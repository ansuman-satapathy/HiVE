import uuid
from datetime import datetime, timezone
from typing import Optional
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
    # Provider: 'auto', 'ollama', 'openai', 'custom', 'local'
    llm_provider: str = Field(default="auto", nullable=False)
    llm_base_url: Optional[str] = Field(default=None, nullable=True)
    llm_model: Optional[str] = Field(default=None, nullable=True)
    # Stored encrypted at rest using AES/Fernet authenticated encryption
    llm_api_key: Optional[str] = Field(default=None, nullable=True)

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
