"""Canonical base-admission materialization for graph runs."""

from __future__ import annotations

from app import db
from app.graph.render_policy import renderable_point_predicate_sql


BUILD_WORK_MEM = "256MB"
BUILD_MAX_PARALLEL_WORKERS_PER_GATHER = 4
BUILD_EFFECTIVE_IO_CONCURRENCY = 64
BUILD_RANDOM_PAGE_COST = "1.1"


def _apply_build_session_settings(cur) -> None:
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


def load_active_base_policy(cur) -> dict:
    cur.execute(
        """
        SELECT policy_version, target_base_count
        FROM solemd.base_policy
        WHERE is_active = true
        ORDER BY updated_at DESC, policy_version DESC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError("no active base policy configured")
    return row


def get_active_base_policy_version() -> str:
    with db.pooled() as conn, conn.cursor() as cur:
        policy = load_active_base_policy(cur)
    return str(policy["policy_version"])


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
            true AS is_journal_base,
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
            is_journal_base = COALESCE(jrnl.is_journal_base, false),
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
            is_direct_evidence = (
                (src.admission_reason IN ('journal_and_vocab', 'vocab_entity_match'))
                OR pes.has_entity_rule_hit
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
            COUNT(*) FILTER (WHERE is_direct_evidence)::INTEGER AS direct_evidence_count,
            COUNT(*) FILTER (WHERE is_journal_base)::INTEGER AS journal_base_count
        FROM solemd.paper_evidence_summary
        """
    )
    counts = cur.fetchone()
    return {
        "paper_count": counts["paper_count"],
        "direct_evidence_count": counts["direct_evidence_count"],
        "journal_base_count": counts["journal_base_count"],
    }


PAPER_EVIDENCE_STAGES = ("source", "entity", "relation", "journal", "finalize")


def refresh_paper_evidence_summary_stage(stage: str) -> dict[str, int | str]:
    if stage not in PAPER_EVIDENCE_STAGES:
        raise ValueError(f"unsupported paper evidence stage: {stage}")

    with db.pooled() as conn, conn.cursor() as cur:
        _apply_build_session_settings(cur)
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


def materialize_base_policy(graph_run_id: str) -> dict[str, object]:
    renderable_predicate = renderable_point_predicate_sql("gp")

    with db.pooled() as conn, conn.cursor() as cur:
        _apply_build_session_settings(cur)
        policy = load_active_base_policy(cur)
        policy_version = str(policy["policy_version"])

        cur.execute(
            """
            SELECT COUNT(*)::INTEGER AS missing_count
            FROM solemd.graph_points gp
            LEFT JOIN solemd.paper_evidence_summary pes ON pes.corpus_id = gp.corpus_id
            WHERE gp.graph_run_id = %s
              AND pes.corpus_id IS NULL
            """,
            (graph_run_id,),
        )
        missing = cur.fetchone()["missing_count"]
        if missing:
            raise RuntimeError(
                "paper_evidence_summary is missing "
                f"{missing} mapped papers for graph run {graph_run_id}; "
                "refresh evidence summary before materializing base admission"
            )

        cur.execute(
            "DELETE FROM solemd.graph_base_features WHERE graph_run_id = %s",
            (graph_run_id,),
        )

        cur.execute(
            """
            CREATE TEMP TABLE tmp_graph_base_features
            ON COMMIT DROP AS
            SELECT
                gp.graph_run_id,
                gp.corpus_id,
                pes.admission_reason,
                pes.has_vocab_match,
                pes.has_entity_rule_hit,
                pes.has_relation_rule_hit,
                pes.is_direct_evidence,
                pes.is_journal_base,
                pes.journal_family_key,
                pes.journal_family_label,
                pes.journal_family_type,
                CASE
                    WHEN pes.is_direct_evidence AND pes.is_journal_base THEN 'direct+journal'
                    WHEN pes.is_direct_evidence THEN 'direct'
                    WHEN pes.is_journal_base THEN 'journal'
                    ELSE 'hidden'
                END AS base_source,
                pes.citation_count,
                pes.paper_entity_count,
                pes.paper_relation_count,
                CASE
                    WHEN pes.is_direct_evidence AND pes.is_journal_base THEN 2500::REAL
                    WHEN pes.is_direct_evidence THEN 2000::REAL
                    WHEN pes.is_journal_base THEN 1200::REAL
                    ELSE 0::REAL
                END
                + CASE COALESCE(pes.journal_family_type, '')
                    WHEN 'general_flagship' THEN 320::REAL
                    WHEN 'domain_flagship' THEN 280::REAL
                    WHEN 'domain_base' THEN 220::REAL
                    WHEN 'organ_overlap' THEN 180::REAL
                    WHEN 'specialty' THEN 140::REAL
                    ELSE 0::REAL
                  END
                + CASE
                    WHEN pes.has_vocab_match THEN 120::REAL
                    ELSE 0::REAL
                  END
                + CASE
                    WHEN pes.has_entity_rule_hit THEN 90::REAL
                    ELSE 0::REAL
                  END
                + CASE
                    WHEN pes.has_relation_rule_hit THEN 100::REAL
                    ELSE 0::REAL
                  END
                + (LN(1 + pes.citation_count::REAL) * 20::REAL)
                + (LN(1 + pes.paper_entity_count::REAL) * 8::REAL)
                + (LN(1 + pes.paper_relation_count::REAL) * 10::REAL)
                AS base_rank
            FROM solemd.graph_points gp
            JOIN solemd.paper_evidence_summary pes ON pes.corpus_id = gp.corpus_id
            WHERE gp.graph_run_id = %s
            """,
            (graph_run_id,),
        )

        cur.execute(
            """
            INSERT INTO solemd.graph_base_features (
                graph_run_id,
                corpus_id,
                admission_reason,
                has_vocab_match,
                has_entity_rule_hit,
                has_relation_rule_hit,
                is_direct_evidence,
                is_journal_base,
                journal_family_key,
                journal_family_label,
                journal_family_type,
                base_source,
                citation_count,
                paper_entity_count,
                paper_relation_count
            )
            SELECT
                graph_run_id,
                corpus_id,
                admission_reason,
                has_vocab_match,
                has_entity_rule_hit,
                has_relation_rule_hit,
                is_direct_evidence,
                is_journal_base,
                journal_family_key,
                journal_family_label,
                journal_family_type,
                base_source,
                citation_count,
                paper_entity_count,
                paper_relation_count
            FROM tmp_graph_base_features
            """
        )

        cur.execute(
            f"""
            UPDATE solemd.graph_points gp
            SET is_in_base = (
                    ({renderable_predicate})
                    AND COALESCE(tmp.base_source, 'hidden') <> 'hidden'
                ),
                base_rank = CASE
                    WHEN ({renderable_predicate})
                      AND COALESCE(tmp.base_source, 'hidden') <> 'hidden'
                    THEN COALESCE(tmp.base_rank, 0)
                    ELSE 0
                END
            FROM tmp_graph_base_features tmp
            WHERE gp.graph_run_id = %s
              AND gp.graph_run_id = tmp.graph_run_id
              AND gp.corpus_id = tmp.corpus_id
            """,
            (graph_run_id,),
        )

        cur.execute(
            f"""
            SELECT
                COUNT(*) FILTER (WHERE gp.is_in_base)::INTEGER AS base_count,
                COUNT(*) FILTER (
                    WHERE ({renderable_predicate})
                      AND gp.is_in_base = false
                )::INTEGER AS universe_count,
                COUNT(*) FILTER (WHERE ({renderable_predicate}))::INTEGER AS renderable_count,
                COUNT(*) FILTER (WHERE NOT ({renderable_predicate}))::INTEGER AS non_renderable_count
            FROM solemd.graph_points gp
            WHERE gp.graph_run_id = %s
            """,
            (graph_run_id,),
        )
        counts = cur.fetchone()

        cur.execute(
            """
            SELECT
                c.admission_reason,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_points gp
            JOIN solemd.corpus c ON c.corpus_id = gp.corpus_id
            WHERE gp.graph_run_id = %s
              AND gp.is_in_base = true
            GROUP BY c.admission_reason
            ORDER BY paper_count DESC, c.admission_reason
            """,
            (graph_run_id,),
        )
        counts_by_admission_reason = {
            row["admission_reason"]: row["paper_count"] for row in cur.fetchall()
        }

        cur.execute(
            """
            SELECT
                base_source,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_base_features
            WHERE graph_run_id = %s
            GROUP BY base_source
            ORDER BY paper_count DESC, base_source
            """,
            (graph_run_id,),
        )
        counts_by_base_source = {
            row["base_source"]: row["paper_count"] for row in cur.fetchall()
        }

        cur.execute(
            """
            SELECT
                journal_family_key,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_base_features f
            JOIN solemd.graph_points gp
              ON gp.graph_run_id = f.graph_run_id
             AND gp.corpus_id = f.corpus_id
            WHERE f.graph_run_id = %s
              AND gp.is_in_base = true
              AND f.journal_family_key IS NOT NULL
            GROUP BY journal_family_key
            ORDER BY paper_count DESC, journal_family_key
            LIMIT 15
            """,
            (graph_run_id,),
        )
        top_journal_families = {
            row["journal_family_key"]: row["paper_count"] for row in cur.fetchall()
        }

        conn.commit()

    return {
        "policy_version": policy_version,
        "target_base_count": int(policy["target_base_count"]),
        "base_count": counts["base_count"],
        "universe_count": counts["universe_count"],
        "renderable_count": counts["renderable_count"],
        "non_renderable_count": counts["non_renderable_count"],
        "counts_by_admission_reason": counts_by_admission_reason,
        "counts_by_base_source": counts_by_base_source,
        "top_journal_families": top_journal_families,
    }
