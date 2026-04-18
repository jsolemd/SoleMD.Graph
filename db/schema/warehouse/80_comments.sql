SET ROLE engine_warehouse_admin;

COMMENT ON SCHEMA solemd IS
    'Canonical warehouse schema for rebuild inputs, identity tables, and control rows.';
COMMENT ON SCHEMA pubtator IS
    'Reserved raw PubTator ingest schema for later warehouse slices.';
COMMENT ON SCHEMA umls IS
    'Reserved UMLS reference schema for later warehouse slices.';

COMMENT ON TABLE solemd.source_releases IS
    'One row per external source release loaded into the warehouse.';
COMMENT ON TABLE solemd.ingest_runs IS
    'One row per ingest or rebuild cycle against a source release.';
COMMENT ON TABLE solemd.corpus IS
    'Stable canonical paper identity inventory for the warehouse.';
COMMENT ON TABLE solemd.venues IS
    'Canonical venue registry for papers promoted out of raw ingest.';
COMMENT ON TABLE solemd.authors IS
    'Canonical author registry for papers promoted out of raw ingest.';
COMMENT ON TABLE solemd.papers IS
    'Canonical paper identity and non-text bibliographic metadata.';
COMMENT ON TABLE solemd.paper_text IS
    'Canonical title and abstract storage separated from narrow bibliographic metadata.';
COMMENT ON TABLE solemd.paper_authors IS
    'Canonical author ordering for each paper.';
COMMENT ON TABLE solemd.paper_chunk_versions IS
    'Version registry for chunking policy revisions.';
COMMENT ON TABLE solemd.graph_runs IS
    'Warehouse-side graph build lineage and publish lifecycle rows.';
COMMENT ON TABLE solemd.s2_papers_raw IS
    'Typed Semantic Scholar paper metadata staging table keyed by source paper id.';
COMMENT ON TABLE solemd.s2_paper_authors_raw IS
    'Typed Semantic Scholar author-order staging rows keyed by source paper id.';
COMMENT ON TABLE solemd.s2_paper_references_raw IS
    'Typed Semantic Scholar citation-edge staging rows prior to canonical promotion.';
COMMENT ON TABLE solemd.s2_paper_assets_raw IS
    'Typed Semantic Scholar asset metadata staging rows keyed by source paper id.';

COMMENT ON COLUMN solemd.source_releases.release_status IS
    'Human-readable operator status kept as TEXT for low-cardinality release control rows in the warehouse baseline.';
COMMENT ON COLUMN solemd.ingest_runs.status IS
    'Ingest lifecycle code from db/schema/enum-codes.yaml.ingest_run_status.';
COMMENT ON COLUMN solemd.ingest_runs.requested_status IS
    'Operator control code from db/schema/enum-codes.yaml.ingest_requested_status.';
COMMENT ON COLUMN solemd.corpus.domain_status IS
    'Human-readable curation status kept as TEXT for low-cardinality mapping review rows in the warehouse baseline.';
COMMENT ON COLUMN solemd.paper_text.text_availability IS
    'Text availability code from db/schema/enum-codes.yaml.text_availability.';
COMMENT ON COLUMN solemd.paper_text.normalized_title_key IS
    'Normalized exact-match title key; fuzzy trigram title matching is intentionally deferred.';
COMMENT ON COLUMN solemd.graph_runs.status IS
    'Graph build lifecycle code from db/schema/enum-codes.yaml.graph_run_status.';
COMMENT ON COLUMN solemd.s2_paper_references_raw.source_release_id IS
    'Release whose raw citation snapshot produced this edge row; one row per edge per source release.';
COMMENT ON COLUMN solemd.s2_paper_references_raw.linkage_status IS
    'Reference-linkage state from db/schema/enum-codes.yaml.s2_reference_linkage_status.';

RESET ROLE;

COMMENT ON FUNCTION solemd.normalize_lookup_key(TEXT) IS
    'Lowercase and collapse whitespace for stable generated lookup keys.';
