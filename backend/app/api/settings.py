import time
import httpx
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.workspace_setting import WorkspaceSetting
from app.services.llm_service import LLMService
from app.core.config import settings as app_settings
from app.core.encryption import encrypt_field, decrypt_field

router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Pydantic Request / Response Schemas ─────────────────────────────────────

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


class PublicSettingsResponse(BaseModel):
    allow_demo_autofill: bool
    initialized: bool


class TestLLMRequest(BaseModel):
    provider: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None


class TestLLMResponse(BaseModel):
    success: bool
    latency_ms: int
    message: str


class LocalModelDetectionResponse(BaseModel):
    available: bool
    endpoint: Optional[str] = None
    models: List[str] = Field(default_factory=list)


def mask_api_key(key: Optional[str]) -> Optional[str]:
    """Return a masked representation (e.g. sk-****1234) of a key."""
    if not key or not key.strip():
        return None
    k = key.strip()
    if len(k) <= 8:
        return "••••••••"
    return f"{k[:3]}••••••••{k[-4:]}"


async def get_or_create_workspace_settings(db: AsyncSession) -> WorkspaceSetting:
    """Retrieve singleton workspace settings row, creating default if absent."""
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
    plain_key = setting.decrypted_api_key or app_settings.LLM_API_KEY or app_settings.OPENAI_API_KEY
    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(plain_key),
        has_api_key=bool(plain_key and plain_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
    )


@router.patch("", response_model=WorkspaceSettingsResponse)
async def update_settings(
    payload: WorkspaceSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update workspace model configuration or security preferences with encrypted storage."""
    setting = await get_or_create_workspace_settings(db)

    if payload.llm_provider is not None:
        setting.llm_provider = payload.llm_provider
    if payload.llm_base_url is not None:
        setting.llm_base_url = payload.llm_base_url.strip() if payload.llm_base_url else None
    if payload.llm_model is not None:
        setting.llm_model = payload.llm_model.strip() if payload.llm_model else None
    if payload.llm_api_key is not None:
        # Encrypt the API key before persisting to DB
        setting.set_api_key(payload.llm_api_key)
    if payload.allow_demo_autofill is not None:
        setting.allow_demo_autofill = payload.allow_demo_autofill

    db.add(setting)
    await db.commit()
    await db.refresh(setting)

    # Immediately reconfigure the active singleton LLM service in memory
    plain_key = setting.decrypted_api_key or app_settings.LLM_API_KEY or app_settings.OPENAI_API_KEY
    llm_service = LLMService.get_instance()
    llm_service.configure(
        provider=setting.llm_provider,
        base_url=setting.llm_base_url,
        model_name=setting.llm_model,
        api_key=plain_key,
    )

    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(plain_key),
        has_api_key=bool(plain_key and plain_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
    )


@router.post("/test-llm", response_model=TestLLMResponse)
async def test_llm_connection(
    req: TestLLMRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Test connectivity, credentials, and latency for a requested model provider.
    Works for Ollama, vLLM, OpenAI, Groq, NVIDIA NIM, and custom OpenAI-compatible endpoints.
    """
    start = time.monotonic()
    provider = (req.provider or "openai").lower()

    if provider == "local":
        latency_ms = int((time.monotonic() - start) * 1000)
        return TestLLMResponse(
            success=True,
            latency_ms=latency_ms,
            message="Local deterministic synthesizer is ready (offline fallback).",
        )

    # Resolve effective API key: payload -> DB -> environment secrets
    effective_api_key = (req.api_key or "").strip()
    if not effective_api_key:
        setting = await get_or_create_workspace_settings(db)
        effective_api_key = (setting.decrypted_api_key or "").strip()
    if not effective_api_key:
        effective_api_key = (app_settings.LLM_API_KEY or app_settings.OPENAI_API_KEY or app_settings.NVIDIA_API_KEY).strip()

    # Determine default base_url and model based on provider
    if provider == "nvidia":
        base_url = req.base_url or "https://integrate.api.nvidia.com/v1"
        model = req.model_name or "meta/llama-3.2-3b-instruct"
    elif provider == "ollama":
        base_url = req.base_url or "http://localhost:11434/v1"
        model = req.model_name or "llama3.2"
    else:
        base_url = req.base_url or "https://api.openai.com/v1"
        model = req.model_name or "gpt-4o-mini"

    # Enforce API key requirement for external cloud providers
    is_local_host = any(h in base_url for h in ["localhost", "127.0.0.1", "host.docker.internal"])
    if not is_local_host and provider != "ollama" and not effective_api_key:
        return TestLLMResponse(
            success=False,
            latency_ms=0,
            message="API key is required to test cloud endpoints. Please enter an API key.",
        )

    clean_url = base_url.rstrip("/")
    if not clean_url.endswith("/v1") and not clean_url.endswith("/chat/completions"):
        clean_url = f"{clean_url}/v1"
    endpoint = f"{clean_url}/chat/completions" if not clean_url.endswith("/chat/completions") else clean_url

    headers = {"Content-Type": "application/json"}
    if effective_api_key:
        headers["Authorization"] = f"Bearer {effective_api_key}"

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
            elif res.status_code == 401:
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency_ms,
                    message=f"Authentication failed (HTTP 401): Invalid or missing API key for {base_url}.",
                )
            elif res.status_code == 404:
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency_ms,
                    message=f"Not found (HTTP 404): Endpoint or model '{model}' does not exist on {base_url}.",
                )
            else:
                err_detail = ""
                try:
                    err_json = res.json()
                    err_detail = err_json.get("error", {}).get("message") or str(err_json.get("detail", ""))
                except Exception:
                    err_detail = res.text[:150]
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency_ms,
                    message=f"Endpoint returned HTTP {res.status_code}: {err_detail}",
                )
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        return TestLLMResponse(
            success=False,
            latency_ms=latency_ms,
            message=f"Connection failed to {endpoint}: {str(exc)}",
        )


@router.get("/detect-local-models", response_model=LocalModelDetectionResponse)
async def detect_local_models(
    current_user: User = Depends(get_current_user),
):
    """
    Scan host and local network for active Ollama or vLLM instances.
    Returns the list of installed local models if detected.
    """
    candidates = [
        "http://host.docker.internal:11434",
        "http://localhost:11434",
        "http://127.0.0.1:11434",
    ]

    # Dynamically resolve default gateway on Linux Docker
    try:
        with open("/proc/net/route", "r") as f:
            for line in f:
                fields = line.strip().split()
                if len(fields) >= 3 and fields[1] == "00000000":
                    gw_hex = fields[2]
                    gw_ip = ".".join(str(int(gw_hex[i:i+2], 16)) for i in (6, 4, 2, 0))
                    gw_url = f"http://{gw_ip}:11434"
                    if gw_url not in candidates:
                        candidates.append(gw_url)
                    break
    except Exception:
        pass

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
