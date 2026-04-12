-- GIN index for backlink lookups: WHERE slug = ANY(outgoing_links)
-- Without this, the backlinks query seq-scans wiki_pages.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wiki_pages_outgoing_links
    ON solemd.wiki_pages USING GIN (outgoing_links);
