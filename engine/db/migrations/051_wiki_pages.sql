BEGIN;

CREATE TABLE IF NOT EXISTS solemd.wiki_pages (
    slug            TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    content_md      TEXT NOT NULL,
    frontmatter     JSONB NOT NULL DEFAULT '{}',
    entity_type     TEXT,
    concept_id      TEXT,
    family_key      TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    outgoing_links  TEXT[] NOT NULL DEFAULT '{}',
    paper_pmids     INTEGER[] NOT NULL DEFAULT '{}',
    checksum        TEXT NOT NULL,
    fts_vector      TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content_md, '')), 'B')
    ) STORED,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE solemd.wiki_pages IS 'Curated wiki content synced from wiki/ markdown files.';
COMMENT ON COLUMN solemd.wiki_pages.slug IS 'URL-safe path derived from file path relative to wiki/, e.g. entities/melatonin';
COMMENT ON COLUMN solemd.wiki_pages.checksum IS 'SHA-256 hex digest of raw file bytes — skip UPSERT when unchanged';
COMMENT ON COLUMN solemd.wiki_pages.paper_pmids IS 'PMIDs extracted from [[pmid:NNN]] citations in content';
COMMENT ON COLUMN solemd.wiki_pages.outgoing_links IS 'Slugs extracted from [[wikilink]] references in content';

CREATE INDEX IF NOT EXISTS idx_wiki_pages_fts ON solemd.wiki_pages USING GIN (fts_vector);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_entity ON solemd.wiki_pages (entity_type, concept_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_family ON solemd.wiki_pages (family_key);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_tags ON solemd.wiki_pages USING GIN (tags);

ANALYZE solemd.wiki_pages;

COMMIT;
