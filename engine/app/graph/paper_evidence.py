"""Durable per-paper evidence summary for base admission."""

from __future__ import annotations


from app import db
from app.langfuse_config import get_langfuse as _get_langfuse, SPAN_GRAPH_EVIDENCE, observe

BUILD_WORK_MEM = "512MB"
BUILD_MAX_PARALLEL_WORKERS_PER_GATHER = 6
BUILD_EFFECTIVE_IO_CONCURRENCY = 200
BUILD_RANDOM_PAGE_COST = "1.1"

PAPER_EVIDENCE_STAGES = ("source", "entity", "relation", "journal", "finalize")


def apply_build_session_settings(cur) -> None:
    cur.execute("SET LOCAL jit = off")
    cur.execute(f"SET LOCAL work_mem = '{BUILD_WORK_MEM}'")
    cur.execute(
        "SET LOCAL max_parallel_workers_per_gather = "
        f"{BUILD_MAX_PARALLEL_WORKERS_PER_GATHER}"
    )
    cur.execute(
        "SET LOCAL effective_io_concurrency = "
        f"{BUILD_EFFECTIVE_IO_CONCURRENCY}"
    )
    cur.execute(f"SET LOCAL random_page_cost = {BUILD_RANDOM_PAGE_COST}")


def mapped_paper_predicate_sql(
    corpus_alias: str = "c",
    paper_alias: str = "p",
) -> str:
    return f"""
        {corpus_alias}.layout_status = 'mapped'
        AND ({paper_alias}.year >= 1945 OR {paper_alias}.year IS NULL)
        AND NOT (
            (
                {paper_alias}.publication_types IS NULL
                OR CARDINALITY({paper_alias}.publication_types) = 0
            )
            AND COALESCE({paper_alias}.citation_count, 0) < 50
        )
        AND NOT (
            {paper_alias}.publication_types IS NOT NULL
            AND 'News' = ANY({paper_alias}.publication_types)
            AND COALESCE({paper_alias}.citation_count, 0) < 50
        )
        AND NOT (
            {paper_alias}.publication_types IS NOT NULL
            AND 'LettersAndComments' = ANY({paper_alias}.publication_types)
            AND COALESCE({paper_alias}.citation_count, 0) < 50
        )
        AND NOT (
            {paper_alias}.publication_types IS NOT NULL
            AND 'Editorial' = ANY({paper_alias}.publication_types)
            AND COALESCE({paper_alias}.citation_count, 0) < 20
        )
    """


def _load_paper_evidence_counts(cur) -> dict[str, int]:
    cur.execute(
        """
        SELECT
            COUNT(*)::INTEGER AS paper_count,
            COUNT(*) FILTER (WHERE has_rule_evidence)::INTEGER AS rule_evidence_count,
            COUNT(*) FILTER (WHERE has_curated_journal_family)::INTEGER AS curated_journal_count
        FROM solemd.paper_evidence_summary
        """
    )
    counts = cur.fetchone()
    return {
        "paper_count": counts["paper_count"],
        "rule_evidence_count": counts["rule_evidence_count"],
        "curated_journal_count": counts["curated_journal_count"],
    }


@observe(name=SPAN_GRAPH_EVIDENCE)
def refresh_paper_evidence_summary() -> dict[str, int]:
    """Refresh paper evidence tables in one transaction from a shared source stage."""
    mapped_predicate = mapped_paper_predicate_sql("c", "p")

    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)

        cur.execute(
            f"""
            CREATE TEMP TABLE stg_paper_evidence_source ON COMMIT DROP AS
            SELECT
                c.corpus_id,
                c.admission_reason,
                c.pmid,
                COALESCE(p.citation_count, 0)::INTEGER AS citation_count,
                COALESCE(solemd.clean_venue(p.venue), '') AS venue_normalized
            FROM solemd.corpus c
            JOIN solemd.papers p ON p.corpus_id = c.corpus_id
            WHERE {mapped_predicate}
            """
        )

        cur.execute(
            """
            CREATE TEMP TABLE stg_paper_relation_base ON COMMIT DROP AS
            SELECT
                src.corpus_id,
                src.citation_count,
                r.relation_type,
                r.subject_type,
                r.subject_id,
                r.object_type,
                r.object_id
            FROM stg_paper_evidence_source src
            LEFT JOIN pubtator.relations r
              ON r.pmid = src.pmid
            WHERE src.pmid IS NOT NULL
            """
        )

        cur.execute(
            """
            CREATE TEMP TABLE stg_paper_relation_evidence ON COMMIT DROP AS
            SELECT
                rel.corpus_id,
                lower(rel.relation_type) AS relation_type,
                COUNT(*)::INTEGER AS relation_count,
                now() AS created_at,
                now() AS updated_at
            FROM stg_paper_relation_base rel
            WHERE COALESCE(rel.relation_type, '') <> ''
            GROUP BY
                rel.corpus_id,
                lower(rel.relation_type)
            """
        )

        cur.execute(
            """
            CREATE TEMP TABLE stg_paper_evidence ON COMMIT DROP AS
            WITH
            entity_agg AS (
                SELECT
                    src.corpus_id,
                    COUNT(ea.*)::INTEGER AS paper_entity_count,
                    COALESCE(BOOL_OR(
                        er.entity_type IS NOT NULL
                        AND (er.confidence != 'requires_second_gate' OR src.citation_count >= 100)
                    ), false) AS has_entity_rule_hit,
                    COALESCE(COUNT(DISTINCT er.family_key)
                        FILTER (WHERE er.confidence = 'high'), 0)::INTEGER
                        AS entity_rule_families,
                    COALESCE(COUNT(DISTINCT er.concept_id)
                        FILTER (WHERE er.confidence = 'high'), 0)::INTEGER
                        AS entity_rule_count,
                    COALESCE(COUNT(DISTINCT er.family_key)
                        FILTER (WHERE er.confidence = 'high'
                            AND er.family_key IN (
                                'psychiatric_disorder',
                                'neurological_disorder',
                                'psychiatric_medication',
                                'neurotransmitter_system',
                                'neuropsych_symptom'
                            )), 0)::INTEGER
                        AS entity_core_families
                FROM stg_paper_evidence_source src
                LEFT JOIN pubtator.entity_annotations ea ON ea.pmid = src.pmid
                LEFT JOIN solemd.entity_rule er
                    ON er.entity_type = ea.entity_type
                   AND er.concept_id = ea.concept_id
                   AND src.citation_count >= COALESCE(er.min_citation_count, 0)
                WHERE src.pmid IS NOT NULL
                GROUP BY src.corpus_id
            ),
            relation_count_agg AS (
                SELECT
                    rel.corpus_id,
                    COALESCE(SUM(rel.relation_count), 0)::INTEGER AS paper_relation_count
                FROM stg_paper_relation_evidence rel
                GROUP BY rel.corpus_id
            ),
            relation_rule_agg AS (
                SELECT
                    rel.corpus_id,
                    COALESCE(BOOL_OR(
                        rr.subject_type IS NOT NULL
                        AND (
                            rr.relation_type = 'treat'
                            OR EXISTS (
                                SELECT 1 FROM solemd.entity_rule med
                                WHERE med.family_key = 'psychiatric_medication'
                                  AND med.concept_id = rel.subject_id
                            )
                        )
                    ), false) AS has_relation_rule_hit
                FROM stg_paper_relation_base rel
                LEFT JOIN solemd.relation_rule rr
                    ON rr.subject_type = rel.subject_type
                   AND rr.relation_type = rel.relation_type
                   AND rr.object_type = rel.object_type
                   AND rr.object_id = rel.object_id
                   AND rr.target_scope = 'base'
                   AND rel.citation_count >= COALESCE(rr.min_citation_count, 0)
                GROUP BY rel.corpus_id
            ),
            journal_match AS (
                SELECT
                    src.corpus_id,
                    true AS has_curated_journal_family,
                    jf.family_key AS journal_family_key,
                    jf.family_label AS journal_family_label,
                    jf.family_type AS journal_family_type,
                    jf.score_multiplier AS journal_score_multiplier
                FROM stg_paper_evidence_source src
                JOIN solemd.journal_rule jr
                    ON jr.venue_normalized = src.venue_normalized
                   AND jr.include_in_corpus = true
                JOIN solemd.base_journal_family jf
                    ON jf.family_key = jr.family_key
                   AND jf.include_in_base = true
            )
            SELECT
                src.corpus_id,
                src.admission_reason,
                src.pmid,
                src.citation_count,
                src.venue_normalized,
                (
                    src.admission_reason IN ('journal_and_vocab', 'vocab_entity_match')
                ) AS has_vocab_match,
                COALESCE(ea.paper_entity_count, 0) AS paper_entity_count,
                COALESCE(ea.has_entity_rule_hit, false) AS has_entity_rule_hit,
                COALESCE(rca.paper_relation_count, 0) AS paper_relation_count,
                COALESCE(rra.has_relation_rule_hit, false) AS has_relation_rule_hit,
                (
                    COALESCE(ea.has_entity_rule_hit, false)
                    OR COALESCE(rra.has_relation_rule_hit, false)
                ) AS has_rule_evidence,
                COALESCE(jm.has_curated_journal_family, false) AS has_curated_journal_family,
                jm.journal_family_key,
                jm.journal_family_label,
                jm.journal_family_type,
                now() AS created_at,
                now() AS updated_at,
                COALESCE(ea.entity_rule_families, 0) AS entity_rule_families,
                COALESCE(ea.entity_rule_count, 0) AS entity_rule_count,
                COALESCE(ea.entity_core_families, 0) AS entity_core_families,
                COALESCE(jm.journal_score_multiplier, 1.0) AS journal_score_multiplier
            FROM stg_paper_evidence_source src
            LEFT JOIN entity_agg ea ON ea.corpus_id = src.corpus_id
            LEFT JOIN relation_count_agg rca ON rca.corpus_id = src.corpus_id
            LEFT JOIN relation_rule_agg rra ON rra.corpus_id = src.corpus_id
            LEFT JOIN journal_match jm ON jm.corpus_id = src.corpus_id
            """
        )

        cur.execute("TRUNCATE solemd.paper_relation_evidence, solemd.paper_evidence_summary")
        cur.execute(
            "INSERT INTO solemd.paper_evidence_summary SELECT * FROM stg_paper_evidence"
        )
        cur.execute(
            "INSERT INTO solemd.paper_relation_evidence SELECT * FROM stg_paper_relation_evidence"
        )
        counts = _load_paper_evidence_counts(cur)
        conn.commit()

    with db.connect_autocommit() as conn, conn.cursor() as cur:
        cur.execute("ANALYZE solemd.paper_evidence_summary")
        cur.execute("ANALYZE solemd.paper_relation_evidence")

    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(output=counts)
    except Exception:
        pass

    return counts


def refresh_paper_evidence_summary_stage(stage: str) -> dict[str, int | str]:
    """Run the full single-pass refresh regardless of stage.

    Kept for backward compatibility with CLI ``--evidence-stage`` flag.
    At 200M scale the single-pass approach is faster than any individual
    stage was under the old multi-UPDATE design.
    """
    if stage not in PAPER_EVIDENCE_STAGES:
        raise ValueError(f"unsupported paper evidence stage: {stage}")

    counts = refresh_paper_evidence_summary()
    return {
        "stage": stage,
        **counts,
    }
