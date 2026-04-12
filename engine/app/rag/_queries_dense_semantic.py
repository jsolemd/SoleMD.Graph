"""Dense vector search, semantic neighbors, citation context, entity/relation match,
and reference/asset lookup SQL."""

from app.rag._queries_paper_core import (
    ENTITY_MENTION_CONCEPT_KEY_SQL,
    ENTITY_MENTION_NAMESPACE_KEY_SQL,
    ENTITY_MENTION_TYPE_KEY_SQL,
    ENTITY_RESOLVED_TOP_CONCEPTS_CTE_SQL,
    ENTITY_TOP_CONCEPT_MENTION_TARGETS_CTE_SQL,
)

# ---------------------------------------------------------------------------
# Dense (pgvector) query search
# ---------------------------------------------------------------------------

DENSE_QUERY_SEARCH_SQL = """
SELECT
    p.corpus_id,
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
WHERE p.embedding IS NOT NULL
ORDER BY p.embedding <=> %s::vector ASC
LIMIT %s
"""

DENSE_QUERY_SEARCH_IN_SELECTION_SQL = """
SELECT
    p.corpus_id,
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
WHERE
    p.corpus_id = ANY(%s)
    AND p.embedding IS NOT NULL
ORDER BY p.embedding <=> %s::vector ASC
LIMIT %s
"""

DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL = """
WITH ann_candidates AS MATERIALIZED (
    SELECT
        p.corpus_id,
        (p.embedding <=> %s::vector) AS distance
    FROM solemd.papers p
    WHERE p.embedding IS NOT NULL
    ORDER BY p.embedding <=> %s::vector ASC
    LIMIT %s
)
SELECT
    ann.corpus_id,
    ann.distance
FROM ann_candidates ann
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = ann.corpus_id
ORDER BY ann.distance ASC
LIMIT %s
"""

# ---------------------------------------------------------------------------
# Corpus / scope resolution
# ---------------------------------------------------------------------------

SELECTED_CORPUS_LOOKUP_BY_CORPUS_ID_SQL = """
SELECT candidate.corpus_id
FROM unnest(%s::bigint[]) WITH ORDINALITY AS candidate(corpus_id, ordinal)
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = candidate.corpus_id
ORDER BY candidate.ordinal
LIMIT 1
"""

SELECTED_CORPUS_LOOKUP_BY_PAPER_ID_SQL = """
SELECT gp.corpus_id
FROM unnest(%s::text[]) WITH ORDINALITY AS candidate(paper_id, ordinal)
JOIN solemd.papers p
  ON p.paper_id = candidate.paper_id
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
ORDER BY candidate.ordinal
LIMIT 1
"""

SCOPE_CORPUS_LOOKUP_BY_CORPUS_ID_SQL = """
SELECT gp.corpus_id
FROM solemd.graph_points gp
WHERE
    gp.graph_run_id = %s
    AND gp.corpus_id = ANY(%s::bigint[])
ORDER BY gp.corpus_id
"""

SCOPE_CORPUS_LOOKUP_BY_PAPER_ID_SQL = """
SELECT gp.corpus_id
FROM solemd.papers p
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
WHERE p.paper_id = ANY(%s::text[])
ORDER BY gp.corpus_id
"""

# ---------------------------------------------------------------------------
# Citation context
# ---------------------------------------------------------------------------

CITATION_CONTEXT_SQL = """
WITH query_terms AS (
    SELECT DISTINCT lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 4
),
scoped_contexts AS (
    SELECT
        cc.citing_corpus_id,
        cc.cited_corpus_id,
        cc.citation_id,
        cc.intents,
        cc.is_influential,
        cc.context_text,
        cc.context_text_lower AS lowered_context_text
    FROM solemd.citation_contexts cc
    WHERE
        (
            cc.citing_corpus_id = ANY(%s)
            OR cc.cited_corpus_id = ANY(%s)
        )
),
matched_term_counts AS (
    SELECT
        scx.citing_corpus_id,
        scx.cited_corpus_id,
        scx.citation_id,
        scx.intents,
        scx.is_influential,
        scx.context_text,
        COALESCE(COUNT(qt.lowered_term), 0)::float AS matched_term_count
    FROM scoped_contexts scx
    LEFT JOIN query_terms qt
      ON POSITION(qt.lowered_term IN scx.lowered_context_text) > 0
    GROUP BY
        scx.citing_corpus_id,
        scx.cited_corpus_id,
        scx.citation_id,
        scx.intents,
        scx.is_influential,
        scx.context_text
),
scored_contexts AS (
    SELECT
        mtc.*,
        GREATEST(
            0.1,
            mtc.matched_term_count
        ) + CASE
            WHEN mtc.is_influential THEN 0.25
            ELSE 0.0
        END AS score
    FROM matched_term_counts mtc
),
candidate_contexts AS (
    SELECT
        sc.citing_corpus_id AS corpus_id,
        'outgoing'::text AS direction,
        sc.cited_corpus_id AS neighbor_corpus_id,
        sc.citation_id,
        sc.context_text,
        sc.intents,
        sc.score
    FROM scored_contexts sc
    WHERE sc.citing_corpus_id = ANY(%s)
    UNION ALL
    SELECT
        sc.cited_corpus_id AS corpus_id,
        'incoming'::text AS direction,
        sc.citing_corpus_id AS neighbor_corpus_id,
        sc.citation_id,
        sc.context_text,
        sc.intents,
        sc.score
    FROM scored_contexts sc
    WHERE sc.cited_corpus_id = ANY(%s)
),
ranked_contexts AS (
    SELECT
        cc.*,
        ROW_NUMBER() OVER (
            PARTITION BY cc.corpus_id
            ORDER BY
                cc.score DESC,
                cc.citation_id DESC NULLS LAST,
                cc.neighbor_corpus_id DESC NULLS LAST
        ) AS corpus_rank
    FROM candidate_contexts cc
),
limited_contexts AS (
    SELECT *
    FROM ranked_contexts
    WHERE corpus_rank <= %s
)
SELECT
    lc.corpus_id,
    lc.direction,
    lc.neighbor_corpus_id,
    neighbor.paper_id AS neighbor_paper_id,
    lc.citation_id,
    lc.context_text,
    lc.intents,
    lc.score
FROM limited_contexts lc
LEFT JOIN solemd.papers neighbor
  ON neighbor.corpus_id = lc.neighbor_corpus_id
ORDER BY lc.corpus_id, lc.corpus_rank
"""

# ---------------------------------------------------------------------------
# Entity mention match (per-corpus entity annotation)
# ---------------------------------------------------------------------------

ENTITY_MATCH_SQL = f"""
WITH {ENTITY_RESOLVED_TOP_CONCEPTS_CTE_SQL.strip()},
{ENTITY_TOP_CONCEPT_MENTION_TARGETS_CTE_SQL.strip()},
query_term_stats AS (
    SELECT GREATEST(COUNT(DISTINCT lowered_term), 1) AS term_count
    FROM top_concepts
),
matched_mentions AS MATERIALIZED (
    SELECT DISTINCT
        pem.corpus_id,
        tmt.entity_type,
        tmt.concept_id,
        tmt.raw_term,
        tmt.lowered_term,
        COALESCE(pb.is_retrieval_default, false) AS is_retrieval_default,
        format(
            '%%s:%%s',
            COALESCE(pem.canonical_block_ordinal, -1),
            COALESCE(pem.canonical_sentence_ordinal, -1)
        ) AS structural_span_key
    FROM top_concept_mention_targets tmt
    JOIN solemd.paper_entity_mentions pem
      ON {ENTITY_MENTION_NAMESPACE_KEY_SQL} = tmt.match_namespace
     AND {ENTITY_MENTION_CONCEPT_KEY_SQL} = tmt.match_concept_id
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    WHERE
        tmt.concept_namespace IS NOT NULL
        AND pem.corpus_id = ANY(%s)
    UNION ALL
    SELECT DISTINCT
        pem.corpus_id,
        tc.entity_type,
        tc.concept_id,
        tc.raw_term,
        tc.lowered_term,
        COALESCE(pb.is_retrieval_default, false) AS is_retrieval_default,
        format(
            '%%s:%%s',
            COALESCE(pem.canonical_block_ordinal, -1),
            COALESCE(pem.canonical_sentence_ordinal, -1)
        ) AS structural_span_key
    FROM top_concepts tc
    JOIN solemd.paper_entity_mentions pem
      ON pem.runtime_concept_namespace_key IS NULL
     AND {ENTITY_MENTION_TYPE_KEY_SQL} = tc.entity_type
     AND {ENTITY_MENTION_CONCEPT_KEY_SQL} = tc.concept_id
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    WHERE
        tc.concept_namespace IS NULL
        AND pem.corpus_id = ANY(%s)
),
matched_entities AS (
    SELECT
        mm.corpus_id,
        mm.entity_type,
        mm.concept_id,
        ARRAY_AGG(DISTINCT mm.raw_term ORDER BY mm.raw_term) AS matched_terms,
        COUNT(DISTINCT mm.lowered_term) AS matched_term_count,
        COUNT(*) AS mention_count,
        COUNT(DISTINCT mm.structural_span_key) AS structural_span_count,
        COUNT(*) FILTER (WHERE mm.is_retrieval_default) AS retrieval_default_mention_count
    FROM matched_mentions mm
    GROUP BY mm.corpus_id, mm.entity_type, mm.concept_id
),
ranked_matches AS (
    SELECT
        me.corpus_id,
        me.entity_type,
        me.concept_id,
        me.matched_terms,
        me.mention_count,
        me.structural_span_count,
        me.retrieval_default_mention_count,
        LEAST(
            1.0,
            GREATEST(
                0.25,
                me.matched_term_count::float / qts.term_count::float
            )
            + LEAST(0.15, LN(me.mention_count + 1) * 0.06)
            + LEAST(0.12, LN(me.structural_span_count + 1) * 0.05)
            + LEAST(
                0.12,
                me.retrieval_default_mention_count::DOUBLE PRECISION * 0.04
            )
        ) AS score,
        ROW_NUMBER() OVER (
            PARTITION BY me.corpus_id
            ORDER BY
                me.matched_term_count DESC,
                me.retrieval_default_mention_count DESC,
                me.structural_span_count DESC,
                me.mention_count DESC,
                cardinality(me.matched_terms) DESC,
                me.entity_type,
                me.concept_id
        ) AS paper_rank
    FROM matched_entities me
    CROSS JOIN query_term_stats qts
)
SELECT
    corpus_id,
    entity_type,
    concept_id,
    matched_terms,
    mention_count,
    structural_span_count,
    retrieval_default_mention_count,
    score
FROM ranked_matches
WHERE paper_rank <= %s
ORDER BY corpus_id, paper_rank
"""

# ---------------------------------------------------------------------------
# Relation match (per-corpus relation annotation)
# ---------------------------------------------------------------------------

RELATION_MATCH_SQL = """
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE trim(term) <> ''
),
query_term_stats AS (
    SELECT GREATEST(COUNT(*), 1) AS term_count
    FROM query_terms
),
relation_surfaces AS (
    SELECT
        c.corpus_id,
        r.relation_type,
        r.subject_type,
        r.subject_id,
        r.object_type,
        r.object_id,
        lower(COALESCE(r.relation_type, '')) AS relation_type_surface,
        lower(COALESCE(r.subject_type, '')) AS subject_type_surface,
        lower(COALESCE(r.subject_id, '')) AS subject_id_surface,
        lower(COALESCE(r.object_type, '')) AS object_type_surface,
        lower(COALESCE(r.object_id, '')) AS object_id_surface
    FROM pubtator.relations r
    JOIN solemd.corpus c
      ON c.pmid = r.pmid
    WHERE c.corpus_id = ANY(%s)
),
matched_relations AS (
    SELECT
        rs.corpus_id,
        rs.relation_type,
        rs.subject_type,
        rs.subject_id,
        rs.object_type,
        rs.object_id,
        COUNT(DISTINCT qt.lowered_term) AS matched_term_count
    FROM relation_surfaces rs
    JOIN query_terms qt
      ON POSITION(qt.lowered_term IN rs.relation_type_surface) > 0
      OR POSITION(qt.lowered_term IN rs.subject_type_surface) > 0
      OR POSITION(qt.lowered_term IN rs.subject_id_surface) > 0
      OR POSITION(qt.lowered_term IN rs.object_type_surface) > 0
      OR POSITION(qt.lowered_term IN rs.object_id_surface) > 0
    GROUP BY
        rs.corpus_id,
        rs.relation_type,
        rs.subject_type,
        rs.subject_id,
        rs.object_type,
        rs.object_id
),
ranked_matches AS (
    SELECT
        mr.corpus_id,
        mr.relation_type,
        mr.subject_type,
        mr.subject_id,
        mr.object_type,
        mr.object_id,
        LEAST(
            1.0,
            GREATEST(
                0.25,
                mr.matched_term_count::float / qts.term_count::float
            )
        ) AS score,
        ROW_NUMBER() OVER (
            PARTITION BY mr.corpus_id
            ORDER BY
                mr.matched_term_count DESC,
                mr.relation_type,
                mr.subject_id,
                mr.object_id
        ) AS paper_rank
    FROM matched_relations mr
    CROSS JOIN query_term_stats qts
)
SELECT
    corpus_id,
    relation_type,
    subject_type,
    subject_id,
    object_type,
    object_id,
    score
FROM ranked_matches
WHERE paper_rank <= %s
ORDER BY corpus_id, paper_rank
"""

# ---------------------------------------------------------------------------
# Reference and asset lookups
# ---------------------------------------------------------------------------

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

AUTHOR_LOOKUP_SQL = """
WITH ranked_authors AS (
    SELECT
        pa.corpus_id,
        pa.author_position,
        pa.author_id,
        pa.name,
        ROW_NUMBER() OVER (
            PARTITION BY pa.corpus_id
            ORDER BY pa.author_position
        ) AS author_rank
    FROM solemd.paper_authors pa
    WHERE pa.corpus_id = ANY(%s)
)
SELECT
    corpus_id,
    author_position,
    author_id,
    name
FROM ranked_authors
WHERE author_rank <= %s
ORDER BY corpus_id, author_position
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

# ---------------------------------------------------------------------------
# Semantic neighbor search (pgvector ANN)
# ---------------------------------------------------------------------------

SEMANTIC_NEIGHBOR_SQL = """
SELECT
    p.corpus_id,
    p.paper_id,
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = p.corpus_id
WHERE
    p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY p.embedding <=> %s::vector ASC
LIMIT %s
"""

SEMANTIC_NEIGHBOR_IN_SELECTION_SQL = """
SELECT
    p.corpus_id,
    p.paper_id,
    (p.embedding <=> %s::vector) AS distance
FROM solemd.papers p
WHERE
    p.corpus_id = ANY(%s)
    AND p.embedding IS NOT NULL
    AND p.corpus_id <> %s
ORDER BY p.embedding <=> %s::vector ASC
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

SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL = """
SELECT to_regclass('solemd.idx_papers_embedding_hnsw') IS NOT NULL AS index_ready
"""
