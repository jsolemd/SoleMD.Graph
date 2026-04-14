"""Paper FTS search SQL — full-graph, in-selection, and title candidate variants."""

from app.rag._queries_paper_core import (
    GRAPH_INPUT_CTE_SQL,
    PAPER_CORE_JOINS,
    PAPER_GRAPH_JOIN_SQL,
    PAPER_GRAPH_WHERE_SQL,
    PAPER_NORMALIZED_TITLE_KEY_SQL,
    PAPER_NORMALIZED_TITLE_SIMILARITY_SQL,
    PAPER_SEARCH_VECTOR_SQL,
    PAPER_SELECT_COLUMNS,
    PAPER_TITLE_SIMILARITY_SQL,
    PAPER_TITLE_TEXT_SQL,
)


def _paper_search_sql(*, include_title_similarity: bool) -> str:
    fts_title_similarity_sql = (
        f"""
        GREATEST(
            {PAPER_TITLE_SIMILARITY_SQL},
            CASE
                WHEN query_input.normalized_title_query <> ''
                THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                ELSE 0.0
            END
        )
        """
        if include_title_similarity
        else "0.0"
    )
    # The historical ``title_matches`` and ``normalized_title_matches`` CTEs
    # were dropped because they combined four trigram predicates via OR —
    # ``LIKE '%X%'`` + ``% query`` + ``normalized_title_query <<% ...`` +
    # ``... LIKE '%Y%'`` — inside a BitmapOr over GiST/GIN trigram indexes
    # on a 14M-row papers table. On short title queries the trigram recheck
    # burned 30-60 s per call (see the docs/map/rag.md "title_similarity
    # fast-fail" note). The retained ``exact_title_matches`` (btree exact)
    # and ``fts_matches`` (GIN tsvector) cover the common cases — exact
    # title lookup and word-level containment via FTS. The inline
    # ``fts_title_similarity_sql`` still scores matched rows with
    # word_similarity/similarity so the title boost in ``final_order_sql``
    # still benefits genuine title queries.
    title_similarity_ctes = ""
    candidate_match_sources = """
        SELECT * FROM exact_title_matches
        UNION ALL
        SELECT * FROM fts_matches
"""
    final_order_sql = (
        "(mp.lexical_score + (mp.title_similarity * 0.15)) DESC"
        if include_title_similarity
        else "mp.lexical_score DESC"
    )
    return f"""
WITH query_input AS NOT MATERIALIZED (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS title_phrase_query,
        lower(%s) AS lowered_query,
        %s::text AS normalized_title_query
),
{GRAPH_INPUT_CTE_SQL},
exact_title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        2.0 AS lexical_score,
        1.0 AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE {PAPER_GRAPH_WHERE_SQL}
        AND (
            (
                query_input.lowered_query <> ''
                AND {PAPER_TITLE_TEXT_SQL} >= query_input.lowered_query
                AND {PAPER_TITLE_TEXT_SQL} <= query_input.lowered_query
            )
            OR (
                query_input.normalized_title_query <> ''
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} >= query_input.normalized_title_query
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} <= query_input.normalized_title_query
            )
        )
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
fts_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.ts_query), 0)
            + (
                COALESCE(
                    ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.title_phrase_query),
                    0
                ) * 0.35
            ) AS lexical_score,
        {fts_title_similarity_sql} AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND {PAPER_GRAPH_WHERE_SQL}
        AND (
            {PAPER_SEARCH_VECTOR_SQL} @@ query_input.ts_query
            OR {PAPER_SEARCH_VECTOR_SQL} @@ query_input.title_phrase_query
        )
    ORDER BY
        COALESCE(ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.ts_query), 0)
            + (
                COALESCE(
                    ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.title_phrase_query),
                    0
                ) * 0.35
            ) DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
){title_similarity_ctes},
search_matches AS MATERIALIZED (
    SELECT
        candidate_matches.corpus_id,
        MAX(candidate_matches.lexical_score) AS lexical_score,
        MAX(candidate_matches.title_similarity) AS title_similarity,
        MAX(candidate_matches.citation_count) AS citation_count
    FROM (
{candidate_match_sources}
    ) AS candidate_matches
    GROUP BY candidate_matches.corpus_id
),
matched_papers AS MATERIALIZED (
    SELECT
        sm.corpus_id,
        sm.lexical_score,
        sm.title_similarity,
        sm.citation_count
    FROM search_matches sm
    ORDER BY
        sm.lexical_score DESC,
        sm.citation_count DESC,
        sm.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    mp.lexical_score,
    mp.title_similarity
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    {final_order_sql},
    mp.citation_count DESC,
    mp.corpus_id DESC
"""


PAPER_SEARCH_SQL = _paper_search_sql(include_title_similarity=True)
PAPER_SEARCH_SQL_NO_TITLE_SIMILARITY = _paper_search_sql(include_title_similarity=False)


PAPER_SEARCH_IN_SELECTION_SQL = f"""
WITH query_input AS NOT MATERIALIZED (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS title_phrase_query,
        lower(%s) AS lowered_query,
        %s::text AS normalized_title_query,
        %s::boolean AS allow_title_similarity
),
exact_title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        2.0 AS lexical_score,
        1.0 AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        p.corpus_id = ANY(%s)
        AND (
            {PAPER_TITLE_TEXT_SQL} = query_input.lowered_query
            OR (
                query_input.normalized_title_query <> ''
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} = query_input.normalized_title_query
            )
        )
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
matched_papers AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(
            ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.ts_query),
            0
        ) + (
            COALESCE(
                ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.title_phrase_query),
                0
            ) * 0.35
        ) AS lexical_score,
        CASE
            WHEN query_input.allow_title_similarity THEN GREATEST(
                {PAPER_TITLE_SIMILARITY_SQL},
                CASE
                    WHEN query_input.normalized_title_query <> ''
                    THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                    ELSE 0.0
                END
            )
            ELSE 0.0
        END AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        p.corpus_id = ANY(%s)
        AND NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND (
            {PAPER_SEARCH_VECTOR_SQL} @@ query_input.ts_query
            OR {PAPER_SEARCH_VECTOR_SQL} @@ query_input.title_phrase_query
            OR (
                query_input.allow_title_similarity
                AND (
                    {PAPER_TITLE_TEXT_SQL} LIKE ('%%' || query_input.lowered_query || '%%')
                    OR {PAPER_TITLE_TEXT_SQL} %% query_input.lowered_query
                    OR (
                        query_input.normalized_title_query <> ''
                        AND (
                            query_input.normalized_title_query <<%% {PAPER_NORMALIZED_TITLE_KEY_SQL}
                            OR {PAPER_NORMALIZED_TITLE_KEY_SQL} LIKE (
                                '%%' || query_input.normalized_title_query || '%%'
                            )
                        )
                    )
                )
            )
        )
    UNION ALL
    SELECT * FROM exact_title_matches
)
SELECT
    {PAPER_SELECT_COLUMNS},
    mp.lexical_score,
    mp.title_similarity
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
LIMIT %s
"""


PAPER_SEARCH_IN_GRAPH_SQL = f"""
WITH query_input AS NOT MATERIALIZED (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS title_phrase_query,
        lower(%s) AS lowered_query,
        %s::text AS normalized_title_query,
        %s::boolean AS allow_title_similarity
),
{GRAPH_INPUT_CTE_SQL},
exact_title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        2.0 AS lexical_score,
        1.0 AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE
        {PAPER_GRAPH_WHERE_SQL}
        AND (
            (
                query_input.lowered_query <> ''
                AND {PAPER_TITLE_TEXT_SQL} >= query_input.lowered_query
                AND {PAPER_TITLE_TEXT_SQL} <= query_input.lowered_query
            )
            OR (
                query_input.normalized_title_query <> ''
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} >= query_input.normalized_title_query
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} <= query_input.normalized_title_query
            )
        )
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
matched_papers AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(
            ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.ts_query),
            0
        ) + (
            COALESCE(
                ts_rank_cd({PAPER_SEARCH_VECTOR_SQL}, query_input.title_phrase_query),
                0
            ) * 0.35
        ) AS lexical_score,
        CASE
            WHEN query_input.allow_title_similarity THEN GREATEST(
                {PAPER_TITLE_SIMILARITY_SQL},
                CASE
                    WHEN query_input.normalized_title_query <> ''
                    THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                    ELSE 0.0
                END
            )
            ELSE 0.0
        END AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND {PAPER_GRAPH_WHERE_SQL}
        AND (
            {PAPER_SEARCH_VECTOR_SQL} @@ query_input.ts_query
            OR {PAPER_SEARCH_VECTOR_SQL} @@ query_input.title_phrase_query
            OR (
                query_input.allow_title_similarity
                AND (
                    {PAPER_TITLE_TEXT_SQL} LIKE ('%%' || query_input.lowered_query || '%%')
                    OR {PAPER_TITLE_TEXT_SQL} %% query_input.lowered_query
                    OR (
                        query_input.normalized_title_query <> ''
                        AND (
                            query_input.normalized_title_query <<%% {PAPER_NORMALIZED_TITLE_KEY_SQL}
                            OR {PAPER_NORMALIZED_TITLE_KEY_SQL} LIKE (
                                '%%' || query_input.normalized_title_query || '%%'
                            )
                        )
                    )
                )
            )
        )
    UNION ALL
    SELECT * FROM exact_title_matches
)
SELECT
    {PAPER_SELECT_COLUMNS},
    mp.lexical_score,
    mp.title_similarity
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
{PAPER_CORE_JOINS}
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
LIMIT %s
"""


# ---------------------------------------------------------------------------
# Title candidate SQL (standalone queries for precheck / anchor resolution)
# ---------------------------------------------------------------------------

PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL = """
SELECT
    p.corpus_id,
    COALESCE(p.citation_count, 0) AS citation_count
FROM solemd.papers p
WHERE
    %s <> ''
    AND lower(coalesce(p.title, '')) >= %s
    AND lower(coalesce(p.title, '')) <= %s
ORDER BY
    citation_count DESC,
    p.corpus_id DESC
LIMIT %s
"""

PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL = f"""
SELECT
    p.corpus_id,
    COALESCE(p.citation_count, 0) AS citation_count
FROM solemd.papers p
WHERE
    %s <> ''
    AND {PAPER_NORMALIZED_TITLE_KEY_SQL} >= %s
    AND {PAPER_NORMALIZED_TITLE_KEY_SQL} <= %s
ORDER BY
    citation_count DESC,
    p.corpus_id DESC
LIMIT %s
"""

PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL = """
SELECT
    p.corpus_id,
    COALESCE(p.citation_count, 0) AS citation_count
FROM solemd.papers p
WHERE
    %s <> ''
    AND lower(coalesce(p.title, '')) >= %s
    AND lower(coalesce(p.title, '')) < %s
ORDER BY
    citation_count DESC,
    p.corpus_id DESC
LIMIT %s
"""

PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL = f"""
SELECT
    p.corpus_id,
    COALESCE(p.citation_count, 0) AS citation_count
FROM solemd.papers p
WHERE
    %s <> ''
    AND {PAPER_NORMALIZED_TITLE_KEY_SQL} >= %s
    AND {PAPER_NORMALIZED_TITLE_KEY_SQL} < %s
ORDER BY
    citation_count DESC,
    p.corpus_id DESC
LIMIT %s
"""

PAPER_TITLE_FTS_CANDIDATE_SQL = """
SELECT
    p.corpus_id,
    COALESCE(p.citation_count, 0) AS citation_count
FROM solemd.papers p
WHERE
    %s <> ''
    AND to_tsvector('english', coalesce(p.title, '')) @@ phraseto_tsquery('english', %s)
ORDER BY
    citation_count DESC,
    p.corpus_id DESC
LIMIT %s
"""
