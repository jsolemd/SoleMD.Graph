SET ROLE engine_warehouse_admin;

COMMENT ON SCHEMA solemd IS
    'Canonical warehouse schema for rebuild inputs, identity tables, and control rows.';
COMMENT ON SCHEMA pubtator IS
    'Raw and canonical PubTator ingest schema for the warehouse refresh lane.';
COMMENT ON SCHEMA umls IS
    'Reserved UMLS reference schema for later warehouse slices.';

COMMENT ON TABLE solemd.source_releases IS
    'One row per external source release loaded into the warehouse.';
COMMENT ON TABLE solemd.ingest_runs IS
    'One row per ingest or rebuild cycle against a source release.';
COMMENT ON TABLE solemd.ingest_file_tasks IS
    'Durable DB-backed file work queue for parallel ingest families; workers claim idempotent source files and finalizers merge completed stage rows.';
COMMENT ON TABLE solemd.s2_dataset_cursors IS
    'Semantic Scholar Datasets API current-state cursor per dataset. Full ingest seeds the base cursor; diff application must explicitly mark hot source deletion safe.';
COMMENT ON TABLE solemd.s2_dataset_diff_manifests IS
    'Semantic Scholar Datasets API diff manifest ledger returned by /datasets/v1/diffs/{start}/to/{end}/{dataset}.';
COMMENT ON TABLE solemd.s2_dataset_diff_files IS
    'Durable per-file ledger for S2 diff update/delete file URLs before streamed application.';
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
COMMENT ON TABLE solemd.paper_citations IS
    'Canonical citation edges for release-selected papers, with corpus linkage when the cited paper is already canonical.';
COMMENT ON TABLE solemd.paper_chunk_versions IS
    'Version registry for chunking policy revisions.';
COMMENT ON TABLE solemd.graph_runs IS
    'Warehouse-side graph build lineage and publish lifecycle rows.';
COMMENT ON TABLE solemd.s2_papers_raw IS
    'Typed Semantic Scholar paper metadata staging table keyed by source paper id.';
COMMENT ON TABLE solemd.s2_paper_authors_raw IS
    'Typed Semantic Scholar author-order staging rows keyed by source paper id.';
COMMENT ON TABLE solemd.s2_authors_raw IS
    'Release-scoped Semantic Scholar author registry rows retained on the raw side of the corpus boundary.';
COMMENT ON TABLE solemd.s2_paper_reference_metrics_raw IS
    'Release-scoped aggregate citation metrics used for corpus and mapped gates without materializing full reference edges.';
COMMENT ON TABLE solemd.s2_paper_reference_metrics_stage IS
    'Transient unlogged Semantic Scholar citation metric fragments, one aggregate row per citing paper per completed source file.';
COMMENT ON TABLE solemd.s2_paper_reference_metrics_file_checkpoints IS
    'Durable Semantic Scholar citation file checkpoints that let long citation metric sweeps resume by file after worker failure.';
COMMENT ON TABLE solemd.s2_paper_references_raw IS
    'Optional Semantic Scholar citation-edge staging rows retained outside the default corpus gate contract.';
COMMENT ON TABLE solemd.s2_paper_assets_raw IS
    'Typed Semantic Scholar asset metadata staging rows keyed by source paper id.';
COMMENT ON TABLE solemd.s2orc_documents_raw IS
    'Release-backed Semantic Scholar S2ORC raw document payloads before any canonical hot-wave parsing.';
COMMENT ON TABLE pubtator.entity_annotations_stage IS
    'Release-scoped PubTator entity staging rows before canonical corpus-id promotion.';
COMMENT ON TABLE pubtator.entity_annotations IS
    'Canonical PubTator entity annotations keyed to warehouse corpus ids.';
COMMENT ON TABLE pubtator.relations_stage IS
    'Release-scoped PubTator relation staging rows before canonical corpus-id promotion.';
COMMENT ON TABLE pubtator.relations IS
    'Canonical PubTator relation rows keyed to warehouse corpus ids.';

COMMENT ON COLUMN solemd.source_releases.release_status IS
    'Human-readable operator status kept as TEXT for low-cardinality release control rows in the warehouse baseline.';
COMMENT ON COLUMN solemd.ingest_runs.status IS
    'Ingest lifecycle code from db/schema/enum-codes.yaml.ingest_run_status.';
COMMENT ON COLUMN solemd.ingest_runs.requested_status IS
    'Operator control code from db/schema/enum-codes.yaml.ingest_requested_status.';
COMMENT ON COLUMN solemd.ingest_file_tasks.status IS
    'File task lifecycle code: 1=pending, 2=running, 3=completed, 4=failed.';
COMMENT ON COLUMN solemd.ingest_file_tasks.input_bytes_read IS
    'Best-effort per-file byte progress reported by the worker heartbeat.';
COMMENT ON COLUMN solemd.ingest_file_tasks.stage_row_count IS
    'Exact completed stage row count recorded after a file reaches its durable checkpoint.';
COMMENT ON COLUMN solemd.ingest_file_tasks.claim_token IS
    'Per-claim lease token. File workers must present the current token before heartbeat, stage merge, checkpoint, complete, or fail updates.';
COMMENT ON COLUMN solemd.s2_dataset_cursors.hot_source_delete_safe_at IS
    'Non-null only after the dataset has a tested diff-application path. Source retention refuses hot deletion without this marker.';
COMMENT ON COLUMN solemd.corpus.domain_status IS
    'Human-readable curation status kept as TEXT for low-cardinality mapping review rows in the warehouse baseline.';
COMMENT ON COLUMN solemd.paper_text.text_availability IS
    'Text availability code from db/schema/enum-codes.yaml.text_availability.';
COMMENT ON COLUMN solemd.paper_text.normalized_title_key IS
    'Normalized exact-match title key; fuzzy trigram title matching is intentionally deferred.';
COMMENT ON COLUMN solemd.graph_runs.status IS
    'Graph build lifecycle code from db/schema/enum-codes.yaml.graph_run_status.';
COMMENT ON COLUMN solemd.venues.source_venue_id IS
    'Stable upstream Semantic Scholar publication-venue identifier when present.';
COMMENT ON COLUMN solemd.authors.source_author_id IS
    'Stable upstream Semantic Scholar author identifier when present.';
COMMENT ON INDEX solemd.uq_authors_anonymous_normalized_name IS
    'Serializes anonymous S2 author fallback upserts during parallel mapped materialization.';
COMMENT ON COLUMN solemd.s2_authors_raw.source_author_id IS
    'Stable upstream Semantic Scholar author identifier captured on the raw side before any canonical author promotion.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_raw.source_release_id IS
    'Release whose aggregate citation metrics produced this per-paper row.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_stage.ingest_run_id IS
    'Ingest run whose parallel citation workers produced this staging fragment.';
COMMENT ON COLUMN solemd.s2_paper_reference_metrics_file_checkpoints.stage_row_count IS
    'Number of per-file citation metric stage rows present when the source file was marked complete.';
COMMENT ON COLUMN solemd.s2_paper_references_raw.source_release_id IS
    'Release whose raw citation snapshot produced this edge row; one row per edge per source release.';
COMMENT ON COLUMN solemd.s2_paper_references_raw.reference_checksum IS
    'Stable release-scoped citation row checksum used as the refresh-safe raw primary key.';
COMMENT ON COLUMN solemd.s2_paper_references_raw.linkage_status IS
    'Reference-linkage state from db/schema/enum-codes.yaml.s2_reference_linkage_status.';
COMMENT ON COLUMN solemd.s2orc_documents_raw.document_payload IS
    'Normalized parsed S2ORC document JSON retained on the raw side of the corpus boundary.';
COMMENT ON COLUMN pubtator.entity_annotations_stage.entity_type IS
    'PubTator entity-type code from db/schema/enum-codes.yaml.pubtator_entity_type.';
COMMENT ON COLUMN pubtator.entity_annotations_stage.resource IS
    'PubTator entity resource code from db/schema/enum-codes.yaml.pubtator_entity_resource.';
COMMENT ON COLUMN pubtator.entity_annotations.entity_type IS
    'PubTator entity-type code from db/schema/enum-codes.yaml.pubtator_entity_type.';
COMMENT ON COLUMN pubtator.entity_annotations.resource IS
    'PubTator entity resource code from db/schema/enum-codes.yaml.pubtator_entity_resource.';
COMMENT ON COLUMN pubtator.relations_stage.relation_type IS
    'PubTator relation-type code from db/schema/enum-codes.yaml.pubtator_relation_type.';
COMMENT ON COLUMN pubtator.relations_stage.relation_source IS
    'PubTator relation-source code from db/schema/enum-codes.yaml.pubtator_relation_source.';
COMMENT ON COLUMN pubtator.relations.relation_type IS
    'PubTator relation-type code from db/schema/enum-codes.yaml.pubtator_relation_type.';
COMMENT ON COLUMN pubtator.relations.relation_source IS
    'PubTator relation-source code from db/schema/enum-codes.yaml.pubtator_relation_source.';

RESET ROLE;

COMMENT ON FUNCTION solemd.normalize_lookup_key(TEXT) IS
    'Lowercase and collapse whitespace for stable generated lookup keys.';
