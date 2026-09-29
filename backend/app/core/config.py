from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    callmissed_api_key: SecretStr | None = None
    callmissed_base_url: str = "https://api.callmissed.com/v1"
    callmissed_chat_model: str = "gpt-oss-120b"
    callmissed_image_model: str = "flux-2-klein-9b"
    callmissed_image_size: str = "1024x1024"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
