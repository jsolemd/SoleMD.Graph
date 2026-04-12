"""SQL query constants for the wiki module."""

# ---------------------------------------------------------------------------
# Page lookup
# ---------------------------------------------------------------------------

GET_PAGE_BY_SLUG = """\
SELECT slug, title, content_md, frontmatter, entity_type, concept_id,
       family_key, semantic_group, tags, outgoing_links, paper_pmids, checksum,
       synced_at, created_at, updated_at
  FROM solemd.wiki_pages
 WHERE slug = %(slug)s
"""

LIST_PAGE_SUMMARIES = """\
SELECT slug, title, entity_type, family_key, tags
  FROM solemd.wiki_pages
 ORDER BY title
"""

# ---------------------------------------------------------------------------
# Full-text search
# ---------------------------------------------------------------------------

SEARCH_PAGES = """\
SELECT slug, title, entity_type, family_key, tags,
       ts_rank(fts_vector, websearch_to_tsquery('english', %(query)s)) AS rank,
       ts_headline('english', content_md, websearch_to_tsquery('english', %(query)s),
                   'MaxWords=40, MinWords=15, StartSel=**, StopSel=**') AS headline
  FROM solemd.wiki_pages
 WHERE fts_vector @@ websearch_to_tsquery('english', %(query)s)
 ORDER BY rank DESC
 LIMIT %(limit)s
"""

# ---------------------------------------------------------------------------
# Backlinks — pages whose outgoing_links contain the target slug
# ---------------------------------------------------------------------------

GET_BACKLINK_SUMMARIES = """\
SELECT slug, title, entity_type, family_key, tags
  FROM solemd.wiki_pages
 WHERE %(slug)s = ANY(outgoing_links)
 ORDER BY title
"""

# ---------------------------------------------------------------------------
# Sync helpers (used by sync_wiki_pages.py)
# ---------------------------------------------------------------------------

UPSERT_PAGE = """\
INSERT INTO solemd.wiki_pages
       (slug, title, content_md, frontmatter, entity_type, concept_id,
        family_key, semantic_group, tags, outgoing_links, paper_pmids, checksum,
        synced_at, updated_at)
VALUES (%(slug)s, %(title)s, %(content_md)s, %(frontmatter)s, %(entity_type)s,
        %(concept_id)s, %(family_key)s, %(semantic_group)s, %(tags)s, %(outgoing_links)s,
        %(paper_pmids)s, %(checksum)s, now(), now())
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    content_md = EXCLUDED.content_md,
    frontmatter = EXCLUDED.frontmatter,
    entity_type = EXCLUDED.entity_type,
    concept_id = EXCLUDED.concept_id,
    family_key = EXCLUDED.family_key,
    semantic_group = EXCLUDED.semantic_group,
    tags = EXCLUDED.tags,
    outgoing_links = EXCLUDED.outgoing_links,
    paper_pmids = EXCLUDED.paper_pmids,
    checksum = EXCLUDED.checksum,
    synced_at = now(),
    updated_at = now()
"""

UPDATE_PAGE_RUNTIME_FIELDS = """\
UPDATE solemd.wiki_pages
   SET outgoing_links = %(outgoing_links)s,
       semantic_group = %(semantic_group)s
 WHERE slug = %(slug)s
   AND (
       outgoing_links IS DISTINCT FROM %(outgoing_links)s
       OR semantic_group IS DISTINCT FROM %(semantic_group)s
   )
"""

DELETE_REMOVED_PAGES = """\
DELETE FROM solemd.wiki_pages
 WHERE slug != ALL(%(slugs)s)
"""

GET_EXISTING_CHECKSUMS = """\
SELECT slug, checksum FROM solemd.wiki_pages
"""

RESOLVE_PAGE_SEMANTIC_GROUPS = """\
WITH requested_concepts AS (
    SELECT DISTINCT concept_id
    FROM unnest(%(concept_ids)s::text[]) AS requested(concept_id)
    WHERE concept_id IS NOT NULL
      AND concept_id <> ''
)
SELECT
    requested_concepts.concept_id,
    NULLIF(vt.semantic_groups[1], '') AS semantic_group
FROM requested_concepts
JOIN LATERAL (
    SELECT semantic_groups, updated_at, created_at, umls_cui, mesh_id
    FROM solemd.vocab_terms
    WHERE (
        requested_concepts.concept_id = 'UMLS:' || umls_cui
        OR requested_concepts.concept_id = 'MESH:' || mesh_id
    )
    ORDER BY
        CASE
            WHEN requested_concepts.concept_id = 'UMLS:' || umls_cui THEN 0
            WHEN requested_concepts.concept_id = 'MESH:' || mesh_id THEN 1
            ELSE 2
        END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
    LIMIT 1
) AS vt ON TRUE
WHERE NULLIF(vt.semantic_groups[1], '') IS NOT NULL
"""

# ---------------------------------------------------------------------------
# Linked entity metadata (batch resolve for hover cards)
# ---------------------------------------------------------------------------

RESOLVE_LINKED_ENTITY_METADATA = """\
SELECT slug, entity_type, concept_id
  FROM solemd.wiki_pages
 WHERE slug = ANY(%(slugs)s)
   AND entity_type IS NOT NULL
   AND concept_id IS NOT NULL
"""

# ---------------------------------------------------------------------------
# Wiki graph — page nodes + paper nodes + edges
# ---------------------------------------------------------------------------

GET_ALL_PAGES_FOR_GRAPH = """\
SELECT slug, title, entity_type, concept_id, family_key, semantic_group, tags,
       outgoing_links, paper_pmids
  FROM solemd.wiki_pages
 ORDER BY slug
"""
