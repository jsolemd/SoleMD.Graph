from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg

from app.corpus.errors import CorpusQualityAuditAlreadyInProgress
from app.corpus.models import StartCorpusQualityAuditRequest
from app.corpus.quality_audit_queries import (
    EVIDENCE_PUBLICATION_TYPE_PROFILE_SQL,
    EVIDENCE_PUBLICATION_TYPES,
    ENTITY_SIGNAL_COVERAGE_SQL,
    LOW_VALUE_PUBLICATION_TYPES,
    MAPPED_RELEVANCE_CONTENT_SQL,
    METADATA_ONLY_LOW_VALUE_PUBLICATION_TYPES,
    METADATA_ONLY_PROFILE_SQL,
    METADATA_ONLY_PUBLICATION_TYPE_SQL,
    QUALITY_WARNING_DISTRIBUTION_SQL,
    RELATION_ARTIFACT_SQL,
    RELATION_SIGNAL_SQL,
    RELATION_SUMMARY_SQL,
    SAMPLE_BUCKETS,
    STATUS_DISTRIBUTION_SQL,
    SUMMARY_METRICS_SQL,
    TOP_VENUES_SQL,
    TRACK_COLUMNS,
    sample_sql,
    track_sql,
)
from app.corpus.summary_refresh_store import SelectionRunContext


QUALITY_AUDIT_PHASE_NAME = "quality_audit"


@dataclass(frozen=True, slots=True)
class QualityAuditDetail:
    summary_row_count: int
    mapped_row_count: int
    rag_eligible_row_count: int
    distributions: dict[str, Any]
    relation_diagnostic: dict[str, Any]
    top_signals: dict[str, Any]
    samples: dict[str, Any]
    findings: list[dict[str, Any]]


async def acquire_quality_audit_lock(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::BIGINT",
        f"corpus-quality-audit:{corpus_selection_run_id}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise CorpusQualityAuditAlreadyInProgress(
            "corpus-quality audit is already running for this corpus selection run"
        )
    return int(lock_key)


async def open_quality_audit_run(
    connection: asyncpg.Connection,
    *,
    request: StartCorpusQualityAuditRequest,
    context: SelectionRunContext,
) -> UUID:
    return await connection.fetchval(
        """
        INSERT INTO solemd.corpus_quality_audit_runs (
            corpus_selection_run_id,
            selector_version,
            requested_by,
            status,
            plan_checksum,
            sample_size
        )
        VALUES ($1, $2, $3, 'running', $4, $5)
        RETURNING corpus_quality_audit_run_id
        """,
        context.corpus_selection_run_id,
        context.selector_version,
        request.requested_by,
        context.plan.plan_checksum,
        request.sample_size,
    )


async def mark_quality_audit_complete(
    connection: asyncpg.Connection,
    *,
    audit_run_id: UUID,
    detail: QualityAuditDetail,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_quality_audit_runs
        SET status = 'complete',
            completed_at = now(),
            summary_row_count = $2,
            mapped_row_count = $3,
            rag_eligible_row_count = $4,
            distributions = $5,
            relation_diagnostic = $6,
            top_signals = $7,
            samples = $8,
            findings = $9,
            error_message = NULL
        WHERE corpus_quality_audit_run_id = $1
        """,
        audit_run_id,
        detail.summary_row_count,
        detail.mapped_row_count,
        detail.rag_eligible_row_count,
        detail.distributions,
        detail.relation_diagnostic,
        detail.top_signals,
        detail.samples,
        detail.findings,
    )


async def mark_quality_audit_failed(
    connection: asyncpg.Connection,
    *,
    audit_run_id: UUID,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_quality_audit_runs
        SET status = 'failed',
            completed_at = now(),
            error_message = $2
        WHERE corpus_quality_audit_run_id = $1
        """,
        audit_run_id,
        error_message[:2000],
    )


async def build_quality_audit_detail(
    connection: asyncpg.Connection,
    *,
    context: SelectionRunContext,
    sample_size: int,
) -> QualityAuditDetail:
    summary = await _fetch_one(
        connection,
        SUMMARY_METRICS_SQL,
        context.corpus_selection_run_id,
    )
    relation_diagnostic = await _load_relation_diagnostic(connection, context=context)
    distributions = await _load_distributions(connection, context=context)
    top_signals = await _load_top_signals(connection, context=context)
    samples = await _load_samples(
        connection,
        corpus_selection_run_id=context.corpus_selection_run_id,
        sample_size=sample_size,
    )
    findings = _build_findings(summary, relation_diagnostic)
    return QualityAuditDetail(
        summary_row_count=int(summary["summary_rows"]),
        mapped_row_count=int(summary["mapped_rows"]),
        rag_eligible_row_count=int(summary["rag_eligible_rows"]),
        distributions=distributions,
        relation_diagnostic=relation_diagnostic,
        top_signals=top_signals,
        samples=samples,
        findings=findings,
    )


async def _load_distributions(
    connection: asyncpg.Connection,
    *,
    context: SelectionRunContext,
) -> dict[str, Any]:
    return {
        "status": await _fetch_many(
            connection,
            STATUS_DISTRIBUTION_SQL,
            context.corpus_selection_run_id,
        ),
        "mapped_relevance_content": await _fetch_many(
            connection,
            MAPPED_RELEVANCE_CONTENT_SQL,
            context.corpus_selection_run_id,
        ),
        "quality_warnings": await _fetch_many(
            connection,
            QUALITY_WARNING_DISTRIBUTION_SQL,
            context.corpus_selection_run_id,
        ),
        "evidence_publication_types": await _fetch_one(
            connection,
            EVIDENCE_PUBLICATION_TYPE_PROFILE_SQL,
            context.corpus_selection_run_id,
            list(EVIDENCE_PUBLICATION_TYPES),
            list(LOW_VALUE_PUBLICATION_TYPES),
        ),
        "entity_signal_coverage": await _fetch_many(
            connection,
            ENTITY_SIGNAL_COVERAGE_SQL,
            context.corpus_selection_run_id,
        ),
        "metadata_only_profile": await _fetch_one(
            connection,
            METADATA_ONLY_PROFILE_SQL,
            context.corpus_selection_run_id,
            list(METADATA_ONLY_LOW_VALUE_PUBLICATION_TYPES),
            list(EVIDENCE_PUBLICATION_TYPES),
        ),
        "metadata_only_publication_types": await _fetch_many(
            connection,
            METADATA_ONLY_PUBLICATION_TYPE_SQL,
            context.corpus_selection_run_id,
            40,
        ),
    }


async def _load_top_signals(
    connection: asyncpg.Connection,
    *,
    context: SelectionRunContext,
) -> dict[str, Any]:
    return {
        "venues": await _fetch_many(
            connection,
            TOP_VENUES_SQL,
            context.corpus_selection_run_id,
            50,
        ),
        "mesh_major_tracks": await _fetch_track_rows(
            connection,
            context.corpus_selection_run_id,
            "mesh_major_tracks",
            40,
        ),
        "publication_type_tracks": await _fetch_track_rows(
            connection,
            context.corpus_selection_run_id,
            "publication_type_tracks",
            40,
        ),
        "s2_fields_of_study": await _fetch_track_rows(
            connection,
            context.corpus_selection_run_id,
            "s2_fields_of_study",
            30,
        ),
        "topic_tracks": await _fetch_track_rows(
            connection,
            context.corpus_selection_run_id,
            "topic_tracks",
            40,
        ),
        "organ_system_tracks": await _fetch_track_rows(
            connection,
            context.corpus_selection_run_id,
            "organ_system_tracks",
            40,
        ),
    }


async def _load_relation_diagnostic(
    connection: asyncpg.Connection,
    *,
    context: SelectionRunContext,
) -> dict[str, Any]:
    summary = await _fetch_one(
        connection,
        RELATION_SUMMARY_SQL,
        context.corpus_selection_run_id,
    )
    signals = await _fetch_many(
        connection,
        RELATION_SIGNAL_SQL,
        context.corpus_selection_run_id,
    )
    artifacts = await _fetch_many(
        connection,
        RELATION_ARTIFACT_SQL,
        context.corpus_selection_run_id,
    )
    return {
        "summary": summary,
        "signals": signals,
        "artifacts": {str(row["artifact_kind"]): row for row in artifacts},
    }


async def _load_samples(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    sample_size: int,
) -> dict[str, Any]:
    samples: dict[str, Any] = {}
    for sample_key, condition, order_clause in SAMPLE_BUCKETS:
        rows = await _fetch_many(
            connection,
            sample_sql(condition=condition, order_clause=order_clause),
            corpus_selection_run_id,
            sample_size,
        )
        samples[sample_key] = rows
    return samples


async def _fetch_track_rows(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    column_name: str,
    limit: int,
) -> list[dict[str, Any]]:
    if column_name not in TRACK_COLUMNS:
        raise ValueError(f"unsupported audit track column: {column_name}")
    return await _fetch_many(
        connection,
        track_sql(column_name),
        corpus_selection_run_id,
        limit,
    )


async def _fetch_one(
    connection: asyncpg.Connection,
    sql: str,
    *args: object,
) -> dict[str, Any]:
    row = await connection.fetchrow(sql, *args)
    return _record_to_dict(row) if row is not None else {}


async def _fetch_many(
    connection: asyncpg.Connection,
    sql: str,
    *args: object,
) -> list[dict[str, Any]]:
    rows = await connection.fetch(sql, *args)
    return [_record_to_dict(row) for row in rows]


def _record_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    return {key: _json_safe(value) for key, value in dict(row).items()}


def _json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    return value


def _build_findings(
    summary: dict[str, Any],
    relation_diagnostic: dict[str, Any],
) -> list[dict[str, Any]]:
    relation_summary = relation_diagnostic.get("summary", {})
    relation_artifacts = relation_diagnostic.get("artifacts", {})
    findings = _artifact_findings(relation_artifacts)
    aggregate_rows = int(
        relation_artifacts.get("relation_aggregate", {}).get("row_count") or 0
    )
    relation_match_rows = int(relation_summary.get("mapped_relation_match_rows") or 0)
    raw_relation_rows = int(relation_summary.get("raw_relation_rows") or 0)
    if aggregate_rows > 0 and relation_match_rows == 0:
        findings.append(
            {
                "severity": "critical",
                "code": "relation_aggregate_not_projected",
                "message": "Relation rollup has rows but summary has zero mapped relation matches.",
                "relation_aggregate_rows": aggregate_rows,
            }
        )
    elif raw_relation_rows > 0 and relation_match_rows / raw_relation_rows < 0.02:
        findings.append(
            {
                "severity": "info",
                "code": "narrow_relation_rule_coverage",
                "message": "Raw PT3 relation coverage is wider than curated relation rules.",
                "raw_relation_rows": raw_relation_rows,
                "mapped_relation_match_rows": relation_match_rows,
            }
        )
    for code, key, severity in (
        ("metadata_only_mapped_backlog", "mapped_metadata_only_rows", "warning"),
        ("missing_text_mapped_backlog", "mapped_missing_text_rows", "warning"),
        ("mapped_missing_organ_tracks", "mapped_missing_organ_track_rows", "warning"),
        ("mapped_low_signal_review", "mapped_low_signal_rows", "info"),
    ):
        count = int(summary.get(key) or 0)
        if count:
            findings.append(
                {
                    "severity": severity,
                    "code": code,
                    "message": code.replace("_", " "),
                    "row_count": count,
                }
            )
    return findings


def _artifact_findings(
    relation_artifacts: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for artifact_kind, artifact in relation_artifacts.items():
        expected_rows = int(artifact.get("row_count") or 0)
        physical_byte_size = int(artifact.get("physical_byte_size") or 0)
        physical_table_exists = bool(artifact.get("physical_table_exists"))
        if expected_rows > 0 and (not physical_table_exists or physical_byte_size == 0):
            findings.append(
                {
                    "severity": "warning",
                    "code": "scratch_artifact_physical_mismatch",
                    "message": "Scratch artifact ledger expects rows but the physical table is absent or empty.",
                    "artifact_kind": artifact_kind,
                    "ledger_row_count": expected_rows,
                    "physical_table_exists": physical_table_exists,
                    "physical_byte_size": physical_byte_size,
                }
            )
    return findings
