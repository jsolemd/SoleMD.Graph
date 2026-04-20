SET ROLE engine_warehouse_admin;

CREATE TABLE IF NOT EXISTS solemd.paper_citations (
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    reference_checksum TEXT NOT NULL,
    cited_corpus_id BIGINT
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE SET NULL,
    cited_s2_paper_id TEXT,
    linkage_status SMALLINT NOT NULL DEFAULT 1,
    is_influential BOOLEAN NOT NULL DEFAULT false,
    intent_raw TEXT,
    PRIMARY KEY (corpus_id, reference_checksum),
    CONSTRAINT ck_paper_citations_linkage
        CHECK (linkage_status BETWEEN 1 AND 3)
);
ALTER TABLE solemd.paper_citations SET (fillfactor = 100);
ALTER TABLE solemd.paper_citations ALTER COLUMN intent_raw SET COMPRESSION lz4;

CREATE INDEX IF NOT EXISTS idx_paper_citations_cited
    ON solemd.paper_citations (cited_corpus_id, corpus_id)
    WHERE cited_corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paper_citations_influential
    ON solemd.paper_citations (corpus_id, cited_corpus_id)
    WHERE is_influential = true;

COMMENT ON TABLE solemd.paper_citations IS
    'Canonical citation edges for release-selected papers, with corpus linkage when the cited paper is already canonical.';

GRANT INSERT, SELECT ON TABLE solemd.paper_citations TO engine_ingest_write;
GRANT DELETE ON TABLE solemd.paper_citations TO engine_ingest_write;
GRANT SELECT ON TABLE solemd.paper_citations TO engine_warehouse_read;

RESET ROLE;
