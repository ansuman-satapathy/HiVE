import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="allow")

    PROJECT_NAME: str = "HiVE"
    API_V1_STR: str = "/api"
    
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/quickdesk"

    SECRET_KEY: str = "password"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Optional encryption key for database config & secrets (AES/Fernet)
    # If not set, safely derived from SECRET_KEY
    CONFIG_ENCRYPTION_KEY: str = ""

    # Runtime LLM Configuration from Environment / Secrets Manager (optional)
    LLM_PROVIDER: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""
    LLM_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-3.2-11b-vision-instruct"
    NVIDIA_EMBED_MODEL: str = "nvidia/nemotron-3-embed-1b"
    EMBEDDING_PROVIDER: str = "auto"  # "auto", "nvidia", or "local"
    RERANKER_PROVIDER: str = "local"  # "local", "nvidia", or "auto"
    NVIDIA_RERANK_MODEL: str = "nvidia/llama-nemotron-rerank-1b-v2"
    RERANKER_TIMEOUT_SECONDS: float = 5.0

    CHROMA_PERSIST_DIR: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "chroma_db"
    )
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CHROMA_PERSIST_DIR, exist_ok=True)

