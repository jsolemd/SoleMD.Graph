"""Foundational SQL fragments shared across all query modules.

All other _queries_*.py modules import from this file. Keep this
module free of circular imports — it must not import from siblings.
"""

# ---------------------------------------------------------------------------
# Graph / release meta
# ---------------------------------------------------------------------------

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
SELECT COUNT(*)::INT AS paper_count
FROM solemd.papers
WHERE embedding IS NOT NULL
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
        e.concept_id,
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
SELECT
    normalized_term,
    MAX(rule_confidence) AS rule_confidence
FROM (
    SELECT
        me.normalized_term,
        MAX(me.token_count) AS token_count,
        MAX(me.match_score) AS match_score,
        MAX(me.paper_count) AS paper_count,
        MAX(er.confidence) AS rule_confidence
    FROM matched_entities me
    LEFT JOIN solemd.entity_rule er
      ON er.concept_id = me.concept_id
    WHERE me.normalized_term IS NOT NULL
    GROUP BY me.normalized_term
) ranked_entities
GROUP BY normalized_term
ORDER BY
    MAX(token_count) DESC,
    MAX(match_score) DESC,
    MAX(paper_count) DESC,
    normalized_term
LIMIT %s
"""


def _normalized_entity_type_sql(expr: str) -> str:
    return f"lower(COALESCE({expr}, ''))"


def _normalized_entity_concept_id_sql(expr: str) -> str:
    return f"""
CASE
    WHEN upper(COALESCE({expr}, '')) LIKE 'MESH:%%'
        THEN split_part(COALESCE({expr}, ''), ':', 2)
    ELSE COALESCE({expr}, '')
END
""".strip()


ENTITY_TABLE_TYPE_KEY_SQL = _normalized_entity_type_sql("e.entity_type")
ENTITY_TABLE_CONCEPT_KEY_SQL = _normalized_entity_concept_id_sql("e.concept_id")
ENTITY_MENTION_TYPE_KEY_SQL = _normalized_entity_type_sql("pem.entity_type")
ENTITY_MENTION_CONCEPT_KEY_SQL = _normalized_entity_concept_id_sql("pem.concept_id")

# ---------------------------------------------------------------------------
# Paper column lists
# ---------------------------------------------------------------------------

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

RANKED_PAPER_SELECT_COLUMNS = """
    rp.corpus_id,
    rp.paper_id,
    rp.semantic_scholar_paper_id,
    rp.title,
    rp.abstract,
    rp.tldr,
    rp.journal_name,
    rp.year,
    rp.doi,
    rp.pmid,
    rp.pmcid,
    rp.text_availability,
    rp.is_open_access,
    rp.citation_count,
    rp.influential_citation_count,
    rp.reference_count,
    rp.publication_types,
    rp.fields_of_study,
    rp.has_rule_evidence,
    rp.has_curated_journal_family,
    rp.journal_family_type,
    rp.entity_rule_families,
    rp.entity_rule_count,
    rp.entity_core_families
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

PAPER_CORE_JOINS = """
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
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
