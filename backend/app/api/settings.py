import time
import httpx
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.workspace_setting import WorkspaceSetting
from app.services.llm_service import LLMService
from app.services.embedding_service import EmbeddingFactory
from app.core.config import settings as app_settings
from app.core.encryption import encrypt_field, decrypt_field

router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Pydantic Request / Response Schemas ─────────────────────────────────────

class ModelProfile(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    provider: str
    base_url: Optional[str] = None
    model_name: str
    api_key: Optional[str] = None
    is_active: bool = False
    enable_thinking: bool = False
    timeout_seconds: int = 180
    temperature: Optional[float] = 0.2
    max_tokens: Optional[int] = 4096


class WorkspaceSettingsResponse(BaseModel):
    llm_provider: str
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key_masked: Optional[str] = None
    has_api_key: bool = False
    allow_demo_autofill: bool = True
    models: List[Dict[str, Any]] = Field(default_factory=list)
    embedding_provider: str = "auto"
    embedding_model: Optional[str] = None
    embedding_base_url: Optional[str] = None
    embedding_api_key_masked: Optional[str] = None
    has_embedding_api_key: bool = False


class WorkspaceSettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None
    allow_demo_autofill: Optional[bool] = None
    models: Optional[List[Dict[str, Any]]] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_base_url: Optional[str] = None
    embedding_api_key: Optional[str] = None


class PublicSettingsResponse(BaseModel):
    allow_demo_autofill: bool
    initialized: bool


class TestLLMRequest(BaseModel):
    provider: str
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    timeout_seconds: Optional[int] = 180


class TestEmbeddingRequest(BaseModel):
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
    plain_embed_key = setting.decrypted_embedding_api_key

    models = setting.models_list
    if not models and setting.llm_model:
        models = [{
            "id": f"{setting.llm_provider}_{setting.llm_model.replace(':', '_')}",
            "name": f"{setting.llm_model} ({setting.llm_provider.capitalize()})",
            "provider": setting.llm_provider,
            "base_url": setting.llm_base_url,
            "model_name": setting.llm_model,
            "is_active": True,
            "enable_thinking": False,
            "timeout_seconds": 180,
            "temperature": 0.2,
        }]

    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(plain_key),
        has_api_key=bool(plain_key and plain_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
        models=models,
        embedding_provider=setting.embedding_provider or "auto",
        embedding_model=setting.embedding_model or "BAAI/bge-small-en-v1.5",
        embedding_base_url=setting.embedding_base_url,
        embedding_api_key_masked=mask_api_key(plain_embed_key),
        has_embedding_api_key=bool(plain_embed_key and plain_embed_key.strip()),
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

    if payload.models is not None:
        setting.set_models_list(payload.models)

    if payload.embedding_provider is not None:
        setting.embedding_provider = payload.embedding_provider
    if payload.embedding_model is not None:
        setting.embedding_model = payload.embedding_model.strip() if payload.embedding_model else None
    if payload.embedding_base_url is not None:
        setting.embedding_base_url = payload.embedding_base_url.strip() if payload.embedding_base_url else None
    if payload.embedding_api_key is not None:
        setting.set_embedding_api_key(payload.embedding_api_key)

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

    # Immediately reconfigure EmbeddingFactory
    EmbeddingFactory.configure(
        provider=setting.embedding_provider,
        model=setting.embedding_model,
        base_url=setting.embedding_base_url,
        api_key=setting.decrypted_embedding_api_key,
    )

    plain_embed_key = setting.decrypted_embedding_api_key
    models = setting.models_list
    if not models and setting.llm_model:
        models = [{
            "id": f"{setting.llm_provider}_{setting.llm_model.replace(':', '_')}",
            "name": f"{setting.llm_model} ({setting.llm_provider.capitalize()})",
            "provider": setting.llm_provider,
            "base_url": setting.llm_base_url,
            "model_name": setting.llm_model,
            "is_active": True,
            "enable_thinking": False,
            "timeout_seconds": 180,
            "temperature": 0.2,
        }]

    return WorkspaceSettingsResponse(
        llm_provider=setting.llm_provider,
        llm_base_url=setting.llm_base_url,
        llm_model=setting.llm_model,
        llm_api_key_masked=mask_api_key(plain_key),
        has_api_key=bool(plain_key and plain_key.strip()),
        allow_demo_autofill=setting.allow_demo_autofill,
        models=models,
        embedding_provider=setting.embedding_provider or "auto",
        embedding_model=setting.embedding_model or "BAAI/bge-small-en-v1.5",
        embedding_base_url=setting.embedding_base_url,
        embedding_api_key_masked=mask_api_key(plain_embed_key),
        has_embedding_api_key=bool(plain_embed_key and plain_embed_key.strip()),
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
        if provider == "nvidia":
            effective_api_key = (app_settings.LLM_API_KEY or app_settings.NVIDIA_API_KEY or "").strip()
        elif provider == "openai":
            effective_api_key = (app_settings.LLM_API_KEY or app_settings.OPENAI_API_KEY or "").strip()
        else:
            effective_api_key = (app_settings.LLM_API_KEY or "").strip()

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
        # Configurable timeout (default 180s for local models that load into GPU/RAM on cold start)
        test_timeout = float(req.timeout_seconds or 180.0)
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=30.0, read=test_timeout, write=30.0, pool=30.0)) as client:
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
    except httpx.TimeoutException:
        latency_ms = int((time.monotonic() - start) * 1000)
        return TestLLMResponse(
            success=False,
            latency_ms=latency_ms,
            message=f"Connection timed out after {latency_ms}ms. If Ollama is loading '{model}' into memory for the first time, it may take a moment. Please click Test Connection again.",
        )
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        err_msg = str(exc) or exc.__class__.__name__
        return TestLLMResponse(
            success=False,
            latency_ms=latency_ms,
            message=f"Connection failed to {endpoint}: {err_msg}",
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


@router.get("/models")
async def list_workspace_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all saved models in the workspace catalog and the currently active model."""
    setting = await get_or_create_workspace_settings(db)
    models = setting.models_list

    if not models and setting.llm_model:
        models = [{
            "id": f"{setting.llm_provider}_{setting.llm_model.replace(':', '_')}",
            "name": f"{setting.llm_model} ({setting.llm_provider.capitalize()})",
            "provider": setting.llm_provider,
            "base_url": setting.llm_base_url,
            "model_name": setting.llm_model,
            "is_active": True,
            "enable_thinking": False,
            "timeout_seconds": 180,
            "temperature": 0.2,
        }]

    active_id = None
    for m in models:
        if m.get("is_active"):
            active_id = m.get("id")
            break
    if not active_id and models:
        active_id = models[0].get("id") or models[0].get("model_name")
    if not active_id:
        active_id = setting.llm_model

    return {
        "models": models,
        "active_model_id": active_id,
        "active_model": setting.llm_model,
        "active_provider": setting.llm_provider,
    }


@router.post("/models")
async def save_workspace_model(
    model: ModelProfile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add or update a model profile in the workspace catalog."""
    setting = await get_or_create_workspace_settings(db)
    current_models = setting.models_list

    # Ensure id and name are generated if omitted
    target_id = model.id or f"{model.provider}_{model.model_name.replace(':', '_').replace('/', '_')}"
    target_name = model.name or f"{model.model_name} ({model.provider.capitalize()})"

    entry = model.model_dump()
    entry["id"] = target_id
    entry["name"] = target_name

    # Update existing or append new
    updated = False
    new_list = []
    for m in current_models:
        if m.get("id") == target_id or (m.get("model_name") == model.model_name and m.get("provider") == model.provider):
            if model.is_active:
                entry["is_active"] = True
            new_list.append(entry)
            updated = True
        else:
            if model.is_active:
                m["is_active"] = False
            new_list.append(m)

    if not updated:
        new_list.append(entry)

    if model.is_active:
        setting.llm_provider = model.provider
        setting.llm_base_url = model.base_url.strip() if model.base_url else None
        setting.llm_model = model.model_name.strip() if model.model_name else None
        if model.api_key:
            setting.set_api_key(model.api_key)

        # Reconfigure LLMService immediately
        plain_key = setting.decrypted_api_key or app_settings.LLM_API_KEY or app_settings.OPENAI_API_KEY
        llm_service = LLMService.get_instance()
        llm_service.configure(
            provider=setting.llm_provider,
            base_url=setting.llm_base_url,
            model_name=setting.llm_model,
            api_key=plain_key,
            timeout=float(model.timeout_seconds or 180.0),
            enable_thinking=model.enable_thinking,
        )

    setting.set_models_list(new_list)
    db.add(setting)
    await db.commit()
    await db.refresh(setting)

    return {"status": "success", "models": setting.models_list}


@router.delete("/models/{model_id}")
async def delete_workspace_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a model profile from the workspace catalog."""
    setting = await get_or_create_workspace_settings(db)
    current_models = setting.models_list
    new_list = [m for m in current_models if m.get("id") != model_id]
    setting.set_models_list(new_list)
    db.add(setting)
    await db.commit()
    return {"status": "deleted", "models": setting.models_list}


@router.post("/test-embedding", response_model=TestLLMResponse)
async def test_embedding_connection(
    req: TestEmbeddingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test embedding model connection and vector dimension generation."""
    start = time.monotonic()
    provider = (req.provider or "auto").lower()

    if provider in ["local", "auto", "fastembed"] and not req.api_key:
        from app.services.embedding_service import LocalFeatureEmbeddingProvider
        model_to_use = req.model_name or "BAAI/bge-small-en-v1.5"
        try:
            p = LocalFeatureEmbeddingProvider()
            vec = p.embed_query("test semantic vector embedding ping")
            latency = int((time.monotonic() - start) * 1000)
            return TestLLMResponse(
                success=True,
                latency_ms=latency,
                message=f"Local FastEmbed provider ready ({model_to_use}: {len(vec)}-dimensional vector in {latency}ms)",
            )
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            return TestLLMResponse(
                success=False,
                latency_ms=latency,
                message=f"FastEmbed initialization error: {str(e)}",
            )

    base_url = (req.base_url or ("http://localhost:11434/v1" if provider == "ollama" else "https://api.openai.com/v1")).rstrip("/")
    model = req.model_name or ("nomic-embed-text" if provider == "ollama" else "text-embedding-3-small")

    clean_url = base_url
    if not clean_url.endswith("/v1") and not clean_url.endswith("/embeddings"):
        clean_url = f"{clean_url}/v1"
    endpoint = f"{clean_url}/embeddings" if not clean_url.endswith("/embeddings") else clean_url

    headers = {"Content-Type": "application/json"}
    if req.api_key:
        headers["Authorization"] = f"Bearer {req.api_key.strip()}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(endpoint, json={"model": model, "input": "test embedding ping"}, headers=headers)
            latency = int((time.monotonic() - start) * 1000)
            if res.status_code == 200:
                data = res.json()
                raw = data.get("data", [])
                dim = len(raw[0].get("embedding", [])) if raw else 0
                return TestLLMResponse(
                    success=True,
                    latency_ms=latency,
                    message=f"Connected successfully to {model} via {base_url} (Dimension: {dim}, Latency: {latency}ms)",
                )
            elif res.status_code == 401:
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency,
                    message=f"Authentication failed (HTTP 401): Invalid API key for {base_url}.",
                )
            elif res.status_code == 404:
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency,
                    message=f"Model '{model}' not found in Ollama (HTTP 404). Run 'ollama pull {model}' on your host.",
                )
            else:
                return TestLLMResponse(
                    success=False,
                    latency_ms=latency,
                    message=f"Endpoint returned HTTP {res.status_code}: {res.text[:150]}",
                )
    except httpx.TimeoutException:
        latency = int((time.monotonic() - start) * 1000)
        return TestLLMResponse(
            success=False,
            latency_ms=latency,
            message=f"Embedding request to {endpoint} timed out ({latency}ms). Ollama may still be loading '{model}'.",
        )
    except Exception as exc:
        latency = int((time.monotonic() - start) * 1000)
        err_msg = str(exc) or exc.__class__.__name__
        return TestLLMResponse(
            success=False,
            latency_ms=latency,
            message=f"Connection failed to {endpoint}: {err_msg}",
        )
