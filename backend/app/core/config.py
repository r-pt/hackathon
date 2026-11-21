"""Application settings loaded from backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed environment settings aligned with backend/.env.example."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    campus_lat: float = -33.0344
    campus_lon: float = -71.5950

    @property
    def is_supabase_configured(self) -> bool:
        """Return True when Supabase URL and service role key are set to non-placeholder values."""
        url = self.supabase_url.strip()
        key = self.supabase_service_role_key.strip()
        if not url or not key:
            return False
        if "YOUR_" in url.upper() or "YOUR_" in key.upper():
            return False
        return True


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
