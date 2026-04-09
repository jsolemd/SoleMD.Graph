"""Chunk-level lexical search SQL — in-graph and in-selection variants."""

from app.rag._queries_paper_core import (
    CHUNK_EXACT_MATCH_BONUS,
    CHUNK_EXACT_MATCH_NORMALIZATION_REGEX,
    CHUNK_HEADLINE_OPTIONS,
    CHUNK_SEARCH_VECTOR_SQL,
    PAPER_SELECT_COLUMNS,
)


CHUNK_SEARCH_SQL = f"""
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS phrase_query,
        websearch_to_tsquery('english', %s) AS normalized_ts_query,
        trim(%s) AS normalized_query_text
),
scored_chunks AS MATERIALIZED (
    SELECT
        c.corpus_id,
        c.chunk_ordinal,
        c.text AS chunk_text,
        chunk_eval.chunk_lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count,
        ROW_NUMBER() OVER (
            PARTITION BY c.corpus_id
            ORDER BY
                chunk_eval.chunk_lexical_score DESC,
                c.token_count_estimate DESC,
                c.chunk_ordinal ASC
        ) AS corpus_chunk_rank
    FROM solemd.paper_chunks c
    JOIN solemd.graph_points gp
      ON gp.graph_run_id = %s
     AND gp.corpus_id = c.corpus_id
    JOIN solemd.papers p
      ON p.corpus_id = c.corpus_id
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT
            GREATEST(
                COALESCE(
                    ts_rank_cd({CHUNK_SEARCH_VECTOR_SQL}, query_input.ts_query),
                    0
                ),
                COALESCE(
                    ts_rank_cd({CHUNK_SEARCH_VECTOR_SQL}, query_input.phrase_query),
                    0
                ) * 1.1,
                COALESCE(
                    ts_rank_cd(
                        {CHUNK_SEARCH_VECTOR_SQL},
                        query_input.normalized_ts_query
                    ),
                    0
                )
            ) + CASE
                WHEN query_input.normalized_query_text = '' THEN 0
                WHEN position(
                    query_input.normalized_query_text in trim(
                        regexp_replace(
                            lower(c.text),
                            '{CHUNK_EXACT_MATCH_NORMALIZATION_REGEX}',
                            ' ',
                            'g'
                        )
                    )
                ) > 0 THEN {CHUNK_EXACT_MATCH_BONUS}
                ELSE 0
            END AS chunk_lexical_score
    ) AS chunk_eval
    WHERE
        c.chunk_version_key = %s
        AND c.is_retrieval_default IS TRUE
        AND (
            {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.ts_query
            OR {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.phrase_query
            OR {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.normalized_ts_query
        )
),
matched_papers AS MATERIALIZED (
    SELECT
        sc.corpus_id,
        sc.chunk_ordinal,
        sc.chunk_text,
        sc.chunk_lexical_score,
        sc.citation_count
    FROM scored_chunks sc
    WHERE sc.corpus_chunk_rank = 1
    ORDER BY
        sc.chunk_lexical_score DESC,
        sc.citation_count DESC,
        sc.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    0.0 AS lexical_score,
    0.0 AS title_similarity,
    mp.chunk_ordinal,
    replace(
        replace(
            ts_headline(
                'english',
                mp.chunk_text,
                query_input.normalized_ts_query,
                '{CHUNK_HEADLINE_OPTIONS}'
            ),
            '<b>',
            ''
        ),
        '</b>',
        ''
    ) AS chunk_snippet,
    mp.chunk_lexical_score
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
CROSS JOIN query_input
ORDER BY
    mp.chunk_lexical_score DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
LIMIT %s
"""


CHUNK_SEARCH_IN_SELECTION_SQL = f"""
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS phrase_query,
        websearch_to_tsquery('english', %s) AS normalized_ts_query,
        trim(%s) AS normalized_query_text
),
scored_chunks AS MATERIALIZED (
    SELECT
        c.corpus_id,
        c.chunk_ordinal,
        c.text AS chunk_text,
        chunk_eval.chunk_lexical_score,
        COALESCE(p.citation_count, 0) AS citation_count,
        ROW_NUMBER() OVER (
            PARTITION BY c.corpus_id
            ORDER BY
                chunk_eval.chunk_lexical_score DESC,
                c.token_count_estimate DESC,
                c.chunk_ordinal ASC
        ) AS corpus_chunk_rank
    FROM solemd.paper_chunks c
    JOIN solemd.papers p
      ON p.corpus_id = c.corpus_id
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT
            GREATEST(
                COALESCE(
                    ts_rank_cd({CHUNK_SEARCH_VECTOR_SQL}, query_input.ts_query),
                    0
                ),
                COALESCE(
                    ts_rank_cd({CHUNK_SEARCH_VECTOR_SQL}, query_input.phrase_query),
                    0
                ) * 1.1,
                COALESCE(
                    ts_rank_cd(
                        {CHUNK_SEARCH_VECTOR_SQL},
                        query_input.normalized_ts_query
                    ),
                    0
                )
            ) + CASE
                WHEN query_input.normalized_query_text = '' THEN 0
                WHEN position(
                    query_input.normalized_query_text in trim(
                        regexp_replace(
                            lower(c.text),
                            '{CHUNK_EXACT_MATCH_NORMALIZATION_REGEX}',
                            ' ',
                            'g'
                        )
                    )
                ) > 0 THEN {CHUNK_EXACT_MATCH_BONUS}
                ELSE 0
            END AS chunk_lexical_score
    ) AS chunk_eval
    WHERE
        c.chunk_version_key = %s
        AND c.is_retrieval_default IS TRUE
        AND c.corpus_id = ANY(%s)
        AND (
            {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.ts_query
            OR {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.phrase_query
            OR {CHUNK_SEARCH_VECTOR_SQL} @@ query_input.normalized_ts_query
        )
),
matched_chunks AS MATERIALIZED (
    SELECT
        sc.corpus_id,
        sc.chunk_ordinal,
        sc.chunk_text,
        sc.chunk_lexical_score,
        sc.citation_count
    FROM scored_chunks sc
    WHERE sc.corpus_chunk_rank = 1
)
SELECT
    {PAPER_SELECT_COLUMNS},
    0.0 AS lexical_score,
    0.0 AS title_similarity,
    mc.chunk_ordinal,
    replace(
        replace(
            ts_headline(
                'english',
                mc.chunk_text,
                query_input.normalized_ts_query,
                '{CHUNK_HEADLINE_OPTIONS}'
            ),
            '<b>',
            ''
        ),
        '</b>',
        ''
    ) AS chunk_snippet,
    mc.chunk_lexical_score
FROM matched_chunks mc
JOIN solemd.papers p
  ON p.corpus_id = mc.corpus_id
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
CROSS JOIN query_input
ORDER BY
    mc.chunk_lexical_score DESC,
    mc.citation_count DESC,
    mc.corpus_id DESC
LIMIT %s
"""
