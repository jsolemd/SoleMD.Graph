from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
from typing import Literal

import asyncpg
from dramatiq.asyncio import get_event_loop_thread
from dramatiq.middleware import Middleware
from redis import asyncio as redis_asyncio

from app.config import DependencyTarget, Settings


PoolName = Literal["ingest_write", "warehouse_read", "serve_read", "admin"]


@dataclass(frozen=True, slots=True)
class PoolSpec:
    name: PoolName
    dsn: str
    min_size: int
    max_size: int
    statement_cache_size: int
    command_timeout: float | None = None
    server_settings: tuple[tuple[str, str], ...] = ()


@dataclass(slots=True)
class WorkerPools:
    pools: dict[PoolName, asyncpg.Pool]

    def get(self, name: PoolName) -> asyncpg.Pool:
        try:
            return self.pools[name]
        except KeyError as exc:
            raise RuntimeError(f"worker pool {name!r} is not initialized") from exc

    async def close(self) -> None:
        await asyncio.gather(*(pool.close() for pool in self.pools.values()))


_worker_pools: WorkerPools | None = None
_worker_pools_lock: asyncio.Lock | None = None


def build_pool_specs(settings: Settings) -> dict[PoolName, PoolSpec]:
    specs: dict[PoolName, PoolSpec] = {}
    if settings.serve_dsn_read:
        specs["serve_read"] = PoolSpec(
            name="serve_read",
            dsn=settings.serve_dsn_read,
            min_size=settings.pool_serve_read_min,
            max_size=settings.pool_serve_read_max,
            statement_cache_size=0,
            command_timeout=settings.serve_read_command_timeout_seconds,
        )
    if settings.serve_dsn_admin:
        specs["admin"] = PoolSpec(
            name="admin",
            dsn=settings.serve_dsn_admin,
            min_size=settings.pool_admin_min,
            max_size=settings.pool_admin_max,
            statement_cache_size=settings.admin_statement_cache_size,
        )
    if settings.warehouse_dsn_ingest:
        specs["ingest_write"] = PoolSpec(
            name="ingest_write",
            dsn=settings.warehouse_dsn_ingest,
            min_size=settings.pool_ingest_min,
            max_size=settings.pool_ingest_max,
            statement_cache_size=settings.ingest_write_statement_cache_size,
            command_timeout=settings.ingest_write_command_timeout_seconds,
            server_settings=_ingest_write_server_settings(settings),
        )
    if settings.warehouse_dsn_read:
        specs["warehouse_read"] = PoolSpec(
            name="warehouse_read",
            dsn=settings.warehouse_dsn_read,
            min_size=settings.pool_warehouse_read_min,
            max_size=settings.pool_warehouse_read_max,
            statement_cache_size=settings.admin_statement_cache_size,
            command_timeout=settings.warehouse_read_command_timeout_seconds,
        )
    return specs


def resolve_boot_pool_names(settings: Settings) -> tuple[PoolName, ...]:
    return tuple(build_pool_specs(settings))


async def open_pool(spec: PoolSpec) -> asyncpg.Pool:
    kwargs: dict[str, object] = {
        "dsn": spec.dsn,
        "min_size": spec.min_size,
        "max_size": spec.max_size,
        "command_timeout": spec.command_timeout,
        "statement_cache_size": spec.statement_cache_size,
        "init": init_connection,
    }
    if spec.server_settings:
        kwargs["server_settings"] = dict(spec.server_settings)
    return await asyncpg.create_pool(**kwargs)


def _ingest_write_server_settings(settings: Settings) -> tuple[tuple[str, str], ...]:
    pairs: list[tuple[str, str]] = []
    idle_ms = settings.ingest_write_idle_in_transaction_timeout_ms
    if idle_ms > 0:
        pairs.append(("idle_in_transaction_session_timeout", str(idle_ms)))
    keepalives_idle = settings.ingest_write_tcp_keepalives_idle_seconds
    if keepalives_idle > 0:
        pairs.append(("tcp_keepalives_idle", str(keepalives_idle)))
    keepalives_interval = settings.ingest_write_tcp_keepalives_interval_seconds
    if keepalives_interval > 0:
        pairs.append(("tcp_keepalives_interval", str(keepalives_interval)))
    keepalives_count = settings.ingest_write_tcp_keepalives_count
    if keepalives_count > 0:
        pairs.append(("tcp_keepalives_count", str(keepalives_count)))
    return tuple(pairs)


async def init_connection(connection: asyncpg.Connection) -> None:
    await connection.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await connection.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
        format="text",
    )


async def open_pools(
    settings: Settings,
    names: tuple[PoolName, ...] | None = None,
) -> WorkerPools:
    specs = build_pool_specs(settings)
    pool_names = names or resolve_boot_pool_names(settings)
    missing = [name for name in pool_names if name not in specs]
    if missing:
        joined = ", ".join(sorted(missing))
        raise RuntimeError(f"missing DSN configuration for pool(s): {joined}")

    pools: dict[PoolName, asyncpg.Pool] = {}
    try:
        for name in pool_names:
            pools[name] = await open_pool(specs[name])
    except Exception:
        if pools:
            await asyncio.gather(*(pool.close() for pool in pools.values()))
        raise

    return WorkerPools(pools=pools)


def set_worker_pools(pools: WorkerPools | None) -> None:
    global _worker_pools
    _worker_pools = pools


def get_worker_pools() -> WorkerPools:
    if _worker_pools is None:
        raise RuntimeError("worker pools are not initialized for this worker process")
    return _worker_pools


def get_pool(name: PoolName) -> asyncpg.Pool:
    return get_worker_pools().get(name)


def _get_worker_pools_lock() -> asyncio.Lock:
    global _worker_pools_lock
    if _worker_pools_lock is None:
        _worker_pools_lock = asyncio.Lock()
    return _worker_pools_lock


def _ensure_worker_pool_names(
    pools: WorkerPools,
    *,
    names: tuple[PoolName, ...] | None,
) -> WorkerPools:
    if not names:
        return pools
    missing = [name for name in names if name not in pools.pools]
    if missing:
        joined = ", ".join(sorted(missing))
        raise RuntimeError(f"worker pool(s) are not initialized for this process: {joined}")
    return pools


async def ensure_worker_pools_open(
    settings: Settings,
    *,
    names: tuple[PoolName, ...] | None = None,
) -> WorkerPools:
    pools = _worker_pools
    if pools is not None:
        return _ensure_worker_pool_names(pools, names=names)

    async with _get_worker_pools_lock():
        pools = _worker_pools
        if pools is not None:
            return _ensure_worker_pool_names(pools, names=names)

        pools = await open_pools(settings, names=names)
        set_worker_pools(pools)
        return pools


class WorkerPoolBootstrap(Middleware):
    def __init__(
        self,
        runtime_settings: Settings,
        *,
        pool_names: tuple[PoolName, ...] | None = None,
    ) -> None:
        self.runtime_settings = runtime_settings
        self.pool_names = pool_names or resolve_boot_pool_names(runtime_settings)

    def after_worker_boot(self, broker, worker) -> None:
        if _worker_pools is not None:
            return
        event_loop_thread = get_event_loop_thread()
        if event_loop_thread is None:
            raise RuntimeError("Dramatiq AsyncIO event loop is not running")
        event_loop_thread.run_coroutine(
            ensure_worker_pools_open(
                self.runtime_settings,
                names=self.pool_names,
            )
        )

    def before_worker_shutdown(self, broker, worker) -> None:
        pools = _worker_pools
        if pools is None:
            return
        event_loop_thread = get_event_loop_thread()
        if event_loop_thread is None:
            raise RuntimeError("Dramatiq AsyncIO event loop is not running")
        event_loop_thread.run_coroutine(pools.close())
        set_worker_pools(None)


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
