"""SQL query text for the current-table evidence baseline."""

GRAPH_RELEASE_LOOKUP_SQL = """
SELECT
    id::TEXT AS graph_run_id,
    graph_name,
    is_current,
    NULLIF(bundle_checksum, '') AS bundle_checksum
FROM solemd.graph_runs
WHERE
    status = 'completed'
    AND graph_name = 'cosmograph'
    AND node_kind = 'corpus'
    AND (
        %s = 'current'
        AND is_current = true
        OR id::TEXT = %s
        OR bundle_checksum = %s
    )
ORDER BY is_current DESC, created_at DESC
LIMIT 1
"""


GRAPH_RELEASE_PAPER_COUNT_SQL = """
SELECT COUNT(*)::INT AS paper_count
FROM solemd.graph_points
WHERE graph_run_id = %s
"""


EMBEDDED_PAPER_COUNT_SQL = """
SELECT COUNT(*)::INT AS embedded_paper_count
FROM solemd.papers
WHERE embedding IS NOT NULL
"""


QUERY_ENTITY_TERM_MATCH_SQL = """
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term,
        cardinality(string_to_array(lower(trim(term)), ' ')) AS token_count
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_entities AS (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        qt.token_count,
        CASE
            WHEN e.concept_id = qt.raw_term OR e.concept_id = qt.upper_term THEN e.concept_id
            WHEN lower(e.canonical_name) = qt.lowered_term THEN e.canonical_name
            ELSE NULL
        END AS normalized_term,
        e.canonical_name,
        e.paper_count,
        CASE
            WHEN e.concept_id = qt.raw_term OR e.concept_id = qt.upper_term THEN 1.0
            WHEN lower(e.canonical_name) = qt.lowered_term THEN 0.98
            ELSE 0.0
        END AS match_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON (
        e.concept_id = qt.raw_term
        OR e.concept_id = qt.upper_term
        OR lower(e.canonical_name) = qt.lowered_term
      )
)
SELECT normalized_term
FROM (
    SELECT
        normalized_term,
        MAX(token_count) AS token_count,
        MAX(match_score) AS match_score,
        MAX(paper_count) AS paper_count
    FROM matched_entities
    WHERE normalized_term IS NOT NULL
    GROUP BY normalized_term
) ranked_entities
ORDER BY
    token_count DESC,
    match_score DESC,
    paper_count DESC,
    normalized_term
LIMIT %s
"""


PAPER_SELECT_COLUMNS = """
    p.corpus_id,
    p.paper_id,
    p.paper_id AS semantic_scholar_paper_id,
    p.title,
    p.abstract,
    p.tldr,
    COALESCE(p.journal_name, p.venue) AS journal_name,
    p.year,
    c.doi,
    c.pmid,
    c.pmc_id AS pmcid,
    p.text_availability,
    p.is_open_access,
    COALESCE(p.citation_count, 0) AS citation_count,
    COALESCE(p.influential_citation_count, 0) AS influential_citation_count,
    COALESCE(p.reference_count, 0) AS reference_count,
    COALESCE(p.publication_types, ARRAY[]::text[]) AS publication_types,
    COALESCE(p.fields_of_study, ARRAY[]::text[]) AS fields_of_study,
    COALESCE(pes.has_rule_evidence, false) AS has_rule_evidence,
    COALESCE(pes.has_curated_journal_family, false) AS has_curated_journal_family,
    pes.journal_family_type,
    COALESCE(pes.entity_rule_families, 0) AS entity_rule_families,
    COALESCE(pes.entity_rule_count, 0) AS entity_rule_count,
    COALESCE(pes.entity_core_families, 0) AS entity_core_families
"""


PAPER_CORE_JOINS = """
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
"""


PAPER_SEARCH_VECTOR_SQL = """
setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
"""


PAPER_TITLE_TEXT_SQL = """
lower(COALESCE(p.title, ''))
"""


PAPER_TITLE_SIMILARITY_SQL = f"""
GREATEST(
    COALESCE(
        word_similarity(query_input.lowered_query, {PAPER_TITLE_TEXT_SQL}),
        0
    ),
    COALESCE(similarity({PAPER_TITLE_TEXT_SQL}, query_input.lowered_query), 0)
)
"""


CHUNK_SEARCH_VECTOR_SQL = """
to_tsvector('english', COALESCE(c.text, ''))
"""


CHUNK_HEADLINE_OPTIONS = (
    "MaxWords=40, MinWords=12, ShortWord=2, MaxFragments=2, FragmentDelimiter=..."
)


PAPER_SEARCH_SQL = f"""
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS title_phrase_query,
        lower(%s) AS lowered_query,
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
    WHERE {PAPER_TITLE_TEXT_SQL} = query_input.lowered_query
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
fts_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(ts_rank_cd(search_terms.search_vector, query_input.ts_query), 0)
            + (
                COALESCE(
                    ts_rank_cd(search_terms.search_vector, query_input.title_phrase_query),
                    0
                ) * 0.35
            ) AS lexical_score,
        CASE
            WHEN query_input.allow_title_similarity THEN {PAPER_TITLE_SIMILARITY_SQL}
            ELSE 0.0
        END AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT
            {PAPER_SEARCH_VECTOR_SQL} AS search_vector
    ) AS search_terms
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND (
            search_terms.search_vector @@ query_input.ts_query
            OR search_terms.search_vector @@ query_input.title_phrase_query
        )
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
title_matches AS MATERIALIZED (
    SELECT
        p.corpus_id,
        0.0 AS lexical_score,
        {PAPER_TITLE_SIMILARITY_SQL} AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    WHERE
        NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND query_input.allow_title_similarity
        AND (
            {PAPER_TITLE_TEXT_SQL} LIKE ('%%' || query_input.lowered_query || '%%')
            OR {PAPER_TITLE_TEXT_SQL} %% query_input.lowered_query
        )
    ORDER BY
        title_similarity DESC,
        citation_count DESC,
        p.corpus_id DESC
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
        SELECT * FROM fts_matches
        UNION ALL
        SELECT * FROM title_matches
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
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
"""


PAPER_SEARCH_IN_SELECTION_SQL = f"""
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS title_phrase_query,
        lower(%s) AS lowered_query,
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
        AND {PAPER_TITLE_TEXT_SQL} = query_input.lowered_query
    ORDER BY
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
),
matched_papers AS MATERIALIZED (
    SELECT
        p.corpus_id,
        COALESCE(
            ts_rank_cd(search_terms.search_vector, query_input.ts_query),
            0
        ) + (
            COALESCE(
                ts_rank_cd(search_terms.search_vector, query_input.title_phrase_query),
                0
            ) * 0.35
        ) AS lexical_score,
        CASE
            WHEN query_input.allow_title_similarity THEN {PAPER_TITLE_SIMILARITY_SQL}
            ELSE 0.0
        END AS title_similarity,
        COALESCE(p.citation_count, 0) AS citation_count
    FROM solemd.papers p
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT
            {PAPER_SEARCH_VECTOR_SQL} AS search_vector
    ) AS search_terms
    WHERE
        p.corpus_id = ANY(%s)
        AND NOT EXISTS (SELECT 1 FROM exact_title_matches)
        AND (
            search_terms.search_vector @@ query_input.ts_query
            OR search_terms.search_vector @@ query_input.title_phrase_query
            OR (
                query_input.allow_title_similarity
                AND (
                    {PAPER_TITLE_TEXT_SQL} LIKE ('%%' || query_input.lowered_query || '%%')
                    OR {PAPER_TITLE_TEXT_SQL} %% query_input.lowered_query
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
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
ORDER BY
    (mp.lexical_score + (mp.title_similarity * 0.15)) DESC,
    mp.citation_count DESC,
    mp.corpus_id DESC
LIMIT %s
"""


CHUNK_SEARCH_SQL = f"""
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        phraseto_tsquery('english', %s) AS phrase_query,
        websearch_to_tsquery('english', %s) AS normalized_ts_query
),
matched_chunks AS MATERIALIZED (
    SELECT
        c.corpus_id,
        c.chunk_ordinal,
        c.text AS chunk_text,
        chunk_eval.chunk_snippet,
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
            replace(
                replace(
                    ts_headline(
                        'english',
                        c.text,
                        query_input.normalized_ts_query,
                        '{CHUNK_HEADLINE_OPTIONS}'
                    ),
                    '<b>',
                    ''
                ),
                '</b>',
                ''
            ) AS chunk_snippet,
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
            ) AS chunk_lexical_score
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
        mc.corpus_id,
        mc.chunk_ordinal,
        mc.chunk_text,
        mc.chunk_snippet,
        mc.chunk_lexical_score,
        mc.citation_count
    FROM matched_chunks mc
    WHERE mc.corpus_chunk_rank = 1
    ORDER BY
        mc.chunk_lexical_score DESC,
        mc.citation_count DESC,
        mc.corpus_id DESC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    0.0 AS lexical_score,
    0.0 AS title_similarity,
    mp.chunk_ordinal,
    mp.chunk_snippet,
    mp.chunk_lexical_score
FROM matched_papers mp
JOIN solemd.papers p
  ON p.corpus_id = mp.corpus_id
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
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
        websearch_to_tsquery('english', %s) AS normalized_ts_query
),
matched_chunks AS MATERIALIZED (
    SELECT
        c.corpus_id,
        c.chunk_ordinal,
        c.text AS chunk_text,
        chunk_eval.chunk_snippet,
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
            replace(
                replace(
                    ts_headline(
                        'english',
                        c.text,
                        query_input.normalized_ts_query,
                        '{CHUNK_HEADLINE_OPTIONS}'
                    ),
                    '<b>',
                    ''
                ),
                '</b>',
                ''
            ) AS chunk_snippet,
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
            ) AS chunk_lexical_score
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
)
SELECT
    {PAPER_SELECT_COLUMNS},
    0.0 AS lexical_score,
    0.0 AS title_similarity,
    mc.chunk_ordinal,
    mc.chunk_snippet,
    mc.chunk_lexical_score
FROM matched_chunks mc
JOIN solemd.papers p
  ON p.corpus_id = mc.corpus_id
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
WHERE mc.corpus_chunk_rank = 1
ORDER BY
    mc.chunk_lexical_score DESC,
    mc.citation_count DESC,
    mc.corpus_id DESC
LIMIT %s
"""


PAPER_ENTITY_SEARCH_SQL = f"""
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
exact_matches AS (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        e.entity_type,
        e.concept_id,
        e.paper_count,
        CASE
            WHEN e.concept_id = qt.raw_term OR e.concept_id = qt.upper_term THEN 1.0
            ELSE 0.98
        END AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON (
        e.concept_id = qt.raw_term
        OR e.concept_id = qt.upper_term
        OR lower(e.canonical_name) = qt.lowered_term
      )
),
fuzzy_query_terms AS (
    SELECT qt.raw_term, qt.lowered_term
    FROM query_terms qt
    WHERE NOT EXISTS (
        SELECT 1
        FROM exact_matches em
        WHERE em.lowered_term = qt.lowered_term
    )
),
fuzzy_matches AS (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        e.entity_type,
        e.concept_id,
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
),
matched_concepts AS (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM fuzzy_matches
),
top_concepts AS (
    SELECT
        raw_term,
        lowered_term,
        entity_type,
        concept_id,
        concept_score
    FROM (
        SELECT
            mc.*,
            row_number() OVER (
                PARTITION BY lowered_term
                ORDER BY concept_score DESC, paper_count DESC, concept_id
            ) AS concept_rank
        FROM matched_concepts mc
    ) ranked_concepts
    WHERE concept_rank <= %s
),
matched_corpus_scores AS (
    SELECT
        c.corpus_id,
        MAX(tc.concept_score) AS entity_candidate_score
    FROM top_concepts tc
    JOIN pubtator.entity_annotations ea
      ON ea.entity_type = tc.entity_type
     AND ea.concept_id = tc.concept_id
    JOIN solemd.corpus c
      ON c.pmid = ea.pmid
    JOIN solemd.graph_points gp
      ON gp.graph_run_id = %s
     AND gp.corpus_id = c.corpus_id
    GROUP BY c.corpus_id
),
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
    {PAPER_SELECT_COLUMNS},
    entity_candidate_score
FROM ranked_papers
ORDER BY
    entity_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_ENTITY_SEARCH_IN_SELECTION_SQL = f"""
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
exact_matches AS (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        e.entity_type,
        e.concept_id,
        e.paper_count,
        CASE
            WHEN e.concept_id = qt.raw_term OR e.concept_id = qt.upper_term THEN 1.0
            ELSE 0.98
        END AS concept_score
    FROM query_terms qt
    JOIN solemd.entities e
      ON (
        e.concept_id = qt.raw_term
        OR e.concept_id = qt.upper_term
        OR lower(e.canonical_name) = qt.lowered_term
      )
),
fuzzy_query_terms AS (
    SELECT qt.raw_term, qt.lowered_term
    FROM query_terms qt
    WHERE NOT EXISTS (
        SELECT 1
        FROM exact_matches em
        WHERE em.lowered_term = qt.lowered_term
    )
),
fuzzy_matches AS (
    SELECT
        qt.raw_term,
        qt.lowered_term,
        e.entity_type,
        e.concept_id,
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
),
matched_concepts AS (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM fuzzy_matches
),
top_concepts AS (
    SELECT
        raw_term,
        lowered_term,
        entity_type,
        concept_id,
        concept_score
    FROM (
        SELECT
            mc.*,
            row_number() OVER (
                PARTITION BY lowered_term
                ORDER BY concept_score DESC, paper_count DESC, concept_id
            ) AS concept_rank
        FROM matched_concepts mc
    ) ranked_concepts
    WHERE concept_rank <= %s
),
matched_corpus_scores AS (
    SELECT
        c.corpus_id,
        MAX(tc.concept_score) AS entity_candidate_score
    FROM top_concepts tc
    JOIN pubtator.entity_annotations ea
      ON ea.entity_type = tc.entity_type
     AND ea.concept_id = tc.concept_id
    JOIN solemd.corpus c
      ON c.pmid = ea.pmid
    WHERE c.corpus_id = ANY(%s)
    GROUP BY c.corpus_id
),
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
    {PAPER_SELECT_COLUMNS},
    entity_candidate_score
FROM ranked_papers
ORDER BY
    entity_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_SQL = f"""
WITH scoped_corpus AS (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
),
query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS (
    SELECT
        c.corpus_id,
        LEAST(1.0, 0.35 + (ln(COUNT(*) + 1) * 0.2)) AS relation_candidate_score
    FROM query_terms qt
    JOIN pubtator.relations r
      ON r.relation_type = qt.normalized_term
    JOIN solemd.corpus c
      ON c.pmid = r.pmid
    JOIN scoped_corpus scoped
      ON scoped.corpus_id = c.corpus_id
    GROUP BY c.corpus_id
),
ranked_papers AS (
    SELECT
        {PAPER_SELECT_COLUMNS},
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {PAPER_SELECT_COLUMNS},
    relation_candidate_score
FROM ranked_papers
ORDER BY
    relation_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_IN_SELECTION_SQL = f"""
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS (
    SELECT
        c.corpus_id,
        LEAST(1.0, 0.35 + (ln(COUNT(*) + 1) * 0.2)) AS relation_candidate_score
    FROM query_terms qt
    JOIN pubtator.relations r
      ON r.relation_type = qt.normalized_term
    JOIN solemd.corpus c
      ON c.pmid = r.pmid
    WHERE c.corpus_id = ANY(%s)
    GROUP BY c.corpus_id
),
ranked_papers AS (
    SELECT
        {PAPER_SELECT_COLUMNS},
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {PAPER_SELECT_COLUMNS},
    relation_candidate_score
FROM ranked_papers
ORDER BY
    relation_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
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


PAPER_EMBEDDING_LOOKUP_SQL = """
SELECT embedding::text AS embedding_literal
FROM solemd.papers
WHERE corpus_id = %s
  AND embedding IS NOT NULL
LIMIT 1
"""


DENSE_QUERY_SEARCH_SQL = f"""
SELECT
    {PAPER_SELECT_COLUMNS},
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
{PAPER_CORE_JOINS}
WHERE p.embedding IS NOT NULL
ORDER BY p.embedding <=> %s::vector ASC
LIMIT %s
"""


DENSE_QUERY_SEARCH_IN_SELECTION_SQL = f"""
SELECT
    {PAPER_SELECT_COLUMNS},
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
{PAPER_CORE_JOINS}
WHERE
    p.corpus_id = ANY(%s)
    AND p.embedding IS NOT NULL
ORDER BY p.embedding <=> %s::vector ASC
LIMIT %s
"""


DENSE_QUERY_SEARCH_ANN_IN_GRAPH_SQL = f"""
WITH query_vector AS (
    SELECT %s::vector AS embedding
),
graph_scope AS MATERIALIZED (
    SELECT gp.corpus_id
    FROM solemd.graph_points gp
    WHERE gp.graph_run_id = %s
),
ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        (p.embedding <=> qv.embedding) AS distance
    FROM graph_scope gs
    JOIN solemd.papers p
      ON p.corpus_id = gs.corpus_id
    CROSS JOIN query_vector qv
    WHERE p.embedding IS NOT NULL
    ORDER BY p.embedding <=> qv.embedding ASC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    ann.distance
FROM ann_candidates ann
JOIN solemd.papers p
  ON p.corpus_id = ann.corpus_id
{PAPER_CORE_JOINS}
ORDER BY ann.distance ASC
LIMIT %s
"""


DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL = f"""
WITH query_vector AS (
    SELECT %s::vector AS embedding
),
ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        (p.embedding <=> qv.embedding) AS distance
    FROM solemd.papers p
    CROSS JOIN query_vector qv
    WHERE p.embedding IS NOT NULL
    ORDER BY p.embedding <=> qv.embedding ASC
    LIMIT %s
)
SELECT
    {PAPER_SELECT_COLUMNS},
    ann.distance
FROM ann_candidates ann
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = ann.corpus_id
JOIN solemd.papers p
  ON p.corpus_id = ann.corpus_id
{PAPER_CORE_JOINS}
ORDER BY ann.distance ASC
LIMIT %s
"""


SELECTED_CORPUS_LOOKUP_SQL = """
SELECT gp.corpus_id
FROM solemd.graph_points gp
LEFT JOIN solemd.papers p
  ON p.corpus_id = gp.corpus_id
WHERE
    gp.graph_run_id = %s
    AND (
        p.paper_id = %s
        OR ('paper:' || gp.corpus_id::TEXT) = %s
        OR ('corpus:' || gp.corpus_id::TEXT) = %s
        OR gp.corpus_id::TEXT = %s
    )
LIMIT 1
"""


SCOPE_CORPUS_LOOKUP_SQL = """
SELECT DISTINCT gp.corpus_id
FROM solemd.graph_points gp
LEFT JOIN solemd.papers p
  ON p.corpus_id = gp.corpus_id
WHERE
    gp.graph_run_id = %s
    AND (
        p.paper_id = ANY(%s)
        OR ('paper:' || gp.corpus_id::TEXT) = ANY(%s)
        OR ('corpus:' || gp.corpus_id::TEXT) = ANY(%s)
        OR gp.corpus_id::TEXT = ANY(%s)
    )
ORDER BY gp.corpus_id
"""


CITATION_CONTEXT_SQL = """
SELECT
    c.citing_corpus_id,
    c.cited_corpus_id,
    citing.paper_id AS citing_paper_id,
    cited.paper_id AS cited_paper_id,
    c.citation_id,
    c.contexts,
    c.intents,
    c.is_influential,
    c.context_count
FROM solemd.citations c
JOIN solemd.papers citing
  ON citing.corpus_id = c.citing_corpus_id
JOIN solemd.papers cited
  ON cited.corpus_id = c.cited_corpus_id
WHERE
    c.context_count > 0
    AND (
        c.citing_corpus_id = ANY(%s)
        OR c.cited_corpus_id = ANY(%s)
    )
"""


ENTITY_MATCH_SQL = """
SELECT
    c.corpus_id,
    ea.entity_type,
    ea.concept_id,
    ea.mentions
FROM pubtator.entity_annotations ea
JOIN solemd.corpus c
  ON c.pmid = ea.pmid
WHERE c.corpus_id = ANY(%s)
"""


RELATION_MATCH_SQL = """
SELECT
    c.corpus_id,
    r.relation_type,
    r.subject_type,
    r.subject_id,
    r.object_type,
    r.object_id
FROM pubtator.relations r
JOIN solemd.corpus c
  ON c.pmid = r.pmid
WHERE c.corpus_id = ANY(%s)
"""


REFERENCE_LOOKUP_SQL = """
SELECT
    corpus_id,
    reference_id,
    reference_index,
    title,
    year,
    doi,
    pmid,
    pmcid,
    referenced_corpus_id,
    referenced_paper_id
FROM solemd.paper_references
WHERE corpus_id = ANY(%s)
ORDER BY corpus_id, reference_index
"""


ASSET_LOOKUP_SQL = """
SELECT
    corpus_id,
    asset_id,
    asset_kind,
    remote_url,
    storage_path,
    access_status,
    license,
    metadata
FROM solemd.paper_assets
WHERE corpus_id = ANY(%s)
ORDER BY corpus_id, asset_id
"""


SEMANTIC_NEIGHBOR_SQL = """
SELECT
    p.corpus_id,
    p.paper_id,
    (%s::vector <=> p.embedding) AS distance
FROM solemd.graph_points gp
JOIN solemd.papers p
  ON p.corpus_id = gp.corpus_id
WHERE
    gp.graph_run_id = %s
    AND p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY %s::vector <=> p.embedding ASC
LIMIT %s
"""


SEMANTIC_NEIGHBOR_IN_SELECTION_SQL = """
SELECT
    p.corpus_id,
    p.paper_id,
    (%s::vector <=> p.embedding) AS distance
FROM solemd.papers p
WHERE
    p.corpus_id = ANY(%s)
    AND p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY %s::vector <=> p.embedding ASC
LIMIT %s
"""


SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL = """
SELECT to_regclass('solemd.idx_papers_embedding_hnsw') IS NOT NULL AS index_ready
"""


SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL = """
WITH graph_scope AS MATERIALIZED (
    SELECT gp.corpus_id
    FROM solemd.graph_points gp
    WHERE gp.graph_run_id = %s
),
ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        p.paper_id,
        (p.embedding <=> %s::vector) AS distance
    FROM graph_scope gs
    JOIN solemd.papers p
      ON p.corpus_id = gs.corpus_id
    WHERE
        p.embedding IS NOT NULL
        AND p.corpus_id <> %s
    ORDER BY
        p.embedding <=> %s::vector ASC
    LIMIT %s
)
SELECT
    ann.corpus_id,
    ann.paper_id,
    ann.distance
FROM ann_candidates ann
ORDER BY ann.distance ASC
LIMIT %s
"""


SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL = """
WITH ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        p.paper_id,
        (p.embedding <=> %s::vector) AS distance
    FROM solemd.papers p
    WHERE
        p.embedding IS NOT NULL
        AND p.corpus_id <> %s
    ORDER BY p.embedding <=> %s::vector ASC
    LIMIT %s
)
SELECT
    ann.corpus_id,
    ann.paper_id,
    ann.distance
FROM ann_candidates ann
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = ann.corpus_id
ORDER BY ann.distance ASC
LIMIT %s
"""
