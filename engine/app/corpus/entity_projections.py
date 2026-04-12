"""Derived entity-serving projections for entity lookup, query aliases, and presence."""

from __future__ import annotations

import logging
import time

from app import db
from app.corpus._etl import log_etl_run
from app.entities.highlight_policy import (
    AMBIGUOUS_HIGHLIGHT_ALIAS_KEYS,
    HIGHLIGHT_ELIGIBLE_ALIAS_SOURCES,
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_DISABLED,
    HIGHLIGHT_MODE_EXACT,
    HIGHLIGHT_MODE_SEARCH_ONLY,
    HIGHLIGHT_RUNTIME_MODES,
)
from app.rag.entity_runtime_keys import catalog_vocab_source_identifier_sql

logger = logging.getLogger(__name__)

ENTITY_PROJECTION_BUILD_WORK_MEM = "1GB"
ENTITY_PROJECTION_BUILD_MAINTENANCE_WORK_MEM = "2GB"
ENTITY_PROJECTION_MAX_PARALLEL_WORKERS_PER_GATHER = 8
ENTITY_PROJECTION_MAX_PARALLEL_MAINTENANCE_WORKERS = 4
ENTITY_PROJECTION_EFFECTIVE_IO_CONCURRENCY = 200
ENTITY_PROJECTION_RANDOM_PAGE_COST = "1.1"
ENTITY_PROJECTION_LOCK_TIMEOUT = "10s"

_ENTITIES_TABLE = "solemd.entities"
_ENTITIES_STAGE_TABLE = "solemd.entities_next"
_ENTITIES_OLD_TABLE = "solemd.entities_old"
_ENTITIES_PKEY = "entities_pkey"
_ENTITIES_OLD_PKEY = "entities_old_pkey"
_ENTITIES_TYPE_INDEX = "idx_entities_type"
_ENTITIES_OLD_TYPE_INDEX = "idx_entities_old_type"
_ENTITIES_PAPER_COUNT_INDEX = "idx_entities_paper_count"
_ENTITIES_OLD_PAPER_COUNT_INDEX = "idx_entities_old_paper_count"
_ENTITIES_CANONICAL_NAME_TRGM_INDEX = "idx_entities_canonical_name_trgm"
_ENTITIES_OLD_CANONICAL_NAME_TRGM_INDEX = "idx_entities_old_canonical_name_trgm"

_ENTITY_ALIASES_TABLE = "solemd.entity_aliases"
_ENTITY_ALIASES_STAGE_TABLE = "solemd.entity_aliases_next"
_ENTITY_ALIASES_OLD_TABLE = "solemd.entity_aliases_old"
_ENTITY_ALIASES_PKEY = "entity_aliases_pkey"
_ENTITY_ALIASES_OLD_PKEY = "entity_aliases_old_pkey"
_ENTITY_ALIASES_HIGHLIGHT_MODE_CHECK = "entity_aliases_highlight_mode_check"
_ENTITY_ALIASES_OLD_HIGHLIGHT_MODE_CHECK = "entity_aliases_old_highlight_mode_check"
_ENTITY_ALIASES_ALIAS_KEY_INDEX = "idx_entity_aliases_alias_key_all"
_ENTITY_ALIASES_OLD_ALIAS_KEY_INDEX = "idx_entity_aliases_old_alias_key_all"

_ENTITY_RUNTIME_ALIASES_TABLE = "solemd.entity_runtime_aliases"
_ENTITY_RUNTIME_ALIASES_STAGE_TABLE = "solemd.entity_runtime_aliases_next"
_ENTITY_RUNTIME_ALIASES_OLD_TABLE = "solemd.entity_runtime_aliases_old"
_ENTITY_RUNTIME_ALIASES_PKEY = "entity_runtime_aliases_pkey"
_ENTITY_RUNTIME_ALIASES_OLD_PKEY = "entity_runtime_aliases_old_pkey"
_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_INDEX = "idx_entity_runtime_aliases_alias_key"
_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_INDEX = (
    "idx_entity_runtime_aliases_old_alias_key"
)
_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_ENTITY_TYPE_INDEX = (
    "idx_entity_runtime_aliases_alias_key_entity_type"
)
_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_ENTITY_TYPE_INDEX = (
    "idx_entity_runtime_aliases_old_alias_key_entity_type"
)

_ENTITY_CORPUS_PRESENCE_TABLE = "solemd.entity_corpus_presence"
_ENTITY_CORPUS_PRESENCE_STAGE_TABLE = "solemd.entity_corpus_presence_next"
_ENTITY_CORPUS_PRESENCE_OLD_TABLE = "solemd.entity_corpus_presence_old"

_COUNT_ENTITY_ALIASES_SQL = f"SELECT COUNT(*) AS cnt FROM {_ENTITY_ALIASES_TABLE}"
_COUNT_ENTITIES_SQL = f"SELECT COUNT(*) AS cnt FROM {_ENTITIES_TABLE}"
_COUNT_ENTITIES_STAGE_SQL = f"SELECT COUNT(*) AS cnt FROM {_ENTITIES_STAGE_TABLE}"
_COUNT_ENTITY_ALIASES_STAGE_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_ALIASES_STAGE_TABLE}"
)
_COUNT_ENTITY_RUNTIME_ALIASES_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_RUNTIME_ALIASES_TABLE}"
)
_COUNT_ENTITY_RUNTIME_ALIASES_STAGE_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE}"
)
_COUNT_ENTITY_CORPUS_PRESENCE_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_CORPUS_PRESENCE_TABLE}"
)
_COUNT_ENTITY_CORPUS_PRESENCE_STAGE_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}"
)

_DROP_ENTITY_ALIASES_STAGE_SQL = f"DROP TABLE IF EXISTS {_ENTITY_ALIASES_STAGE_TABLE}"
_DROP_ENTITY_ALIASES_OLD_SQL = f"DROP TABLE IF EXISTS {_ENTITY_ALIASES_OLD_TABLE}"
_DROP_ENTITIES_STAGE_SQL = f"DROP TABLE IF EXISTS {_ENTITIES_STAGE_TABLE}"
_DROP_ENTITIES_OLD_SQL = f"DROP TABLE IF EXISTS {_ENTITIES_OLD_TABLE}"
_DROP_ENTITY_RUNTIME_ALIASES_STAGE_SQL = (
    f"DROP TABLE IF EXISTS {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE}"
)
_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL = (
    f"DROP TABLE IF EXISTS {_ENTITY_RUNTIME_ALIASES_OLD_TABLE}"
)
_DROP_ENTITY_CORPUS_PRESENCE_STAGE_SQL = (
    f"DROP TABLE IF EXISTS {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}"
)
_DROP_ENTITY_CORPUS_PRESENCE_OLD_SQL = (
    f"DROP TABLE IF EXISTS {_ENTITY_CORPUS_PRESENCE_OLD_TABLE}"
)


def _chemical_vocab_normalization_candidates_sql(source_relation: str) -> str:
    normalized_vocab_concept_id = catalog_vocab_source_identifier_sql(
        mesh_id_expr="vt.mesh_id",
        umls_cui_expr="vt.umls_cui",
    )
    return f"""
SELECT DISTINCT ON (src.concept_id, src.entity_type)
    src.concept_id AS source_concept_id,
    src.entity_type,
    {normalized_vocab_concept_id} AS normalized_concept_id,
    trim(vt.canonical_name) AS normalized_canonical_name
FROM {source_relation} src
JOIN umls.mesh_to_cui raw_mesh
  ON raw_mesh.mesh_id = replace(src.concept_id, 'MESH:', '')
JOIN umls.chemical_ingredient_bridge cib
  ON cib.form_cui = raw_mesh.cui
JOIN solemd.vocab_terms vt
  ON lower(vt.pubtator_entity_type) = lower(src.entity_type)
 AND vt.umls_cui = cib.ingredient_cui
 AND vt.rxnorm_cui IS NOT NULL
WHERE lower(src.entity_type) = 'chemical'
  AND src.concept_id LIKE 'MESH:%'
  AND (
      lower(regexp_replace(trim(src.canonical_name), '\\s+', ' ', 'g'))
          = lower(regexp_replace(trim(vt.canonical_name), '\\s+', ' ', 'g'))
      OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(src.synonyms, ARRAY[]::TEXT[])) AS syn
          WHERE lower(regexp_replace(trim(syn), '\\s+', ' ', 'g'))
              = lower(regexp_replace(trim(vt.canonical_name), '\\s+', ' ', 'g'))
      )
  )
ORDER BY
    src.concept_id,
    src.entity_type,
    CASE WHEN vt.mesh_id IS NOT NULL THEN 0 ELSE 1 END,
    trim(vt.canonical_name)
""".strip()

_ENTITY_ALIAS_CANDIDATES_SQL = fr"""
WITH entity_vocab_links AS (
    SELECT DISTINCT ON (e.concept_id, e.entity_type)
        e.concept_id,
        e.entity_type,
        vt.id AS term_id
    FROM solemd.entities e
    JOIN solemd.vocab_terms vt
      ON lower(vt.pubtator_entity_type) = lower(e.entity_type)
     AND e.concept_id = {catalog_vocab_source_identifier_sql(mesh_id_expr="vt.mesh_id", umls_cui_expr="vt.umls_cui")}
    WHERE vt.pubtator_entity_type IS NOT NULL
      AND (vt.mesh_id IS NOT NULL OR vt.umls_cui IS NOT NULL)
    ORDER BY
        e.concept_id,
        e.entity_type,
        CASE WHEN vt.mesh_id IS NOT NULL THEN 0 ELSE 1 END,
        trim(vt.canonical_name)
),
alias_candidates AS (
    SELECT
        e.concept_id,
        e.entity_type,
        regexp_replace(trim(e.canonical_name), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(e.canonical_name), '\s+', ' ', 'g')) AS alias_key,
        TRUE AS is_canonical,
        'canonical_name'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    WHERE e.concept_id != '-'
      AND NULLIF(trim(e.canonical_name), '') IS NOT NULL
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        regexp_replace(trim(synonym), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(synonym), '\s+', ' ', 'g')) AS alias_key,
        FALSE AS is_canonical,
        'synonym'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    CROSS JOIN LATERAL unnest(COALESCE(e.synonyms, ARRAY[]::TEXT[])) AS synonym
    WHERE e.concept_id != '-'
      AND NULLIF(trim(synonym), '') IS NOT NULL
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        ua.alias_text,
        ua.alias_key,
        FALSE AS is_canonical,
        'umls'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN umls.mesh_to_cui xw ON xw.mesh_id = replace(e.concept_id, 'MESH:', '')
    JOIN umls.cui_aliases ua ON ua.cui = xw.cui
    WHERE e.concept_id LIKE 'MESH:%%'
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        ua.alias_text,
        ua.alias_key,
        FALSE AS is_canonical,
        'umls_tradename'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN umls.mesh_to_cui xw ON xw.mesh_id = replace(e.concept_id, 'MESH:', '')
    JOIN umls.tradename_bridge tb ON tb.ingredient_cui = xw.cui
    JOIN umls.cui_aliases ua ON ua.cui = tb.tradename_cui
    WHERE e.concept_id LIKE 'MESH:%%'
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        ua.alias_text,
        ua.alias_key,
        FALSE AS is_canonical,
        'umls_tradename'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN umls.tradename_bridge tb ON tb.ingredient_cui = replace(e.concept_id, 'UMLS:', '')
    JOIN umls.cui_aliases ua ON ua.cui = tb.tradename_cui
    WHERE e.concept_id LIKE 'UMLS:%%'
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        ua.alias_text,
        ua.alias_key,
        FALSE AS is_canonical,
        'umls'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN umls.cui_aliases ua ON ua.cui = replace(e.concept_id, 'UMLS:', '')
    WHERE e.concept_id LIKE 'UMLS:%%'
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        ua.alias_text,
        ua.alias_key,
        FALSE AS is_canonical,
        'umls'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN umls.gene_to_cui xw ON xw.gene_id = e.concept_id
    JOIN umls.cui_aliases ua ON ua.cui = xw.cui
    WHERE e.entity_type = 'gene'
      AND e.concept_id ~ '^\d+$'
    UNION ALL
    SELECT
        e.concept_id,
        e.entity_type,
        regexp_replace(trim(vta.alias_text), '\s+', ' ', 'g') AS alias_text,
        lower(regexp_replace(trim(vta.alias_text), '\s+', ' ', 'g')) AS alias_key,
        COALESCE(vta.is_preferred, FALSE) AS is_canonical,
        'vocab'::TEXT AS alias_source,
        COALESCE(NULLIF(trim(e.canonical_name), ''), e.concept_id) AS entity_canonical_name,
        COALESCE(e.paper_count, 0) AS entity_paper_count
    FROM solemd.entities e
    JOIN entity_vocab_links evl
      ON evl.concept_id = e.concept_id
     AND evl.entity_type = e.entity_type
    JOIN solemd.vocab_term_aliases vta
      ON vta.term_id = evl.term_id
    WHERE NULLIF(trim(vta.alias_text), '') IS NOT NULL
),
ranked_aliases AS (
    SELECT
        concept_id,
        entity_type,
        alias_text,
        alias_key,
        is_canonical,
        alias_source,
        entity_canonical_name,
        entity_paper_count,
        ROW_NUMBER() OVER (
            PARTITION BY concept_id, entity_type, alias_key
            ORDER BY is_canonical DESC,
                     CASE alias_source
                         WHEN 'canonical_name' THEN 0
                         WHEN 'vocab' THEN 1
                         WHEN 'umls' THEN 2
                         WHEN 'umls_tradename' THEN 3
                         ELSE 4
                     END,
                     alias_text
        ) AS alias_rank
    FROM alias_candidates
)
"""

_ENTITY_STAGE_SELECT_SQL = fr"""
WITH mention_rows AS MATERIALIZED (
    SELECT
        ea.concept_id,
        ea.entity_type,
        regexp_replace(trim(mention), '\s+', ' ', 'g') AS mention,
        ea.pmid
    FROM pubtator.entity_annotations ea
    CROSS JOIN LATERAL unnest(string_to_array(ea.mentions, '|')) AS mention
    WHERE ea.concept_id != ''
      AND ea.concept_id != '-'
      AND ea.mentions != ''
      AND NULLIF(trim(mention), '') IS NOT NULL
),
raw_grouped_mentions AS MATERIALIZED (
    SELECT
        ea.pmid,
        ea.concept_id,
        ea.entity_type
    FROM pubtator.entity_annotations ea
    WHERE ea.concept_id != ''
      AND ea.concept_id != '-'
    GROUP BY ea.pmid, ea.concept_id, ea.entity_type
),
raw_aggregated_entities AS MATERIALIZED (
    SELECT
        concept_id,
        entity_type,
        mode() WITHIN GROUP (ORDER BY mention) AS canonical_name,
        array_agg(DISTINCT mention ORDER BY mention) AS synonyms
    FROM mention_rows
    GROUP BY concept_id, entity_type
),
chemical_vocab_normalization_candidates AS MATERIALIZED (
    {_chemical_vocab_normalization_candidates_sql("raw_aggregated_entities")}
),
normalized_grouped_mentions AS MATERIALIZED (
    SELECT
        rgm.pmid,
        COALESCE(cvn.normalized_concept_id, rgm.concept_id) AS concept_id,
        rgm.entity_type
    FROM raw_grouped_mentions rgm
    LEFT JOIN chemical_vocab_normalization_candidates cvn
      ON cvn.source_concept_id = rgm.concept_id
     AND cvn.entity_type = rgm.entity_type
),
normalized_paper_counts AS MATERIALIZED (
    SELECT
        concept_id,
        entity_type,
        COUNT(*)::INTEGER AS paper_count
    FROM normalized_grouped_mentions
    GROUP BY concept_id, entity_type
),
normalized_surface_terms AS MATERIALIZED (
    SELECT
        COALESCE(cvn.normalized_concept_id, ra.concept_id) AS concept_id,
        ra.entity_type,
        surface.term
    FROM raw_aggregated_entities ra
    LEFT JOIN chemical_vocab_normalization_candidates cvn
      ON cvn.source_concept_id = ra.concept_id
     AND cvn.entity_type = ra.entity_type
    CROSS JOIN LATERAL unnest(
        CASE
            WHEN cvn.normalized_canonical_name IS NOT NULL THEN
                array_prepend(
                    cvn.normalized_canonical_name,
                    array_prepend(
                        ra.canonical_name,
                        COALESCE(ra.synonyms, ARRAY[]::TEXT[])
                    )
                )
            ELSE array_prepend(ra.canonical_name, COALESCE(ra.synonyms, ARRAY[]::TEXT[]))
        END
    ) AS surface(term)
),
normalized_synonyms AS MATERIALIZED (
    SELECT
        concept_id,
        entity_type,
        array_agg(DISTINCT term ORDER BY term) AS synonyms
    FROM normalized_surface_terms
    GROUP BY concept_id, entity_type
),
normalized_entity_identities AS MATERIALIZED (
    SELECT
        COALESCE(cvn.normalized_concept_id, ra.concept_id) AS concept_id,
        ra.entity_type,
        COALESCE(
            MIN(cvn.normalized_canonical_name)
                FILTER (WHERE cvn.normalized_canonical_name IS NOT NULL),
            MIN(ra.canonical_name)
        ) AS canonical_name
    FROM raw_aggregated_entities ra
    LEFT JOIN chemical_vocab_normalization_candidates cvn
      ON cvn.source_concept_id = ra.concept_id
     AND cvn.entity_type = ra.entity_type
    GROUP BY
        COALESCE(cvn.normalized_concept_id, ra.concept_id),
        ra.entity_type
),
normalized_entities AS MATERIALIZED (
    SELECT
        nei.concept_id,
        nei.entity_type,
        nei.canonical_name,
        ns.synonyms,
        COALESCE(npc.paper_count, 0)::INTEGER AS paper_count
    FROM normalized_entity_identities nei
    JOIN normalized_synonyms ns
      ON ns.concept_id = nei.concept_id
     AND ns.entity_type = nei.entity_type
    LEFT JOIN normalized_paper_counts npc
      ON npc.concept_id = nei.concept_id
     AND npc.entity_type = nei.entity_type
),
reconciled_entities AS (
    SELECT
        ne.concept_id,
        ne.entity_type,
        COALESCE(er.canonical_name, ne.canonical_name) AS canonical_name,
        ne.synonyms,
        current_entities.embedding,
        ne.paper_count,
        COALESCE(current_entities.created_at, now()::TIMESTAMPTZ) AS created_at
    FROM normalized_entities ne
    LEFT JOIN solemd.entity_rule er
      ON er.concept_id = ne.concept_id
     AND er.entity_type = ne.entity_type
    LEFT JOIN solemd.entities current_entities
      ON current_entities.concept_id = ne.concept_id
     AND current_entities.entity_type = ne.entity_type
),
raw_vocab_seed_candidates AS (
    SELECT
        {catalog_vocab_source_identifier_sql(mesh_id_expr="vt.mesh_id", umls_cui_expr="vt.umls_cui")} AS concept_id,
        lower(vt.pubtator_entity_type) AS entity_type,
        trim(vt.canonical_name) AS candidate_name
    FROM solemd.vocab_terms vt
    WHERE vt.pubtator_entity_type IS NOT NULL
      AND (vt.mesh_id IS NOT NULL OR vt.umls_cui IS NOT NULL)
      AND NULLIF(trim(vt.canonical_name), '') IS NOT NULL
),
deduped_vocab_seed_candidates AS (
    SELECT
        concept_id,
        entity_type,
        MIN(candidate_name) AS canonical_name,
        array_agg(DISTINCT candidate_name ORDER BY candidate_name) AS synonyms,
        0::INTEGER AS paper_count
    FROM raw_vocab_seed_candidates
    GROUP BY concept_id, entity_type
),
vocab_seeded_entities AS (
    SELECT
        seeds.concept_id,
        seeds.entity_type,
        COALESCE(
            er.canonical_name,
            current_entities.canonical_name,
            seeds.canonical_name
        ) AS canonical_name,
        seeds.synonyms,
        current_entities.embedding,
        seeds.paper_count,
        COALESCE(current_entities.created_at, now()::TIMESTAMPTZ) AS created_at
    FROM deduped_vocab_seed_candidates seeds
    LEFT JOIN solemd.entities current_entities
      ON current_entities.concept_id = seeds.concept_id
     AND current_entities.entity_type = seeds.entity_type
    LEFT JOIN normalized_entities ne
      ON ne.concept_id = seeds.concept_id
     AND ne.entity_type = seeds.entity_type
    LEFT JOIN solemd.entity_rule er
      ON er.concept_id = seeds.concept_id
     AND er.entity_type = seeds.entity_type
    WHERE ne.concept_id IS NULL
)
SELECT
    concept_id,
    entity_type,
    canonical_name,
    synonyms,
    embedding,
    paper_count,
    created_at
FROM reconciled_entities
UNION ALL
SELECT
    concept_id,
    entity_type,
    canonical_name,
    synonyms,
    embedding,
    paper_count,
    created_at
FROM vocab_seeded_entities
"""

_ENTITY_CORPUS_PRESENCE_SELECT_SQL = fr"""
WITH raw_entity_mentions AS MATERIALIZED (
    SELECT
        ea.concept_id,
        ea.entity_type,
        regexp_replace(trim(mention), '\s+', ' ', 'g') AS mention
    FROM pubtator.entity_annotations ea
    CROSS JOIN LATERAL unnest(string_to_array(ea.mentions, '|')) AS mention
    WHERE ea.concept_id != ''
      AND ea.concept_id != '-'
      AND ea.mentions != ''
      AND NULLIF(trim(mention), '') IS NOT NULL
),
raw_entity_surfaces AS MATERIALIZED (
    SELECT
        concept_id,
        entity_type,
        mode() WITHIN GROUP (ORDER BY mention) AS canonical_name,
        array_agg(DISTINCT mention ORDER BY mention) AS synonyms
    FROM raw_entity_mentions
    GROUP BY concept_id, entity_type
),
chemical_vocab_normalization_candidates AS MATERIALIZED (
    {_chemical_vocab_normalization_candidates_sql("raw_entity_surfaces")}
),
grouped_mentions AS MATERIALIZED (
    SELECT
        ea.pmid,
        ea.entity_type,
        COALESCE(cvn.normalized_concept_id, ea.concept_id) AS concept_id,
        COUNT(*)::INTEGER AS mention_count
    FROM pubtator.entity_annotations ea
    LEFT JOIN chemical_vocab_normalization_candidates cvn
      ON cvn.source_concept_id = ea.concept_id
     AND cvn.entity_type = ea.entity_type
    WHERE ea.concept_id != ''
      AND ea.concept_id != '-'
    GROUP BY
        ea.pmid,
        ea.entity_type,
        COALESCE(cvn.normalized_concept_id, ea.concept_id)
)
SELECT
    gm.entity_type,
    gm.concept_id,
    c.corpus_id,
    gm.pmid,
    gm.mention_count,
    now()::TIMESTAMPTZ AS created_at
FROM grouped_mentions gm
JOIN solemd.corpus c
  ON c.pmid = gm.pmid
"""

_DRY_RUN_ENTITY_ALIASES_SQL = f"""
{_ENTITY_ALIAS_CANDIDATES_SQL}
SELECT
    COUNT(*)::BIGINT AS total_aliases,
    COUNT(*) FILTER (
        WHERE highlight_mode = ANY(%s::text[])
    )::BIGINT AS total_runtime_aliases
FROM (
    SELECT
        ra.concept_id,
        ra.entity_type,
        ra.alias_text,
        ra.alias_key,
        ra.is_canonical,
        ra.alias_source,
        COALESCE(NULLIF(trim(ra.entity_canonical_name), ''), ra.alias_text) AS canonical_name,
        ra.entity_paper_count AS paper_count,
        {{highlight_mode_case}}
            AS highlight_mode
    FROM ranked_aliases ra
    WHERE ra.alias_rank = 1
) projected_aliases
""".replace("{highlight_mode_case}", "{highlight_mode_case}")

_DRY_RUN_ENTITY_RUNTIME_ALIASES_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_ENTITY_ALIASES_TABLE} WHERE highlight_mode = ANY(%s::text[])"
)
_DRY_RUN_ENTITY_CORPUS_PRESENCE_SQL = f"""
SELECT COUNT(*) AS cnt
FROM (
    {_ENTITY_CORPUS_PRESENCE_SELECT_SQL}
) AS entity_corpus_presence
"""


def _highlight_mode_case_sql(alias_ref: str) -> str:
    return f"""
CASE
    WHEN {alias_ref}.alias_key = ANY(%s::text[]) THEN %s
    WHEN {alias_ref}.alias_source = ANY(%s::text[]) THEN
        CASE
            WHEN {alias_ref}.alias_text = upper({alias_ref}.alias_text)
                AND length({alias_ref}.alias_text) <= 6 THEN %s
            ELSE %s
        END
    WHEN NOT {alias_ref}.is_canonical THEN %s
    WHEN {alias_ref}.alias_text = upper({alias_ref}.alias_text)
        AND length({alias_ref}.alias_text) <= 6 THEN %s
    ELSE %s
END
""".strip()


_HIGHLIGHT_POLICY_SQL_PARAMS = (
    sorted(AMBIGUOUS_HIGHLIGHT_ALIAS_KEYS),
    HIGHLIGHT_MODE_DISABLED,
    list(HIGHLIGHT_ELIGIBLE_ALIAS_SOURCES),
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_EXACT,
    HIGHLIGHT_MODE_SEARCH_ONLY,
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_EXACT,
)


def _create_entity_aliases_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
{_ENTITY_ALIAS_CANDIDATES_SQL}
SELECT
    ra.concept_id,
    ra.entity_type,
    ra.alias_text,
    ra.alias_key,
    ra.is_canonical,
    ra.alias_source,
    COALESCE(NULLIF(trim(ra.entity_canonical_name), ''), ra.alias_text) AS canonical_name,
    ra.entity_paper_count AS paper_count,
    {_highlight_mode_case_sql("ra")} AS highlight_mode,
    now()::TIMESTAMPTZ AS created_at
FROM ranked_aliases ra
WHERE ra.alias_rank = 1
"""


def _create_entities_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
{_ENTITY_STAGE_SELECT_SQL}
"""


def _create_runtime_aliases_stage_sql(target_table: str, source_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
SELECT
    concept_id,
    entity_type,
    alias_text,
    alias_key,
    is_canonical,
    alias_source,
    canonical_name,
    paper_count,
    highlight_mode,
    created_at
FROM {source_table}
WHERE highlight_mode = ANY(%s::text[])
"""


def _create_entity_corpus_presence_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
{_ENTITY_CORPUS_PRESENCE_SELECT_SQL}
"""


def _apply_entity_projection_build_session_settings(cur) -> None:
    cur.execute("SET LOCAL jit = off")
    cur.execute(f"SET LOCAL work_mem = '{ENTITY_PROJECTION_BUILD_WORK_MEM}'")
    cur.execute(
        "SET LOCAL maintenance_work_mem = "
        f"'{ENTITY_PROJECTION_BUILD_MAINTENANCE_WORK_MEM}'"
    )
    cur.execute(
        "SET LOCAL max_parallel_workers_per_gather = "
        f"{ENTITY_PROJECTION_MAX_PARALLEL_WORKERS_PER_GATHER}"
    )
    cur.execute(
        "SET LOCAL max_parallel_maintenance_workers = "
        f"{ENTITY_PROJECTION_MAX_PARALLEL_MAINTENANCE_WORKERS}"
    )
    cur.execute(
        "SET LOCAL effective_io_concurrency = "
        f"{ENTITY_PROJECTION_EFFECTIVE_IO_CONCURRENCY}"
    )
    cur.execute(f"SET LOCAL random_page_cost = {ENTITY_PROJECTION_RANDOM_PAGE_COST}")
    cur.execute("SET LOCAL parallel_tuple_cost = 0")
    cur.execute("SET LOCAL parallel_setup_cost = 0")
    cur.execute("SET LOCAL synchronous_commit = off")


def _relation_exists(cur, relation_name: str) -> bool:
    cur.execute(
        "SELECT to_regclass(%s) IS NOT NULL AS exists",
        (relation_name,),
    )
    return bool(cur.fetchone()["exists"])


def _constraint_exists(cur, relation_name: str, constraint_name: str) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass(%s)
              AND conname = %s
        ) AS exists
        """,
        (relation_name, constraint_name),
    )
    return bool(cur.fetchone()["exists"])


def _stage_table_ready(
    cur,
    *,
    table_name: str,
    constraint_names: tuple[str, ...] = (),
    index_names: tuple[str, ...] = (),
) -> bool:
    if not _relation_exists(cur, table_name):
        return False
    if not all(_constraint_exists(cur, table_name, name) for name in constraint_names):
        return False
    return all(_relation_exists(cur, index_name) for index_name in index_names)


def _assert_no_active_stage_build(cur, relation_names: tuple[str, ...]) -> None:
    for relation_name in relation_names:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND pid <> pg_backend_pid()
                  AND backend_type <> 'autovacuum worker'
                  AND state <> 'idle'
                  AND query ILIKE %s
            ) AS active
            """,
            (f"%{relation_name}%",),
        )
        if cur.fetchone()["active"]:
            raise RuntimeError(
                f"cannot reuse staged relation {relation_name} while another build is active"
            )


def _entities_stage_ready(cur) -> bool:
    return _stage_table_ready(
        cur,
        table_name=_ENTITIES_STAGE_TABLE,
        constraint_names=("entities_next_pkey",),
        index_names=(
            "solemd.idx_entities_next_type",
            "solemd.idx_entities_next_paper_count",
            "solemd.idx_entities_next_canonical_name_trgm",
        ),
    )


def _entity_alias_projection_stages_ready(cur) -> bool:
    return _stage_table_ready(
        cur,
        table_name=_ENTITY_ALIASES_STAGE_TABLE,
        constraint_names=(
            "entity_aliases_next_pkey",
            "entity_aliases_next_highlight_mode_check",
        ),
        index_names=("solemd.idx_entity_aliases_next_alias_key_all",),
    ) and _stage_table_ready(
        cur,
        table_name=_ENTITY_RUNTIME_ALIASES_STAGE_TABLE,
        constraint_names=("entity_runtime_aliases_next_pkey",),
        index_names=(
            "solemd.idx_entity_runtime_aliases_next_alias_key",
            "solemd.idx_entity_runtime_aliases_next_alias_key_entity_type",
        ),
    )


def _entity_runtime_aliases_stage_ready(cur) -> bool:
    return _stage_table_ready(
        cur,
        table_name=_ENTITY_RUNTIME_ALIASES_STAGE_TABLE,
        constraint_names=("entity_runtime_aliases_next_pkey",),
        index_names=(
            "solemd.idx_entity_runtime_aliases_next_alias_key",
            "solemd.idx_entity_runtime_aliases_next_alias_key_entity_type",
        ),
    )


def _entity_corpus_presence_stage_ready(cur) -> bool:
    return _stage_table_ready(
        cur,
        table_name=_ENTITY_CORPUS_PRESENCE_STAGE_TABLE,
        constraint_names=(
            "entity_corpus_presence_next_pkey",
            "entity_corpus_presence_next_corpus_id_fkey",
        ),
        index_names=("solemd.idx_entity_corpus_presence_next_corpus_id",),
    )


def get_entity_projection_stage_state() -> dict[str, bool]:
    """Return whether each staged entity projection is fully built and reusable."""

    with db.connect() as conn, conn.cursor() as cur:
        return {
            "catalog_stage_ready": _entities_stage_ready(cur),
            "aliases_stage_ready": _entity_alias_projection_stages_ready(cur),
            "runtime_aliases_stage_ready": _entity_runtime_aliases_stage_ready(cur),
            "presence_stage_ready": _entity_corpus_presence_stage_ready(cur),
        }


def _finalize_entity_aliases_stage(cur) -> int:
    cur.execute(
        _create_entity_aliases_stage_sql(_ENTITY_ALIASES_STAGE_TABLE),
        _HIGHLIGHT_POLICY_SQL_PARAMS,
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_ALIASES_STAGE_TABLE}
            ALTER COLUMN concept_id SET NOT NULL,
            ALTER COLUMN entity_type SET NOT NULL,
            ALTER COLUMN alias_text SET NOT NULL,
            ALTER COLUMN alias_key SET NOT NULL,
            ALTER COLUMN is_canonical SET NOT NULL,
            ALTER COLUMN is_canonical SET DEFAULT false,
            ALTER COLUMN alias_source SET NOT NULL,
            ALTER COLUMN canonical_name SET NOT NULL,
            ALTER COLUMN paper_count SET NOT NULL,
            ALTER COLUMN paper_count SET DEFAULT 0,
            ALTER COLUMN highlight_mode SET NOT NULL,
            ALTER COLUMN highlight_mode SET DEFAULT '{HIGHLIGHT_MODE_DISABLED}',
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_ENTITY_ALIASES_STAGE_TABLE} IS
            'Broad exact-query entity alias serving projection for RAG and entity resolution,
             derived from solemd.entities plus UMLS/vocab alias expansion.'
        """
    )
    cur.execute(
        f"""
        COMMENT ON COLUMN {_ENTITY_ALIASES_STAGE_TABLE}.alias_key IS
            'Lowercased normalized alias key used for exact runtime lookup.'
        """
    )
    cur.execute(
        f"""
        COMMENT ON COLUMN {_ENTITY_ALIASES_STAGE_TABLE}.alias_source IS
            'Source surface for the alias row: canonical_name, synonym, umls,
             umls_tradename, or vocab.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_ALIASES_STAGE_TABLE}
            ADD CONSTRAINT entity_aliases_next_highlight_mode_check
            CHECK (
                highlight_mode = ANY (
                    ARRAY[
                        '{HIGHLIGHT_MODE_DISABLED}'::text,
                        '{HIGHLIGHT_MODE_EXACT}'::text,
                        '{HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT}'::text,
                        '{HIGHLIGHT_MODE_SEARCH_ONLY}'::text
                    ]
                )
            )
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_ALIASES_STAGE_TABLE}
            ADD CONSTRAINT entity_aliases_next_pkey
            PRIMARY KEY (entity_type, concept_id, alias_key)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entity_aliases_next_alias_key_all
            ON {_ENTITY_ALIASES_STAGE_TABLE} (alias_key)
        """
    )
    cur.execute(_COUNT_ENTITY_ALIASES_STAGE_SQL)
    return cur.fetchone()["cnt"]


def _finalize_entities_stage(cur) -> int:
    cur.execute(_create_entities_stage_sql(_ENTITIES_STAGE_TABLE))
    cur.execute(
        f"""
        ALTER TABLE {_ENTITIES_STAGE_TABLE}
            ALTER COLUMN concept_id SET NOT NULL,
            ALTER COLUMN entity_type SET NOT NULL,
            ALTER COLUMN canonical_name SET NOT NULL,
            ALTER COLUMN paper_count SET NOT NULL,
            ALTER COLUMN paper_count SET DEFAULT 0,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_ENTITIES_STAGE_TABLE} IS
            'Canonical entity catalog aggregated from PubTator mentions and vocab-only
             anatomy/network seed terms. Preferred names are overridden by entity_rule
             where curated.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITIES_STAGE_TABLE}
            ADD CONSTRAINT entities_next_pkey
            PRIMARY KEY (concept_id, entity_type)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entities_next_type
            ON {_ENTITIES_STAGE_TABLE} (entity_type)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entities_next_paper_count
            ON {_ENTITIES_STAGE_TABLE} (paper_count DESC)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entities_next_canonical_name_trgm
            ON {_ENTITIES_STAGE_TABLE} USING gin (lower(canonical_name) gin_trgm_ops)
        """
    )
    cur.execute(_COUNT_ENTITIES_STAGE_SQL)
    return cur.fetchone()["cnt"]


def _finalize_entity_runtime_aliases_stage(cur, *, source_table: str) -> int:
    cur.execute(
        _create_runtime_aliases_stage_sql(_ENTITY_RUNTIME_ALIASES_STAGE_TABLE, source_table),
        (list(HIGHLIGHT_RUNTIME_MODES),),
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE}
            ALTER COLUMN concept_id SET NOT NULL,
            ALTER COLUMN entity_type SET NOT NULL,
            ALTER COLUMN alias_text SET NOT NULL,
            ALTER COLUMN alias_key SET NOT NULL,
            ALTER COLUMN is_canonical SET NOT NULL,
            ALTER COLUMN is_canonical SET DEFAULT false,
            ALTER COLUMN alias_source SET NOT NULL,
            ALTER COLUMN canonical_name SET NOT NULL,
            ALTER COLUMN paper_count SET NOT NULL,
            ALTER COLUMN paper_count SET DEFAULT 0,
            ALTER COLUMN highlight_mode SET NOT NULL,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE} IS
            'Hot-path entity alias serving table containing only highlight-eligible aliases
             for live text matching.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE}
            ADD CONSTRAINT entity_runtime_aliases_next_pkey
            PRIMARY KEY (entity_type, concept_id, alias_key)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entity_runtime_aliases_next_alias_key
            ON {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE} (alias_key)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entity_runtime_aliases_next_alias_key_entity_type
            ON {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE} (alias_key, entity_type)
        """
    )
    cur.execute(_COUNT_ENTITY_RUNTIME_ALIASES_STAGE_SQL)
    return cur.fetchone()["cnt"]


def _build_entity_alias_projection_stages(cur) -> tuple[int, int]:
    logger.info("Building staged entity alias projections from solemd.entities ...")
    _apply_entity_projection_build_session_settings(cur)
    cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_STAGE_SQL)
    cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
    cur.execute(_DROP_ENTITY_ALIASES_STAGE_SQL)
    cur.execute(_DROP_ENTITY_ALIASES_OLD_SQL)
    total_aliases = _finalize_entity_aliases_stage(cur)
    total_runtime_aliases = _finalize_entity_runtime_aliases_stage(
        cur,
        source_table=_ENTITY_ALIASES_STAGE_TABLE,
    )
    logger.info(
        "Built staged alias projections: %d warehouse aliases, %d runtime aliases",
        total_aliases,
        total_runtime_aliases,
    )
    return total_aliases, total_runtime_aliases


def _build_entities_stage(cur) -> int:
    logger.info("Building staged %s from PubTator and vocab terms ...", _ENTITIES_STAGE_TABLE)
    _apply_entity_projection_build_session_settings(cur)
    cur.execute(_DROP_ENTITIES_STAGE_SQL)
    cur.execute(_DROP_ENTITIES_OLD_SQL)
    total = _finalize_entities_stage(cur)
    logger.info("Built %d staged canonical entity rows", total)
    return total


def _swap_entity_alias_projection_stages(cur) -> None:
    logger.info("Swapping staged entity alias projections into place ...")
    cur.execute(f"SET LOCAL lock_timeout = '{ENTITY_PROJECTION_LOCK_TIMEOUT}'")
    cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
    cur.execute(_DROP_ENTITY_ALIASES_OLD_SQL)
    cur.execute(
        "ALTER TABLE IF EXISTS "
        f"{_ENTITY_RUNTIME_ALIASES_TABLE} RENAME TO entity_runtime_aliases_old"
    )
    cur.execute(
        "ALTER TABLE IF EXISTS "
        f"{_ENTITY_ALIASES_TABLE} RENAME TO entity_aliases_old"
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_ENTITY_ALIASES_OLD_TABLE}
            RENAME CONSTRAINT {_ENTITY_ALIASES_PKEY}
            TO {_ENTITY_ALIASES_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_ENTITY_ALIASES_OLD_TABLE}
            RENAME CONSTRAINT {_ENTITY_ALIASES_HIGHLIGHT_MODE_CHECK}
            TO {_ENTITY_ALIASES_OLD_HIGHLIGHT_MODE_CHECK}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITY_ALIASES_ALIAS_KEY_INDEX}
            RENAME TO {_ENTITY_ALIASES_OLD_ALIAS_KEY_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_ENTITY_RUNTIME_ALIASES_OLD_TABLE}
            RENAME CONSTRAINT {_ENTITY_RUNTIME_ALIASES_PKEY}
            TO {_ENTITY_RUNTIME_ALIASES_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_INDEX}
            RENAME TO {_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_ENTITY_TYPE_INDEX}
            RENAME TO {_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_ENTITY_TYPE_INDEX}
        """
    )
    cur.execute(
        f"ALTER TABLE {_ENTITY_ALIASES_STAGE_TABLE} RENAME TO entity_aliases"
    )
    cur.execute(
        f"ALTER TABLE {_ENTITY_RUNTIME_ALIASES_STAGE_TABLE} RENAME TO entity_runtime_aliases"
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_ALIASES_TABLE}
            RENAME CONSTRAINT entity_aliases_next_pkey
            TO {_ENTITY_ALIASES_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_ALIASES_TABLE}
            RENAME CONSTRAINT entity_aliases_next_highlight_mode_check
            TO {_ENTITY_ALIASES_HIGHLIGHT_MODE_CHECK}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entity_aliases_next_alias_key_all
            RENAME TO {_ENTITY_ALIASES_ALIAS_KEY_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_RUNTIME_ALIASES_TABLE}
            RENAME CONSTRAINT entity_runtime_aliases_next_pkey
            TO {_ENTITY_RUNTIME_ALIASES_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entity_runtime_aliases_next_alias_key
            RENAME TO {_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entity_runtime_aliases_next_alias_key_entity_type
            RENAME TO {_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_ENTITY_TYPE_INDEX}
        """
    )
    cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
    cur.execute(_DROP_ENTITY_ALIASES_OLD_SQL)


def _swap_entities_stage(cur) -> None:
    logger.info("Swapping staged entities table into place ...")
    cur.execute(f"SET LOCAL lock_timeout = '{ENTITY_PROJECTION_LOCK_TIMEOUT}'")
    cur.execute(_DROP_ENTITIES_OLD_SQL)
    cur.execute(
        "ALTER TABLE IF EXISTS "
        f"{_ENTITIES_TABLE} RENAME TO entities_old"
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_ENTITIES_OLD_TABLE}
            RENAME CONSTRAINT {_ENTITIES_PKEY}
            TO {_ENTITIES_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITIES_TYPE_INDEX}
            RENAME TO {_ENTITIES_OLD_TYPE_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITIES_PAPER_COUNT_INDEX}
            RENAME TO {_ENTITIES_OLD_PAPER_COUNT_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_ENTITIES_CANONICAL_NAME_TRGM_INDEX}
            RENAME TO {_ENTITIES_OLD_CANONICAL_NAME_TRGM_INDEX}
        """
    )
    cur.execute(
        f"ALTER TABLE {_ENTITIES_STAGE_TABLE} RENAME TO entities"
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITIES_TABLE}
            RENAME CONSTRAINT entities_next_pkey
            TO {_ENTITIES_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entities_next_type
            RENAME TO {_ENTITIES_TYPE_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entities_next_paper_count
            RENAME TO {_ENTITIES_PAPER_COUNT_INDEX}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX solemd.idx_entities_next_canonical_name_trgm
            RENAME TO {_ENTITIES_CANONICAL_NAME_TRGM_INDEX}
        """
    )
    cur.execute(_DROP_ENTITIES_OLD_SQL)


def _finalize_entity_corpus_presence_stage(cur) -> int:
    cur.execute(
        _create_entity_corpus_presence_stage_sql(_ENTITY_CORPUS_PRESENCE_STAGE_TABLE)
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}
            ALTER COLUMN entity_type SET NOT NULL,
            ALTER COLUMN concept_id SET NOT NULL,
            ALTER COLUMN corpus_id SET NOT NULL,
            ALTER COLUMN pmid SET NOT NULL,
            ALTER COLUMN mention_count SET NOT NULL,
            ALTER COLUMN mention_count SET DEFAULT 0,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE} IS
            'Derived serving projection: one row per (entity_type, concept_id, corpus_id)
             from PubTator joined onto the active SoleMD corpus.'
        """
    )
    cur.execute(
        f"""
        COMMENT ON COLUMN {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}.mention_count IS
            'Count of matching PubTator annotation rows for the entity within the corpus paper.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}
            ADD CONSTRAINT entity_corpus_presence_next_pkey
            PRIMARY KEY (entity_type, concept_id, corpus_id)
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE}
            ADD CONSTRAINT entity_corpus_presence_next_corpus_id_fkey
            FOREIGN KEY (corpus_id)
            REFERENCES solemd.corpus(corpus_id)
            ON DELETE CASCADE
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_entity_corpus_presence_next_corpus_id
            ON {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE} (corpus_id)
        """
    )
    cur.execute(_COUNT_ENTITY_CORPUS_PRESENCE_STAGE_SQL)
    return cur.fetchone()["cnt"]


def _build_entity_corpus_presence_stage(cur) -> int:
    logger.info(
        "Building staged %s from pubtator.entity_annotations ...",
        _ENTITY_CORPUS_PRESENCE_STAGE_TABLE,
    )
    _apply_entity_projection_build_session_settings(cur)
    cur.execute(_DROP_ENTITY_CORPUS_PRESENCE_STAGE_SQL)
    cur.execute(_DROP_ENTITY_CORPUS_PRESENCE_OLD_SQL)
    total = _finalize_entity_corpus_presence_stage(cur)
    logger.info("Built %d staged entity-to-corpus presence rows", total)
    return total


def _swap_entity_corpus_presence_stage(cur) -> None:
    logger.info("Swapping staged entity_corpus_presence table into place ...")
    cur.execute(f"SET LOCAL lock_timeout = '{ENTITY_PROJECTION_LOCK_TIMEOUT}'")
    cur.execute(_DROP_ENTITY_CORPUS_PRESENCE_OLD_SQL)
    cur.execute(
        "ALTER TABLE IF EXISTS "
        f"{_ENTITY_CORPUS_PRESENCE_TABLE} RENAME TO entity_corpus_presence_old"
    )
    cur.execute(
        f"ALTER TABLE {_ENTITY_CORPUS_PRESENCE_STAGE_TABLE} RENAME TO entity_corpus_presence"
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_CORPUS_PRESENCE_TABLE}
            RENAME CONSTRAINT entity_corpus_presence_next_pkey
            TO entity_corpus_presence_pkey
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_ENTITY_CORPUS_PRESENCE_TABLE}
            RENAME CONSTRAINT entity_corpus_presence_next_corpus_id_fkey
            TO entity_corpus_presence_corpus_id_fkey
        """
    )
    cur.execute(
        """
        ALTER INDEX solemd.idx_entity_corpus_presence_next_corpus_id
            RENAME TO idx_entity_corpus_presence_corpus_id
        """
    )
    cur.execute(_DROP_ENTITY_CORPUS_PRESENCE_OLD_SQL)


def _analyze_projection_tables(cur, table_names: tuple[str, ...]) -> None:
    for table_name in table_names:
        cur.execute(f"ANALYZE {table_name}")


def build_entity_aliases_table(
    *,
    dry_run: bool = False,
    log_history: bool = True,
    reuse_stage: bool = False,
) -> dict:
    """Rebuild the broad query alias projection and hot runtime alias subset."""

    t_start = time.monotonic()

    if dry_run:
        dry_run_sql = _DRY_RUN_ENTITY_ALIASES_SQL.format(
            highlight_mode_case=_highlight_mode_case_sql("ra")
        )
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(
                dry_run_sql,
                (list(HIGHLIGHT_RUNTIME_MODES),) + _HIGHLIGHT_POLICY_SQL_PARAMS,
            )
            row = cur.fetchone()
            logger.info("Dry run — entity alias candidates: %d", row["total_aliases"])
            logger.info(
                "Dry run — runtime entity alias candidates: %d",
                row["total_runtime_aliases"],
            )
            return {
                "dry_run": True,
                "total_aliases": row["total_aliases"],
                "total_runtime_aliases": row["total_runtime_aliases"],
            }

    with db.connect() as conn:
        with conn.cursor() as cur:
            if reuse_stage and _entity_alias_projection_stages_ready(cur):
                _assert_no_active_stage_build(
                    cur,
                    (_ENTITY_ALIASES_STAGE_TABLE, _ENTITY_RUNTIME_ALIASES_STAGE_TABLE),
                )
                cur.execute(_COUNT_ENTITY_ALIASES_STAGE_SQL)
                inserted = cur.fetchone()["cnt"]
                cur.execute(_COUNT_ENTITY_RUNTIME_ALIASES_STAGE_SQL)
                runtime_inserted = cur.fetchone()["cnt"]
                logger.info(
                    "Reusing staged entity alias projections: %d warehouse aliases, "
                    "%d runtime aliases",
                    inserted,
                    runtime_inserted,
                )
            else:
                inserted, runtime_inserted = _build_entity_alias_projection_stages(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _swap_entity_alias_projection_stages(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _analyze_projection_tables(
                cur,
                (_ENTITY_ALIASES_TABLE, _ENTITY_RUNTIME_ALIASES_TABLE),
            )
            cur.execute(_COUNT_ENTITY_ALIASES_SQL)
            total_aliases = cur.fetchone()["cnt"]
            cur.execute(_COUNT_ENTITY_RUNTIME_ALIASES_SQL)
            total_runtime_aliases = cur.fetchone()["cnt"]
        if log_history:
            log_etl_run(
                conn,
                operation="build_entity_aliases",
                source="solemd.entities",
                rows_processed=inserted,
                rows_loaded=total_aliases,
                status="completed",
                metadata={
                    "inserted": inserted,
                    "total_aliases": total_aliases,
                    "runtime_aliases_inserted": runtime_inserted,
                    "total_runtime_aliases": total_runtime_aliases,
                },
            )

    elapsed = time.monotonic() - t_start
    logger.info(
        "Entity alias projection refresh complete: %d warehouse aliases, "
        "%d runtime aliases in %.1fs (%.1f min)",
        total_aliases,
        total_runtime_aliases,
        elapsed,
        elapsed / 60,
    )
    return {
        "inserted": inserted,
        "total_aliases": total_aliases,
        "runtime_aliases_inserted": runtime_inserted,
        "total_runtime_aliases": total_runtime_aliases,
        "elapsed_seconds": round(elapsed, 1),
    }


def build_entity_catalog_table(
    *,
    dry_run: bool = False,
    log_history: bool = True,
    reuse_stage: bool = False,
) -> dict:
    """Rebuild the canonical entity catalog with a staged stage/swap pattern."""

    t_start = time.monotonic()

    if dry_run:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt "
                f"FROM ({_ENTITY_STAGE_SELECT_SQL}) AS staged_entities"
            )
            total_entities = cur.fetchone()["cnt"]
            logger.info("Dry run — canonical entity catalog rows: %d", total_entities)
            return {"dry_run": True, "total_entities": total_entities}

    with db.connect() as conn:
        with conn.cursor() as cur:
            if reuse_stage and _entities_stage_ready(cur):
                _assert_no_active_stage_build(cur, (_ENTITIES_STAGE_TABLE,))
                cur.execute(_COUNT_ENTITIES_STAGE_SQL)
                inserted = cur.fetchone()["cnt"]
                logger.info(
                    "Reusing staged canonical entity catalog from %s (%d rows)",
                    _ENTITIES_STAGE_TABLE,
                    inserted,
                )
            else:
                inserted = _build_entities_stage(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _swap_entities_stage(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _analyze_projection_tables(cur, (_ENTITIES_TABLE,))
            cur.execute(_COUNT_ENTITIES_SQL)
            total_entities = cur.fetchone()["cnt"]
        if log_history:
            log_etl_run(
                conn,
                operation="build_entity_catalog",
                source="pubtator.entity_annotations",
                rows_processed=inserted,
                rows_loaded=total_entities,
                status="completed",
                metadata={
                    "inserted": inserted,
                    "total_entities": total_entities,
                },
            )

    elapsed = time.monotonic() - t_start
    logger.info(
        "Canonical entity catalog refresh complete: %d entities in %.1fs (%.1f min)",
        total_entities,
        elapsed,
        elapsed / 60,
    )
    return {
        "inserted": inserted,
        "total_entities": total_entities,
        "elapsed_seconds": round(elapsed, 1),
    }


def build_entity_runtime_aliases_table(
    *,
    dry_run: bool = False,
    log_history: bool = True,
    reuse_stage: bool = False,
) -> dict:
    """Rebuild only the hot-path runtime entity alias serving table."""

    t_start = time.monotonic()

    if dry_run:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(_DRY_RUN_ENTITY_RUNTIME_ALIASES_SQL, (list(HIGHLIGHT_RUNTIME_MODES),))
            total_runtime_aliases = cur.fetchone()["cnt"]
            logger.info("Dry run — runtime entity aliases: %d", total_runtime_aliases)
            return {
                "dry_run": True,
                "total_runtime_aliases": total_runtime_aliases,
            }

    with db.connect() as conn:
        with conn.cursor() as cur:
            if reuse_stage and _entity_runtime_aliases_stage_ready(cur):
                _assert_no_active_stage_build(cur, (_ENTITY_RUNTIME_ALIASES_STAGE_TABLE,))
                cur.execute(_COUNT_ENTITY_RUNTIME_ALIASES_STAGE_SQL)
                inserted = cur.fetchone()["cnt"]
                logger.info(
                    "Reusing staged runtime entity aliases from %s (%d rows)",
                    _ENTITY_RUNTIME_ALIASES_STAGE_TABLE,
                    inserted,
                )
            else:
                _apply_entity_projection_build_session_settings(cur)
                cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_STAGE_SQL)
                cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
                inserted = _finalize_entity_runtime_aliases_stage(
                    cur,
                    source_table=_ENTITY_ALIASES_TABLE,
                )
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SET LOCAL lock_timeout = '{ENTITY_PROJECTION_LOCK_TIMEOUT}'")
            cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
            cur.execute(
                "ALTER TABLE IF EXISTS "
                f"{_ENTITY_RUNTIME_ALIASES_TABLE} RENAME TO entity_runtime_aliases_old"
            )
            cur.execute(
                f"""
                ALTER TABLE IF EXISTS {_ENTITY_RUNTIME_ALIASES_OLD_TABLE}
                    RENAME CONSTRAINT {_ENTITY_RUNTIME_ALIASES_PKEY}
                    TO {_ENTITY_RUNTIME_ALIASES_OLD_PKEY}
                """
            )
            cur.execute(
                f"""
                ALTER INDEX IF EXISTS solemd.{_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_INDEX}
                    RENAME TO {_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_INDEX}
                """
            )
            cur.execute(
                f"""
                ALTER INDEX IF EXISTS solemd.{_ENTITY_RUNTIME_ALIASES_ALIAS_KEY_ENTITY_TYPE_INDEX}
                    RENAME TO {_ENTITY_RUNTIME_ALIASES_OLD_ALIAS_KEY_ENTITY_TYPE_INDEX}
                """
            )
            cur.execute(
                "ALTER TABLE "
                f"{_ENTITY_RUNTIME_ALIASES_STAGE_TABLE} RENAME TO entity_runtime_aliases"
            )
            cur.execute(
                f"""
                ALTER TABLE {_ENTITY_RUNTIME_ALIASES_TABLE}
                    RENAME CONSTRAINT entity_runtime_aliases_next_pkey
                    TO entity_runtime_aliases_pkey
                """
            )
            cur.execute(
                """
                ALTER INDEX solemd.idx_entity_runtime_aliases_next_alias_key
                    RENAME TO idx_entity_runtime_aliases_alias_key
                """
            )
            cur.execute(
                """
                ALTER INDEX solemd.idx_entity_runtime_aliases_next_alias_key_entity_type
                    RENAME TO idx_entity_runtime_aliases_alias_key_entity_type
                """
            )
            cur.execute(_DROP_ENTITY_RUNTIME_ALIASES_OLD_SQL)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _analyze_projection_tables(cur, (_ENTITY_RUNTIME_ALIASES_TABLE,))
            cur.execute(_COUNT_ENTITY_RUNTIME_ALIASES_SQL)
            total_runtime_aliases = cur.fetchone()["cnt"]
        if log_history:
            log_etl_run(
                conn,
                operation="build_entity_runtime_aliases",
                source="solemd.entity_aliases",
                rows_processed=inserted,
                rows_loaded=total_runtime_aliases,
                status="completed",
                metadata={
                    "inserted": inserted,
                    "total_runtime_aliases": total_runtime_aliases,
                },
            )

    elapsed = time.monotonic() - t_start
    logger.info(
        "Runtime entity alias refresh complete: %d aliases in %.1fs (%.1f min)",
        total_runtime_aliases,
        elapsed,
        elapsed / 60,
    )
    return {
        "inserted": inserted,
        "total_runtime_aliases": total_runtime_aliases,
        "elapsed_seconds": round(elapsed, 1),
    }


def build_entity_corpus_presence_table(
    *,
    dry_run: bool = False,
    log_history: bool = True,
    reuse_stage: bool = False,
) -> dict:
    """Rebuild the derived entity-to-corpus serving projection."""

    t_start = time.monotonic()

    if dry_run:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(_DRY_RUN_ENTITY_CORPUS_PRESENCE_SQL)
            total_rows = cur.fetchone()["cnt"]
            logger.info("Dry run — entity-to-corpus projection rows: %d", total_rows)
            return {"dry_run": True, "total_entity_corpus_presence": total_rows}

    with db.connect() as conn:
        with conn.cursor() as cur:
            if reuse_stage and _entity_corpus_presence_stage_ready(cur):
                _assert_no_active_stage_build(cur, (_ENTITY_CORPUS_PRESENCE_STAGE_TABLE,))
                cur.execute(_COUNT_ENTITY_CORPUS_PRESENCE_STAGE_SQL)
                inserted = cur.fetchone()["cnt"]
                logger.info(
                    "Reusing staged entity-to-corpus projection from %s (%d rows)",
                    _ENTITY_CORPUS_PRESENCE_STAGE_TABLE,
                    inserted,
                )
            else:
                inserted = _build_entity_corpus_presence_stage(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _swap_entity_corpus_presence_stage(cur)
        conn.commit()

    with db.connect() as conn:
        with conn.cursor() as cur:
            _analyze_projection_tables(cur, (_ENTITY_CORPUS_PRESENCE_TABLE,))
            cur.execute(_COUNT_ENTITY_CORPUS_PRESENCE_SQL)
            total = cur.fetchone()["cnt"]
        if log_history:
            log_etl_run(
                conn,
                operation="build_entity_corpus_presence",
                source="pubtator.entity_annotations",
                rows_processed=inserted,
                rows_loaded=total,
                status="completed",
                metadata={
                    "inserted": inserted,
                    "total_entity_corpus_presence": total,
                },
            )

    elapsed = time.monotonic() - t_start
    logger.info(
        "Entity-to-corpus projection refresh complete: %d rows in %.1fs (%.1f min)",
        total,
        elapsed,
        elapsed / 60,
    )
    return {
        "inserted": inserted,
        "total_entity_corpus_presence": total,
        "elapsed_seconds": round(elapsed, 1),
    }
