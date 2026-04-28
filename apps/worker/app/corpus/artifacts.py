from __future__ import annotations

from dataclasses import dataclass
import re
from uuid import UUID

import asyncpg

from app.corpus.models import CorpusPlan


SCRATCH_SCHEMA = "solemd_scratch"

PAPER_SCOPE = "paper_scope"
ENTITY_AGGREGATE = "entity_aggregate"
RELATION_AGGREGATE = "relation_aggregate"
MAPPED_ENTITY_DETAIL = "mapped_entity_detail"
MAPPED_RELATION_DETAIL = "mapped_relation_detail"

ARTIFACT_SUFFIXES: dict[str, str] = {
    PAPER_SCOPE: "paper_scope",
    ENTITY_AGGREGATE: "entity_aggregate",
    RELATION_AGGREGATE: "relation_aggregate",
    MAPPED_ENTITY_DETAIL: "mapped_entity_detail",
    MAPPED_RELATION_DETAIL: "mapped_relation_detail",
}

_IDENT_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
_CREATE_TABLE_ROW_COUNT_RE = re.compile(r"^(?:CREATE TABLE AS|SELECT) (?P<count>\d+)$")


@dataclass(frozen=True, slots=True)
class ScratchTableRef:
    schema_name: str
    table_name: str

    @property
    def qualified_name(self) -> str:
        return f"{quote_ident(self.schema_name)}.{quote_ident(self.table_name)}"

    @property
    def regclass_name(self) -> str:
        return f"{self.schema_name}.{self.table_name}"


def quote_ident(value: str) -> str:
    if not _IDENT_RE.fullmatch(value):
        raise ValueError(f"unsafe SQL identifier: {value!r}")
    return f'"{value}"'


def artifact_ref(corpus_selection_run_id: UUID, artifact_kind: str) -> ScratchTableRef:
    try:
        suffix = ARTIFACT_SUFFIXES[artifact_kind]
    except KeyError as exc:
        raise ValueError(f"unsupported corpus artifact kind: {artifact_kind}") from exc
    return ScratchTableRef(
        schema_name=SCRATCH_SCHEMA,
        table_name=f"cs_{corpus_selection_run_id.hex}_{suffix}",
    )


def parse_create_table_row_count(command_tag: str) -> int | None:
    match = _CREATE_TABLE_ROW_COUNT_RE.match(command_tag)
    if match is None:
        return None
    return int(match.group("count"))


async def load_required_artifact_refs(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    artifact_kinds: tuple[str, ...],
) -> dict[str, ScratchTableRef]:
    rows = await connection.fetch(
        """
        SELECT artifact_kind, storage_schema, storage_table, status
        FROM solemd.corpus_selection_artifacts
        WHERE corpus_selection_run_id = $1
          AND artifact_kind = ANY($2::TEXT[])
        """,
        corpus_selection_run_id,
        list(artifact_kinds),
    )
    by_kind = {str(row["artifact_kind"]): row for row in rows}
    missing = [kind for kind in artifact_kinds if kind not in by_kind]
    if missing:
        raise RuntimeError(
            "missing corpus selection artifact(s): " + ", ".join(sorted(missing))
        )

    refs: dict[str, ScratchTableRef] = {}
    stale: list[str] = []
    for kind in artifact_kinds:
        row = by_kind[kind]
        ref = ScratchTableRef(str(row["storage_schema"]), str(row["storage_table"]))
        if row["status"] != "complete" or not await artifact_table_exists(connection, ref):
            stale.append(kind)
        refs[kind] = ref
    if stale:
        raise RuntimeError(
            "corpus selection artifact(s) are not complete or present: "
            + ", ".join(sorted(stale))
        )
    return refs


async def artifact_complete(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
    plan_checksum: str,
) -> bool:
    ref = artifact_ref(corpus_selection_run_id, artifact_kind)
    row = await connection.fetchrow(
        """
        SELECT status, storage_schema, storage_table
        FROM solemd.corpus_selection_artifacts
        WHERE corpus_selection_run_id = $1
          AND artifact_kind = $2
          AND plan_checksum = $3
        """,
        corpus_selection_run_id,
        artifact_kind,
        plan_checksum,
    )
    if row is None or row["status"] != "complete":
        return False
    ledger_ref = ScratchTableRef(str(row["storage_schema"]), str(row["storage_table"]))
    return ledger_ref == ref and await artifact_table_exists(connection, ref)


async def artifact_table_exists(
    connection: asyncpg.Connection,
    ref: ScratchTableRef,
) -> bool:
    exists = await connection.fetchval("SELECT to_regclass($1) IS NOT NULL", ref.regclass_name)
    return bool(exists)


async def mark_artifact_building(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    phase_name: str,
    artifact_kind: str,
    ref: ScratchTableRef,
    detail: dict[str, object] | None = None,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.corpus_selection_artifacts (
            corpus_selection_run_id,
            s2_source_release_id,
            pt3_source_release_id,
            selector_version,
            phase_name,
            artifact_kind,
            storage_schema,
            storage_table,
            is_logged,
            status,
            plan_checksum,
            detail,
            created_at,
            completed_at,
            dropped_at,
            error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, 'building', $9, $10, now(), NULL, NULL, NULL)
        ON CONFLICT (corpus_selection_run_id, artifact_kind)
        DO UPDATE SET
            phase_name = EXCLUDED.phase_name,
            storage_schema = EXCLUDED.storage_schema,
            storage_table = EXCLUDED.storage_table,
            is_logged = false,
            status = 'building',
            plan_checksum = EXCLUDED.plan_checksum,
            detail = EXCLUDED.detail,
            created_at = now(),
            completed_at = NULL,
            dropped_at = NULL,
            error_message = NULL
        """,
        corpus_selection_run_id,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        plan.selector_version,
        phase_name,
        artifact_kind,
        ref.schema_name,
        ref.table_name,
        plan.plan_checksum,
        detail or {},
    )


async def mark_artifact_complete(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
    row_count: int | None,
    detail: dict[str, object] | None = None,
) -> None:
    ref = artifact_ref(corpus_selection_run_id, artifact_kind)
    byte_size = await connection.fetchval(
        "SELECT pg_total_relation_size(to_regclass($1))",
        ref.regclass_name,
    )
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_artifacts
        SET status = 'complete',
            row_count = $3,
            byte_size = $4,
            detail = detail || $5::JSONB,
            completed_at = now(),
            error_message = NULL
        WHERE corpus_selection_run_id = $1
          AND artifact_kind = $2
        """,
        corpus_selection_run_id,
        artifact_kind,
        row_count,
        int(byte_size or 0),
        detail or {},
    )


async def mark_artifact_failed(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_artifacts
        SET status = 'failed',
            error_message = $3
        WHERE corpus_selection_run_id = $1
          AND artifact_kind = $2
        """,
        corpus_selection_run_id,
        artifact_kind,
        error_message[:2000],
    )


async def drop_artifact_table(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    artifact_kind: str,
) -> None:
    ref = artifact_ref(corpus_selection_run_id, artifact_kind)
    await connection.execute(f"DROP TABLE IF EXISTS {ref.qualified_name}")


async def garbage_collect_artifacts(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    retention_runs: int,
) -> int:
    retained_run_ids = await connection.fetch(
        """
        SELECT corpus_selection_run_id
        FROM solemd.corpus_selection_runs
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND selector_version = $3
        ORDER BY started_at DESC
        LIMIT $4
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        plan.selector_version,
        retention_runs,
    )
    retained = [row["corpus_selection_run_id"] for row in retained_run_ids]
    if not retained:
        return 0

    rows = await connection.fetch(
        """
        SELECT
            corpus_selection_run_id,
            artifact_kind,
            storage_schema,
            storage_table
        FROM solemd.corpus_selection_artifacts
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND selector_version = $3
          AND NOT (corpus_selection_run_id = ANY($4::UUID[]))
          AND status IN ('complete', 'failed', 'stale')
        ORDER BY created_at
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        plan.selector_version,
        retained,
    )
    dropped_count = 0
    for row in rows:
        ref = ScratchTableRef(
            schema_name=str(row["storage_schema"]),
            table_name=str(row["storage_table"]),
        )
        await connection.execute(f"DROP TABLE IF EXISTS {ref.qualified_name}")
        await connection.execute(
            """
            UPDATE solemd.corpus_selection_artifacts
            SET status = 'dropped',
                dropped_at = now()
            WHERE corpus_selection_run_id = $1
              AND artifact_kind = $2
            """,
            row["corpus_selection_run_id"],
            row["artifact_kind"],
        )
        dropped_count += 1
    return dropped_count
