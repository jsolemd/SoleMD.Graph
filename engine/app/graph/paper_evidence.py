"""Durable per-paper evidence summary for base admission."""

from __future__ import annotations

from app import db
from app.graph.build_settings import apply_build_session_settings
from app.graph.paper_summary import refresh_graph_paper_summary
from app.langfuse_config import (
    SPAN_GRAPH_EVIDENCE,
    observe,
)
from app.langfuse_config import (
    get_langfuse as _get_langfuse,
)

PAPER_EVIDENCE_STAGES = ("source", "entity", "relation", "journal", "finalize")
PAPER_EVIDENCE_SUMMARY_TABLE = "solemd.paper_evidence_summary"
_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE = "solemd.paper_evidence_summary_next"
_PAPER_EVIDENCE_SUMMARY_OLD_TABLE = "solemd.paper_evidence_summary_old"
_PAPER_EVIDENCE_SUMMARY_PKEY = "paper_evidence_summary_pkey"
_PAPER_EVIDENCE_SUMMARY_OLD_PKEY = "paper_evidence_summary_old_pkey"
_PAPER_EVIDENCE_SUMMARY_CORPUS_FKEY = "paper_evidence_summary_corpus_id_fkey"
_PAPER_EVIDENCE_SUMMARY_OLD_CORPUS_FKEY = "paper_evidence_summary_old_corpus_id_fkey"
_PAPER_EVIDENCE_SUMMARY_PMID_INDEX = "idx_paper_evidence_summary_pmid"
_PAPER_EVIDENCE_SUMMARY_OLD_PMID_INDEX = "idx_paper_evidence_summary_old_pmid"
_PAPER_EVIDENCE_SUMMARY_RULE_EVIDENCE_INDEX = "idx_paper_evidence_summary_rule_evidence"
_PAPER_EVIDENCE_SUMMARY_OLD_RULE_EVIDENCE_INDEX = (
    "idx_paper_evidence_summary_old_rule_evidence"
)
_PAPER_EVIDENCE_SUMMARY_JOURNAL_FAMILY_INDEX = (
    "idx_paper_evidence_summary_journal_family"
)
_PAPER_EVIDENCE_SUMMARY_OLD_JOURNAL_FAMILY_INDEX = (
    "idx_paper_evidence_summary_old_journal_family"
)
PAPER_RELATION_EVIDENCE_TABLE = "solemd.paper_relation_evidence"
_PAPER_RELATION_EVIDENCE_STAGE_TABLE = "solemd.paper_relation_evidence_next"
_PAPER_RELATION_EVIDENCE_OLD_TABLE = "solemd.paper_relation_evidence_old"
_PAPER_RELATION_EVIDENCE_PKEY = "paper_relation_evidence_pkey"
_PAPER_RELATION_EVIDENCE_OLD_PKEY = "paper_relation_evidence_old_pkey"
_PAPER_RELATION_EVIDENCE_CORPUS_FKEY = "paper_relation_evidence_corpus_id_fkey"
_PAPER_RELATION_EVIDENCE_OLD_CORPUS_FKEY = "paper_relation_evidence_old_corpus_id_fkey"
_PAPER_RELATION_EVIDENCE_TYPE_COUNT_INDEX = "idx_paper_relation_evidence_type_count"
_PAPER_RELATION_EVIDENCE_OLD_TYPE_COUNT_INDEX = (
    "idx_paper_relation_evidence_old_type_count"
)

_DROP_PAPER_EVIDENCE_SUMMARY_STAGE_SQL = (
    f"DROP TABLE IF EXISTS {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE}"
)
_DROP_PAPER_EVIDENCE_SUMMARY_OLD_SQL = (
    f"DROP TABLE IF EXISTS {_PAPER_EVIDENCE_SUMMARY_OLD_TABLE}"
)
_DROP_PAPER_RELATION_EVIDENCE_STAGE_SQL = (
    f"DROP TABLE IF EXISTS {_PAPER_RELATION_EVIDENCE_STAGE_TABLE}"
)
_DROP_PAPER_RELATION_EVIDENCE_OLD_SQL = (
    f"DROP TABLE IF EXISTS {_PAPER_RELATION_EVIDENCE_OLD_TABLE}"
)


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


def _create_paper_evidence_summary_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
SELECT * FROM stg_paper_evidence
"""


def _create_paper_relation_evidence_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
SELECT * FROM stg_paper_relation_evidence
"""


def _finalize_paper_evidence_summary_stage(cur) -> None:
    cur.execute(_create_paper_evidence_summary_stage_sql(_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE))
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE}
            ALTER COLUMN corpus_id SET NOT NULL,
            ALTER COLUMN admission_reason SET NOT NULL,
            ALTER COLUMN citation_count SET NOT NULL,
            ALTER COLUMN citation_count SET DEFAULT 0,
            ALTER COLUMN venue_normalized SET NOT NULL,
            ALTER COLUMN venue_normalized SET DEFAULT '',
            ALTER COLUMN has_vocab_match SET NOT NULL,
            ALTER COLUMN has_vocab_match SET DEFAULT false,
            ALTER COLUMN paper_entity_count SET NOT NULL,
            ALTER COLUMN paper_entity_count SET DEFAULT 0,
            ALTER COLUMN has_entity_rule_hit SET NOT NULL,
            ALTER COLUMN has_entity_rule_hit SET DEFAULT false,
            ALTER COLUMN paper_relation_count SET NOT NULL,
            ALTER COLUMN paper_relation_count SET DEFAULT 0,
            ALTER COLUMN relation_categories_csv DROP NOT NULL,
            ALTER COLUMN has_relation_rule_hit SET NOT NULL,
            ALTER COLUMN has_relation_rule_hit SET DEFAULT false,
            ALTER COLUMN has_rule_evidence SET NOT NULL,
            ALTER COLUMN has_rule_evidence SET DEFAULT false,
            ALTER COLUMN has_curated_journal_family SET NOT NULL,
            ALTER COLUMN has_curated_journal_family SET DEFAULT false,
            ALTER COLUMN entity_rule_families SET NOT NULL,
            ALTER COLUMN entity_rule_families SET DEFAULT 0,
            ALTER COLUMN entity_rule_count SET NOT NULL,
            ALTER COLUMN entity_rule_count SET DEFAULT 0,
            ALTER COLUMN entity_core_families SET NOT NULL,
            ALTER COLUMN entity_core_families SET DEFAULT 0,
            ALTER COLUMN journal_score_multiplier SET NOT NULL,
            ALTER COLUMN journal_score_multiplier SET DEFAULT 1.0,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now(),
            ALTER COLUMN updated_at SET NOT NULL,
            ALTER COLUMN updated_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE} IS
            'Durable per-paper evidence summary used to admit mapped papers '
            'into base_points without rescanning raw PubTator evidence on '
            'every publish.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE}
            ADD CONSTRAINT paper_evidence_summary_next_corpus_id_fkey
            FOREIGN KEY (corpus_id) REFERENCES solemd.corpus (corpus_id)
            ON DELETE CASCADE
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE}
            ADD CONSTRAINT paper_evidence_summary_next_pkey
            PRIMARY KEY (corpus_id)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_paper_evidence_summary_next_pmid
            ON {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE} (pmid)
            WHERE pmid IS NOT NULL
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_paper_evidence_summary_next_rule_evidence
            ON {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE} (has_rule_evidence)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_paper_evidence_summary_next_journal_family
            ON {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE} (journal_family_key)
            WHERE journal_family_key IS NOT NULL
        """
    )


def _finalize_paper_relation_evidence_stage(cur) -> None:
    cur.execute(_create_paper_relation_evidence_stage_sql(_PAPER_RELATION_EVIDENCE_STAGE_TABLE))
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_RELATION_EVIDENCE_STAGE_TABLE}
            ALTER COLUMN corpus_id SET NOT NULL,
            ALTER COLUMN relation_type SET NOT NULL,
            ALTER COLUMN relation_count SET NOT NULL,
            ALTER COLUMN relation_count SET DEFAULT 0,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now(),
            ALTER COLUMN updated_at SET NOT NULL,
            ALTER COLUMN updated_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_PAPER_RELATION_EVIDENCE_STAGE_TABLE} IS
            'Durable per-paper relation-type counts used by runtime relation '
            'recall so the service does not rescan raw PubTator relation rows '
            'on every request.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_RELATION_EVIDENCE_STAGE_TABLE}
            ADD CONSTRAINT paper_relation_evidence_next_corpus_id_fkey
            FOREIGN KEY (corpus_id) REFERENCES solemd.corpus (corpus_id)
            ON DELETE CASCADE
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_PAPER_RELATION_EVIDENCE_STAGE_TABLE}
            ADD CONSTRAINT paper_relation_evidence_next_pkey
            PRIMARY KEY (corpus_id, relation_type)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_paper_relation_evidence_next_type_count
            ON {_PAPER_RELATION_EVIDENCE_STAGE_TABLE}
            (relation_type, relation_count DESC, corpus_id)
        """
    )


def _swap_paper_evidence_summary_stage(cur) -> None:
    cur.execute("SET LOCAL lock_timeout = '10s'")
    cur.execute(_DROP_PAPER_EVIDENCE_SUMMARY_OLD_SQL)
    cur.execute(
        f"ALTER TABLE IF EXISTS {PAPER_EVIDENCE_SUMMARY_TABLE} "
        f"RENAME TO {_PAPER_EVIDENCE_SUMMARY_OLD_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_PAPER_EVIDENCE_SUMMARY_OLD_TABLE}
            RENAME CONSTRAINT {_PAPER_EVIDENCE_SUMMARY_CORPUS_FKEY}
            TO {_PAPER_EVIDENCE_SUMMARY_OLD_CORPUS_FKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_PAPER_EVIDENCE_SUMMARY_OLD_TABLE}
            RENAME CONSTRAINT {_PAPER_EVIDENCE_SUMMARY_PKEY}
            TO {_PAPER_EVIDENCE_SUMMARY_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_PAPER_EVIDENCE_SUMMARY_PMID_INDEX}
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_OLD_PMID_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_PAPER_EVIDENCE_SUMMARY_RULE_EVIDENCE_INDEX}
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_OLD_RULE_EVIDENCE_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_PAPER_EVIDENCE_SUMMARY_JOURNAL_FAMILY_INDEX}
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_OLD_JOURNAL_FAMILY_INDEX}
        """
    )
    cur.execute(
        f"ALTER TABLE {_PAPER_EVIDENCE_SUMMARY_STAGE_TABLE} "
        f"RENAME TO {PAPER_EVIDENCE_SUMMARY_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE {PAPER_EVIDENCE_SUMMARY_TABLE}
            RENAME CONSTRAINT paper_evidence_summary_next_corpus_id_fkey
            TO {_PAPER_EVIDENCE_SUMMARY_CORPUS_FKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {PAPER_EVIDENCE_SUMMARY_TABLE}
            RENAME CONSTRAINT paper_evidence_summary_next_pkey
            TO {_PAPER_EVIDENCE_SUMMARY_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_paper_evidence_summary_next_pmid
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_PMID_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_paper_evidence_summary_next_rule_evidence
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_RULE_EVIDENCE_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_paper_evidence_summary_next_journal_family
            RENAME TO {_PAPER_EVIDENCE_SUMMARY_JOURNAL_FAMILY_INDEX}
        """
    )
    cur.execute(_DROP_PAPER_EVIDENCE_SUMMARY_OLD_SQL)


def _swap_paper_relation_evidence_stage(cur) -> None:
    cur.execute("SET LOCAL lock_timeout = '10s'")
    cur.execute(_DROP_PAPER_RELATION_EVIDENCE_OLD_SQL)
    cur.execute(
        f"ALTER TABLE IF EXISTS {PAPER_RELATION_EVIDENCE_TABLE} "
        f"RENAME TO {_PAPER_RELATION_EVIDENCE_OLD_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_PAPER_RELATION_EVIDENCE_OLD_TABLE}
            RENAME CONSTRAINT {_PAPER_RELATION_EVIDENCE_CORPUS_FKEY}
            TO {_PAPER_RELATION_EVIDENCE_OLD_CORPUS_FKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_PAPER_RELATION_EVIDENCE_OLD_TABLE}
            RENAME CONSTRAINT {_PAPER_RELATION_EVIDENCE_PKEY}
            TO {_PAPER_RELATION_EVIDENCE_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_PAPER_RELATION_EVIDENCE_TYPE_COUNT_INDEX}
            RENAME TO {_PAPER_RELATION_EVIDENCE_OLD_TYPE_COUNT_INDEX}
        """
    )
    cur.execute(
        f"ALTER TABLE {_PAPER_RELATION_EVIDENCE_STAGE_TABLE} "
        f"RENAME TO {PAPER_RELATION_EVIDENCE_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE {PAPER_RELATION_EVIDENCE_TABLE}
            RENAME CONSTRAINT paper_relation_evidence_next_corpus_id_fkey
            TO {_PAPER_RELATION_EVIDENCE_CORPUS_FKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {PAPER_RELATION_EVIDENCE_TABLE}
            RENAME CONSTRAINT paper_relation_evidence_next_pkey
            TO {_PAPER_RELATION_EVIDENCE_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_paper_relation_evidence_next_type_count
            RENAME TO {_PAPER_RELATION_EVIDENCE_TYPE_COUNT_INDEX}
        """
    )
    cur.execute(_DROP_PAPER_RELATION_EVIDENCE_OLD_SQL)


@observe(name=SPAN_GRAPH_EVIDENCE)
def refresh_paper_evidence_summary() -> dict[str, int]:
    """Refresh paper evidence serving tables with a stage/swap cutover."""
    mapped_predicate = mapped_paper_predicate_sql("c", "p")

    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        cur.execute(_DROP_PAPER_EVIDENCE_SUMMARY_STAGE_SQL)
        cur.execute(_DROP_PAPER_EVIDENCE_SUMMARY_OLD_SQL)
        cur.execute(_DROP_PAPER_RELATION_EVIDENCE_STAGE_SQL)
        cur.execute(_DROP_PAPER_RELATION_EVIDENCE_OLD_SQL)

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
                    string_agg(
                        DISTINCT ea.entity_type,
                        ', ' ORDER BY ea.entity_type
                    ) FILTER (WHERE COALESCE(ea.entity_type, '') <> '') AS semantic_groups_csv,
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
                    ranked.corpus_id,
                    COALESCE(SUM(ranked.relation_count), 0)::INTEGER AS paper_relation_count,
                    string_agg(
                        ranked.relation_type,
                        ', ' ORDER BY ranked.relation_count DESC, ranked.relation_type
                    ) FILTER (WHERE ranked.rank <= 5) AS relation_categories_csv
                FROM (
                    SELECT
                        rel.*,
                        row_number() OVER (
                            PARTITION BY rel.corpus_id
                            ORDER BY rel.relation_count DESC, rel.relation_type
                        ) AS rank
                    FROM stg_paper_relation_evidence rel
                ) ranked
                GROUP BY ranked.corpus_id
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
                ea.semantic_groups_csv,
                COALESCE(ea.has_entity_rule_hit, false) AS has_entity_rule_hit,
                COALESCE(rca.paper_relation_count, 0) AS paper_relation_count,
                rca.relation_categories_csv,
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

        _finalize_paper_evidence_summary_stage(cur)
        _finalize_paper_relation_evidence_stage(cur)

        _swap_paper_evidence_summary_stage(cur)
        _swap_paper_relation_evidence_stage(cur)
        counts = _load_paper_evidence_counts(cur)
        conn.commit()

    with db.connect_autocommit() as conn, conn.cursor() as cur:
        cur.execute(f"ANALYZE {PAPER_EVIDENCE_SUMMARY_TABLE}")
        cur.execute(f"ANALYZE {PAPER_RELATION_EVIDENCE_TABLE}")

    refresh_graph_paper_summary()

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
