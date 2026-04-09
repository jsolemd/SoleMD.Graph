"""Entity-based paper search SQL — exact/fuzzy entity matching + graph-scoped retrieval."""

from app.rag._queries_paper_core import (
    ENTITY_MENTION_CONCEPT_KEY_SQL,
    ENTITY_MENTION_TYPE_KEY_SQL,
    ENTITY_TABLE_CONCEPT_KEY_SQL,
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
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        CASE
            WHEN {ENTITY_TABLE_CONCEPT_KEY_SQL} = qt.raw_term
              OR {ENTITY_TABLE_CONCEPT_KEY_SQL} = qt.upper_term
              OR e.concept_id = qt.raw_term
              OR e.concept_id = qt.upper_term
            THEN 1.0
            ELSE 0.98
        END AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON (
        {ENTITY_TABLE_CONCEPT_KEY_SQL} = qt.raw_term
        OR {ENTITY_TABLE_CONCEPT_KEY_SQL} = qt.upper_term
        OR e.concept_id = qt.raw_term
        OR e.concept_id = qt.upper_term
        OR lower(e.canonical_name) = qt.lowered_term
      )
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


def _entity_matched_corpus_scores_cte_sql(*, scoped_to_selection: bool) -> str:
    scope_sql = "WHERE pem.corpus_id = ANY(%s)"
    if not scoped_to_selection:
        scope_sql = """
    JOIN graph_scope gs
      ON gs.corpus_id = pem.corpus_id
"""
    return f"""
matched_corpus_scores AS (
    SELECT
        pem.corpus_id,
        {ENTITY_CANDIDATE_SCORE_SQL.strip()} AS entity_candidate_score
    FROM top_concepts tc
    JOIN solemd.paper_entity_mentions pem
      ON {ENTITY_MENTION_TYPE_KEY_SQL} = tc.entity_type
     AND {ENTITY_MENTION_CONCEPT_KEY_SQL} = tc.concept_id
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    {scope_sql.strip()}
    GROUP BY pem.corpus_id
)
"""


def _paper_entity_search_sql(*, exact_only: bool, scoped_to_selection: bool) -> str:
    ctes: list[str] = [ENTITY_QUERY_TERMS_CTE_SQL, ENTITY_EXACT_MATCHES_CTE_SQL]
    if not exact_only:
        ctes.extend(
            [
                ENTITY_FUZZY_QUERY_TERMS_CTE_SQL,
                ENTITY_FUZZY_MATCHES_CTE_SQL,
                ENTITY_MATCHED_CONCEPTS_CTE_SQL,
            ]
        )
    ctes.append(_entity_top_concepts_cte_sql(exact_only=exact_only))
    if not scoped_to_selection:
        ctes.append(ENTITY_GRAPH_SCOPE_CTE_SQL)
    ctes.append(
        _entity_matched_corpus_scores_cte_sql(
            scoped_to_selection=scoped_to_selection,
        )
    )
    return "WITH " + ",\n".join(ctes) + ",\n" + ENTITY_RANKED_PAPERS_SELECT_SQL


PAPER_ENTITY_EXACT_SEARCH_SQL = _paper_entity_search_sql(
    exact_only=True,
    scoped_to_selection=False,
)
PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL = _paper_entity_search_sql(
    exact_only=True,
    scoped_to_selection=True,
)
PAPER_ENTITY_SEARCH_SQL = _paper_entity_search_sql(
    exact_only=False,
    scoped_to_selection=False,
)
PAPER_ENTITY_SEARCH_IN_SELECTION_SQL = _paper_entity_search_sql(
    exact_only=False,
    scoped_to_selection=True,
)
