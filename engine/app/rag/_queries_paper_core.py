"""Foundational SQL fragments shared across all query modules.

All other _queries_*.py modules import from this file. Keep this
module free of circular imports — it must not import from siblings.
"""

from app.graph import paper_runtime_contract
from app.rag.entity_runtime_keys import (
    catalog_vocab_source_identifier_sql,
    runtime_concept_id_key_sql,
    runtime_concept_namespace_key_sql,
    runtime_entity_type_key_sql,
)

EMBEDDED_PAPER_COUNT_ESTIMATE_SQL = """
SELECT COALESCE(c.reltuples::BIGINT, 0) AS paper_count
FROM pg_class c
WHERE c.oid = to_regclass('solemd.idx_papers_embedding_hnsw')
"""

PAPER_EMBEDDING_LITERAL_SQL = """
SELECT embedding::text AS embedding_literal
FROM solemd.papers
WHERE
    corpus_id = %s
    AND embedding IS NOT NULL
LIMIT 1
"""

# ---------------------------------------------------------------------------
# Entity term resolution
# ---------------------------------------------------------------------------

def _entity_join_type_sql(expr: str) -> str:
    return runtime_entity_type_key_sql(expr)


def _entity_catalog_namespace_sql(
    *,
    concept_id_expr: str,
    entity_type_expr: str,
) -> str:
    return f"""
CASE
    WHEN upper(COALESCE({concept_id_expr}, '')) LIKE 'MESH:%%'
        THEN 'mesh'
    WHEN upper(COALESCE({concept_id_expr}, '')) LIKE 'UMLS:%%'
        THEN 'umls'
    WHEN lower(COALESCE({entity_type_expr}, '')) = 'gene'
        THEN 'ncbi_gene'
    WHEN lower(COALESCE({entity_type_expr}, '')) = 'species'
        THEN 'ncbi_taxonomy'
    ELSE NULL
END
""".strip()


def _entity_catalog_mention_concept_id_sql(
    *,
    concept_id_expr: str,
    entity_type_expr: str,
) -> str:
    return f"""
CASE
    WHEN upper(COALESCE({concept_id_expr}, '')) LIKE 'MESH:%%'
        OR upper(COALESCE({concept_id_expr}, '')) LIKE 'UMLS:%%'
        THEN split_part(COALESCE({concept_id_expr}, ''), ':', 2)
    WHEN lower(COALESCE({entity_type_expr}, '')) = 'cellline'
        THEN replace(COALESCE({concept_id_expr}, ''), '_', ':')
    ELSE COALESCE({concept_id_expr}, '')
END
""".strip()


ENTITY_TABLE_TYPE_KEY_SQL = _entity_join_type_sql("e.entity_type")
ENTITY_TABLE_NAMESPACE_KEY_SQL = _entity_catalog_namespace_sql(
    concept_id_expr="e.concept_id",
    entity_type_expr="e.entity_type",
)
ENTITY_TABLE_CONCEPT_KEY_SQL = _entity_catalog_mention_concept_id_sql(
    concept_id_expr="e.concept_id",
    entity_type_expr="e.entity_type",
)
ENTITY_MENTION_TYPE_KEY_SQL = "pem.runtime_entity_type_key"
ENTITY_MENTION_NAMESPACE_KEY_SQL = "pem.runtime_concept_namespace_key"
ENTITY_MENTION_CONCEPT_KEY_SQL = "pem.runtime_concept_id_key"
ENTITY_INPUT_TYPE_KEY_SQL = runtime_entity_type_key_sql("resolved.entity_type")
ENTITY_INPUT_NAMESPACE_KEY_SQL = runtime_concept_namespace_key_sql(
    "resolved.concept_namespace"
)
ENTITY_INPUT_CONCEPT_KEY_SQL = runtime_concept_id_key_sql("resolved.concept_id")
PAPER_SELECT_COLUMNS = paper_runtime_contract.PAPER_RUNTIME_SELECT_COLUMNS
RANKED_PAPER_SELECT_COLUMNS = (
    paper_runtime_contract.RANKED_PAPER_RUNTIME_SELECT_COLUMNS
)
PAPER_CORE_JOINS = paper_runtime_contract.PAPER_RUNTIME_JOINS

_ENTITY_CATALOG_NULL_VOCAB_COLUMNS = """
        'entity_catalog' AS source_surface,
        NULL::uuid AS vocab_term_id,
        NULL::text AS vocab_alias_key,
        NULL::text AS vocab_alias_type,
        NULL::integer AS vocab_quality_score,
        NULL::boolean AS vocab_is_preferred,
        NULL::text AS vocab_umls_cui,
        NULL::text AS vocab_mesh_id,
        NULL::text AS vocab_category
"""

_ENTITY_ALIAS_NULL_VOCAB_COLUMNS = """
        'entity_alias' AS source_surface,
        NULL::uuid AS vocab_term_id,
        NULL::text AS vocab_alias_key,
        NULL::text AS vocab_alias_type,
        NULL::integer AS vocab_quality_score,
        NULL::boolean AS vocab_is_preferred,
        NULL::text AS vocab_umls_cui,
        NULL::text AS vocab_mesh_id,
        NULL::text AS vocab_category
"""

_VOCAB_CONCEPT_IDENTIFIER_SQL = catalog_vocab_source_identifier_sql(
    mesh_id_expr="vt.mesh_id",
    umls_cui_expr="vt.umls_cui",
)
_VOCAB_CONCEPT_NAMESPACE_SQL = _entity_catalog_namespace_sql(
    concept_id_expr=_VOCAB_CONCEPT_IDENTIFIER_SQL,
    entity_type_expr="COALESCE(e.entity_type, vt.pubtator_entity_type)",
)
_VOCAB_CONCEPT_ID_SQL = runtime_concept_id_key_sql(_VOCAB_CONCEPT_IDENTIFIER_SQL)

ENTITY_TOP_CONCEPT_MENTION_TARGETS_CTE_SQL = """
top_concept_mention_targets AS MATERIALIZED (
    SELECT DISTINCT
        tc.raw_term,
        tc.lowered_term,
        tc.entity_type,
        tc.concept_namespace,
        tc.concept_id,
        tc.concept_score,
        tc.concept_namespace AS match_namespace,
        tc.concept_id AS match_concept_id
    FROM top_concepts tc
    WHERE tc.concept_namespace IS NOT NULL
    UNION
    SELECT DISTINCT
        tc.raw_term,
        tc.lowered_term,
        tc.entity_type,
        tc.concept_namespace,
        tc.concept_id,
        tc.concept_score,
        'mesh' AS match_namespace,
        c2m.mesh_id AS match_concept_id
    FROM top_concepts tc
    JOIN umls.chemical_ingredient_bridge cib
      ON tc.concept_namespace = 'umls'
     AND tc.entity_type = 'chemical'
     AND cib.ingredient_cui = tc.concept_id
    JOIN umls.cui_to_mesh c2m
      ON c2m.cui = cib.form_cui
    WHERE c2m.mesh_id IS NOT NULL
      AND c2m.mesh_id <> ''
)
"""

QUERY_ENTITY_TERM_MATCH_SQL = f"""
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term,
        cardinality(string_to_array(lower(trim(term)), ' ')) AS token_count
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
catalog_exact_matches AS (
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = qt.raw_term
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = qt.upper_term
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE
        qt.upper_term <> qt.raw_term
        AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('MESH:' || qt.raw_term)
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE
        qt.raw_term NOT LIKE '%%:%%'
        AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('MESH:' || qt.upper_term)
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE
        qt.raw_term NOT LIKE '%%:%%'
        AND qt.upper_term <> qt.raw_term
        AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('UMLS:' || qt.raw_term)
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE
        qt.raw_term NOT LIKE '%%:%%'
        AND COALESCE(e.concept_id, '') NOT IN ('', '-')
    UNION
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        e.concept_id AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        1.0 AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_CATALOG_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entities e
      ON e.concept_id = ('UMLS:' || qt.upper_term)
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE
        qt.raw_term NOT LIKE '%%:%%'
        AND qt.upper_term <> qt.raw_term
        AND COALESCE(e.concept_id, '') NOT IN ('', '-')
),
catalog_alias_exact_matches AS (
    -- Broad exact-query alias resolution deliberately uses entity_aliases rather
    -- than entity_runtime_aliases. The runtime table is the highlight/matcher
    -- subset; the query-serving alias projection carries the fuller UMLS/vocab
    -- exact-match surface used by RAG concept normalization.
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        COALESCE(NULLIF(trim(e.canonical_name), ''), ea.alias_text, qt.raw_term) AS normalized_term,
        {ENTITY_TABLE_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_TABLE_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_TABLE_CONCEPT_KEY_SQL} AS concept_id,
        e.paper_count,
        CASE
            WHEN ea.is_canonical THEN 0.98
            ELSE 0.97
        END AS match_score,
        CASE COALESCE(er.confidence, '')
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        {_ENTITY_ALIAS_NULL_VOCAB_COLUMNS}
    FROM query_terms qt
    JOIN solemd.entity_aliases ea
      ON ea.alias_key = qt.lowered_term
    JOIN solemd.entities e
      ON e.concept_id = ea.concept_id
     AND e.entity_type = ea.entity_type
    LEFT JOIN solemd.entity_rule er
      ON er.entity_type = {ENTITY_TABLE_TYPE_KEY_SQL}
     AND er.concept_id = e.concept_id
    WHERE COALESCE(e.concept_id, '') NOT IN ('', '-')
),
vocab_alias_exact_matches AS (
    SELECT
        qt.raw_term AS query_term,
        qt.token_count,
        COALESCE(
            NULLIF(trim(vt.canonical_name), ''),
            NULLIF(trim(COALESCE(e.canonical_name, '')), ''),
            vta.alias_text,
            qt.raw_term
        ) AS normalized_term,
        COALESCE(
            {_entity_join_type_sql("e.entity_type")},
            {_entity_join_type_sql("vt.pubtator_entity_type")},
            'disease'
        ) AS entity_type,
        {_VOCAB_CONCEPT_NAMESPACE_SQL} AS concept_namespace,
        {_VOCAB_CONCEPT_ID_SQL} AS concept_id,
        COALESCE(e.paper_count, 0) AS paper_count,
        CASE
            WHEN vta.is_preferred AND COALESCE(vta.quality_score, 0) >= 90 THEN 0.96
            WHEN vta.is_preferred THEN 0.95
            WHEN COALESCE(vta.quality_score, 0) >= 90 THEN 0.94
            WHEN COALESCE(vta.quality_score, 0) >= 70 THEN 0.92
            ELSE 0.88
        END AS match_score,
        CASE
            WHEN COALESCE(er.confidence, '') = 'high' THEN 3
            WHEN COALESCE(er.confidence, '') = 'medium' THEN 2
            WHEN COALESCE(er.confidence, '') = 'low' THEN 1
            WHEN vta.is_preferred AND COALESCE(vta.quality_score, 0) >= 90 THEN 3
            WHEN COALESCE(vta.quality_score, 0) >= 70 THEN 2
            ELSE 1
        END AS rule_confidence_rank,
        (COALESCE(er.confidence, '') <> '') AS has_entity_rule,
        'vocab_alias' AS source_surface,
        vt.id AS vocab_term_id,
        vta.alias_key AS vocab_alias_key,
        vta.alias_type AS vocab_alias_type,
        vta.quality_score AS vocab_quality_score,
        vta.is_preferred AS vocab_is_preferred,
        vta.umls_cui AS vocab_umls_cui,
        vt.mesh_id AS vocab_mesh_id,
        vt.category AS vocab_category
    FROM query_terms qt
    JOIN solemd.vocab_term_aliases vta
      ON vta.alias_key = qt.lowered_term
    JOIN solemd.vocab_terms vt
      ON vt.id = vta.term_id
    LEFT JOIN solemd.entities e
      ON e.concept_id = {_VOCAB_CONCEPT_IDENTIFIER_SQL}
    LEFT JOIN solemd.entity_rule er
      ON e.concept_id IS NOT NULL
     AND er.entity_type = {_entity_join_type_sql("e.entity_type")}
     AND er.concept_id = e.concept_id
    WHERE
        {_VOCAB_CONCEPT_IDENTIFIER_SQL} IS NOT NULL
        AND trim(COALESCE(vt.canonical_name, '')) <> ''
),
matched_entities AS (
    SELECT * FROM catalog_exact_matches
    UNION ALL
    SELECT * FROM catalog_alias_exact_matches
    UNION ALL
    SELECT * FROM vocab_alias_exact_matches
),
selected_terms AS MATERIALIZED (
    SELECT
        query_term,
        MAX(token_count) AS token_count,
        MAX(match_score) AS match_score,
        MAX(paper_count) AS paper_count,
        MAX(rule_confidence_rank) AS rule_confidence_rank
    FROM matched_entities
    WHERE normalized_term IS NOT NULL
    GROUP BY query_term
    ORDER BY
        MAX(token_count) DESC,
        MAX(match_score) DESC,
        MAX(paper_count) DESC,
        query_term
    LIMIT %s
),
ranked_entities AS (
    SELECT
        me.query_term,
        me.normalized_term,
        me.entity_type,
        me.concept_namespace,
        me.concept_id,
        st.rule_confidence_rank,
        me.has_entity_rule,
        st.token_count,
        st.match_score,
        st.paper_count,
        me.source_surface,
        me.vocab_term_id,
        me.vocab_alias_key,
        me.vocab_alias_type,
        me.vocab_quality_score,
        me.vocab_is_preferred,
        me.vocab_umls_cui,
        me.vocab_mesh_id,
        me.vocab_category,
        ROW_NUMBER() OVER (
            PARTITION BY me.query_term, me.normalized_term, me.source_surface
            ORDER BY me.match_score DESC, me.paper_count DESC, me.concept_id
        ) AS concept_rank
    FROM (
        SELECT DISTINCT ON (
            query_term, normalized_term, entity_type,
            concept_namespace, concept_id, source_surface
        )
            query_term,
            normalized_term,
            entity_type,
            concept_namespace,
            concept_id,
            match_score,
            paper_count,
            has_entity_rule,
            source_surface,
            vocab_term_id,
            vocab_alias_key,
            vocab_alias_type,
            vocab_quality_score,
            vocab_is_preferred,
            vocab_umls_cui,
            vocab_mesh_id,
            vocab_category
        FROM matched_entities
        WHERE normalized_term IS NOT NULL
        ORDER BY
            query_term, normalized_term, entity_type,
            concept_namespace, concept_id, source_surface,
            match_score DESC, paper_count DESC
    ) me
    JOIN selected_terms st
      ON st.query_term = me.query_term
)
SELECT
    query_term,
    normalized_term,
    entity_type,
    concept_namespace,
    concept_id,
    CASE rule_confidence_rank
        WHEN 3 THEN 'high'
        WHEN 2 THEN 'medium'
        WHEN 1 THEN 'low'
        ELSE NULL
    END AS rule_confidence,
    has_entity_rule,
    source_surface,
    vocab_term_id::text AS vocab_term_id,
    vocab_alias_key,
    vocab_alias_type,
    vocab_quality_score,
    vocab_is_preferred,
    vocab_umls_cui,
    vocab_mesh_id,
    vocab_category
FROM ranked_entities
WHERE concept_rank <= 3
ORDER BY
    token_count DESC,
    match_score DESC,
    paper_count DESC,
    query_term,
    normalized_term,
    concept_rank
"""

QUERY_VOCAB_CONCEPT_MATCH_SQL = """
WITH query_terms AS (
    SELECT DISTINCT
        trim(term) AS query_term,
        lower(trim(term)) AS lowered_term,
        cardinality(string_to_array(lower(trim(term)), ' ')) AS token_count
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_vocab AS (
    SELECT
        qt.query_term,
        qt.token_count,
        COALESCE(
            NULLIF(trim(vt.canonical_name), ''),
            vta.alias_text,
            qt.query_term
        ) AS preferred_term,
        vta.alias_text AS matched_alias,
        vta.alias_key,
        vta.alias_type,
        vta.quality_score,
        vta.is_preferred,
        vta.umls_cui,
        vt.id::text AS term_id,
        vt.category,
        vt.mesh_id,
        COALESCE(vt.pubtator_entity_type, 'disease') AS entity_type,
        CASE
            WHEN vta.is_preferred AND COALESCE(vta.quality_score, 0) >= 90 THEN 0
            WHEN COALESCE(vta.quality_score, 0) >= 90 THEN 1
            WHEN vta.is_preferred THEN 2
            WHEN COALESCE(vta.quality_score, 0) >= 70 THEN 3
            ELSE 4
        END AS match_rank
    FROM query_terms qt
    JOIN solemd.vocab_term_aliases vta
      ON vta.alias_key = qt.lowered_term
    JOIN solemd.vocab_terms vt
      ON vt.id = vta.term_id
    WHERE trim(COALESCE(vt.canonical_name, '')) <> ''
),
ranked_vocab AS (
    SELECT
        query_term,
        token_count,
        preferred_term,
        matched_alias,
        alias_key,
        alias_type,
        quality_score,
        is_preferred,
        umls_cui,
        term_id,
        category,
        mesh_id,
        entity_type,
        ROW_NUMBER() OVER (
            PARTITION BY query_term, term_id
            ORDER BY match_rank ASC, quality_score DESC NULLS LAST, matched_alias
        ) AS alias_rank
    FROM matched_vocab
)
SELECT
    query_term,
    preferred_term,
    matched_alias,
    alias_key,
    alias_type,
    quality_score,
    is_preferred,
    umls_cui,
    term_id,
    category,
    mesh_id,
    entity_type,
    'vocab_alias' AS source_surface
FROM ranked_vocab
WHERE alias_rank = 1
ORDER BY
    token_count DESC,
    quality_score DESC NULLS LAST,
    is_preferred DESC,
    query_term,
    preferred_term
LIMIT %s
"""

ENTITY_RESOLVED_TOP_CONCEPTS_CTE_SQL = f"""
top_concepts AS MATERIALIZED (
    SELECT DISTINCT
        trim(raw_term) AS raw_term,
        lower(trim(raw_term)) AS lowered_term,
        {ENTITY_INPUT_TYPE_KEY_SQL} AS entity_type,
        {ENTITY_INPUT_NAMESPACE_KEY_SQL} AS concept_namespace,
        {ENTITY_INPUT_CONCEPT_KEY_SQL} AS concept_id,
        1.0 AS concept_score
    FROM unnest(
        %s::text[],
        %s::text[],
        %s::text[],
        %s::text[]
    ) AS resolved(raw_term, entity_type, concept_namespace, concept_id)
    WHERE
        trim(raw_term) <> ''
        AND trim(entity_type) <> ''
        AND trim(concept_id) <> ''
)
"""

SPECIES_PROFILE_SQL = """
SELECT
    pem.corpus_id,
    COUNT(*) FILTER (WHERE pem.concept_id = %s) AS human_mentions,
    COUNT(*) FILTER (
        WHERE pem.concept_id IS NOT NULL
          AND pem.concept_id <> %s
    ) AS nonhuman_mentions,
    COUNT(*) FILTER (WHERE pem.concept_id = ANY(%s::text[])) AS common_model_mentions
FROM solemd.paper_entity_mentions pem
WHERE
    lower(pem.entity_type) = 'species'
    AND pem.corpus_id = ANY(%s)
GROUP BY pem.corpus_id
"""

PAPER_SEARCH_VECTOR_SQL = "p.fts_vector"

# ---------------------------------------------------------------------------
# Graph input / join fragments
# ---------------------------------------------------------------------------

GRAPH_INPUT_CTE_SQL = """
graph_input AS NOT MATERIALIZED (
    SELECT %s::uuid AS graph_run_id
)
"""

PAPER_GRAPH_JOIN_SQL = """
solemd.graph_points gp
JOIN solemd.papers p ON p.corpus_id = gp.corpus_id
"""

PAPER_GRAPH_WHERE_SQL = "gp.graph_run_id = graph_input.graph_run_id"

# ---------------------------------------------------------------------------
# Title SQL building blocks
# ---------------------------------------------------------------------------

PAPER_TITLE_TEXT_SQL = """
lower(COALESCE(p.title, ''))
"""

PAPER_NORMALIZED_TITLE_KEY_SQL = """
solemd.normalize_title_key(p.title)
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

PAPER_NORMALIZED_TITLE_SIMILARITY_SQL = f"""
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
)
"""

# ---------------------------------------------------------------------------
# Chunk search fragments
# ---------------------------------------------------------------------------

CHUNK_SEARCH_VECTOR_SQL = """
to_tsvector('english', COALESCE(c.text, ''))
"""

CHUNK_HEADLINE_OPTIONS = (
    "MaxWords=40, MinWords=12, ShortWord=2, MaxFragments=2, FragmentDelimiter=..."
)
CHUNK_EXACT_MATCH_BONUS = 0.45
CHUNK_EXACT_MATCH_NORMALIZATION_REGEX = "[^[:alnum:]:_/+-]+"
ENTITY_FUZZY_SIMILARITY_THRESHOLD = 0.3
ENTITY_TOP_CONCEPTS_PER_TERM = 3
