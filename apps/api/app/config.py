from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"
DEFAULT_POSTGRES_PORT = 5432


@dataclass(frozen=True, slots=True)
class DependencyTarget:
    name: str
    host: str
    port: int


def dependency_target_from_url(
    *, name: str, value: str, default_port: int
) -> DependencyTarget:
    parsed = urlsplit(value)
    host = parsed.hostname
    port = parsed.port or default_port
    if not host:
        raise ValueError(f"{name} must include a hostname")
    return DependencyTarget(name=name, host=host, port=port)


class Settings(BaseSettings):
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    api_host: str = Field(default="127.0.0.1", alias="API_HOST")
    api_port: int = Field(default=8010, alias="API_PORT")
    api_readiness_timeout_seconds: float = Field(
        default=1.0, alias="API_READINESS_TIMEOUT_SECONDS"
    )
    serve_dsn_read: str = Field(..., alias="SERVE_DSN_READ")
    serve_dsn_admin: str = Field(..., alias="SERVE_DSN_ADMIN")

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore",
    )

    @property
    def service_name(self) -> str:
        return "graph-engine-api"

    @property
    def readiness_targets(self) -> tuple[DependencyTarget, ...]:
        return (
            dependency_target_from_url(
                name="serve_read",
                value=self.serve_dsn_read,
                default_port=DEFAULT_POSTGRES_PORT,
            ),
            dependency_target_from_url(
                name="serve_admin",
                value=self.serve_dsn_admin,
                default_port=DEFAULT_POSTGRES_PORT,
            ),
        )


settings = Settings()
