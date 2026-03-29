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


PAPER_SEARCH_SQL = """
WITH scoped_corpus AS (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
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
        p.doi,
        c.pmid,
        c.pmc_id AS pmcid,
        p.text_availability,
        p.is_open_access,
        COALESCE(p.citation_count, 0) AS citation_count,
        COALESCE(p.reference_count, 0) AS reference_count,
        COALESCE(
            ts_rank_cd(
                setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B'),
                websearch_to_tsquery('english', %s)
            ),
            0
        ) AS lexical_score,
        COALESCE(similarity(lower(COALESCE(p.title, '')), lower(%s)), 0) AS title_similarity
    FROM solemd.papers p
    JOIN scoped_corpus scoped
      ON scoped.corpus_id = p.corpus_id
    JOIN solemd.corpus c
      ON c.corpus_id = p.corpus_id
    WHERE
        (
            setweight(to_tsvector('english', COALESCE(p.title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(p.abstract, '')), 'B')
        ) @@ websearch_to_tsquery('english', %s)
        OR lower(COALESCE(p.title, '')) LIKE ('%%' || lower(%s) || '%%')
        OR similarity(lower(COALESCE(p.title, '')), lower(%s)) > %s
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
WITH scoped_corpus AS (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
),
seed AS (
    SELECT p.corpus_id, p.embedding
    FROM solemd.papers p
    JOIN scoped_corpus scoped
      ON scoped.corpus_id = p.corpus_id
    WHERE p.corpus_id = %s
    LIMIT 1
)
SELECT
    p.corpus_id,
    p.paper_id,
    (seed.embedding <=> p.embedding) AS distance
FROM seed
JOIN scoped_corpus scoped
  ON scoped.corpus_id <> seed.corpus_id
JOIN solemd.papers p
  ON p.corpus_id = scoped.corpus_id
WHERE
    seed.embedding IS NOT NULL
    AND p.embedding IS NOT NULL
ORDER BY seed.embedding <=> p.embedding ASC
LIMIT %s
"""
