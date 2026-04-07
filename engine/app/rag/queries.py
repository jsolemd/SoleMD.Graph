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
JOIN solemd.corpus c
  ON c.corpus_id = p.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = p.corpus_id
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


ENTITY_QUERY_TERMS_CTE_SQL = """
query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        upper(trim(term)) AS upper_term,
        lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
)
"""


ENTITY_EXACT_MATCHES_CTE_SQL = """
exact_matches AS MATERIALIZED (
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
)
"""


ENTITY_FUZZY_QUERY_TERMS_CTE_SQL = """
fuzzy_query_terms AS MATERIALIZED (
    SELECT qt.raw_term, qt.lowered_term
    FROM query_terms qt
    WHERE NOT EXISTS (
        SELECT 1
        FROM exact_matches em
        WHERE em.lowered_term = qt.lowered_term
    )
)
"""


ENTITY_FUZZY_MATCHES_CTE_SQL = """
fuzzy_matches AS MATERIALIZED (
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
)
"""


ENTITY_MATCHED_CONCEPTS_CTE_SQL = """
matched_concepts AS MATERIALIZED (
    SELECT * FROM exact_matches
    UNION ALL
    SELECT * FROM fuzzy_matches
)
"""


ENTITY_GRAPH_SCOPE_CTE_SQL = """
graph_scope AS MATERIALIZED (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
)
"""


ENTITY_CANDIDATE_SCORE_SQL = """
LEAST(
    1.35,
    MAX(tc.concept_score)
    + LEAST(
        0.18,
        GREATEST(COUNT(DISTINCT tc.lowered_term) - 1, 0)::DOUBLE PRECISION * 0.09
    )
    + LEAST(0.12, LN(COUNT(*) + 1) * 0.05)
    + LEAST(
        0.12,
        LN(
            COUNT(
                DISTINCT format(
                    '%%s:%%s',
                    COALESCE(pem.canonical_block_ordinal, -1),
                    COALESCE(pem.canonical_sentence_ordinal, -1)
                )
            ) + 1
        ) * 0.06
    )
    + LEAST(
        0.12,
        COUNT(*) FILTER (WHERE pb.is_retrieval_default IS TRUE)::DOUBLE PRECISION * 0.04
    )
)
"""


def _entity_top_concepts_cte_sql(*, exact_only: bool) -> str:
    source_cte = "exact_matches" if exact_only else "matched_concepts"
    source_alias = "em" if exact_only else "mc"
    return f"""
top_concepts AS (
    SELECT
        raw_term,
        lowered_term,
        entity_type,
        concept_id,
        concept_score
    FROM (
        SELECT
            {source_alias}.*,
            row_number() OVER (
                PARTITION BY lowered_term
                ORDER BY concept_score DESC, paper_count DESC, concept_id
            ) AS concept_rank
        FROM {source_cte} {source_alias}
    ) ranked_concepts
    WHERE concept_rank <= %s
)
"""


def _entity_matched_corpus_scores_cte_sql(*, scoped_to_selection: bool) -> str:
    scope_sql = "WHERE pem.corpus_id = ANY(%s)"
    if not scoped_to_selection:
        scope_sql = """
    JOIN graph_scope gs
      ON gs.corpus_id = pem.corpus_id
"""
    return f"""
matched_corpus_scores AS (
    SELECT
        pem.corpus_id,
        {ENTITY_CANDIDATE_SCORE_SQL.strip()} AS entity_candidate_score
    FROM top_concepts tc
    JOIN solemd.paper_entity_mentions pem
      ON pem.entity_type = tc.entity_type
     AND pem.concept_id = tc.concept_id
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    {scope_sql.strip()}
    GROUP BY pem.corpus_id
)
"""


ENTITY_RANKED_PAPERS_SELECT_SQL = f"""
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
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.entity_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.entity_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


def _paper_entity_search_sql(*, exact_only: bool, scoped_to_selection: bool) -> str:
    ctes: list[str] = [ENTITY_QUERY_TERMS_CTE_SQL, ENTITY_EXACT_MATCHES_CTE_SQL]
    if not exact_only:
        ctes.extend(
            [
                ENTITY_FUZZY_QUERY_TERMS_CTE_SQL,
                ENTITY_FUZZY_MATCHES_CTE_SQL,
                ENTITY_MATCHED_CONCEPTS_CTE_SQL,
            ]
        )
    ctes.append(_entity_top_concepts_cte_sql(exact_only=exact_only))
    if not scoped_to_selection:
        ctes.append(ENTITY_GRAPH_SCOPE_CTE_SQL)
    ctes.append(
        _entity_matched_corpus_scores_cte_sql(
            scoped_to_selection=scoped_to_selection,
        )
    )
    return "WITH " + ",\n".join(ctes) + ",\n" + ENTITY_RANKED_PAPERS_SELECT_SQL


PAPER_ENTITY_EXACT_SEARCH_SQL = _paper_entity_search_sql(
    exact_only=True,
    scoped_to_selection=False,
)


PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL = _paper_entity_search_sql(
    exact_only=True,
    scoped_to_selection=True,
)


PAPER_ENTITY_SEARCH_SQL = _paper_entity_search_sql(
    exact_only=False,
    scoped_to_selection=False,
)


PAPER_ENTITY_SEARCH_IN_SELECTION_SQL = _paper_entity_search_sql(
    exact_only=False,
    scoped_to_selection=True,
)


PAPER_RELATION_SEARCH_SQL = f"""
WITH graph_scope AS MATERIALIZED (
    SELECT DISTINCT corpus_id
    FROM solemd.graph_points
    WHERE graph_run_id = %s
),
query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS MATERIALIZED (
    SELECT
        pre.corpus_id,
        LEAST(1.0, 0.35 + (ln(SUM(pre.relation_count) + 1) * 0.2)) AS relation_candidate_score
    FROM solemd.paper_relation_evidence pre
    JOIN query_terms qt
      ON pre.relation_type = qt.normalized_term
    JOIN graph_scope gs
      ON gs.corpus_id = pre.corpus_id
    GROUP BY pre.corpus_id
),
candidate_papers AS MATERIALIZED (
    SELECT
        mcs.corpus_id,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    ORDER BY
        mcs.relation_candidate_score DESC,
        mcs.corpus_id DESC
    LIMIT GREATEST(%s::integer * 40, 200)
),
ranked_papers AS MATERIALIZED (
    SELECT
        {PAPER_SELECT_COLUMNS},
        cp.relation_candidate_score
    FROM candidate_papers cp
    JOIN solemd.papers p
      ON p.corpus_id = cp.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.relation_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.relation_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
LIMIT %s
"""


PAPER_RELATION_SEARCH_IN_SELECTION_SQL = f"""
WITH query_terms AS MATERIALIZED (
    SELECT DISTINCT
        trim(term) AS raw_term,
        lower(replace(replace(trim(term), '-', '_'), ' ', '_')) AS normalized_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 3
),
matched_corpus_scores AS MATERIALIZED (
    SELECT
        pre.corpus_id,
        LEAST(1.0, 0.35 + (ln(SUM(pre.relation_count) + 1) * 0.2)) AS relation_candidate_score
    FROM solemd.paper_relation_evidence pre
    JOIN query_terms qt
      ON pre.relation_type = qt.normalized_term
    WHERE pre.corpus_id = ANY(%s)
    GROUP BY pre.corpus_id
),
candidate_papers AS MATERIALIZED (
    SELECT
        mcs.corpus_id,
        mcs.relation_candidate_score
    FROM matched_corpus_scores mcs
    ORDER BY
        mcs.relation_candidate_score DESC,
        mcs.corpus_id DESC
    LIMIT GREATEST(%s::integer * 40, 200)
),
ranked_papers AS MATERIALIZED (
    SELECT
        {PAPER_SELECT_COLUMNS},
        cp.relation_candidate_score
    FROM candidate_papers cp
    JOIN solemd.papers p
      ON p.corpus_id = cp.corpus_id
    {PAPER_CORE_JOINS}
)
SELECT
    {RANKED_PAPER_SELECT_COLUMNS},
    rp.relation_candidate_score
FROM ranked_papers rp
ORDER BY
    rp.relation_candidate_score DESC,
    rp.citation_count DESC,
    rp.corpus_id DESC
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
WITH query_terms AS (
    SELECT DISTINCT lower(trim(term)) AS lowered_term
    FROM unnest(%s::text[]) AS term
    WHERE length(trim(term)) >= 4
),
scoped_citations AS (
    SELECT
        c.citing_corpus_id,
        c.cited_corpus_id,
        c.citation_id,
        c.intents,
        c.is_influential,
        context_items.context_text,
        lower(context_items.context_text) AS lowered_context_text
    FROM solemd.citations c
    CROSS JOIN LATERAL (
        SELECT
            CASE
                WHEN jsonb_typeof(context_item) = 'string' THEN
                    trim(both '"' from context_item::text)
                WHEN jsonb_typeof(context_item) = 'object' THEN
                    COALESCE(context_item ->> 'text', '')
                ELSE ''
            END AS context_text
        FROM jsonb_array_elements(c.contexts) AS context_item
    ) AS context_items
    WHERE
        c.context_count > 0
        AND (
            c.citing_corpus_id = ANY(%s)
            OR c.cited_corpus_id = ANY(%s)
        )
        AND context_items.context_text <> ''
),
matched_term_counts AS (
    SELECT
        sc.citing_corpus_id,
        sc.cited_corpus_id,
        sc.citation_id,
        sc.intents,
        sc.is_influential,
        sc.context_text,
        COALESCE(COUNT(qt.lowered_term), 0)::float AS matched_term_count
    FROM scoped_citations sc
    LEFT JOIN query_terms qt
      ON POSITION(qt.lowered_term IN sc.lowered_context_text) > 0
    GROUP BY
        sc.citing_corpus_id,
        sc.cited_corpus_id,
        sc.citation_id,
        sc.intents,
        sc.is_influential,
        sc.context_text
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


ENTITY_MATCH_SQL = """
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
entity_surfaces AS (
    SELECT
        pem.corpus_id,
        pem.entity_type,
        pem.concept_id,
        lower(COALESCE(pem.text, '')) AS mention_surface,
        lower(COALESCE(pem.concept_id, '')) AS concept_surface,
        lower(COALESCE(e.canonical_name, '')) AS canonical_surface,
        COALESCE(pb.is_retrieval_default, false) AS is_retrieval_default,
        format(
            '%%s:%%s',
            COALESCE(pem.canonical_block_ordinal, -1),
            COALESCE(pem.canonical_sentence_ordinal, -1)
        ) AS structural_span_key
    FROM solemd.paper_entity_mentions pem
    LEFT JOIN solemd.entities e
      ON e.entity_type = pem.entity_type
     AND e.concept_id = pem.concept_id
    LEFT JOIN solemd.paper_blocks pb
      ON pb.corpus_id = pem.corpus_id
     AND pb.block_ordinal = pem.canonical_block_ordinal
    WHERE pem.corpus_id = ANY(%s)
),
matched_entities AS (
    SELECT
        es.corpus_id,
        es.entity_type,
        es.concept_id,
        ARRAY_AGG(DISTINCT qt.raw_term ORDER BY qt.raw_term) AS matched_terms,
        COUNT(DISTINCT qt.lowered_term) AS matched_term_count,
        COUNT(*) AS mention_count,
        COUNT(DISTINCT es.structural_span_key) AS structural_span_count,
        COUNT(*) FILTER (WHERE es.is_retrieval_default) AS retrieval_default_mention_count
    FROM entity_surfaces es
    JOIN query_terms qt
      ON POSITION(qt.lowered_term IN es.concept_surface) > 0
      OR POSITION(qt.lowered_term IN es.canonical_surface) > 0
      OR POSITION(qt.lowered_term IN es.mention_surface) > 0
    GROUP BY es.corpus_id, es.entity_type, es.concept_id
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
