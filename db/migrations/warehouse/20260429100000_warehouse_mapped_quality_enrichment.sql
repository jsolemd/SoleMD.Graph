SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.paper_selection_summary
    ADD COLUMN IF NOT EXISTS raw_pubtator_entity_annotation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS curated_entity_signal_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS raw_pubtator_relation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS incoming_citation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS influential_citation_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS s2_fields_of_study TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS s2_publication_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS open_access_pdf_status TEXT,
    ADD COLUMN IF NOT EXISTS publication_venue_type TEXT,
    ADD COLUMN IF NOT EXISTS rag_candidate BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rag_eligible BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS content_status TEXT NOT NULL DEFAULT 'metadata_only',
    ADD COLUMN IF NOT EXISTS relevance_band TEXT NOT NULL DEFAULT 'weak_candidate',
    ADD COLUMN IF NOT EXISTS topic_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS organ_system_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS publication_type_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS mesh_major_tracks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS has_cl_bridge BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS quality_warnings JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE solemd.paper_selection_summary
    DROP CONSTRAINT IF EXISTS ck_paper_selection_summary_content_status;
ALTER TABLE solemd.paper_selection_summary
    ADD CONSTRAINT ck_paper_selection_summary_content_status
        CHECK (
            content_status IN (
                'fulltext_ready',
                'abstract_ready',
                'metadata_only',
                'missing_text'
            )
        );

ALTER TABLE solemd.paper_selection_summary
    DROP CONSTRAINT IF EXISTS ck_paper_selection_summary_relevance_band;
ALTER TABLE solemd.paper_selection_summary
    ADD CONSTRAINT ck_paper_selection_summary_relevance_band
        CHECK (
            relevance_band IN (
                'high_confidence',
                'clinical_bridge',
                'venue_supported',
                'weak_candidate',
                'low_confidence'
            )
        );

CREATE TABLE IF NOT EXISTS solemd.pubmed_metadata_fetch_runs (
    pubmed_metadata_fetch_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    corpus_selection_run_id UUID
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE SET NULL,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    max_papers INTEGER,
    detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    CONSTRAINT ck_pubmed_metadata_fetch_runs_status
        CHECK (status IN ('running', 'complete', 'failed', 'aborted')),
    CONSTRAINT ck_pubmed_metadata_fetch_runs_max_papers
        CHECK (max_papers IS NULL OR max_papers >= 1)
);
ALTER TABLE solemd.pubmed_metadata_fetch_runs SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.pubmed_metadata_fetch_tasks (
    pubmed_metadata_fetch_run_id UUID NOT NULL
        REFERENCES solemd.pubmed_metadata_fetch_runs (pubmed_metadata_fetch_run_id)
        ON DELETE CASCADE,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    pmid INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pubmed_metadata_fetch_run_id, pmid),
    CONSTRAINT ck_pubmed_metadata_fetch_tasks_status
        CHECK (status IN ('pending', 'running', 'complete', 'failed')),
    CONSTRAINT ck_pubmed_metadata_fetch_tasks_attempts
        CHECK (attempts >= 0)
);
ALTER TABLE solemd.pubmed_metadata_fetch_tasks SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.pubmed_metadata (
    pmid INTEGER PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_name TEXT NOT NULL DEFAULT 'pubmed_efetch',
    response_checksum TEXT NOT NULL,
    article_title TEXT,
    abstract_text TEXT,
    abstract_hash TEXT,
    language_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    publication_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    citation_subsets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    mesh_headings JSONB NOT NULL DEFAULT '[]'::JSONB,
    mesh_major_terms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    grant_count INTEGER NOT NULL DEFAULT 0,
    has_grant BOOLEAN NOT NULL DEFAULT false,
    chemicals JSONB NOT NULL DEFAULT '[]'::JSONB,
    comments_corrections JSONB NOT NULL DEFAULT '[]'::JSONB,
    has_retraction BOOLEAN NOT NULL DEFAULT false,
    has_erratum BOOLEAN NOT NULL DEFAULT false,
    publication_status TEXT,
    structured_abstract JSONB NOT NULL DEFAULT '[]'::JSONB,
    raw_detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT ck_pubmed_metadata_grant_count
        CHECK (grant_count >= 0)
);
ALTER TABLE solemd.pubmed_metadata SET (fillfactor = 90);
ALTER TABLE solemd.pubmed_metadata ALTER COLUMN article_title SET COMPRESSION lz4;
ALTER TABLE solemd.pubmed_metadata ALTER COLUMN abstract_text SET COMPRESSION lz4;

CREATE TABLE IF NOT EXISTS solemd.s2_graph_enrichment_runs (
    s2_graph_enrichment_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    corpus_selection_run_id UUID
        REFERENCES solemd.corpus_selection_runs (corpus_selection_run_id)
        ON DELETE SET NULL,
    s2_source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    requested_by TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    max_papers INTEGER,
    detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    CONSTRAINT ck_s2_graph_enrichment_runs_status
        CHECK (status IN ('running', 'complete', 'failed', 'aborted')),
    CONSTRAINT ck_s2_graph_enrichment_runs_max_papers
        CHECK (max_papers IS NULL OR max_papers >= 1)
);
ALTER TABLE solemd.s2_graph_enrichment_runs SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.s2_graph_enrichment_tasks (
    s2_graph_enrichment_run_id UUID NOT NULL
        REFERENCES solemd.s2_graph_enrichment_runs (s2_graph_enrichment_run_id)
        ON DELETE CASCADE,
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    paper_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (s2_graph_enrichment_run_id, paper_id),
    CONSTRAINT ck_s2_graph_enrichment_tasks_status
        CHECK (status IN ('pending', 'running', 'complete', 'failed')),
    CONSTRAINT ck_s2_graph_enrichment_tasks_attempts
        CHECK (attempts >= 0)
);
ALTER TABLE solemd.s2_graph_enrichment_tasks SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.s2_paper_enrichment (
    source_release_id INTEGER NOT NULL
        REFERENCES solemd.source_releases (source_release_id)
        ON DELETE RESTRICT,
    paper_id TEXT NOT NULL,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.corpus (corpus_id)
        ON DELETE CASCADE,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    response_checksum TEXT NOT NULL,
    citation_count INTEGER NOT NULL DEFAULT 0,
    influential_citation_count INTEGER NOT NULL DEFAULT 0,
    publication_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    fields_of_study TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    s2_fields_of_study JSONB NOT NULL DEFAULT '[]'::JSONB,
    open_access_pdf JSONB NOT NULL DEFAULT '{}'::JSONB,
    open_access_pdf_status TEXT,
    publication_venue JSONB NOT NULL DEFAULT '{}'::JSONB,
    publication_venue_type TEXT,
    external_ids JSONB NOT NULL DEFAULT '{}'::JSONB,
    journal JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_open_access BOOLEAN,
    year INTEGER,
    publication_date DATE,
    raw_detail JSONB NOT NULL DEFAULT '{}'::JSONB,
    PRIMARY KEY (source_release_id, paper_id),
    CONSTRAINT ck_s2_paper_enrichment_citation_count
        CHECK (citation_count >= 0),
    CONSTRAINT ck_s2_paper_enrichment_influential_count
        CHECK (influential_citation_count >= 0)
);
ALTER TABLE solemd.s2_paper_enrichment SET (fillfactor = 90);

CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_rag_candidate
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        relevance_band,
        evidence_priority_score DESC,
        corpus_id
    )
    WHERE rag_candidate;
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_rag_eligible
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        content_status,
        evidence_priority_score DESC,
        corpus_id
    )
    WHERE rag_eligible;
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_content_status
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        content_status,
        corpus_id
    );
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_topic_tracks
    ON solemd.paper_selection_summary USING gin (topic_tracks);
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_organ_system_tracks
    ON solemd.paper_selection_summary USING gin (organ_system_tracks);
CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_quality_warnings
    ON solemd.paper_selection_summary USING gin (quality_warnings jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_fetch_runs_status_started
    ON solemd.pubmed_metadata_fetch_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_fetch_tasks_claim
    ON solemd.pubmed_metadata_fetch_tasks (
        pubmed_metadata_fetch_run_id,
        status,
        attempts,
        pmid
    );
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_publication_types
    ON solemd.pubmed_metadata USING gin (publication_types);
CREATE INDEX IF NOT EXISTS idx_pubmed_metadata_mesh_major_terms
    ON solemd.pubmed_metadata USING gin (mesh_major_terms);

CREATE INDEX IF NOT EXISTS idx_s2_graph_enrichment_runs_status_started
    ON solemd.s2_graph_enrichment_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_s2_graph_enrichment_tasks_claim
    ON solemd.s2_graph_enrichment_tasks (
        s2_graph_enrichment_run_id,
        status,
        attempts,
        paper_id
    );
CREATE INDEX IF NOT EXISTS idx_s2_paper_enrichment_corpus
    ON solemd.s2_paper_enrichment (corpus_id);
CREATE INDEX IF NOT EXISTS idx_s2_paper_enrichment_fields_of_study
    ON solemd.s2_paper_enrichment USING gin (fields_of_study);

GRANT INSERT, UPDATE, SELECT, DELETE ON TABLE
    solemd.pubmed_metadata_fetch_runs,
    solemd.pubmed_metadata_fetch_tasks,
    solemd.pubmed_metadata,
    solemd.s2_graph_enrichment_runs,
    solemd.s2_graph_enrichment_tasks,
    solemd.s2_paper_enrichment
TO engine_ingest_write;

GRANT SELECT ON TABLE
    solemd.pubmed_metadata_fetch_runs,
    solemd.pubmed_metadata_fetch_tasks,
    solemd.pubmed_metadata,
    solemd.s2_graph_enrichment_runs,
    solemd.s2_graph_enrichment_tasks,
    solemd.s2_paper_enrichment
TO engine_warehouse_read;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA solemd TO engine_ingest_write;

COMMENT ON COLUMN solemd.paper_selection_summary.entity_annotation_count IS
    'Deprecated compatibility mirror for curated_entity_signal_count. Do not use for raw PubTator coverage decisions.';
COMMENT ON COLUMN solemd.paper_selection_summary.raw_pubtator_entity_annotation_count IS
    'Raw PubTator mention count from the source-release stage table for this corpus paper.';
COMMENT ON COLUMN solemd.paper_selection_summary.curated_entity_signal_count IS
    'Curated entity/vocab/rule signal count used for corpus and mapped quality scoring.';
COMMENT ON COLUMN solemd.paper_selection_summary.raw_pubtator_relation_count IS
    'Raw PubTator relation count from the source-release stage table before curated relation-rule filtering.';
COMMENT ON COLUMN solemd.paper_selection_summary.rag_candidate IS
    'Mapped paper has enough local relevance signal to enter enrichment and RAG-control workflows, independent of text availability.';
COMMENT ON COLUMN solemd.paper_selection_summary.rag_eligible IS
    'Mapped RAG candidate has abstract or full-text content currently available for retrieval indexing.';
COMMENT ON COLUMN solemd.paper_selection_summary.content_status IS
    'Text readiness band: fulltext_ready, abstract_ready, metadata_only, or missing_text.';
COMMENT ON COLUMN solemd.paper_selection_summary.relevance_band IS
    'Mapped quality/relevance control band computed from venue, entity, relation, CL bridge, and enrichment signals.';
COMMENT ON COLUMN solemd.paper_selection_summary.topic_tracks IS
    'Queryable paper-level topic labels derived from curated vocab categories and entity/relation rule families.';
COMMENT ON COLUMN solemd.paper_selection_summary.organ_system_tracks IS
    'Queryable organ/system labels derived from curated vocab metadata; PubMed MeSH improves this after metadata enrichment.';
COMMENT ON COLUMN solemd.paper_selection_summary.has_cl_bridge IS
    'True when psych/neuro/behavior anchors and non-psychiatric organ/system anchors are both present.';
COMMENT ON COLUMN solemd.paper_selection_summary.quality_warnings IS
    'Structured QA flags such as title_only, missing_organ_tracks, low_entity_signal, raw_relation_without_rule_match, and retracted.';

COMMENT ON TABLE solemd.pubmed_metadata_fetch_runs IS
    'Logged PubMed EFetch metadata enrichment run ledger for mapped papers selected from a corpus-selection run.';
COMMENT ON TABLE solemd.pubmed_metadata_fetch_tasks IS
    'Per-PMID resumable PubMed EFetch work queue using SKIP LOCKED claims and bounded retry attempts.';
COMMENT ON TABLE solemd.pubmed_metadata IS
    'Durable per-PMID PubMed EFetch metadata used for MeSH, publication type, abstract, keyword, grant, and correction-aware quality scoring.';
COMMENT ON TABLE solemd.s2_graph_enrichment_runs IS
    'Logged Semantic Scholar Graph API enrichment run ledger for mapped papers selected from a corpus-selection run.';
COMMENT ON TABLE solemd.s2_graph_enrichment_tasks IS
    'Per-paper Semantic Scholar Graph API work queue using mapped-only batch fetches and bounded retry attempts.';
COMMENT ON TABLE solemd.s2_paper_enrichment IS
    'Durable mapped-paper Semantic Scholar Graph API metadata, including incoming citations, fields of study, publication venue type, and open-access PDF status.';

RESET ROLE;
