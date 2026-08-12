from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

EMBEDDING_DIM = 384


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="NEXUS_", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    database_url: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexusdag"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    log_level: str = "INFO"

    embedding_provider: Literal["sentence-transformers", "hash"] = "sentence-transformers"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    llm_provider: Literal["openai", "offline"] = "offline"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: SecretStr | None = None
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 60.0

    node_timeout_seconds: float = Field(120.0, gt=0)
    max_concurrent_runs: int = Field(8, ge=1)
    chunk_size: int = Field(800, ge=100)
    chunk_overlap: int = Field(120, ge=0)
    max_upload_bytes: int = Field(5_000_000, ge=1)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
