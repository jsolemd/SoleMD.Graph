from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"
ENV_LOCAL_FILE = ROOT_DIR / ".env.local"
DEFAULT_POSTGRES_PORT = 5432
DEFAULT_REDIS_PORT = 6379


# Slice 1 intentionally keeps this tiny URL parsing helper local to the worker
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
    worker_redis_namespace: str = Field(
        default="solemd-graph", alias="WORKER_REDIS_NAMESPACE"
    )
    worker_startup_timeout_seconds: float = Field(
        default=1.0, alias="WORKER_STARTUP_TIMEOUT_SECONDS"
    )
    redis_url: str = Field(..., alias="REDIS_URL")
    serve_dsn_read: str | None = Field(default=None, alias="SERVE_DSN_READ")
    serve_dsn_admin: str | None = Field(default=None, alias="SERVE_DSN_ADMIN")
    warehouse_dsn_ingest: str | None = Field(default=None, alias="WAREHOUSE_DSN_INGEST")
    warehouse_dsn_read: str | None = Field(default=None, alias="WAREHOUSE_DSN_READ")
    warehouse_dsn_admin: str | None = Field(default=None, alias="WAREHOUSE_DSN_ADMIN")
    pool_ingest_min: int = Field(default=8, alias="POOL_INGEST_MIN")
    pool_ingest_max: int = Field(default=64, alias="POOL_INGEST_MAX")
    pool_warehouse_read_min: int = Field(
        default=2, alias="POOL_WAREHOUSE_READ_MIN"
    )
    pool_warehouse_read_max: int = Field(
        default=8, alias="POOL_WAREHOUSE_READ_MAX"
    )
    pool_serve_read_min: int = Field(default=2, alias="POOL_SERVE_READ_MIN")
    pool_serve_read_max: int = Field(default=16, alias="POOL_SERVE_READ_MAX")
    pool_admin_min: int = Field(default=1, alias="POOL_ADMIN_MIN")
    pool_admin_max: int = Field(default=2, alias="POOL_ADMIN_MAX")
    warehouse_read_command_timeout_seconds: float = Field(
        default=300.0, alias="WAREHOUSE_READ_COMMAND_TIMEOUT_SECONDS"
    )
    serve_read_command_timeout_seconds: float = Field(
        default=5.0, alias="SERVE_READ_COMMAND_TIMEOUT_SECONDS"
    )
    admin_statement_cache_size: int = Field(
        default=128, alias="ADMIN_STATEMENT_CACHE_SIZE"
    )
    semantic_scholar_dir: str = Field(
        default="data/semantic-scholar",
        alias="SEMANTIC_SCHOLAR_DIR",
    )
    pubtator_dir: str = Field(
        default="data/pubtator",
        alias="PUBTATOR_DIR",
    )
    s2_release_id: str | None = Field(default=None, alias="S2_RELEASE_ID")
    pubtator_release_id: str | None = Field(default=None, alias="PUBTATOR_RELEASE_ID")
    ingest_manifest_marker_name: str = Field(
        default="MANIFEST",
        alias="INGEST_MANIFEST_MARKER_NAME",
    )
    ingest_copy_batch_rows: int = Field(
        default=10_000,
        alias="INGEST_COPY_BATCH_ROWS",
    )
    ingest_max_concurrent_files: int = Field(
        default=4,
        alias="INGEST_MAX_CONCURRENT_FILES",
    )
    ingest_write_command_timeout_seconds: float = Field(
        default=300.0,
        alias="INGEST_WRITE_COMMAND_TIMEOUT_SECONDS",
    )

    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, ENV_LOCAL_FILE),
        extra="ignore",
    )

    @property
    def service_name(self) -> str:
        return "graph-worker"

    @property
    def startup_targets(self) -> tuple[DependencyTarget, ...]:
        targets = [
            dependency_target_from_url(
                name="redis",
                value=self.redis_url,
                default_port=DEFAULT_REDIS_PORT,
            ),
        ]
        if self.serve_dsn_read:
            targets.append(
                dependency_target_from_url(
                    name="serve_read",
                    value=self.serve_dsn_read,
                    default_port=DEFAULT_POSTGRES_PORT,
                )
            )
        if self.serve_dsn_admin:
            targets.append(
                dependency_target_from_url(
                    name="serve_admin",
                    value=self.serve_dsn_admin,
                    default_port=DEFAULT_POSTGRES_PORT,
                )
            )
        optional_dsn_map = {
            "warehouse_ingest": self.warehouse_dsn_ingest,
            "warehouse_read": self.warehouse_dsn_read,
            "warehouse_admin": self.warehouse_dsn_admin,
        }
        for name, value in optional_dsn_map.items():
            if not value:
                continue
            targets.append(
                dependency_target_from_url(
                    name=name,
                    value=value,
                    default_port=DEFAULT_POSTGRES_PORT,
                )
            )
        return tuple(targets)

    @property
    def semantic_scholar_root(self) -> Path:
        return self.resolve_project_path(self.semantic_scholar_dir)

    @property
    def pubtator_root(self) -> Path:
        return self.resolve_project_path(self.pubtator_dir)

    def semantic_scholar_release_dir(self, release_tag: str) -> Path:
        return self.semantic_scholar_root / "releases" / release_tag

    def pubtator_release_dir(self, release_tag: str) -> Path:
        return self.pubtator_root / "releases" / release_tag

    def resolve_project_path(self, value: str | Path) -> Path:
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = ROOT_DIR / path
        return path.resolve(strict=False)


settings = Settings()
