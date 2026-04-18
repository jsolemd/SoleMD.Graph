from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"
DEFAULT_POSTGRES_PORT = 5432


# Slice 1 intentionally keeps this tiny URL parsing helper local to the API
# root instead of introducing a shared Python package before reuse is proven.
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
    pool_serve_read_min: int = Field(default=2, alias="POOL_SERVE_READ_MIN")
    pool_serve_read_max: int = Field(default=16, alias="POOL_SERVE_READ_MAX")
    pool_admin_min: int = Field(default=1, alias="POOL_ADMIN_MIN")
    pool_admin_max: int = Field(default=2, alias="POOL_ADMIN_MAX")
    serve_read_command_timeout_seconds: float = Field(
        default=5.0, alias="SERVE_READ_COMMAND_TIMEOUT_SECONDS"
    )
    admin_statement_cache_size: int = Field(
        default=128, alias="ADMIN_STATEMENT_CACHE_SIZE"
    )

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
