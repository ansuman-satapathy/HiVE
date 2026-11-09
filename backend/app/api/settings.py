import time
import httpx
import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.workspace_setting import WorkspaceSetting
from app.services.llm_service import LLMService

logger = logging.getLogger("settings_api")

router = APIRouter(prefix="/settings", tags=["Settings"])


class PublicSettingsResponse(BaseModel):
    allow_demo_autofill: bool = True
    initialized: bool = True


class WorkspaceSettingsResponse(BaseModel):
    llm_provider: str
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key_masked: Optional[str] = None
    has_api_key: bool = False
    allow_demo_autofill: bool = True


class WorkspaceSettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None
    allow_demo_autofill: Optional[bool] = None


class TestLLMRequest(BaseModel):
    provider: str = Field(..., description="'ollama', 'openai', 'nvidia', or 'local'")
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None


class TestLLMResponse(BaseModel):
    success: bool
    latency_ms: Optional[int] = None
    message: str
    discovered_models: Optional[List[str]] = None


class LocalModelDetectionResponse(BaseModel):
    available: bool
    endpoint: Optional[str] = None
    models: List[str] = []


def mask_api_key(key: Optional[str]) -> Optional[str]:
    if not key or len(key) < 6:
        return None
    return f"{key[:3]}...{key[-4:]}"


async def get_or_create_workspace_settings(db: AsyncSession) -> WorkspaceSetting:
    statement = select(WorkspaceSetting)
    result = await db.exec(statement)
    setting = result.first()
    if not setting:
        setting = WorkspaceSetting()
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    return setting


@router.get("/public", response_model=PublicSettingsResponse)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Unauthenticated public settings required for Login and initial UI render."""
    setting = await get_or_create_workspace_settings(db)
    return PublicSettingsResponse(
        allow_demo_autofill=setting.allow_demo_autofill,
        initialized=True,
    )


@router.get("", response_model=WorkspaceSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve workspace model and operational settings."""
    setting = await get_or_create_workspace_settings(db)
    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(setting.llm_api_key),
        has_api_key=bool(setting.llm_api_key and setting.llm_api_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
    )


@router.patch("", response_model=WorkspaceSettingsResponse)
async def update_settings(
    payload: WorkspaceSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update workspace model configuration or security preferences."""
    setting = await get_or_create_workspace_settings(db)

    if payload.llm_provider is not None:
        setting.llm_provider = payload.llm_provider
    if payload.llm_base_url is not None:
        setting.llm_base_url = payload.llm_base_url
    if payload.llm_model is not None:
        setting.llm_model = payload.llm_model
    if payload.llm_api_key is not None:
        # If user passed empty string, clear it; otherwise update
        setting.llm_api_key = payload.llm_api_key if payload.llm_api_key.strip() else None
    if payload.allow_demo_autofill is not None:
        setting.allow_demo_autofill = payload.allow_demo_autofill

    db.add(setting)
    await db.commit()
    await db.refresh(setting)

    # Immediately reconfigure the active singleton LLM service
    llm_service = LLMService.get_instance()
    llm_service.configure(
        provider=setting.llm_provider,
        base_url=setting.llm_base_url,
        model_name=setting.llm_model,
        api_key=setting.llm_api_key,
    )

    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(setting.llm_api_key),
        has_api_key=bool(setting.llm_api_key and setting.llm_api_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
    )


@router.post("/test-llm", response_model=TestLLMResponse)
async def test_llm_connection(
    req: TestLLMRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Test connectivity, credentials, and latency for a requested model provider.
    Works for Ollama, vLLM, OpenAI, Groq, and NVIDIA NIM.
    """
    start = time.monotonic()
    provider = req.provider.lower()

    if provider == "local":
        latency_ms = int((time.monotonic() - start) * 1000)
        return TestLLMResponse(
            success=True,
            latency_ms=latency_ms,
            message="Local deterministic synthesizer is ready (offline fallback).",
        )

    if provider in ["ollama", "openai", "custom"]:
        base_url = req.base_url or ("http://host.docker.internal:11434/v1" if provider == "ollama" else "https://api.openai.com/v1")
        clean_url = base_url.rstrip("/")
        if not clean_url.endswith("/v1") and not clean_url.endswith("/chat/completions"):
            clean_url = f"{clean_url}/v1"
        endpoint = f"{clean_url}/chat/completions" if not clean_url.endswith("/chat/completions") else clean_url

        headers = {"Content-Type": "application/json"}
        if req.api_key and req.api_key.strip():
            headers["Authorization"] = f"Bearer {req.api_key.strip()}"

        model = req.model_name or ("llama3.2" if provider == "ollama" else "gpt-4o-mini")
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                latency_ms = int((time.monotonic() - start) * 1000)

                if res.status_code == 200:
                    return TestLLMResponse(
                        success=True,
                        latency_ms=latency_ms,
                        message=f"Connected successfully to {model} via {base_url} ({latency_ms}ms)",
                    )
                else:
                    return TestLLMResponse(
                        success=False,
                        latency_ms=latency_ms,
                        message=f"Endpoint returned HTTP {res.status_code}: {res.text[:200]}",
                    )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            return TestLLMResponse(
                success=False,
                latency_ms=latency_ms,
                message=f"Connection failed to {endpoint}: {str(exc)}",
            )

    if provider == "nvidia":
        try:
            from langchain_nvidia_ai_endpoints import ChatNVIDIA
            api_key = req.api_key or ""
            model = req.model_name or "meta/llama-3.2-11b-vision-instruct"
            chat = ChatNVIDIA(api_key=api_key, model=model, max_tokens=1)
            await chat.ainvoke("ping")
            latency_ms = int((time.monotonic() - start) * 1000)
            return TestLLMResponse(
                success=True,
                latency_ms=latency_ms,
                message=f"Connected successfully to NVIDIA NIM model {model} ({latency_ms}ms)",
            )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            return TestLLMResponse(
                success=False,
                latency_ms=latency_ms,
                message=f"NVIDIA connection failed: {str(exc)}",
            )

    raise HTTPException(status_code=400, detail=f"Unsupported provider: '{req.provider}'")


@router.get("/detect-local-models", response_model=LocalModelDetectionResponse)
async def detect_local_models(
    current_user: User = Depends(get_current_user),
):
    """
    Scan host and local network for active Ollama or vLLM instances.
    Returns the list of installed local models if detected.
    """
    candidates = [
        "http://localhost:11434",
        "http://host.docker.internal:11434",
        "http://127.0.0.1:11434",
    ]

    async with httpx.AsyncClient(timeout=2.0) as client:
        for base in candidates:
            try:
                res = await client.get(f"{base}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    return LocalModelDetectionResponse(
                        available=True,
                        endpoint=f"{base}/v1",
                        models=models,
                    )
            except Exception:
                continue

    return LocalModelDetectionResponse(
        available=False,
        endpoint=None,
        models=[],
    )

