SET ROLE engine_admin;

CREATE TABLE IF NOT EXISTS solemd.graph_run_metrics (
    graph_run_id UUID PRIMARY KEY,
    published_at TIMESTAMPTZ NOT NULL,
    built_at TIMESTAMPTZ NOT NULL,
    point_count BIGINT NOT NULL,
    edge_count BIGINT,
    base_cohort_size BIGINT NOT NULL,
    hot_overlap_count BIGINT,
    cluster_count INTEGER NOT NULL,
    embedding_model_key SMALLINT NOT NULL,
    x_min REAL NOT NULL,
    x_max REAL NOT NULL,
    y_min REAL NOT NULL,
    y_max REAL NOT NULL,
    layout_policy_key TEXT NOT NULL,
    qa_summary JSONB,
    CHECK (point_count >= 0),
    CHECK (cluster_count >= 0)
);
ALTER TABLE solemd.graph_run_metrics SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.graph_clusters (
    graph_run_id UUID NOT NULL,
    cluster_id INTEGER NOT NULL,
    parent_cluster_id INTEGER,
    size INTEGER NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    centroid_x REAL,
    centroid_y REAL,
    PRIMARY KEY (graph_run_id, cluster_id),
    FOREIGN KEY (graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE RESTRICT,
    CHECK (size >= 0)
);
ALTER TABLE solemd.graph_clusters SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.graph_points (
    graph_run_id UUID NOT NULL,
    corpus_id BIGINT NOT NULL,
    point_index INTEGER NOT NULL,
    cluster_id INTEGER NOT NULL,
    base_rank INTEGER,
    domain_score REAL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    is_in_base BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (graph_run_id, corpus_id),
    UNIQUE (graph_run_id, point_index),
    FOREIGN KEY (graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (graph_run_id, cluster_id)
        REFERENCES solemd.graph_clusters (graph_run_id, cluster_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.graph_points SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS solemd.paper_semantic_neighbors (
    graph_run_id UUID NOT NULL,
    corpus_id BIGINT NOT NULL,
    neighbor_corpus_id BIGINT NOT NULL,
    similarity REAL NOT NULL,
    neighbor_rank SMALLINT NOT NULL,
    model_key SMALLINT NOT NULL,
    PRIMARY KEY (graph_run_id, corpus_id, model_key, neighbor_rank),
    FOREIGN KEY (graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE RESTRICT,
    CHECK (neighbor_rank > 0)
);
ALTER TABLE solemd.paper_semantic_neighbors SET (fillfactor = 100);

CREATE TABLE IF NOT EXISTS solemd.paper_api_cards (
    corpus_id BIGINT PRIMARY KEY,
    current_graph_run_id UUID,
    citation_count INTEGER NOT NULL DEFAULT 0,
    influential_citation_count INTEGER NOT NULL DEFAULT 0,
    publication_year SMALLINT,
    package_tier SMALLINT NOT NULL DEFAULT 0,
    text_availability SMALLINT NOT NULL DEFAULT 0,
    article_type SMALLINT,
    language SMALLINT,
    is_retracted BOOLEAN NOT NULL DEFAULT false,
    has_full_grounding BOOLEAN NOT NULL DEFAULT false,
    display_title TEXT NOT NULL,
    author_line TEXT,
    venue_display TEXT,
    external_ids JSONB,
    FOREIGN KEY (current_graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE SET NULL
);
ALTER TABLE solemd.paper_api_cards SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.paper_api_profiles (
    corpus_id BIGINT PRIMARY KEY,
    current_graph_run_id UUID,
    citation_count INTEGER NOT NULL DEFAULT 0,
    influential_citation_count INTEGER NOT NULL DEFAULT 0,
    publication_date DATE,
    year SMALLINT,
    package_tier SMALLINT NOT NULL DEFAULT 0,
    text_availability SMALLINT NOT NULL DEFAULT 0,
    article_type SMALLINT,
    language SMALLINT,
    is_retracted BOOLEAN NOT NULL DEFAULT false,
    has_full_grounding BOOLEAN NOT NULL DEFAULT false,
    full_title TEXT NOT NULL,
    abstract TEXT,
    tldr TEXT,
    venue_display TEXT,
    authors JSONB,
    metric_summary JSONB,
    top_concepts JSONB,
    external_ids JSONB,
    FOREIGN KEY (current_graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE SET NULL
);
ALTER TABLE solemd.paper_api_profiles SET (fillfactor = 90);
ALTER TABLE solemd.paper_api_profiles ALTER COLUMN abstract SET STORAGE EXTENDED;
ALTER TABLE solemd.paper_api_profiles ALTER COLUMN abstract SET COMPRESSION lz4;
ALTER TABLE solemd.paper_api_profiles ALTER COLUMN tldr SET COMPRESSION lz4;

CREATE TABLE IF NOT EXISTS solemd.wiki_sync_runs (
    wiki_sync_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    build_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    built_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    page_count INTEGER NOT NULL DEFAULT 0,
    build_status SMALLINT NOT NULL DEFAULT 1,
    source_locator TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    notes TEXT,
    error_summary JSONB
);
ALTER TABLE solemd.wiki_sync_runs SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.wiki_pages (
    wiki_sync_run_id UUID NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content_md TEXT NOT NULL,
    frontmatter JSONB,
    entity_type TEXT,
    concept_id TEXT,
    family_key TEXT,
    semantic_group TEXT,
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    outgoing_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    paper_pmids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    checksum TEXT NOT NULL,
    fts_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector(
            'english',
            coalesce(title, '') || ' ' || coalesce(content_md, '')
        )
    ) STORED,
    FOREIGN KEY (wiki_sync_run_id)
        REFERENCES solemd.wiki_sync_runs (wiki_sync_run_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.wiki_pages SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.graph_cluster_api_cards (
    graph_run_id UUID NOT NULL,
    cluster_id INTEGER NOT NULL,
    parent_cluster_id INTEGER,
    size INTEGER NOT NULL,
    label TEXT NOT NULL,
    short_description TEXT,
    top_concepts JSONB,
    top_venues JSONB,
    representative_corpus_ids JSONB,
    PRIMARY KEY (graph_run_id, cluster_id),
    FOREIGN KEY (graph_run_id, cluster_id)
        REFERENCES solemd.graph_clusters (graph_run_id, cluster_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.graph_cluster_api_cards SET (fillfactor = 90);

CREATE TABLE IF NOT EXISTS solemd.serving_runs (
    serving_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    graph_run_id UUID NOT NULL,
    api_projection_run_id UUID NOT NULL,
    chunk_version_key UUID NOT NULL,
    build_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    build_completed_at TIMESTAMPTZ,
    source_release_watermark INTEGER NOT NULL,
    contract_version INTEGER NOT NULL,
    synonym_version INTEGER NOT NULL,
    analyzer_version INTEGER NOT NULL,
    package_tier SMALLINT NOT NULL DEFAULT 0,
    vector_mode SMALLINT NOT NULL,
    build_status SMALLINT NOT NULL DEFAULT 1,
    opensearch_alias_swap_status SMALLINT NOT NULL DEFAULT 1,
    opensearch_alias_swap_attempted_at TIMESTAMPTZ,
    cohort_manifest JSONB NOT NULL,
    tables_built TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_built_family TEXT,
    build_checksum TEXT,
    notes TEXT,
    opensearch_alias_swap_error TEXT
);
ALTER TABLE solemd.serving_runs SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.serving_artifacts (
    serving_run_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    artifact_kind SMALLINT NOT NULL,
    row_count BIGINT NOT NULL DEFAULT 0,
    artifact_checksum TEXT,
    alias_or_index_name TEXT,
    artifact_uri TEXT,
    PRIMARY KEY (serving_run_id, artifact_kind),
    FOREIGN KEY (serving_run_id)
        REFERENCES solemd.serving_runs (serving_run_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.serving_artifacts SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.serving_cohorts (
    cohort_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    package_tier SMALLINT NOT NULL DEFAULT 0,
    cohort_kind SMALLINT NOT NULL,
    evidence_window_years SMALLINT,
    rubric_version INTEGER,
    cohort_name TEXT NOT NULL UNIQUE,
    notes TEXT
);
ALTER TABLE solemd.serving_cohorts SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.serving_members (
    cohort_id BIGINT NOT NULL,
    corpus_id BIGINT NOT NULL,
    promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    evidence_priority_score REAL,
    publication_year SMALLINT,
    publication_age_years SMALLINT,
    text_availability_class SMALLINT,
    structural_readiness SMALLINT,
    anchor_readiness SMALLINT,
    historical_exception_reason SMALLINT,
    package_build_status SMALLINT NOT NULL DEFAULT 0,
    grounding_roundtrip_ok BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (cohort_id, corpus_id),
    FOREIGN KEY (cohort_id)
        REFERENCES solemd.serving_cohorts (cohort_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.serving_members SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.api_projection_runs (
    api_projection_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    serving_run_id UUID NOT NULL,
    source_graph_run_id UUID NOT NULL,
    source_serving_run_id UUID,
    build_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    built_at TIMESTAMPTZ,
    source_release_watermark INTEGER NOT NULL,
    projection_schema_version INTEGER NOT NULL,
    build_status SMALLINT NOT NULL DEFAULT 1,
    rows_written BIGINT NOT NULL DEFAULT 0,
    advisory_lock_keys BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
    tables_rewritten TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    swap_duration_ms INTEGER,
    admin_connection_id INTEGER,
    notes TEXT
);
ALTER TABLE solemd.api_projection_runs SET (fillfactor = 80);

CREATE TABLE IF NOT EXISTS solemd.active_runtime_pointer (
    singleton_key BOOLEAN PRIMARY KEY DEFAULT true,
    serving_run_id UUID NOT NULL,
    graph_run_id UUID NOT NULL,
    api_projection_run_id UUID NOT NULL,
    promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    promoted_by TEXT,
    previous_serving_run_id UUID,
    previous_graph_run_id UUID,
    previous_api_projection_run_id UUID,
    CONSTRAINT ck_active_runtime_singleton CHECK (singleton_key = true),
    FOREIGN KEY (serving_run_id)
        REFERENCES solemd.serving_runs (serving_run_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (graph_run_id)
        REFERENCES solemd.graph_run_metrics (graph_run_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (api_projection_run_id)
        REFERENCES solemd.api_projection_runs (api_projection_run_id)
        ON DELETE RESTRICT
);
ALTER TABLE solemd.active_runtime_pointer SET (fillfactor = 80);

RESET ROLE;
