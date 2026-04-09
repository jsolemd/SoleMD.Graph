"""Title lookup SQL — full graph and corpus-only multi-strategy title search."""

from app.rag._queries_paper_core import (
    GRAPH_INPUT_CTE_SQL,
    PAPER_CORE_JOINS,
    PAPER_GRAPH_JOIN_SQL,
    PAPER_GRAPH_WHERE_SQL,
    PAPER_NORMALIZED_TITLE_KEY_SQL,
    PAPER_NORMALIZED_TITLE_SIMILARITY_SQL,
    PAPER_SELECT_COLUMNS,
    PAPER_TITLE_SIMILARITY_SQL,
    PAPER_TITLE_TEXT_SQL,
)


PAPER_TITLE_LOOKUP_IN_GRAPH_SQL = f"""
WITH query_input AS NOT MATERIALIZED (
    SELECT
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
prefix_title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        1.7 AS lexical_score,
        GREATEST(
            {PAPER_TITLE_SIMILARITY_SQL},
            CASE
                WHEN query_input.normalized_title_query <> ''
                THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                ELSE 0.0
            END
        ) AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND {PAPER_GRAPH_WHERE_SQL}
        AND query_input.lowered_query <> ''
        AND (
            {PAPER_TITLE_TEXT_SQL} LIKE (query_input.lowered_query || '%%')
            OR (
                query_input.normalized_title_query <> ''
                AND {PAPER_NORMALIZED_TITLE_KEY_SQL} LIKE (
                    query_input.normalized_title_query || '%%'
                )
            )
        )
    ORDER BY
        title_similarity DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.0 AS lexical_score,
        GREATEST(
            {PAPER_TITLE_SIMILARITY_SQL},
            CASE
                WHEN query_input.normalized_title_query <> ''
                THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                ELSE 0.0
            END
        ) AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM {PAPER_GRAPH_JOIN_SQL}
    CROSS JOIN query_input
    CROSS JOIN graph_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND NOT EXISTS (SELECT 1 FROM prefix_title_matches)
        AND {PAPER_GRAPH_WHERE_SQL}
        AND query_input.lowered_query <> ''
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
),
matched_papers AS MATERIALIZED (
    SELECT
        candidate_matches.corpus_id,
        MAX(candidate_matches.lexical_score) AS lexical_score,
        MAX(candidate_matches.title_similarity) AS title_similarity,
        MAX(candidate_matches.citation_count) AS citation_count
    FROM (
        SELECT * FROM exact_title_matches
        UNION ALL
        SELECT * FROM prefix_title_matches
        UNION ALL
        SELECT * FROM title_matches
    ) AS candidate_matches
    GROUP BY candidate_matches.corpus_id
    ORDER BY
        (
            MAX(candidate_matches.lexical_score)
            + (MAX(candidate_matches.title_similarity) * 0.15)
        ) DESC,
        MAX(candidate_matches.citation_count) DESC,
        candidate_matches.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    mp.lexical_score,
    mp.title_similarity
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
"""


PAPER_TITLE_LOOKUP_SQL = f"""
WITH query_input AS NOT MATERIALIZED (
    SELECT
        lower(%s) AS lowered_query,
        %s::text AS normalized_title_query
),
title_exact_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        query_input.lowered_query <> ''
        AND lower(coalesce(p.title, '')) >= query_input.lowered_query
        AND lower(coalesce(p.title, '')) <= query_input.lowered_query
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
normalized_title_exact_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        query_input.normalized_title_query <> ''
        AND {PAPER_NORMALIZED_TITLE_KEY_SQL} >= query_input.normalized_title_query
        AND {PAPER_NORMALIZED_TITLE_KEY_SQL} <= query_input.normalized_title_query
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
exact_title_matches AS MATERIALIZED (
    SELECT
        candidate_matches.corpus_id,
        2.0 AS lexical_score,
        1.0 AS title_similarity,
        MAX(candidate_matches.citation_count) AS citation_count
    FROM (
        SELECT * FROM title_exact_candidates
        UNION ALL
        SELECT * FROM normalized_title_exact_candidates
    ) AS candidate_matches
    GROUP BY candidate_matches.corpus_id
    ORDER BY
        citation_count DESC,
        candidate_matches.corpus_id DESC
),
title_prefix_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND query_input.lowered_query <> ''
        AND lower(coalesce(p.title, '')) LIKE (query_input.lowered_query || '%%')
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
normalized_title_prefix_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND query_input.normalized_title_query <> ''
        AND {PAPER_NORMALIZED_TITLE_KEY_SQL} LIKE (
            query_input.normalized_title_query || '%%'
        )
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
prefix_title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        1.7 AS lexical_score,
        GREATEST(
            {PAPER_TITLE_SIMILARITY_SQL},
            CASE
                WHEN query_input.normalized_title_query <> ''
                THEN {PAPER_NORMALIZED_TITLE_SIMILARITY_SQL}
                ELSE 0.0
            END
        ) AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM (
        SELECT
            candidate_matches.corpus_id
        FROM (
            SELECT * FROM title_prefix_candidates
            UNION ALL
            SELECT * FROM normalized_title_prefix_candidates
        ) AS candidate_matches
        GROUP BY candidate_matches.corpus_id
        ORDER BY
            MAX(candidate_matches.citation_count) DESC,
            candidate_matches.corpus_id DESC
    ) AS prefix_candidates
    JOIN solemd.papers p
      ON p.corpus_id = prefix_candidates.corpus_id
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
),
title_knn_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.0 AS lexical_score,
        GREATEST(
            COALESCE(strict_word_similarity(query_input.lowered_query, {PAPER_TITLE_TEXT_SQL}), 0),
            COALESCE(word_similarity(query_input.lowered_query, {PAPER_TITLE_TEXT_SQL}), 0),
            COALESCE(similarity({PAPER_TITLE_TEXT_SQL}, query_input.lowered_query), 0)
        ) AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND NOT EXISTS (SELECT 1 FROM prefix_title_matches)
        AND query_input.lowered_query <> ''
    ORDER BY
        query_input.lowered_query <<-> {PAPER_TITLE_TEXT_SQL}
    LIMIT %s
),
normalized_title_knn_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.0 AS lexical_score,
        GREATEST(
            COALESCE(
                strict_word_similarity(
                    query_input.normalized_title_query,
                    {PAPER_NORMALIZED_TITLE_KEY_SQL}
                ),
                0
            ),
            COALESCE(
                word_similarity(
                    query_input.normalized_title_query,
                    {PAPER_NORMALIZED_TITLE_KEY_SQL}
                ),
                0
            )
        ) AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND NOT EXISTS (SELECT 1 FROM prefix_title_matches)
        AND query_input.normalized_title_query <> ''
    ORDER BY
        query_input.normalized_title_query <<<-> {PAPER_NORMALIZED_TITLE_KEY_SQL}
    LIMIT %s
),
search_matches AS MATERIALIZED (
    SELECT
        candidate_matches.corpus_id,
        MAX(candidate_matches.lexical_score) AS lexical_score,
        MAX(candidate_matches.title_similarity) AS title_similarity,
        MAX(candidate_matches.citation_count) AS citation_count
    FROM (
        SELECT * FROM exact_title_matches
        UNION ALL
        SELECT * FROM prefix_title_matches
        UNION ALL
        SELECT * FROM title_knn_matches
        UNION ALL
        SELECT * FROM normalized_title_knn_matches
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
    JOIN solemd.graph_points gp
      ON gp.graph_run_id = %s
     AND gp.corpus_id = sm.corpus_id
    ORDER BY
        (sm.lexical_score + (sm.title_similarity * 0.15)) DESC,
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
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
"""
