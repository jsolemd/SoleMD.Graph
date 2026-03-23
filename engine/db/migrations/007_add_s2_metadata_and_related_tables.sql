-- 007_add_s2_metadata_and_related_tables.sql
-- Release-aware S2 metadata tracking plus normalized related-paper tables
-- needed by the detail panel and future geo layer.

BEGIN;

ALTER TABLE solemd.papers
    ADD COLUMN IF NOT EXISTS paper_id TEXT,
    ADD COLUMN IF NOT EXISTS paper_external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS publication_venue_id TEXT,
    ADD COLUMN IF NOT EXISTS journal_volume TEXT,
    ADD COLUMN IF NOT EXISTS journal_issue TEXT,
    ADD COLUMN IF NOT EXISTS journal_pages TEXT,
    ADD COLUMN IF NOT EXISTS s2_full_release_id TEXT,
    ADD COLUMN IF NOT EXISTS s2_embedding_release_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_paper_id
    ON solemd.papers (paper_id)
    WHERE paper_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.publication_venues (
    publication_venue_id     TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    venue_type               TEXT,
    issn                     TEXT,
    url                      TEXT,
    alternate_names          TEXT[] NOT NULL DEFAULT '{}',
    alternate_urls           TEXT[] NOT NULL DEFAULT '{}',
    source                   TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    last_seen_release_id     TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
    ALTER TABLE solemd.papers
        ADD CONSTRAINT papers_publication_venue_fk
        FOREIGN KEY (publication_venue_id)
        REFERENCES solemd.publication_venues (publication_venue_id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS solemd.authors (
    author_id               TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    external_ids            JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    last_seen_release_id    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solemd.paper_authors (
    corpus_id               BIGINT NOT NULL REFERENCES solemd.papers (corpus_id) ON DELETE CASCADE,
    author_position         INTEGER NOT NULL,
    author_id               TEXT REFERENCES solemd.authors (author_id),
    name                    TEXT NOT NULL,
    affiliations            TEXT[] NOT NULL DEFAULT '{}',
    external_ids            JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, author_position)
);

CREATE INDEX IF NOT EXISTS idx_paper_authors_author_id
    ON solemd.paper_authors (author_id)
    WHERE author_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.author_affiliations (
    corpus_id               BIGINT NOT NULL,
    author_position         INTEGER NOT NULL,
    affiliation_index       INTEGER NOT NULL,
    raw_affiliation         TEXT NOT NULL,
    institution             TEXT,
    department              TEXT,
    city                    TEXT,
    region                  TEXT,
    country                 TEXT,
    country_code            TEXT,
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    ror_id                  TEXT,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, author_position, affiliation_index),
    CONSTRAINT author_affiliations_paper_author_fk
        FOREIGN KEY (corpus_id, author_position)
        REFERENCES solemd.paper_authors (corpus_id, author_position)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_author_affiliations_ror
    ON solemd.author_affiliations (ror_id)
    WHERE ror_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.paper_assets (
    asset_id                BIGSERIAL PRIMARY KEY,
    corpus_id               BIGINT NOT NULL REFERENCES solemd.papers (corpus_id) ON DELETE CASCADE,
    asset_kind              TEXT NOT NULL,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    remote_url              TEXT,
    storage_path            TEXT,
    access_status           TEXT,
    license                 TEXT,
    disclaimer              TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, asset_kind, source)
);

CREATE INDEX IF NOT EXISTS idx_paper_assets_kind
    ON solemd.paper_assets (asset_kind);

CREATE TABLE IF NOT EXISTS solemd.paper_references (
    reference_id            BIGSERIAL PRIMARY KEY,
    corpus_id               BIGINT NOT NULL REFERENCES solemd.papers (corpus_id) ON DELETE CASCADE,
    reference_index         INTEGER NOT NULL,
    referenced_paper_id     TEXT,
    referenced_corpus_id    BIGINT REFERENCES solemd.corpus (corpus_id),
    title                   TEXT,
    year                    INTEGER,
    external_ids            JSONB NOT NULL DEFAULT '{}'::jsonb,
    doi                     TEXT,
    pmid                    TEXT,
    pmcid                   TEXT,
    arxiv_id                TEXT,
    acl_id                  TEXT,
    dblp_id                 TEXT,
    mag_id                  TEXT,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, reference_index)
);

CREATE INDEX IF NOT EXISTS idx_paper_references_corpus
    ON solemd.paper_references (corpus_id);
CREATE INDEX IF NOT EXISTS idx_paper_references_referenced_corpus
    ON solemd.paper_references (referenced_corpus_id)
    WHERE referenced_corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_references_referenced_paper
    ON solemd.paper_references (referenced_paper_id)
    WHERE referenced_paper_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS solemd.citations (
    citing_corpus_id        BIGINT NOT NULL REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
    cited_corpus_id         BIGINT NOT NULL REFERENCES solemd.corpus (corpus_id) ON DELETE CASCADE,
    cited_paper_id          TEXT,
    source                  TEXT NOT NULL DEFAULT 'semantic_scholar_graph_api',
    source_release_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (citing_corpus_id, cited_corpus_id)
);

CREATE INDEX IF NOT EXISTS idx_citations_cited
    ON solemd.citations (cited_corpus_id);

COMMENT ON COLUMN solemd.papers.paper_id IS
    'Semantic Scholar paperId hash from the Graph API.';
COMMENT ON COLUMN solemd.papers.paper_external_ids IS
    'Canonical external ID snapshot from the S2 Graph API.';
COMMENT ON COLUMN solemd.papers.s2_full_release_id IS
    'Semantic Scholar release ID used for the latest full metadata enrichment.';
COMMENT ON COLUMN solemd.papers.s2_embedding_release_id IS
    'Semantic Scholar release ID used for the latest embedding-only enrichment.';
COMMENT ON TABLE solemd.paper_authors IS
    'Author snapshot per paper from the S2 Graph API. Source for future geo enrichment.';
COMMENT ON TABLE solemd.author_affiliations IS
    'Raw and normalized affiliation rows derived from paper_authors affiliations.';
COMMENT ON TABLE solemd.paper_assets IS
    'External or mirrored paper assets such as open-access PDFs.';
COMMENT ON TABLE solemd.paper_references IS
    'Outgoing reference list per paper from the S2 Graph API.';
COMMENT ON TABLE solemd.citations IS
    'Domain-domain citation edges, typically derived from paper_references.';

COMMIT;
