from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, validated up front from environment variables or a `.env` file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production"] = "development"
    app_name: str = "Ryanair Flight Search API"
    app_description: str = "FastAPI service to query flight deals via ryanair-py"
    app_version: str = "1.1.0"
    debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_json: bool = True

    cors_origins: list[str] = ["http://localhost:4200", "http://127.0.0.1:4200"]

    # Ryanair's public website API (unofficial), used for the airport/route network.
    ryanair_web_api_url: str = "https://www.ryanair.com"
    network_cache_ttl_seconds: int = 86400
    upstream_timeout_seconds: float = 10.0

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
