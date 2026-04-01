"""Shared PostgreSQL connection helpers.

Used by corpus/, graph/, and rag/ modules. All database access
goes through these helpers to keep connection config in one place.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import psycopg
from psycopg.rows import dict_row

from app.config import settings

if TYPE_CHECKING:
    from psycopg_pool import ConnectionPool

# Module-level connection pool (lazy-initialized).
_pool: ConnectionPool | None = None


def connect(**kwargs) -> psycopg.Connection:
    """Open a synchronous connection to PostgreSQL.

    Returns a connection with autocommit=False by default.
    Caller is responsible for closing (use as context manager).

    Usage:
        with db.connect() as conn:
            conn.execute("SELECT 1")
    """
    defaults = {
        "conninfo": settings.database_url,
        "row_factory": dict_row,
    }
    defaults.update(kwargs)
    return psycopg.connect(**defaults)


def connect_autocommit(**kwargs) -> psycopg.Connection:
    """Open a connection with autocommit=True.

    Needed for operations that can't run inside a transaction:
    CREATE INDEX CONCURRENTLY, VACUUM, ALTER TABLE SET LOGGED, etc.
    """
    return connect(autocommit=True, **kwargs)


def get_pool(*, min_size: int = 1, max_size: int = 4) -> ConnectionPool:
    """Return a lazily-created module-level connection pool.

    Requires psycopg_pool (install via ``pip install psycopg[pool]``
    or add ``psycopg[pool]`` to pyproject.toml dependencies).
    The pool is created on first call and reused thereafter.

    Usage:
        pool = db.get_pool()
        with pool.connection() as conn:
            conn.execute("SELECT 1")
    """
    from psycopg_pool import ConnectionPool as _ConnectionPool

    global _pool
    if _pool is None:
        _pool = _ConnectionPool(
            conninfo=settings.database_url,
            min_size=min_size,
            max_size=max_size,
            open=True,
            kwargs={"row_factory": dict_row},
        )
    return _pool


def pooled():
    """Borrow a connection from the pool (context manager).

    Drop-in replacement for ``db.connect()`` in high-throughput pipelines
    that open many short-lived connections (e.g. graph build, citation ingest).
    The pool is lazily created on first call.

    Usage:
        with db.pooled() as conn:
            conn.execute("SELECT 1")
    """
    return get_pool().connection()


def close_pool() -> None:
    """Close the module-level connection pool if it exists."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
