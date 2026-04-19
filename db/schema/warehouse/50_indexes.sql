SET ROLE engine_warehouse_admin;

CREATE INDEX IF NOT EXISTS idx_source_releases_ingested
    ON solemd.source_releases (source_name, source_ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_source_release_started
    ON solemd.ingest_runs (source_release_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_status_started
    ON solemd.ingest_runs (status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingest_runs_active_lock
    ON solemd.ingest_runs (advisory_lock_key)
    WHERE advisory_lock_key IS NOT NULL
      AND status BETWEEN 1 AND 4;
CREATE INDEX IF NOT EXISTS idx_ingest_runs_started_brin
    ON solemd.ingest_runs
    USING brin (started_at);

CREATE INDEX IF NOT EXISTS idx_corpus_domain_status
    ON solemd.corpus (domain_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_normalized_name
    ON solemd.venues (normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_source_venue_id
    ON solemd.venues (source_venue_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_issn
    ON solemd.venues (issn)
    WHERE issn IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_eissn
    ON solemd.venues (eissn)
    WHERE eissn IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_orcid
    ON solemd.authors (orcid)
    WHERE orcid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_authors_source_author_id
    ON solemd.authors (source_author_id);
CREATE INDEX IF NOT EXISTS idx_authors_normalized_name
    ON solemd.authors (normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_papers_pmid
    ON solemd.papers (pmid)
    WHERE pmid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_papers_doi_norm
    ON solemd.papers (doi_norm)
    WHERE doi_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_papers_pmc_id
    ON solemd.papers (pmc_id)
    WHERE pmc_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_papers_s2_paper_id
    ON solemd.papers (s2_paper_id)
    WHERE s2_paper_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paper_text_normalized_title_key
    ON solemd.paper_text (normalized_title_key);
CREATE INDEX IF NOT EXISTS idx_paper_text_text_availability
    ON solemd.paper_text (text_availability, corpus_id)
    WHERE text_availability > 0;
CREATE INDEX IF NOT EXISTS idx_paper_text_fts
    ON solemd.paper_text
    USING gin (fts_vector);

CREATE INDEX IF NOT EXISTS idx_paper_authors_author
    ON solemd.paper_authors (author_id, corpus_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_chunk_versions_active
    ON solemd.paper_chunk_versions (is_active)
    WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_chunk_versions_default
    ON solemd.paper_chunk_versions (is_default)
    WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_graph_runs_status_built
    ON solemd.graph_runs (status, built_at DESC, graph_run_id);

CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_pmid
    ON solemd.s2_papers_raw (pmid)
    WHERE pmid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_doi_norm
    ON solemd.s2_papers_raw (doi_norm)
    WHERE doi_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_pmc_id
    ON solemd.s2_papers_raw (pmc_id)
    WHERE pmc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_corpus
    ON solemd.s2_papers_raw (corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s2_papers_raw_source_venue_id
    ON solemd.s2_papers_raw (source_venue_id)
    WHERE source_venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_s2_paper_authors_raw_source_author
    ON solemd.s2_paper_authors_raw (source_author_id)
    WHERE source_author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_s2_paper_references_raw_linkage
    ON solemd.s2_paper_references_raw (source_release_id, linkage_status, citing_paper_id);
CREATE INDEX IF NOT EXISTS idx_s2_paper_references_raw_reverse
    ON solemd.s2_paper_references_raw (source_release_id, cited_paper_id, citing_paper_id);

CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_stage_release_pmid
    ON pubtator.entity_annotations_stage (source_release_id, pmid);
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_stage_corpus
    ON pubtator.entity_annotations_stage (corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_concept
    ON pubtator.entity_annotations (corpus_id, concept_id_raw);
CREATE INDEX IF NOT EXISTS idx_pubtator_entity_annotations_pmid
    ON pubtator.entity_annotations (pmid, start_offset)
    WHERE pmid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pubtator_relations_stage_release_pmid
    ON pubtator.relations_stage (source_release_id, pmid);
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_stage_corpus
    ON pubtator.relations_stage (corpus_id)
    WHERE corpus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pubtator_relations_reverse
    ON pubtator.relations (corpus_id, object_entity_id, relation_type, subject_entity_id);

RESET ROLE;
