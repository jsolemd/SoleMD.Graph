"""Shared ETL helpers for corpus loading modules.

Consolidates duplicated patterns across enrich.py, filter.py, and pubtator.py:
- log_etl_run: INSERT into solemd.load_history
- read_expr: DuckDB read_json expression builder with explicit schema
- coalesce_release_id: Normalize empty release IDs to None
- jsonb: Wrap values for psycopg Jsonb insertion
- sql_string_literal: Escape strings for DuckDB SQL
"""

from __future__ import annotations

import json

import psycopg
from psycopg.types.json import Jsonb


def log_etl_run(
    conn: psycopg.Connection,
    *,
    operation: str,
    source: str,
    rows_processed: int,
    rows_loaded: int,
    status: str,
    metadata: dict | None = None,
) -> None:
    """Record an ETL operation in solemd.load_history.

    Inserts a row and commits immediately.

    Args:
        conn: Active psycopg connection.
        operation: ETL operation name (e.g. 'filter_papers', 'enrich_papers').
        source: Data source description.
        rows_processed: Total rows scanned.
        rows_loaded: Rows successfully written.
        status: Run status ('completed', 'checkpoint', 'completed_with_errors').
        metadata: Arbitrary JSON-serializable run stats.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO solemd.load_history
                (operation, source, rows_processed, rows_loaded, status, completed_at, metadata)
            VALUES (%s, %s, %s, %s, %s, now(), %s)
            """,
            (operation, source, rows_processed, rows_loaded, status, json.dumps(metadata or {})),
        )
    conn.commit()


def read_expr(source: str, columns: dict[str, str]) -> str:
    """Build DuckDB read_json expression with explicit schema.

    Single-quotes in file paths are escaped to prevent DuckDB SQL injection.

    Args:
        source: File path or glob pattern for DuckDB.
        columns: Mapping of column name to DuckDB type (e.g. {'corpusid': 'BIGINT'}).

    Returns:
        DuckDB SQL expression string.
    """
    safe_source = source.replace("'", "''")
    col_spec = ", ".join(f"{k}: '{v}'" for k, v in columns.items())
    return (
        f"read_json('{safe_source}', "
        f"format='newline_delimited', compression='gzip', "
        f"columns={{{col_spec}}})"
    )


def coalesce_release_id(release_id: str) -> str | None:
    """Normalize an empty release ID string to None for SQL NULLability."""
    return release_id or None


def jsonb(value: object | None) -> Jsonb:
    """Wrap a value for psycopg Jsonb insertion, defaulting None to empty dict."""
    return Jsonb(value if value is not None else {})


def sql_string_literal(value: str) -> str:
    """Escape a string for use as a DuckDB SQL literal (single-quoted)."""
    return "'" + value.replace("'", "''") + "'"
