"""Metadata-aware paper search SQL for citation-like biomedical queries."""

from app.rag._queries_paper_core import (
    GRAPH_INPUT_CTE_SQL,
    PAPER_CORE_JOINS,
    PAPER_SEARCH_VECTOR_SQL,
    PAPER_SELECT_COLUMNS,
)

PAPER_NORMALIZED_TITLE_VECTOR_SQL = """
to_tsvector(
    'english',
    solemd.normalize_title_key(COALESCE(p.title, ''))
)
""".strip()


def _metadata_scope_parts(scope_mode: str) -> dict[str, str]:
    if scope_mode == "graph":
        return {
            "graph_input_cte_sql": GRAPH_INPUT_CTE_SQL,
            "author_scope_join_sql": """
    CROSS JOIN graph_input
    JOIN solemd.graph_points author_scope
      ON author_scope.graph_run_id = graph_input.graph_run_id
     AND author_scope.corpus_id = pa.corpus_id
""",
            "author_scope_filter_sql": "",
            "paper_scope_join_sql": """
    CROSS JOIN graph_input
    JOIN solemd.graph_points paper_scope
      ON paper_scope.graph_run_id = graph_input.graph_run_id
     AND paper_scope.corpus_id = p.corpus_id
""",
            "paper_scope_filter_sql": "",
        }
    if scope_mode == "current_map":
        return {
            "graph_input_cte_sql": "",
            "author_scope_join_sql": "",
            "author_scope_filter_sql": """
            AND EXISTS (
                SELECT 1
                FROM solemd.corpus author_scope
                WHERE author_scope.corpus_id = pa.corpus_id
                  AND author_scope.is_in_current_map IS TRUE
            )
""",
            "paper_scope_join_sql": "",
            "paper_scope_filter_sql": """
        AND EXISTS (
            SELECT 1
            FROM solemd.corpus paper_scope
            WHERE paper_scope.corpus_id = p.corpus_id
              AND paper_scope.is_in_current_map IS TRUE
        )
""",
        }
    if scope_mode == "selection":
        return {
            "graph_input_cte_sql": "",
            "author_scope_join_sql": "",
            "author_scope_filter_sql": "\n        AND pa.corpus_id = ANY(%s)",
            "paper_scope_join_sql": "",
            "paper_scope_filter_sql": "\n        AND p.corpus_id = ANY(%s)",
        }
    raise ValueError(f"Unsupported metadata scope mode: {scope_mode}")


def _metadata_match_sql(*, scope_mode: str) -> str:
    scope = _metadata_scope_parts(scope_mode)
    cte_parts = [QUERY_INPUT_CTE_SQL]
    if scope["graph_input_cte_sql"]:
        cte_parts.append(scope["graph_input_cte_sql"].strip())
    cte_block = ",\n".join(cte_parts)
    return f"""
WITH {cte_block},
author_matches AS MATERIALIZED (
    SELECT
        matched_authors.corpus_id,
        MAX(matched_authors.author_match_score) AS author_match_score
    FROM (
        SELECT
            pa.corpus_id,
            CASE
                WHEN pa.author_position = 1 THEN 1.0
                WHEN pa.author_position = 2 THEN 0.9
                ELSE 0.78
            END AS author_match_score
        FROM solemd.paper_authors pa
        CROSS JOIN query_input
        {scope["author_scope_join_sql"].strip()}
        WHERE
            query_input.author_query <> ''
            {scope["author_scope_filter_sql"]}
            AND COALESCE(pa.name, '') <> ''
            AND lower(pa.name) = query_input.author_query
        UNION ALL
        SELECT
            pa.corpus_id,
            CASE
                WHEN pa.author_position = 1 THEN 0.96
                WHEN pa.author_position = 2 THEN 0.82
                ELSE 0.68
            END AS author_match_score
        FROM solemd.paper_authors pa
        CROSS JOIN query_input
        {scope["author_scope_join_sql"].strip()}
        WHERE
            query_input.author_ts_query IS NOT NULL
            {scope["author_scope_filter_sql"]}
            AND COALESCE(pa.name, '') <> ''
            AND to_tsvector('simple', COALESCE(pa.name, '')) @@ query_input.author_ts_query
    ) matched_authors
    GROUP BY matched_authors.corpus_id
),
journal_matches AS MATERIALIZED (
    SELECT
        matched_journals.corpus_id,
        MAX(matched_journals.journal_match_score) AS journal_match_score
    FROM (
        SELECT
            p.corpus_id,
            0.9 AS journal_match_score
        FROM solemd.papers p
        CROSS JOIN query_input
        {scope["paper_scope_join_sql"].strip()}
        WHERE
            query_input.journal_query <> ''
            {scope["paper_scope_filter_sql"]}
            AND solemd.clean_venue(COALESCE(p.journal_name, p.venue, ''))
                = query_input.journal_query
        UNION ALL
        SELECT
            p.corpus_id,
            0.68 AS journal_match_score
        FROM solemd.papers p
        CROSS JOIN query_input
        {scope["paper_scope_join_sql"].strip()}
        WHERE
            query_input.journal_ts_query IS NOT NULL
            {scope["paper_scope_filter_sql"]}
            AND to_tsvector(
                'simple',
                solemd.clean_venue(COALESCE(p.journal_name, p.venue, ''))
            ) @@ query_input.journal_ts_query
    ) matched_journals
    GROUP BY matched_journals.corpus_id
),
publication_type_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.85 AS publication_type_match_score
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        cardinality(query_input.publication_type_queries) > 0
        {scope["paper_scope_filter_sql"]}
        AND COALESCE(p.publication_types, ARRAY[]::text[])
            && query_input.publication_type_queries
),
filter_candidate_corpus_ids AS MATERIALIZED (
    SELECT corpus_id FROM author_matches
    UNION
    SELECT corpus_id FROM journal_matches
    UNION
    SELECT corpus_id FROM publication_type_matches
),
topic_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score
    FROM filter_candidate_corpus_ids filter_candidates
    JOIN solemd.papers p
      ON p.corpus_id = filter_candidates.corpus_id
    CROSS JOIN query_input
    WHERE
        (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
),
topic_matches AS MATERIALIZED (
    SELECT
        candidate.corpus_id,
        MAX(candidate.lexical_score) AS lexical_score
    FROM topic_candidates candidate
    GROUP BY candidate.corpus_id
),
topic_year_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        query_input.year_query IS NOT NULL
        {scope["paper_scope_filter_sql"]}
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
),
candidate_corpus_ids AS MATERIALIZED (
    SELECT corpus_id FROM filter_candidate_corpus_ids
    UNION
    SELECT corpus_id FROM topic_year_matches
),
candidate_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        GREATEST(
            COALESCE(MAX(topic_matches.lexical_score), 0),
            COALESCE(MAX(topic_year_matches.lexical_score), 0)
        ) AS lexical_score,
        (
            COALESCE(author_matches.author_match_score, 0)
            + COALESCE(journal_matches.journal_match_score, 0)
            + COALESCE(publication_type_matches.publication_type_match_score, 0)
            + CASE
                WHEN MAX(topic_matches.lexical_score) > 0
                THEN MAX(topic_matches.lexical_score) * 0.35
                ELSE 0
            END
            + CASE
                WHEN MAX(topic_year_matches.lexical_score) > 0
                THEN MAX(topic_year_matches.lexical_score) * 0.45
                ELSE 0
            END
        ) AS metadata_score,
        ARRAY_REMOVE(
            ARRAY[
                CASE WHEN author_matches.corpus_id IS NOT NULL THEN 'author' END,
                CASE WHEN journal_matches.corpus_id IS NOT NULL THEN 'journal' END,
                CASE
                    WHEN MAX(topic_year_matches.corpus_id) IS NOT NULL
                    THEN 'year'
                END,
                CASE
                    WHEN publication_type_matches.corpus_id IS NOT NULL
                    THEN 'publication_type'
                END,
                CASE
                    WHEN (
                        MAX(topic_matches.corpus_id) IS NOT NULL
                        OR MAX(topic_year_matches.corpus_id) IS NOT NULL
                    )
                    THEN 'topic'
                END
            ],
            NULL
        )::text[] AS metadata_match_fields,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM candidate_corpus_ids
    JOIN solemd.papers p
      ON p.corpus_id = candidate_corpus_ids.corpus_id
    LEFT JOIN author_matches
      ON author_matches.corpus_id = p.corpus_id
    LEFT JOIN journal_matches
      ON journal_matches.corpus_id = p.corpus_id
    LEFT JOIN publication_type_matches
      ON publication_type_matches.corpus_id = p.corpus_id
    LEFT JOIN topic_matches
      ON topic_matches.corpus_id = p.corpus_id
    LEFT JOIN topic_year_matches
      ON topic_year_matches.corpus_id = p.corpus_id
    GROUP BY
        p.corpus_id,
        p.citation_count,
        author_matches.author_match_score,
        author_matches.corpus_id,
        journal_matches.journal_match_score,
        journal_matches.corpus_id,
        publication_type_matches.publication_type_match_score,
        publication_type_matches.corpus_id
    ORDER BY
        metadata_score DESC,
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    candidate_matches.lexical_score,
    0.0 AS title_similarity,
    candidate_matches.metadata_score,
    candidate_matches.metadata_match_fields
FROM candidate_matches
JOIN solemd.papers p
  ON p.corpus_id = candidate_matches.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    candidate_matches.metadata_score DESC,
    candidate_matches.lexical_score DESC,
    candidate_matches.citation_count DESC,
    candidate_matches.corpus_id DESC
LIMIT %s
"""


QUERY_INPUT_CTE_SQL = """
query_input AS NOT MATERIALIZED (
    SELECT
        trim(%s)::text AS topic_query,
        CASE
            WHEN trim(%s) = '' THEN NULL::tsquery
            ELSE websearch_to_tsquery('english', %s)
        END AS topic_ts_query,
        trim(%s)::text AS normalized_topic_query,
        CASE
            WHEN trim(%s) = '' THEN NULL::tsquery
            ELSE websearch_to_tsquery('english', %s)
        END AS normalized_topic_ts_query,
        lower(trim(%s))::text AS author_query,
        CASE
            WHEN trim(%s) = '' THEN NULL::tsquery
            ELSE plainto_tsquery('simple', lower(trim(%s)))
        END AS author_ts_query,
        solemd.clean_venue(trim(%s))::text AS journal_query,
        CASE
            WHEN trim(%s) = '' THEN NULL::tsquery
            ELSE plainto_tsquery('simple', solemd.clean_venue(trim(%s)))
        END AS journal_ts_query,
        %s::integer AS year_query,
        COALESCE(%s::text[], ARRAY[]::text[]) AS publication_type_queries
)
""".strip()


PAPER_METADATA_SEARCH_SQL = _metadata_match_sql(scope_mode="graph")
PAPER_METADATA_SEARCH_CURRENT_MAP_SQL = _metadata_match_sql(scope_mode="current_map")
PAPER_METADATA_SEARCH_IN_SELECTION_SQL = _metadata_match_sql(scope_mode="selection")


def _publication_type_topic_sql(*, scope_mode: str) -> str:
    scope = _metadata_scope_parts(scope_mode)
    cte_parts = [QUERY_INPUT_CTE_SQL]
    if scope["graph_input_cte_sql"]:
        cte_parts.append(scope["graph_input_cte_sql"].strip())
    cte_block = ",\n".join(cte_parts)
    return f"""
WITH {cte_block},
publication_type_topic_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        0.85 AS publication_type_match_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        cardinality(query_input.publication_type_queries) > 0
        {scope["paper_scope_filter_sql"]}
        AND COALESCE(p.publication_types, ARRAY[]::text[])
            && query_input.publication_type_queries
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    publication_type_topic_matches.lexical_score,
    0.0 AS title_similarity,
    (
        publication_type_topic_matches.publication_type_match_score
        + CASE
            WHEN publication_type_topic_matches.lexical_score > 0
            THEN publication_type_topic_matches.lexical_score * 0.4
            ELSE 0
        END
    ) AS metadata_score,
    ARRAY['publication_type', 'topic']::text[] AS metadata_match_fields
FROM publication_type_topic_matches
JOIN solemd.papers p
  ON p.corpus_id = publication_type_topic_matches.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    metadata_score DESC,
    publication_type_topic_matches.lexical_score DESC,
    publication_type_topic_matches.citation_count DESC,
    publication_type_topic_matches.corpus_id DESC
LIMIT %s
"""


PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_SQL = _publication_type_topic_sql(scope_mode="graph")
PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_CURRENT_MAP_SQL = _publication_type_topic_sql(
    scope_mode="current_map"
)
PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_IN_SELECTION_SQL = _publication_type_topic_sql(
    scope_mode="selection"
)


def _author_year_sql(*, scope_mode: str) -> str:
    scope = _metadata_scope_parts(scope_mode)
    cte_parts = [QUERY_INPUT_CTE_SQL]
    if scope["graph_input_cte_sql"]:
        cte_parts.append(scope["graph_input_cte_sql"].strip())
    cte_block = ",\n".join(cte_parts)
    return f"""
WITH {cte_block},
author_exact_matches AS MATERIALIZED (
    SELECT
        pa.corpus_id,
        CASE
            WHEN pa.author_position = 1 THEN 1.0
            WHEN pa.author_position = 2 THEN 0.9
            ELSE 0.78
        END AS author_match_score,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.paper_authors pa
    JOIN solemd.papers p
      ON p.corpus_id = pa.corpus_id
    CROSS JOIN query_input
    {scope["author_scope_join_sql"].strip()}
    WHERE
        query_input.author_query <> ''
        AND query_input.year_query IS NOT NULL
        {scope["author_scope_filter_sql"]}
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND COALESCE(pa.name, '') <> ''
        AND lower(pa.name) = query_input.author_query
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        pa.corpus_id DESC
    LIMIT %s
),
author_fts_matches AS MATERIALIZED (
    SELECT
        pa.corpus_id,
        CASE
            WHEN pa.author_position = 1 THEN 0.96
            WHEN pa.author_position = 2 THEN 0.82
            ELSE 0.68
        END AS author_match_score,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.paper_authors pa
    JOIN solemd.papers p
      ON p.corpus_id = pa.corpus_id
    CROSS JOIN query_input
    {scope["author_scope_join_sql"].strip()}
    WHERE
        query_input.author_ts_query IS NOT NULL
        AND query_input.year_query IS NOT NULL
        {scope["author_scope_filter_sql"]}
        AND NOT EXISTS (SELECT 1 FROM author_exact_matches)
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND COALESCE(pa.name, '') <> ''
        AND to_tsvector('simple', COALESCE(pa.name, '')) @@ query_input.author_ts_query
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        pa.corpus_id DESC
    LIMIT %s
),
author_matches_present AS MATERIALIZED (
    SELECT 1 AS present FROM author_exact_matches
    UNION ALL
    SELECT 1 AS present FROM author_fts_matches
    LIMIT 1
),
topic_year_fallback_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.0 AS author_match_score,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        query_input.year_query IS NOT NULL
        {scope["paper_scope_filter_sql"]}
        AND NOT EXISTS (SELECT 1 FROM author_matches_present)
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
candidate_matches AS MATERIALIZED (
    SELECT
        candidate.corpus_id,
        candidate.lexical_score,
        (
            candidate.author_match_score
            + CASE
                WHEN candidate.lexical_score > 0
                THEN candidate.lexical_score * 0.45
                ELSE 0
            END
        ) AS metadata_score,
        CASE
            WHEN candidate.author_match_score > 0
            THEN ARRAY['author', 'year', 'topic']::text[]
            ELSE ARRAY['year', 'topic']::text[]
        END AS metadata_match_fields,
        candidate.citation_count
    FROM (
        SELECT * FROM author_exact_matches
        UNION ALL
        SELECT * FROM author_fts_matches
        UNION ALL
        SELECT * FROM topic_year_fallback_matches
    ) candidate
    ORDER BY
        metadata_score DESC,
        candidate.lexical_score DESC,
        candidate.citation_count DESC,
        candidate.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    candidate_matches.lexical_score,
    0.0 AS title_similarity,
    candidate_matches.metadata_score,
    candidate_matches.metadata_match_fields
FROM candidate_matches
JOIN solemd.papers p
  ON p.corpus_id = candidate_matches.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    candidate_matches.metadata_score DESC,
    candidate_matches.lexical_score DESC,
    candidate_matches.citation_count DESC,
    candidate_matches.corpus_id DESC
LIMIT %s
"""


PAPER_AUTHOR_YEAR_SEARCH_SQL = _author_year_sql(scope_mode="graph")
PAPER_AUTHOR_YEAR_SEARCH_CURRENT_MAP_SQL = _author_year_sql(scope_mode="current_map")
PAPER_AUTHOR_YEAR_SEARCH_IN_SELECTION_SQL = _author_year_sql(scope_mode="selection")


def _journal_year_sql(*, scope_mode: str) -> str:
    scope = _metadata_scope_parts(scope_mode)
    cte_parts = [QUERY_INPUT_CTE_SQL]
    if scope["graph_input_cte_sql"]:
        cte_parts.append(scope["graph_input_cte_sql"].strip())
    cte_block = ",\n".join(cte_parts)
    return f"""
WITH {cte_block},
journal_exact_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.9 AS journal_match_score,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        query_input.journal_query <> ''
        AND query_input.year_query IS NOT NULL
        {scope["paper_scope_filter_sql"]}
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND solemd.clean_venue(COALESCE(p.journal_name, p.venue, ''))
            = query_input.journal_query
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
journal_fts_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.68 AS journal_match_score,
        GREATEST(
            COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.topic_ts_query), 0),
            COALESCE(
                ts_rank_cd(
                    {PAPER_NORMALIZED_TITLE_VECTOR_SQL},
                    query_input.normalized_topic_ts_query
                ),
                0
            )
        ) AS lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    {scope["paper_scope_join_sql"].strip()}
    WHERE
        query_input.journal_ts_query IS NOT NULL
        AND query_input.year_query IS NOT NULL
        {scope["paper_scope_filter_sql"]}
        AND NOT EXISTS (SELECT 1 FROM journal_exact_matches)
        AND p.year BETWEEN query_input.year_query - 1 AND query_input.year_query + 1
        AND to_tsvector(
            'simple',
            solemd.clean_venue(COALESCE(p.journal_name, p.venue, ''))
        ) @@ query_input.journal_ts_query
        AND (
            (
                query_input.topic_ts_query IS NOT NULL
                AND {PAPER_SEARCH_VECTOR_SQL} @@ query_input.topic_ts_query
            )
            OR (
                query_input.normalized_topic_ts_query IS NOT NULL
                AND {PAPER_NORMALIZED_TITLE_VECTOR_SQL} @@ query_input.normalized_topic_ts_query
            )
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
candidate_matches AS MATERIALIZED (
    SELECT
        candidate.corpus_id,
        candidate.lexical_score,
        (
            candidate.journal_match_score
            + CASE
                WHEN candidate.lexical_score > 0
                THEN candidate.lexical_score * 0.45
                ELSE 0
            END
        ) AS metadata_score,
        ARRAY['journal', 'year', 'topic']::text[] AS metadata_match_fields,
        candidate.citation_count
    FROM (
        SELECT * FROM journal_exact_matches
        UNION ALL
        SELECT * FROM journal_fts_matches
    ) candidate
    ORDER BY
        metadata_score DESC,
        candidate.lexical_score DESC,
        candidate.citation_count DESC,
        candidate.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    candidate_matches.lexical_score,
    0.0 AS title_similarity,
    candidate_matches.metadata_score,
    candidate_matches.metadata_match_fields
FROM candidate_matches
JOIN solemd.papers p
  ON p.corpus_id = candidate_matches.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    candidate_matches.metadata_score DESC,
    candidate_matches.lexical_score DESC,
    candidate_matches.citation_count DESC,
    candidate_matches.corpus_id DESC
LIMIT %s
"""


PAPER_JOURNAL_YEAR_SEARCH_SQL = _journal_year_sql(scope_mode="graph")
PAPER_JOURNAL_YEAR_SEARCH_CURRENT_MAP_SQL = _journal_year_sql(scope_mode="current_map")
PAPER_JOURNAL_YEAR_SEARCH_IN_SELECTION_SQL = _journal_year_sql(scope_mode="selection")
