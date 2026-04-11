"""SQL query constants for the wiki module."""

# ---------------------------------------------------------------------------
# Page lookup
# ---------------------------------------------------------------------------

GET_PAGE_BY_SLUG = """\
SELECT slug, title, content_md, frontmatter, entity_type, concept_id,
       family_key, tags, outgoing_links, paper_pmids, checksum,
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
# Graph release resolution (graph_release_id → graph_run_id)
# ---------------------------------------------------------------------------

RESOLVE_GRAPH_RUN_ID = """\
SELECT id::TEXT AS graph_run_id
  FROM solemd.graph_runs
 WHERE status = 'completed'
   AND graph_name = 'cosmograph'
   AND node_kind = 'corpus'
   AND (
       (%(release_id)s = 'current' AND is_current = true)
       OR id::TEXT = %(release_id)s
       OR bundle_checksum = %(release_id)s
   )
 ORDER BY is_current DESC, created_at DESC
 LIMIT 1
"""

# ---------------------------------------------------------------------------
# PMID → graph paper ref resolution (release-scoped)
# ---------------------------------------------------------------------------

RESOLVE_PAPER_GRAPH_REFS = """\
SELECT c.pmid,
       COALESCE(p.paper_id, 'corpus:' || c.corpus_id::TEXT) AS graph_paper_ref
  FROM solemd.corpus c
  JOIN solemd.papers p ON p.corpus_id = c.corpus_id
  JOIN solemd.graph_points gp ON gp.corpus_id = c.corpus_id
 WHERE c.pmid = ANY(%(pmids)s)
   AND gp.graph_run_id = %(graph_run_id)s
"""

# ---------------------------------------------------------------------------
# Wiki entity-page enrichment (PubTator/S2-like backend context)
# ---------------------------------------------------------------------------

GET_ENTITY_PAGE_CONTEXT_COUNTS = """\
WITH matched_corpus AS (
    SELECT DISTINCT c.corpus_id
      FROM pubtator.entity_annotations ea
      JOIN solemd.corpus c ON c.pmid = ea.pmid
     WHERE ea.concept_id = %(concept_id)s
       AND ea.entity_type = %(entity_type)s
)
SELECT
    COUNT(*) AS total_corpus_paper_count,
    COUNT(gp.corpus_id) AS total_graph_paper_count
  FROM matched_corpus mc
  LEFT JOIN solemd.graph_points gp
    ON gp.corpus_id = mc.corpus_id
   AND gp.graph_run_id = %(graph_run_id)s
"""

GET_ENTITY_PAGE_CONTEXT_TOP_PAPERS = """\
WITH matched_corpus AS (
    SELECT DISTINCT c.corpus_id, c.pmid
      FROM pubtator.entity_annotations ea
      JOIN solemd.corpus c ON c.pmid = ea.pmid
     WHERE ea.concept_id = %(concept_id)s
       AND ea.entity_type = %(entity_type)s
)
SELECT
       mc.pmid,
       COALESCE(p.paper_id, 'corpus:' || mc.corpus_id::TEXT) AS graph_paper_ref,
       p.title AS paper_title,
       p.year,
       p.venue,
       p.citation_count
  FROM matched_corpus mc
  JOIN solemd.graph_points gp
    ON gp.corpus_id = mc.corpus_id
   AND gp.graph_run_id = %(graph_run_id)s
  JOIN solemd.papers p ON p.corpus_id = mc.corpus_id
 ORDER BY p.citation_count DESC NULLS LAST, mc.pmid DESC
 LIMIT %(limit)s
"""

# ---------------------------------------------------------------------------
# Sync helpers (used by sync_wiki_pages.py)
# ---------------------------------------------------------------------------

UPSERT_PAGE = """\
INSERT INTO solemd.wiki_pages
       (slug, title, content_md, frontmatter, entity_type, concept_id,
        family_key, tags, outgoing_links, paper_pmids, checksum, synced_at, updated_at)
VALUES (%(slug)s, %(title)s, %(content_md)s, %(frontmatter)s, %(entity_type)s,
        %(concept_id)s, %(family_key)s, %(tags)s, %(outgoing_links)s,
        %(paper_pmids)s, %(checksum)s, now(), now())
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    content_md = EXCLUDED.content_md,
    frontmatter = EXCLUDED.frontmatter,
    entity_type = EXCLUDED.entity_type,
    concept_id = EXCLUDED.concept_id,
    family_key = EXCLUDED.family_key,
    tags = EXCLUDED.tags,
    outgoing_links = EXCLUDED.outgoing_links,
    paper_pmids = EXCLUDED.paper_pmids,
    checksum = EXCLUDED.checksum,
    synced_at = now(),
    updated_at = now()
"""

UPDATE_OUTGOING_LINKS = """\
UPDATE solemd.wiki_pages
   SET outgoing_links = %(outgoing_links)s
 WHERE slug = %(slug)s
   AND outgoing_links IS DISTINCT FROM %(outgoing_links)s
"""

DELETE_REMOVED_PAGES = """\
DELETE FROM solemd.wiki_pages
 WHERE slug != ALL(%(slugs)s)
"""

GET_EXISTING_CHECKSUMS = """\
SELECT slug, checksum FROM solemd.wiki_pages
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
SELECT slug, title, entity_type, concept_id, family_key, tags,
       outgoing_links, paper_pmids
  FROM solemd.wiki_pages
 ORDER BY slug
"""

RESOLVE_PAPER_NODES_FOR_GRAPH = """\
SELECT c.pmid,
       COALESCE(p.paper_id, 'corpus:' || c.corpus_id::TEXT) AS graph_paper_ref,
       p.title AS paper_title,
       p.year,
       p.venue
  FROM solemd.corpus c
  JOIN solemd.papers p ON p.corpus_id = c.corpus_id
  JOIN solemd.graph_points gp ON gp.corpus_id = c.corpus_id
 WHERE c.pmid = ANY(%(pmids)s)
   AND gp.graph_run_id = %(graph_run_id)s
"""
