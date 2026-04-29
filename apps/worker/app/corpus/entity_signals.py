from __future__ import annotations

import asyncio
import re
from time import perf_counter

import asyncpg

from app.corpus.artifacts import ScratchTableRef
from app.corpus.models import CorpusPlan
from app.corpus.runtime_support import digest_payload


_INSERT_ROW_COUNT_RE = re.compile(r"^INSERT 0 (?P<count>\d+)$")
_ENTITY_SIGNAL_CHECKSUM_KEYS = ("vocab_terms", "vocab_aliases", "entity_rules")


def entity_signal_checksum(plan: CorpusPlan) -> str:
    return digest_payload(
        {
            key: plan.asset_checksums[key]
            for key in _ENTITY_SIGNAL_CHECKSUM_KEYS
        }
    )


async def ensure_paper_entity_signals(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    paper_scope_ref: ScratchTableRef,
) -> str:
    checksum = entity_signal_checksum(plan)
    if await _build_complete(connection, plan=plan, checksum=checksum):
        return checksum

    await _mark_building(connection, plan=plan, checksum=checksum)
    try:
        async with connection.transaction():
            await connection.fetchval(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0)::BIGINT)",
                (
                    "paper_entity_signals:"
                    f"{plan.s2_source_release_id}:"
                    f"{plan.pt3_source_release_id}:"
                    f"{checksum}"
                ),
            )
            if await _build_complete(connection, plan=plan, checksum=checksum):
                return checksum
            build_started = perf_counter()
            await connection.execute(
                """
                DELETE FROM solemd.paper_entity_signals
                WHERE s2_source_release_id = $1
                  AND pt3_source_release_id = $2
                  AND entity_signal_checksum = $3
                """,
                plan.s2_source_release_id,
                plan.pt3_source_release_id,
                checksum,
            )
            command_tag = await connection.execute(
                f"""
                INSERT INTO solemd.paper_entity_signals (
                    s2_source_release_id,
                    pt3_source_release_id,
                    entity_signal_checksum,
                    paper_id,
                    pmid,
                    entity_type,
                    concept_id_raw,
                    term_id,
                    term_canonical_name,
                    term_category,
                    matched_alias,
                    rule_canonical_name,
                    rule_family_key,
                    rule_confidence,
                    rule_min_reference_count,
                    matched_mention_text,
                    signal_count,
                    reference_out_count
                )
                SELECT
                    matched.s2_source_release_id,
                    matched.pt3_source_release_id,
                    matched.entity_signal_checksum,
                    matched.paper_id,
                    matched.pmid,
                    matched.entity_type,
                    matched.concept_id_raw,
                    matched.term_id,
                    matched.term_canonical_name,
                    matched.term_category,
                    matched.matched_alias,
                    matched.rule_canonical_name,
                    matched.rule_family_key,
                    matched.rule_confidence,
                    matched.rule_min_reference_count,
                    matched.matched_mention_text,
                    matched.signal_count,
                    matched.reference_out_count
                FROM (
                    WITH matched_annotations AS MATERIALIZED (
                        SELECT
                            scope.source_release_id AS s2_source_release_id,
                            $2::INTEGER AS pt3_source_release_id,
                            $3::TEXT AS entity_signal_checksum,
                            scope.paper_id,
                            scope.pmid,
                            annotations.start_offset,
                            annotations.end_offset,
                            annotations.resource,
                            annotations.entity_type,
                            annotations.concept_id_raw,
                            annotations.mention_text,
                            aliases.alias,
                            aliases.is_preferred,
                            terms.term_id,
                            terms.canonical_name AS term_canonical_name,
                            terms.category AS term_category,
                            rules.canonical_name AS rule_canonical_name,
                            rules.family_key AS rule_family_key,
                            rules.confidence AS rule_confidence,
                            coalesce(rules.min_reference_count, 0)::INTEGER
                                AS rule_min_reference_count,
                            coalesce(metrics.reference_out_count, 0)::INTEGER
                                AS reference_out_count
                        FROM pubtator.entity_annotations_stage annotations
                        JOIN {paper_scope_ref.qualified_name} scope
                          ON scope.source_release_id = $1
                         AND scope.pmid = annotations.pmid
                        LEFT JOIN solemd.vocab_term_aliases aliases
                          ON aliases.normalized_alias =
                             solemd.normalize_lookup_key(annotations.mention_text)
                        LEFT JOIN solemd.vocab_terms terms
                          ON terms.term_id = aliases.term_id
                        LEFT JOIN pg_temp.selector_entity_rules rules
                          ON rules.entity_type = annotations.entity_type
                         AND rules.concept_id_raw = annotations.concept_id_raw
                        LEFT JOIN solemd.s2_paper_reference_metrics_raw metrics
                          ON metrics.source_release_id = scope.source_release_id
                         AND metrics.citing_paper_id = scope.paper_id
                        WHERE annotations.source_release_id = $2
                          AND scope.pmid IS NOT NULL
                          AND (
                              terms.term_id IS NOT NULL
                              OR rules.concept_id_raw IS NOT NULL
                          )
                    )
                    SELECT
                        s2_source_release_id,
                        pt3_source_release_id,
                        entity_signal_checksum,
                        paper_id,
                        pmid,
                        entity_type,
                        concept_id_raw,
                        term_id,
                        term_canonical_name,
                        term_category,
                        coalesce(
                            min(alias) FILTER (WHERE is_preferred),
                            min(alias)
                        ) AS matched_alias,
                        NULL::TEXT AS rule_canonical_name,
                        NULL::TEXT AS rule_family_key,
                        NULL::TEXT AS rule_confidence,
                        0::INTEGER AS rule_min_reference_count,
                        min(mention_text) AS matched_mention_text,
                        count(
                            DISTINCT (start_offset, end_offset, resource)
                        )::INTEGER AS signal_count,
                        reference_out_count
                    FROM matched_annotations
                    WHERE term_id IS NOT NULL
                    GROUP BY
                        s2_source_release_id,
                        pt3_source_release_id,
                        entity_signal_checksum,
                        paper_id,
                        pmid,
                        entity_type,
                        concept_id_raw,
                        term_id,
                        term_canonical_name,
                        term_category,
                        reference_out_count

                    UNION ALL

                    SELECT
                        s2_source_release_id,
                        pt3_source_release_id,
                        entity_signal_checksum,
                        paper_id,
                        pmid,
                        entity_type,
                        concept_id_raw,
                        NULL::UUID AS term_id,
                        NULL::TEXT AS term_canonical_name,
                        NULL::TEXT AS term_category,
                        NULL::TEXT AS matched_alias,
                        rule_canonical_name,
                        rule_family_key,
                        rule_confidence,
                        rule_min_reference_count,
                        min(mention_text) AS matched_mention_text,
                        count(
                            DISTINCT (start_offset, end_offset, resource)
                        )::INTEGER AS signal_count,
                        reference_out_count
                    FROM matched_annotations
                    WHERE rule_family_key IS NOT NULL
                    GROUP BY
                        s2_source_release_id,
                        pt3_source_release_id,
                        entity_signal_checksum,
                        paper_id,
                        pmid,
                        entity_type,
                        concept_id_raw,
                        rule_canonical_name,
                        rule_family_key,
                        rule_confidence,
                        rule_min_reference_count,
                        reference_out_count
                ) matched
                """,
                plan.s2_source_release_id,
                plan.pt3_source_release_id,
                checksum,
            )
            build_seconds = perf_counter() - build_started
            analyze_started = perf_counter()
            await connection.execute("ANALYZE solemd.paper_entity_signals")
            analyze_seconds = perf_counter() - analyze_started
            row_count = _parse_insert_row_count(command_tag)
            await _mark_complete(
                connection,
                plan=plan,
                checksum=checksum,
                row_count=row_count,
                detail={
                    "build_seconds": round(build_seconds, 6),
                    "analyze_seconds": round(analyze_seconds, 6),
                },
            )
    except asyncio.CancelledError:
        await _mark_failed(connection, plan=plan, checksum=checksum, error_message="cancelled")
        raise
    except Exception as exc:
        await _mark_failed(connection, plan=plan, checksum=checksum, error_message=str(exc))
        raise
    return checksum


async def _build_complete(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    checksum: str,
) -> bool:
    status = await connection.fetchval(
        """
        SELECT status
        FROM solemd.paper_entity_signal_builds
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND entity_signal_checksum = $3
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        checksum,
    )
    return status == "complete"


async def _mark_building(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    checksum: str,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.paper_entity_signal_builds (
            s2_source_release_id,
            pt3_source_release_id,
            entity_signal_checksum,
            status,
            started_at,
            completed_at,
            error_message
        )
        VALUES ($1, $2, $3, 'building', now(), NULL, NULL)
        ON CONFLICT (
            s2_source_release_id,
            pt3_source_release_id,
            entity_signal_checksum
        )
        DO UPDATE SET
            status = 'building',
            started_at = now(),
            completed_at = NULL,
            error_message = NULL
        WHERE solemd.paper_entity_signal_builds.status <> 'complete'
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        checksum,
    )


async def _mark_complete(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    checksum: str,
    row_count: int | None,
    detail: dict[str, object] | None = None,
) -> None:
    byte_size = await connection.fetchval(
        "SELECT pg_total_relation_size('solemd.paper_entity_signals'::REGCLASS)"
    )
    await connection.execute(
        """
        UPDATE solemd.paper_entity_signal_builds
        SET status = 'complete',
            row_count = $4,
            byte_size = $5,
            detail = detail || $6::JSONB,
            completed_at = now(),
            error_message = NULL
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND entity_signal_checksum = $3
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        checksum,
        row_count,
        int(byte_size or 0),
        detail or {},
    )


async def _mark_failed(
    connection: asyncpg.Connection,
    *,
    plan: CorpusPlan,
    checksum: str,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.paper_entity_signal_builds
        SET status = 'failed',
            completed_at = now(),
            error_message = $4
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND entity_signal_checksum = $3
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        checksum,
        error_message[:2000],
    )


def _parse_insert_row_count(command_tag: str) -> int | None:
    match = _INSERT_ROW_COUNT_RE.match(command_tag)
    if match is None:
        return None
    return int(match.group("count"))
