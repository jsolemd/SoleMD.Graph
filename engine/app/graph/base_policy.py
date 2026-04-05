"""Canonical base admission for mapped graph runs.

Base admission uses continuous domain-density scoring.  Every mapped paper
receives a ``domain_score`` and the top ``target_base_count`` papers (from
``solemd.base_policy``) enter base; the rest stay in universe.

The score rewards family diversity (squared), core psych/neuro family hits,
citation impact, annotation density, flagship journal membership, and recency.
"""

from __future__ import annotations

from app import db
from app.graph.paper_evidence import apply_build_session_settings
from app.graph.render_policy import renderable_point_predicate_sql


# ── Domain-density score formula ──────────────────────────────────────
# Weights calibrated to produce ~500K base from 2.6M mapped papers.
# See docs/map/database.md § Base Scoring for rationale.
#
# Journal multiplier is data-driven: read from paper_evidence_summary
# (populated from base_journal_family.score_multiplier during evidence refresh).
# flagship=1.5x (with domain signal), penalized=0.3x, everything else=1.0x.
DOMAIN_SCORE_SQL = """
(
    -- Base domain score
    LEAST(
        pes.entity_rule_families * pes.entity_rule_families
        * LEAST(pes.entity_rule_count, 20),
        2000
    )::REAL
    + pes.entity_core_families * 200::REAL
    + CASE WHEN pes.has_relation_rule_hit THEN 500::REAL ELSE 0::REAL END
    + LN(1 + pes.citation_count::REAL) * 40::REAL
    + LN(1 + pes.paper_entity_count::REAL) * 10::REAL
    + LN(1 + pes.paper_relation_count::REAL) * 15::REAL
    + CASE
        WHEN p.year >= 2020 THEN 30::REAL
        WHEN p.year >= 2015 THEN 20::REAL
        WHEN p.year >= 2010 THEN 10::REAL
        WHEN p.year >= 2000 THEN  5::REAL
        ELSE 0::REAL
      END
)
-- Journal multiplier: read from paper_evidence_summary (populated from base_journal_family)
* CASE
    WHEN pes.journal_score_multiplier > 1.0
         AND (pes.entity_core_families > 0
              OR pes.entity_rule_families > 0
              OR pes.has_relation_rule_hit)
    THEN pes.journal_score_multiplier
    WHEN pes.journal_score_multiplier < 1.0
    THEN pes.journal_score_multiplier
    ELSE 1.0::REAL
  END
-- Flagship venue floor: 200 for journals with multiplier > 1.0
+ CASE
    WHEN pes.journal_score_multiplier > 1.0
    THEN 200::REAL
    ELSE 0::REAL
  END
"""


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


def materialize_base_admission(graph_run_id: str) -> dict[str, object]:
    renderable_predicate = renderable_point_predicate_sql("gp")

    # Phase 1: Validate, TRUNCATE, compute, INSERT — then commit to release lock
    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
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

        target_base_count = int(policy["target_base_count"])

        cur.execute("SET LOCAL lock_timeout = '10s'")
        cur.execute("TRUNCATE solemd.graph_base_features")
        cur.execute("TRUNCATE solemd.graph_base_points")

        # Score every mapped paper with the continuous domain-density formula
        cur.execute(
            f"""
            CREATE TEMP TABLE tmp_graph_base_features
            ON COMMIT DROP AS
            SELECT
                gp.graph_run_id,
                gp.corpus_id,
                pes.admission_reason,
                pes.has_vocab_match,
                pes.has_entity_rule_hit,
                pes.has_relation_rule_hit,
                pes.has_rule_evidence,
                pes.has_curated_journal_family,
                pes.journal_family_key,
                pes.journal_family_label,
                pes.journal_family_type,
                -- Descriptive label (not a gate — the score decides admission)
                CASE
                    WHEN pes.has_rule_evidence THEN 'rule'
                    WHEN pes.journal_score_multiplier > 1.0 THEN 'flagship'
                    WHEN pes.has_vocab_match THEN 'vocab'
                    ELSE 'scored'
                END AS base_reason,
                pes.citation_count,
                pes.paper_entity_count,
                pes.paper_relation_count,
                ({DOMAIN_SCORE_SQL}) AS domain_score,
                COALESCE(gp.outlier_score, 0) AS outlier_score
            FROM solemd.graph_points gp
            JOIN solemd.paper_evidence_summary pes ON pes.corpus_id = gp.corpus_id
            JOIN solemd.papers p ON p.corpus_id = gp.corpus_id
            WHERE gp.graph_run_id = %s
            """,
            (graph_run_id,),
        )

        cur.execute(
            """
            INSERT INTO solemd.graph_base_features (
                graph_run_id, corpus_id, admission_reason,
                has_vocab_match, has_entity_rule_hit, has_relation_rule_hit,
                has_rule_evidence, has_curated_journal_family,
                journal_family_key, journal_family_label, journal_family_type,
                base_reason, citation_count, paper_entity_count, paper_relation_count
            )
            SELECT
                graph_run_id, corpus_id, admission_reason,
                has_vocab_match, has_entity_rule_hit, has_relation_rule_hit,
                has_rule_evidence, has_curated_journal_family,
                journal_family_key, journal_family_label, journal_family_type,
                base_reason, citation_count, paper_entity_count, paper_relation_count
            FROM tmp_graph_base_features
            """
        )

        # Top-K by domain_score: only non-outlier papers enter base
        cur.execute(
            """
            INSERT INTO solemd.graph_base_points (
                graph_run_id, corpus_id, base_reason, base_rank
            )
            SELECT graph_run_id, corpus_id, base_reason, domain_score
            FROM (
                SELECT *,
                    ROW_NUMBER() OVER (ORDER BY domain_score DESC) AS rn
                FROM tmp_graph_base_features
                WHERE outlier_score = 0
            ) ranked
            WHERE rn <= %s
            """,
            (target_base_count,),
        )
        conn.commit()

    # Phase 2: ANALYZE (autocommit, no lock held)
    with db.connect_autocommit() as conn, conn.cursor() as cur:
        cur.execute("ANALYZE solemd.graph_base_features")
        cur.execute("ANALYZE solemd.graph_base_points")

    # Phase 3: Reporting queries — lightweight reads, no exclusive lock
    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)

        cur.execute(
            f"""
            SELECT
                COUNT(*) FILTER (
                    WHERE ({renderable_predicate})
                      AND bp.corpus_id IS NOT NULL
                )::INTEGER AS base_count,
                COUNT(*) FILTER (
                    WHERE ({renderable_predicate})
                      AND bp.corpus_id IS NULL
                )::INTEGER AS universe_count,
                COUNT(*) FILTER (WHERE ({renderable_predicate}))::INTEGER AS renderable_count,
                COUNT(*) FILTER (WHERE NOT ({renderable_predicate}))::INTEGER AS non_renderable_count
            FROM solemd.graph_points gp
            LEFT JOIN solemd.graph_base_points bp
              ON bp.graph_run_id = gp.graph_run_id
             AND bp.corpus_id = gp.corpus_id
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
            FROM solemd.graph_base_points bp
            JOIN solemd.corpus c ON c.corpus_id = bp.corpus_id
            WHERE bp.graph_run_id = %s
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
                base_reason,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_base_points
            WHERE graph_run_id = %s
            GROUP BY base_reason
            ORDER BY paper_count DESC, base_reason
            """,
            (graph_run_id,),
        )
        counts_by_base_reason = {
            row["base_reason"]: row["paper_count"] for row in cur.fetchall()
        }

        cur.execute(
            """
            SELECT
                f.journal_family_key,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_base_features f
            JOIN solemd.graph_base_points bp
              ON bp.graph_run_id = f.graph_run_id
             AND bp.corpus_id = f.corpus_id
            WHERE f.graph_run_id = %s
              AND f.journal_family_key IS NOT NULL
            GROUP BY f.journal_family_key
            ORDER BY paper_count DESC, f.journal_family_key
            LIMIT 15
            """,
            (graph_run_id,),
        )
        top_journal_families = {
            row["journal_family_key"]: row["paper_count"] for row in cur.fetchall()
        }

    return {
        "policy_version": policy_version,
        "target_base_count": int(policy["target_base_count"]),
        "base_count": counts["base_count"],
        "universe_count": counts["universe_count"],
        "renderable_count": counts["renderable_count"],
        "non_renderable_count": counts["non_renderable_count"],
        "counts_by_admission_reason": counts_by_admission_reason,
        "counts_by_base_reason": counts_by_base_reason,
        "top_journal_families": top_journal_families,
    }
