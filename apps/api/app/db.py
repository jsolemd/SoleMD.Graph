from __future__ import annotations

import asyncio
from dataclasses import dataclass

import asyncpg

from app.config import Settings


@dataclass(slots=True)
class ServePools:
    serve_read: asyncpg.Pool
    serve_admin: asyncpg.Pool

    async def close(self) -> None:
        await asyncio.gather(
            self.serve_read.close(),
            self.serve_admin.close(),
        )


async def create_serve_pools(settings: Settings) -> ServePools:
    serve_read, serve_admin = await asyncio.gather(
        asyncpg.create_pool(
            dsn=settings.serve_dsn_read,
            min_size=settings.pool_serve_read_min,
            max_size=settings.pool_serve_read_max,
            command_timeout=settings.serve_read_command_timeout_seconds,
            statement_cache_size=0,
        ),
        asyncpg.create_pool(
            dsn=settings.serve_dsn_admin,
            min_size=settings.pool_admin_min,
            max_size=settings.pool_admin_max,
            statement_cache_size=settings.admin_statement_cache_size,
        ),
    )
    return ServePools(
        serve_read=serve_read,
        serve_admin=serve_admin,
    )


async def probe_pool(pool: asyncpg.Pool, *, timeout: float) -> None:
    async with asyncio.timeout(timeout):
        async with pool.acquire() as connection:
            await connection.execute("SELECT 1")
