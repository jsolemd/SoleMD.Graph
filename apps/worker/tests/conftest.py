from __future__ import annotations

import asyncio
from pathlib import Path
import subprocess

import asyncpg
import pytest
from testcontainers.postgres import PostgresContainer

from app.config import settings


REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def warehouse_dsns() -> dict[str, str]:
    with PostgresContainer(
        "postgres:18.3-bookworm",
        dbname="warehouse",
        username="postgres",
        password="postgres",
    ) as postgres:
        admin_dsn = postgres.get_connection_url().replace("postgresql+psycopg2://", "postgresql://")
        subprocess.run(
            [
                "uv",
                "run",
                "scripts/schema_migrations.py",
                "apply",
                "--cluster",
                "warehouse",
                "--dsn",
                admin_dsn,
            ],
            cwd=REPO_ROOT,
            check=True,
        )
        asyncio.run(_set_role_passwords(admin_dsn))
        yield {
            "admin": admin_dsn,
            "ingest": admin_dsn.replace("postgres:postgres", "engine_ingest_write:engine_ingest_write"),
        }


async def _set_role_passwords(admin_dsn: str) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        await connection.execute("ALTER ROLE engine_ingest_write PASSWORD 'engine_ingest_write'")
        await connection.execute("ALTER ROLE engine_warehouse_admin PASSWORD 'engine_warehouse_admin'")
        await connection.execute("ALTER ROLE engine_warehouse_read PASSWORD 'engine_warehouse_read'")
    finally:
        await connection.close()


@pytest.fixture
def runtime_settings_factory():
    def factory(*, semantic_scholar_dir: Path | None = None, pubtator_dir: Path | None = None, ingest_dsn: str) -> object:
        return settings.model_copy(
            update={
                "warehouse_dsn_ingest": ingest_dsn,
                "semantic_scholar_dir": str(semantic_scholar_dir or (REPO_ROOT / "data" / "semantic-scholar")),
                "pubtator_dir": str(pubtator_dir or (REPO_ROOT / "data" / "pubtator")),
                "ingest_max_concurrent_files": 2,
                "ingest_copy_batch_rows": 64,
            }
        )

    return factory
