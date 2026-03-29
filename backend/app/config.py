from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Video-to-Knowledge API"
    api_v1_prefix: str = "/api/v1"

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Resolved relative to backend/ working directory
    temp_audio_dir: Path = Path("storage/temp/audio")

    # CORS (comma-separated origins in env: http://localhost:5173,http://127.0.0.1:5173)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    groq_api_key: str | None = None
    google_api_key: str | None = None
    supabase_url: str | None = None
    supabase_key: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
