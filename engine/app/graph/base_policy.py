"""Canonical base admission for mapped graph runs."""

from __future__ import annotations

from app import db
from app.graph.paper_evidence import apply_build_session_settings
from app.graph.render_policy import renderable_point_predicate_sql


FLAGSHIP_FAMILY_SQL = "'domain_flagship', 'general_flagship'"
EXCLUDED_VOCAB_FAMILY_SQL = "'critical_care_specialty', 'palliative_specialty'"


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

        cur.execute(
            "DELETE FROM solemd.graph_base_features WHERE graph_run_id = %s",
            (graph_run_id,),
        )

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
                CASE
                    WHEN pes.has_rule_evidence THEN 'rule'
                    WHEN pes.journal_family_key IN ({FLAGSHIP_FAMILY_SQL}) THEN 'flagship'
                    WHEN pes.admission_reason = 'vocab_entity_match'
                     AND (
                        pes.journal_family_key IS NULL
                        OR pes.journal_family_key NOT IN ({EXCLUDED_VOCAB_FAMILY_SQL})
                     )
                    THEN 'vocab'
                    ELSE NULL
                END AS base_reason,
                pes.citation_count,
                pes.paper_entity_count,
                pes.paper_relation_count,
                CASE
                    WHEN pes.has_rule_evidence THEN 3000::REAL
                    WHEN pes.journal_family_key IN ({FLAGSHIP_FAMILY_SQL}) THEN 2000::REAL
                    WHEN pes.admission_reason = 'vocab_entity_match'
                     AND (
                        pes.journal_family_key IS NULL
                        OR pes.journal_family_key NOT IN ({EXCLUDED_VOCAB_FAMILY_SQL})
                     )
                    THEN 1000::REAL
                    ELSE 0::REAL
                END
                + (LN(1 + pes.citation_count::REAL) * 20::REAL)
                + (LN(1 + pes.paper_entity_count::REAL) * 8::REAL)
                + (LN(1 + pes.paper_relation_count::REAL) * 10::REAL)
                + CASE
                    WHEN p.year >= 2020 THEN 6::REAL
                    WHEN p.year >= 2010 THEN 4::REAL
                    WHEN p.year >= 2000 THEN 2::REAL
                    ELSE 0::REAL
                  END
                AS base_rank
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
                graph_run_id,
                corpus_id,
                admission_reason,
                has_vocab_match,
                has_entity_rule_hit,
                has_relation_rule_hit,
                has_rule_evidence,
                has_curated_journal_family,
                journal_family_key,
                journal_family_label,
                journal_family_type,
                base_reason,
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
                has_rule_evidence,
                has_curated_journal_family,
                journal_family_key,
                journal_family_label,
                journal_family_type,
                base_reason,
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
                    AND tmp.base_reason IS NOT NULL
                ),
                base_rank = CASE
                    WHEN ({renderable_predicate}) AND tmp.base_reason IS NOT NULL
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
                base_reason,
                COUNT(*)::INTEGER AS paper_count
            FROM solemd.graph_base_features
            WHERE graph_run_id = %s
              AND base_reason IS NOT NULL
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
        "counts_by_base_reason": counts_by_base_reason,
        "top_journal_families": top_journal_families,
    }
