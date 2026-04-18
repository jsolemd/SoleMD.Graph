from __future__ import annotations

import asyncio
from dataclasses import dataclass

import asyncpg
from dramatiq.asyncio import get_event_loop_thread
from dramatiq.middleware import Middleware
from redis import asyncio as redis_asyncio

from app.config import DependencyTarget, Settings


@dataclass(slots=True)
class ServePools:
    serve_read: asyncpg.Pool
    serve_admin: asyncpg.Pool

    async def close(self) -> None:
        await asyncio.gather(
            self.serve_read.close(),
            self.serve_admin.close(),
        )


_serve_pools: ServePools | None = None


async def create_serve_pools(settings: Settings) -> ServePools:
    serve_read: asyncpg.Pool | None = None
    serve_admin: asyncpg.Pool | None = None
    try:
        serve_read, serve_admin = await asyncio.gather(
            asyncpg.create_pool(
                dsn=settings.serve_dsn_read,
                min_size=settings.pool_serve_read_min,
                max_size=settings.pool_serve_read_max,
                command_timeout=settings.serve_read_command_timeout_seconds,
                # Transaction-pooled serve reads stay on the documented
                # safe floor until the prepared-plan path is proven end to end.
                statement_cache_size=0,
            ),
            asyncpg.create_pool(
                dsn=settings.serve_dsn_admin,
                min_size=settings.pool_admin_min,
                max_size=settings.pool_admin_max,
                statement_cache_size=settings.admin_statement_cache_size,
            ),
        )
    except Exception:
        if serve_read is not None:
            await serve_read.close()
        if serve_admin is not None:
            await serve_admin.close()
        raise
    return ServePools(
        serve_read=serve_read,
        serve_admin=serve_admin,
    )


def set_serve_pools(pools: ServePools | None) -> None:
    global _serve_pools
    _serve_pools = pools


def get_serve_pools() -> ServePools:
    if _serve_pools is None:
        raise RuntimeError("serve pools are not initialized for this worker process")
    return _serve_pools


class WorkerPoolBootstrap(Middleware):
    def __init__(self, runtime_settings: Settings) -> None:
        self.runtime_settings = runtime_settings

    def after_worker_boot(self, broker, worker) -> None:
        if _serve_pools is not None:
            return
        event_loop_thread = get_event_loop_thread()
        if event_loop_thread is None:
            raise RuntimeError("Dramatiq AsyncIO event loop is not running")
        set_serve_pools(event_loop_thread.run_coroutine(create_serve_pools(self.runtime_settings)))

    def before_worker_shutdown(self, broker, worker) -> None:
        pools = _serve_pools
        if pools is None:
            return
        event_loop_thread = get_event_loop_thread()
        if event_loop_thread is None:
            raise RuntimeError("Dramatiq AsyncIO event loop is not running")
        event_loop_thread.run_coroutine(pools.close())
        set_serve_pools(None)


async def probe_postgres_target(
    target: DependencyTarget,
    *,
    dsn: str,
    timeout: float,
    statement_cache_size: int,
) -> dict[str, object]:
    connection: asyncpg.Connection | None = None
    try:
        async with asyncio.timeout(timeout):
            connection = await asyncpg.connect(
                dsn=dsn,
                statement_cache_size=statement_cache_size,
                command_timeout=timeout,
            )
            await connection.execute("SELECT 1")
        return {
            "name": target.name,
            "host": target.host,
            "port": target.port,
            "ok": True,
        }
    except (TimeoutError, OSError, asyncpg.PostgresError) as exc:
        return {
            "name": target.name,
            "host": target.host,
            "port": target.port,
            "ok": False,
            "error": str(exc),
        }
    finally:
        if connection is not None:
            await connection.close()


async def probe_redis_target(
    target: DependencyTarget,
    *,
    redis_url: str,
    timeout: float,
) -> dict[str, object]:
    client = redis_asyncio.from_url(redis_url)
    try:
        async with asyncio.timeout(timeout):
            await client.ping()
        return {
            "name": target.name,
            "host": target.host,
            "port": target.port,
            "ok": True,
        }
    except (TimeoutError, OSError, redis_asyncio.RedisError) as exc:
        return {
            "name": target.name,
            "host": target.host,
            "port": target.port,
            "ok": False,
            "error": str(exc),
        }
    finally:
        await client.aclose()
