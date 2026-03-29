"""Durable per-paper evidence summary for base admission."""

from __future__ import annotations

from app import db


BUILD_WORK_MEM = "256MB"
BUILD_MAX_PARALLEL_WORKERS_PER_GATHER = 4
BUILD_EFFECTIVE_IO_CONCURRENCY = 64
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
            ({paper_alias}.publication_types IS NULL OR CARDINALITY({paper_alias}.publication_types) = 0)
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


def _create_tmp_paper_evidence_source(cur) -> None:
    mapped_predicate = mapped_paper_predicate_sql("c", "p")
    cur.execute(
        f"""
        CREATE TEMP TABLE tmp_paper_evidence_source
        ON COMMIT DROP AS
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
        CREATE UNIQUE INDEX tmp_paper_evidence_source_corpus_idx
          ON tmp_paper_evidence_source (corpus_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX tmp_paper_evidence_source_pmid_idx
          ON tmp_paper_evidence_source (pmid)
          WHERE pmid IS NOT NULL
        """
    )
    cur.execute(
        """
        CREATE INDEX tmp_paper_evidence_source_venue_idx
          ON tmp_paper_evidence_source (venue_normalized)
        """
    )
    cur.execute("ANALYZE tmp_paper_evidence_source")


def _sync_paper_evidence_source_rows(cur) -> None:
    _create_tmp_paper_evidence_source(cur)
    cur.execute(
        """
        INSERT INTO solemd.paper_evidence_summary (
            corpus_id,
            admission_reason,
            pmid,
            citation_count,
            venue_normalized
        )
        SELECT
            src.corpus_id,
            src.admission_reason,
            src.pmid,
            src.citation_count,
            src.venue_normalized
        FROM tmp_paper_evidence_source src
        ON CONFLICT (corpus_id) DO UPDATE
        SET
            admission_reason = EXCLUDED.admission_reason,
            pmid = EXCLUDED.pmid,
            citation_count = EXCLUDED.citation_count,
            venue_normalized = EXCLUDED.venue_normalized,
            updated_at = now()
        """
    )


def _refresh_paper_evidence_entity_fields(cur) -> None:
    mapped_predicate = mapped_paper_predicate_sql("c", "p")
    cur.execute(
        f"""
        CREATE TEMP TABLE tmp_paper_entity_summary
        ON COMMIT DROP AS
        SELECT
            c.corpus_id,
            COUNT(*)::INTEGER AS paper_entity_count,
            COALESCE(BOOL_OR(er.entity_type IS NOT NULL), false) AS has_entity_rule_hit
        FROM pubtator.entity_annotations ea
        JOIN solemd.corpus c ON c.pmid = ea.pmid
        JOIN solemd.papers p ON p.corpus_id = c.corpus_id
        LEFT JOIN solemd.entity_rule er
          ON er.entity_type = ea.entity_type
         AND er.concept_id = ea.concept_id
         AND COALESCE(p.citation_count, 0) >= COALESCE(er.min_citation_count, 0)
        WHERE {mapped_predicate}
        GROUP BY c.corpus_id
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX tmp_paper_entity_summary_corpus_idx
          ON tmp_paper_entity_summary (corpus_id)
        """
    )
    cur.execute("ANALYZE tmp_paper_entity_summary")

    cur.execute(
        """
        UPDATE solemd.paper_evidence_summary pes
        SET
            paper_entity_count = COALESCE(ent.paper_entity_count, 0),
            has_entity_rule_hit = COALESCE(ent.has_entity_rule_hit, false),
            updated_at = now()
        FROM tmp_paper_evidence_source src
        LEFT JOIN tmp_paper_entity_summary ent ON ent.corpus_id = src.corpus_id
        WHERE pes.corpus_id = src.corpus_id
        """
    )


def _refresh_paper_evidence_relation_fields(cur) -> None:
    mapped_predicate = mapped_paper_predicate_sql("c", "p")
    cur.execute(
        f"""
        CREATE TEMP TABLE tmp_paper_relation_summary
        ON COMMIT DROP AS
        SELECT
            c.corpus_id,
            COUNT(*)::INTEGER AS paper_relation_count,
            COALESCE(BOOL_OR(rr.subject_type IS NOT NULL), false) AS has_relation_rule_hit
        FROM pubtator.relations r
        JOIN solemd.corpus c ON c.pmid = r.pmid
        JOIN solemd.papers p ON p.corpus_id = c.corpus_id
        LEFT JOIN solemd.relation_rule rr
          ON rr.subject_type = r.subject_type
         AND rr.relation_type = r.relation_type
         AND rr.object_type = r.object_type
         AND rr.object_id = r.object_id
         AND rr.target_scope = 'base'
         AND COALESCE(p.citation_count, 0) >= COALESCE(rr.min_citation_count, 0)
        WHERE {mapped_predicate}
        GROUP BY c.corpus_id
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX tmp_paper_relation_summary_corpus_idx
          ON tmp_paper_relation_summary (corpus_id)
        """
    )
    cur.execute("ANALYZE tmp_paper_relation_summary")

    cur.execute(
        """
        UPDATE solemd.paper_evidence_summary pes
        SET
            paper_relation_count = COALESCE(rel.paper_relation_count, 0),
            has_relation_rule_hit = COALESCE(rel.has_relation_rule_hit, false),
            updated_at = now()
        FROM tmp_paper_evidence_source src
        LEFT JOIN tmp_paper_relation_summary rel ON rel.corpus_id = src.corpus_id
        WHERE pes.corpus_id = src.corpus_id
        """
    )


def _refresh_paper_evidence_journal_fields(cur) -> None:
    cur.execute(
        """
        CREATE TEMP TABLE tmp_paper_journal_summary
        ON COMMIT DROP AS
        SELECT
            src.corpus_id,
            true AS has_curated_journal_family,
            jf.family_key AS journal_family_key,
            jf.family_label AS journal_family_label,
            jf.family_type AS journal_family_type
        FROM tmp_paper_evidence_source src
        JOIN solemd.journal_rule jr
          ON jr.venue_normalized = src.venue_normalized
         AND jr.include_in_corpus = true
        JOIN solemd.base_journal_family jf
          ON jf.family_key = jr.family_key
         AND jf.include_in_base = true
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX tmp_paper_journal_summary_corpus_idx
          ON tmp_paper_journal_summary (corpus_id)
        """
    )
    cur.execute("ANALYZE tmp_paper_journal_summary")

    cur.execute(
        """
        UPDATE solemd.paper_evidence_summary pes
        SET
            has_curated_journal_family = COALESCE(jrnl.has_curated_journal_family, false),
            journal_family_key = jrnl.journal_family_key,
            journal_family_label = jrnl.journal_family_label,
            journal_family_type = jrnl.journal_family_type,
            updated_at = now()
        FROM tmp_paper_evidence_source src
        LEFT JOIN tmp_paper_journal_summary jrnl ON jrnl.corpus_id = src.corpus_id
        WHERE pes.corpus_id = src.corpus_id
        """
    )


def _finalize_paper_evidence_summary(cur) -> None:
    cur.execute(
        """
        UPDATE solemd.paper_evidence_summary pes
        SET
            has_vocab_match = (
                src.admission_reason IN ('journal_and_vocab', 'vocab_entity_match')
            ),
            has_rule_evidence = (
                pes.has_entity_rule_hit
                OR pes.has_relation_rule_hit
            ),
            updated_at = now()
        FROM tmp_paper_evidence_source src
        WHERE pes.corpus_id = src.corpus_id
        """
    )

    cur.execute(
        """
        DELETE FROM solemd.paper_evidence_summary pes
        WHERE NOT EXISTS (
            SELECT 1
            FROM tmp_paper_evidence_source src
            WHERE src.corpus_id = pes.corpus_id
        )
        """
    )


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


def refresh_paper_evidence_summary_stage(stage: str) -> dict[str, int | str]:
    if stage not in PAPER_EVIDENCE_STAGES:
        raise ValueError(f"unsupported paper evidence stage: {stage}")

    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        _sync_paper_evidence_source_rows(cur)

        if stage == "entity":
            _refresh_paper_evidence_entity_fields(cur)
        elif stage == "relation":
            _refresh_paper_evidence_relation_fields(cur)
        elif stage == "journal":
            _refresh_paper_evidence_journal_fields(cur)
        elif stage == "finalize":
            _finalize_paper_evidence_summary(cur)

        counts = _load_paper_evidence_counts(cur)
        conn.commit()

    return {
        "stage": stage,
        **counts,
    }


def refresh_paper_evidence_summary() -> dict[str, int]:
    for stage in PAPER_EVIDENCE_STAGES:
        refresh_paper_evidence_summary_stage(stage)

    with db.pooled() as conn, conn.cursor() as cur:
        counts = _load_paper_evidence_counts(cur)
    return counts
