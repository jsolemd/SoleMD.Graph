from __future__ import annotations

from uuid import UUID

import asyncpg

from app.corpus.artifacts import ScratchTableRef, quote_ident


async def create_rollup_index(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
    suffix: str,
    ref: ScratchTableRef,
    columns: str,
    *,
    unique: bool = False,
    include: tuple[str, ...] = (),
    where: str | None = None,
) -> None:
    artifact_key = "".join(part[0] for part in artifact_kind.split("_"))
    index_name = quote_ident(
        f"idx_{corpus_selection_run_id.hex[:10]}_{artifact_key}_{suffix}"
    )
    unique_sql = "UNIQUE " if unique else ""
    include_sql = f" INCLUDE ({', '.join(include)})" if include else ""
    where_sql = f" WHERE {where}" if where else ""
    await connection.execute(
        f"CREATE {unique_sql}INDEX {index_name} ON {ref.qualified_name} ({columns})"
        f"{include_sql}{where_sql}"
    )
