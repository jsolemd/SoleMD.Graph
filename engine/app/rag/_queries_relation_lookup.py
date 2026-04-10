"""Relation-based paper search and direct paper lookup SQL."""

from app.rag._queries_paper_core import (
    PAPER_CORE_JOINS,
    PAPER_SELECT_COLUMNS,
    RANKED_PAPER_SELECT_COLUMNS,
)

PAPER_RELATION_SEARCH_SQL = f"""
WITH graph_scope AS MATERIALIZED (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
),
query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS MATERIALIZED (
    SELECT
        pre.corpus_id,
        LEAST(1.0, 0.35 + (ln(SUM(pre.relation_count) + 1) * 0.2)) AS relation_candidate_score
    FROM solemd.paper_relation_evidence pre
    JOIN query_terms qt
      ON pre.relation_type = qt.normalized_term
    JOIN graph_scope gs
      ON gs.corpus_id = pre.corpus_id
    GROUP BY pre.corpus_id
),
candidate_papers AS MATERIALIZED (
    SELECT
        mcs.corpus_id,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    ORDER BY
        mcs.relation_candidate_score DESC,
        mcs.corpus_id DESC
    LIMIT GREATEST(%s::integer * 40, 200)
),
ranked_papers AS MATERIALIZED (
    SELECT
        {PAPER_SELECT_COLUMNS},
        cp.relation_candidate_score
    FROM candidate_papers cp
    JOIN solemd.papers p
      ON p.corpus_id = cp.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.relation_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.relation_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_CURRENT_MAP_SQL = f"""
WITH query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS MATERIALIZED (
    SELECT
        pre.corpus_id,
        LEAST(1.0, 0.35 + (ln(SUM(pre.relation_count) + 1) * 0.2)) AS relation_candidate_score
    FROM solemd.paper_relation_evidence pre
    JOIN query_terms qt
      ON pre.relation_type = qt.normalized_term
    JOIN solemd.corpus scope_corpus
      ON scope_corpus.corpus_id = pre.corpus_id
     AND scope_corpus.is_in_current_map IS TRUE
    GROUP BY pre.corpus_id
),
candidate_papers AS MATERIALIZED (
    SELECT
        mcs.corpus_id,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    ORDER BY
        mcs.relation_candidate_score DESC,
        mcs.corpus_id DESC
    LIMIT GREATEST(%s::integer * 40, 200)
),
ranked_papers AS MATERIALIZED (
    SELECT
        {PAPER_SELECT_COLUMNS},
        cp.relation_candidate_score
    FROM candidate_papers cp
    JOIN solemd.papers p
      ON p.corpus_id = cp.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.relation_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.relation_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_IN_SELECTION_SQL = f"""
WITH query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS MATERIALIZED (
    SELECT
        pre.corpus_id,
        LEAST(1.0, 0.35 + (ln(SUM(pre.relation_count) + 1) * 0.2)) AS relation_candidate_score
    FROM solemd.paper_relation_evidence pre
    JOIN query_terms qt
      ON pre.relation_type = qt.normalized_term
    WHERE pre.corpus_id = ANY(%s)
    GROUP BY pre.corpus_id
),
candidate_papers AS MATERIALIZED (
    SELECT
        mcs.corpus_id,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    ORDER BY
        mcs.relation_candidate_score DESC,
        mcs.corpus_id DESC
    LIMIT GREATEST(%s::integer * 40, 200)
),
ranked_papers AS MATERIALIZED (
    SELECT
        {PAPER_SELECT_COLUMNS},
        cp.relation_candidate_score
    FROM candidate_papers cp
    JOIN solemd.papers p
      ON p.corpus_id = cp.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.relation_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.relation_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


PAPER_LOOKUP_SQL = f"""
SELECT
    {PAPER_SELECT_COLUMNS}
FROM solemd.papers p
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
{PAPER_CORE_JOINS}
WHERE p.corpus_id = ANY(%s)
ORDER BY p.corpus_id
"""


PAPER_LOOKUP_DIRECT_SQL = f"""
SELECT
    {PAPER_SELECT_COLUMNS}
FROM solemd.papers p
{PAPER_CORE_JOINS}
WHERE p.corpus_id = ANY(%s)
ORDER BY p.corpus_id
"""
