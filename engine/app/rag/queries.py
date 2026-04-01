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


PAPER_SEARCH_SQL = """
WITH scoped_corpus AS (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
),
query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        lower(%s) AS lowered_query
),
candidate_papers AS (
    SELECT
        p.corpus_id,
        p.paper_id,
        p.paper_id AS semantic_scholar_paper_id,
        p.title,
        p.abstract,
        p.tldr,
        COALESCE(p.journal_name, p.venue) AS journal_name,
        p.year,
        p.text_availability,
        p.is_open_access,
        COALESCE(p.citation_count, 0) AS citation_count,
        COALESCE(p.reference_count, 0) AS reference_count,
        COALESCE(ts_rank_cd(title_search_vector, query_input.ts_query), 0) AS lexical_score,
        COALESCE(
            similarity(lower(COALESCE(p.title, '')), query_input.lowered_query),
            0
        ) AS title_similarity
    FROM solemd.papers p
    JOIN scoped_corpus scoped
      ON scoped.corpus_id = p.corpus_id
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT to_tsvector('english', COALESCE(p.title, '')) AS title_search_vector
    ) AS search_terms
    WHERE
        title_search_vector @@ query_input.ts_query
    ORDER BY
        lexical_score DESC,
        citation_count DESC,
        p.corpus_id DESC
    LIMIT %s
)
SELECT
    cp.corpus_id,
    cp.paper_id,
    cp.semantic_scholar_paper_id,
    cp.title,
    cp.abstract,
    cp.tldr,
    cp.journal_name,
    cp.year,
    c.doi,
    c.pmid,
    c.pmc_id AS pmcid,
    cp.text_availability,
    cp.is_open_access,
    cp.citation_count,
    cp.reference_count,
    cp.lexical_score,
    cp.title_similarity
FROM candidate_papers cp
JOIN solemd.corpus c
  ON c.corpus_id = cp.corpus_id
ORDER BY
    (lexical_score + (title_similarity * 0.15)) DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_SEARCH_IN_SELECTION_SQL = """
WITH query_input AS (
    SELECT
        websearch_to_tsquery('english', %s) AS ts_query,
        lower(%s) AS lowered_query
),
ranked_papers AS (
    SELECT
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
        COALESCE(p.reference_count, 0) AS reference_count,
        COALESCE(
            ts_rank_cd(
                search_terms.search_vector,
                query_input.ts_query
            ),
            0
        ) AS lexical_score,
        COALESCE(
            similarity(lower(COALESCE(p.title, '')), query_input.lowered_query),
            0
        ) AS title_similarity
    FROM solemd.papers p
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
    CROSS JOIN query_input
    CROSS JOIN LATERAL (
        SELECT
            setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B') AS search_vector
    ) AS search_terms
    WHERE
        p.corpus_id = ANY(%s)
        AND (
            search_terms.search_vector @@ query_input.ts_query
            OR lower(COALESCE(p.title, '')) LIKE ('%%' || query_input.lowered_query || '%%')
            OR similarity(lower(COALESCE(p.title, '')), query_input.lowered_query) > %s
        )
)
SELECT
    corpus_id,
    paper_id,
    semantic_scholar_paper_id,
    title,
    abstract,
    tldr,
    journal_name,
    year,
    doi,
    pmid,
    pmcid,
    text_availability,
    is_open_access,
    citation_count,
    reference_count,
    lexical_score,
    title_similarity
FROM ranked_papers
ORDER BY
    (lexical_score + (title_similarity * 0.15)) DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_ENTITY_SEARCH_SQL = """
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
        COALESCE(p.reference_count, 0) AS reference_count,
        mcs.entity_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
)
SELECT
    corpus_id,
    paper_id,
    semantic_scholar_paper_id,
    title,
    abstract,
    tldr,
    journal_name,
    year,
    doi,
    pmid,
    pmcid,
    text_availability,
    is_open_access,
    citation_count,
    reference_count,
    entity_candidate_score
FROM ranked_papers
ORDER BY
    entity_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_ENTITY_SEARCH_IN_SELECTION_SQL = """
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
        COALESCE(p.reference_count, 0) AS reference_count,
        mcs.entity_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
)
SELECT
    corpus_id,
    paper_id,
    semantic_scholar_paper_id,
    title,
    abstract,
    tldr,
    journal_name,
    year,
    doi,
    pmid,
    pmcid,
    text_availability,
    is_open_access,
    citation_count,
    reference_count,
    entity_candidate_score
FROM ranked_papers
ORDER BY
    entity_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_SQL = """
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
        COALESCE(p.reference_count, 0) AS reference_count,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
)
SELECT
    corpus_id,
    paper_id,
    semantic_scholar_paper_id,
    title,
    abstract,
    tldr,
    journal_name,
    year,
    doi,
    pmid,
    pmcid,
    text_availability,
    is_open_access,
    citation_count,
    reference_count,
    relation_candidate_score
FROM ranked_papers
ORDER BY
    relation_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_IN_SELECTION_SQL = """
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
        COALESCE(p.reference_count, 0) AS reference_count,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    JOIN solemd.papers p
      ON p.corpus_id = mcs.corpus_id
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
)
SELECT
    corpus_id,
    paper_id,
    semantic_scholar_paper_id,
    title,
    abstract,
    tldr,
    journal_name,
    year,
    doi,
    pmid,
    pmcid,
    text_availability,
    is_open_access,
    citation_count,
    reference_count,
    relation_candidate_score
FROM ranked_papers
ORDER BY
    relation_candidate_score DESC,
    citation_count DESC,
    corpus_id DESC
LIMIT %s
"""


PAPER_LOOKUP_SQL = """
SELECT
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
    COALESCE(p.reference_count, 0) AS reference_count
FROM solemd.papers p
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
WHERE p.corpus_id = ANY(%s)
ORDER BY p.corpus_id
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
WITH
seed AS (
    SELECT p.embedding
    FROM solemd.papers p
    WHERE p.corpus_id = %s
      AND p.embedding IS NOT NULL
    LIMIT 1
)
SELECT
    p.corpus_id,
    p.paper_id,
    (seed.embedding <=> p.embedding) AS distance
FROM solemd.graph_points gp
JOIN solemd.papers p
  ON p.corpus_id = gp.corpus_id
CROSS JOIN seed
WHERE
    gp.graph_run_id = %s
    AND
    seed.embedding IS NOT NULL
    AND p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY seed.embedding <=> p.embedding ASC
LIMIT %s
"""


SEMANTIC_NEIGHBOR_IN_SELECTION_SQL = """
WITH
seed AS (
    SELECT p.embedding
    FROM solemd.papers p
    WHERE p.corpus_id = %s
      AND p.corpus_id = ANY(%s)
      AND p.embedding IS NOT NULL
    LIMIT 1
)
SELECT
    p.corpus_id,
    p.paper_id,
    (seed.embedding <=> p.embedding) AS distance
FROM solemd.papers p
CROSS JOIN seed
WHERE
    p.corpus_id = ANY(%s)
    AND
    seed.embedding IS NOT NULL
    AND p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY seed.embedding <=> p.embedding ASC
LIMIT %s
"""


SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL = """
SELECT to_regclass('solemd.idx_papers_embedding_hnsw') IS NOT NULL AS index_ready
"""


SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL = """
WITH seed AS (
    SELECT p.embedding
    FROM solemd.papers p
    WHERE p.corpus_id = %s
      AND p.embedding IS NOT NULL
    LIMIT 1
),
ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        p.paper_id,
        (p.embedding <=> seed.embedding) AS distance
    FROM solemd.papers p
    CROSS JOIN seed
    WHERE
        seed.embedding IS NOT NULL
        AND p.embedding IS NOT NULL
        AND p.corpus_id <> %s
    ORDER BY p.embedding <=> seed.embedding ASC
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
