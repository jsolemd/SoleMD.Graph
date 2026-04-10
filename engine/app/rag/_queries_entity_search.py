"""Entity-based paper search SQL — exact/fuzzy entity matching + graph-scoped retrieval."""

from app.rag._queries_paper_core import (
    ENTITY_MENTION_CONCEPT_KEY_SQL,
    ENTITY_MENTION_NAMESPACE_KEY_SQL,
    ENTITY_MENTION_TYPE_KEY_SQL,
    ENTITY_RESOLVED_TOP_CONCEPTS_CTE_SQL,
    ENTITY_TABLE_CONCEPT_KEY_SQL,
    ENTITY_TABLE_NAMESPACE_KEY_SQL,
    ENTITY_TABLE_TYPE_KEY_SQL,
    PAPER_CORE_JOINS,
    PAPER_SELECT_COLUMNS,
    RANKED_PAPER_SELECT_COLUMNS,
)

# ---------------------------------------------------------------------------
# Shared CTE fragments (assembled by _paper_entity_search_sql)
# ---------------------------------------------------------------------------

ENTITY_QUERY_TERMS_CTE_SQL = """
query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
)
"""

ENTITY_EXACT_MATCHES_CTE_SQL = f"""
exact_matches AS MATERIALIZED (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = qt.raw_term
    WHERE COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = qt.upper_term
    WHERE qt.upper_term <> qt.raw_term
      AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('MESH:' || qt.raw_term)
    WHERE qt.raw_term NOT LIKE '%%:%%'
      AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('MESH:' || qt.upper_term)
    WHERE qt.raw_term NOT LIKE '%%:%%'
      AND qt.upper_term <> qt.raw_term
      AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        CASE
            WHEN ea.is_canonical THEN 0.98
            ELSE 0.97
        END AS concept_score
    FROM query_terms qt
    JOIN solemd.entity_aliases ea
      ON ea.alias_key = qt.lowered_term
    JOIN solemd.entities e
      ON e.concept_id = ea.concept_id
     AND e.entity_type = ea.entity_type
    WHERE COALESCE(e.concept_id, '') NOT IN ('', '-')
)
"""

ENTITY_FUZZY_QUERY_TERMS_CTE_SQL = """
fuzzy_query_terms AS MATERIALIZED (
    SELECT qt.raw_term, qt.lowered_term
    FROM query_terms qt
    WHERE NOT EXISTS (
        SELECT 1
        FROM exact_matches em
        WHERE em.lowered_term = qt.lowered_term
    )
)
"""

ENTITY_FUZZY_MATCHES_CTE_SQL = f"""
fuzzy_matches AS MATERIALIZED (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        GREATEST(
            CASE
                WHEN lower(e.canonical_name) LIKE ('%%' || qt.lowered_term || '%%') THEN 0.85
                ELSE 0.0
            END,
            similarity(lower(e.canonical_name), qt.lowered_term)
        ) AS concept_score
    FROM fuzzy_query_terms qt
    JOIN solemd.entities e
      ON (
        lower(e.canonical_name) LIKE ('%%' || qt.lowered_term || '%%')
        OR similarity(lower(e.canonical_name), qt.lowered_term) >= %s
      )
    WHERE COALESCE(e.concept_id, '') NOT IN ('', '-')
)
"""

ENTITY_MATCHED_CONCEPTS_CTE_SQL = """
matched_concepts AS MATERIALIZED (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM fuzzy_matches
)
"""

ENTITY_GRAPH_SCOPE_CTE_SQL = """
graph_scope AS MATERIALIZED (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
)
"""

ENTITY_CANDIDATE_SCORE_SQL = """
LEAST(
    1.35,
    MAX(tc.concept_score)
    + LEAST(
        0.18,
        GREATEST(COUNT(DISTINCT tc.lowered_term) - 1, 0)::DOUBLE PRECISION * 0.09
    )
    + LEAST(0.12, LN(COUNT(*) + 1) * 0.05)
    + LEAST(
        0.12,
        LN(
            COUNT(
                DISTINCT format(
                    '%%s:%%s',
                    COALESCE(pem.canonical_block_ordinal, -1),
                    COALESCE(pem.canonical_sentence_ordinal, -1)
                )
            ) + 1
        ) * 0.06
    )
    + LEAST(
        0.12,
        COUNT(*) FILTER (WHERE pb.is_retrieval_default IS TRUE)::DOUBLE PRECISION * 0.04
    )
)
"""

ENTITY_RANKED_PAPERS_SELECT_SQL = f"""
ranked_papers AS (
    SELECT
        {PAPER_SELECT_COLUMNS},
        mcs.entity_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.entity_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.entity_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


def _entity_top_concepts_cte_sql(*, exact_only: bool) -> str:
    source_cte = "exact_matches" if exact_only else "matched_concepts"
    source_alias = "em" if exact_only else "mc"
    return f"""
top_concepts AS (
    SELECT
        raw_term,
        lowered_term,
        entity_type,
        concept_namespace,
        concept_id,
        concept_score
    FROM (
        SELECT
            {source_alias}.*,
            row_number() OVER (
                PARTITION BY lowered_term
                ORDER BY concept_score DESC, paper_count DESC, concept_id
            ) AS concept_rank
        FROM {source_cte} {source_alias}
    ) ranked_concepts
    WHERE concept_rank <= %s
)
"""


def _entity_matched_corpus_scores_cte_sql(*, scope_mode: str) -> str:
    scope_join_sql = ""
    scope_filter_sql = ""
    if scope_mode == "selection":
        scope_filter_sql = "AND pem.corpus_id = ANY(%s)"
    elif scope_mode == "current_map":
        scope_join_sql = """
    JOIN solemd.corpus scope_corpus
      ON scope_corpus.corpus_id = pem.corpus_id
     AND scope_corpus.is_in_current_map IS TRUE
"""
    else:
        scope_join_sql = """
    JOIN graph_scope gs
      ON gs.corpus_id = pem.corpus_id
"""
    return f"""
matched_mentions AS MATERIALIZED (
    SELECT
        pem.corpus_id,
        pem.canonical_block_ordinal,
        tc.lowered_term,
        tc.concept_score,
        COALESCE(pb.is_retrieval_default, false) AS is_retrieval_default
    FROM top_concepts tc
    JOIN solemd.paper_entity_mentions pem
      ON {ENTITY_MENTION_NAMESPACE_KEY_SQL} = tc.concept_namespace
     AND {ENTITY_MENTION_CONCEPT_KEY_SQL} = tc.concept_id
    {scope_join_sql.strip()}
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    WHERE tc.concept_namespace IS NOT NULL
    {scope_filter_sql}
    UNION ALL
    SELECT
        pem.corpus_id,
        pem.canonical_block_ordinal,
        tc.lowered_term,
        tc.concept_score,
        COALESCE(pb.is_retrieval_default, false) AS is_retrieval_default
    FROM top_concepts tc
    JOIN solemd.paper_entity_mentions pem
      ON pem.runtime_concept_namespace_key IS NULL
     AND {ENTITY_MENTION_TYPE_KEY_SQL} = tc.entity_type
     AND {ENTITY_MENTION_CONCEPT_KEY_SQL} = tc.concept_id
    {scope_join_sql.strip()}
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    WHERE tc.concept_namespace IS NULL
    {scope_filter_sql}
),
matched_corpus_scores AS (
    SELECT
        mm.corpus_id,
        LEAST(
            1.35,
            MAX(mm.concept_score)
            + LEAST(
                0.18,
                GREATEST(COUNT(DISTINCT mm.lowered_term) - 1, 0)::DOUBLE PRECISION * 0.09
            )
            + LEAST(0.12, LN(COUNT(*) + 1) * 0.05)
            + LEAST(
                0.12,
                LN(
                    COUNT(
                        DISTINCT format(
                            '%%s:%%s',
                            COALESCE(mm.canonical_block_ordinal, -1),
                            -1
                        )
                    ) + 1
                ) * 0.06
            )
            + LEAST(
                0.12,
                COUNT(*) FILTER (
                    WHERE mm.is_retrieval_default
                )::DOUBLE PRECISION * 0.04
            )
        ) AS entity_candidate_score
    FROM matched_mentions mm
    GROUP BY mm.corpus_id
)
"""


def _paper_entity_exact_search_sql(*, scope_mode: str) -> str:
    ctes: list[str] = [ENTITY_RESOLVED_TOP_CONCEPTS_CTE_SQL]
    if scope_mode == "graph":
        ctes.append(ENTITY_GRAPH_SCOPE_CTE_SQL)
    ctes.append(
        _entity_matched_corpus_scores_cte_sql(
            scope_mode=scope_mode,
        )
    )
    return "WITH " + ",\n".join(ctes) + ",\n" + ENTITY_RANKED_PAPERS_SELECT_SQL


def _paper_entity_search_sql(*, scope_mode: str) -> str:
    ctes: list[str] = [
        ENTITY_QUERY_TERMS_CTE_SQL,
        ENTITY_EXACT_MATCHES_CTE_SQL,
        ENTITY_FUZZY_QUERY_TERMS_CTE_SQL,
        ENTITY_FUZZY_MATCHES_CTE_SQL,
        ENTITY_MATCHED_CONCEPTS_CTE_SQL,
        _entity_top_concepts_cte_sql(exact_only=False),
    ]
    if scope_mode == "graph":
        ctes.append(ENTITY_GRAPH_SCOPE_CTE_SQL)
    ctes.append(
        _entity_matched_corpus_scores_cte_sql(
            scope_mode=scope_mode,
        )
    )
    return "WITH " + ",\n".join(ctes) + ",\n" + ENTITY_RANKED_PAPERS_SELECT_SQL


PAPER_ENTITY_EXACT_SEARCH_SQL = _paper_entity_exact_search_sql(
    scope_mode="graph",
)
PAPER_ENTITY_EXACT_SEARCH_CURRENT_MAP_SQL = _paper_entity_exact_search_sql(
    scope_mode="current_map",
)
PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL = _paper_entity_exact_search_sql(
    scope_mode="selection",
)
PAPER_ENTITY_SEARCH_SQL = _paper_entity_search_sql(
    scope_mode="graph",
)
PAPER_ENTITY_SEARCH_CURRENT_MAP_SQL = _paper_entity_search_sql(
    scope_mode="current_map",
)
PAPER_ENTITY_SEARCH_IN_SELECTION_SQL = _paper_entity_search_sql(
    scope_mode="selection",
)
