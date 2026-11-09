import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field
from app.core.encryption import encrypt_field, decrypt_field

class WorkspaceSetting(SQLModel, table=True):
    __tablename__: str = "workspace_settings"

    id: Optional[uuid.UUID] = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    # Active primary LLM configuration
    llm_provider: str = Field(default="auto", nullable=False)
    llm_base_url: Optional[str] = Field(default=None, nullable=True)
    llm_model: Optional[str] = Field(default=None, nullable=True)
    # Stored encrypted at rest using AES/Fernet authenticated encryption
    llm_api_key: Optional[str] = Field(default=None, nullable=True)

    # Multi-model catalog JSON string: list of configured model profiles
    # e.g. [{"id": "...", "name": "...", "provider": "...", "base_url": "...", "model_name": "...", "is_active": bool}]
    models_config: str = Field(default="[]", nullable=False)

    # Embedding model configuration (moved from env to UI/DB)
    embedding_provider: str = Field(default="auto", nullable=False)
    embedding_model: Optional[str] = Field(default="BAAI/bge-small-en-v1.5", nullable=True)
    embedding_base_url: Optional[str] = Field(default=None, nullable=True)
    embedding_api_key: Optional[str] = Field(default=None, nullable=True)

    # Security toggle: whether to show the "Fill Default Admin Credentials" button on login
    allow_demo_autofill: bool = Field(default=True, nullable=False)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        nullable=False
    )

    @property
    def decrypted_api_key(self) -> Optional[str]:
        return decrypt_field(self.llm_api_key)

    def set_api_key(self, plain_key: Optional[str]) -> None:
        if plain_key and plain_key.strip():
            self.llm_api_key = encrypt_field(plain_key.strip())
        else:
            self.llm_api_key = None

    @property
    def decrypted_embedding_api_key(self) -> Optional[str]:
        return decrypt_field(self.embedding_api_key)

    def set_embedding_api_key(self, plain_key: Optional[str]) -> None:
        if plain_key and plain_key.strip():
            self.embedding_api_key = encrypt_field(plain_key.strip())
        else:
            self.embedding_api_key = None

    @property
    def models_list(self) -> List[Dict[str, Any]]:
        if not self.models_config:
            return []
        try:
            items = json.loads(self.models_config)
            return items if isinstance(items, list) else []
        except Exception:
            return []

    def set_models_list(self, models: List[Dict[str, Any]]) -> None:
        self.models_config = json.dumps(models)
