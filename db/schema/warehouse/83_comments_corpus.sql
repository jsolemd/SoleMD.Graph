SET ROLE engine_warehouse_admin;

COMMENT ON TABLE solemd.vocab_terms IS
    'Curated editorial vocabulary loaded from data/vocab_terms.tsv for corpus selection and later concept derivation.';
COMMENT ON TABLE solemd.vocab_term_aliases IS
    'Curated alias catalog loaded from data/vocab_aliases.tsv and joined against PubTator mention surfaces.';

COMMENT ON TABLE solemd.corpus_selection_runs IS
    'One row per release-pair corpus-selection run that refreshes corpus, mapped, and retired paper membership.';
COMMENT ON TABLE solemd.corpus_selection_signals IS
    'Durable per-paper selection signal ledger keyed to one corpus-selection run.';
COMMENT ON TABLE solemd.paper_corpus_assignments IS
    'Logged S2-release paper-to-corpus assignment map used to resume corpus admission without mutating raw S2 rows.';
COMMENT ON TABLE solemd.corpus_selection_artifacts IS
    'Durable logged ledger for rebuildable corpus-selection scratch artifacts and logged phase checkpoints. Scratch artifact tables are unlogged and run-scoped; this table survives crashes and drives resume/GC.';
COMMENT ON TABLE solemd.corpus_selection_chunks IS
    'Logged chunk ledger for parallel-safe baseline materialization, mapped materialization, and selection-summary refresh by configured corpus_id hash bucket.';
COMMENT ON TABLE solemd.paper_entity_signal_builds IS
    'Logged build ledger for durable paper-level curated entity signals keyed by S2 release, PT3 release, and entity asset checksum.';
COMMENT ON TABLE solemd.paper_entity_signals IS
    'Durable paper-level curated entity signal layer reused by corpus admission, mapped promotion, and selection summaries. Each row is either a vocab/alias hit or an entity-rule hit.';
COMMENT ON TABLE solemd.paper_selection_summary IS
    'Compact per-paper selection summary refreshed from durable selection signals and release-scoped counts used for mapped rollout and evidence-wave ranking.';
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
COMMENT ON TABLE solemd.corpus_wave_runs IS
    'One row per mapped-paper evidence child-wave dispatch run feeding downstream document acquisition.';
COMMENT ON TABLE solemd.corpus_wave_members IS
    'Deterministic mapped-paper membership for one evidence-wave dispatch plus enqueue progress and ranking snapshot.';

COMMENT ON COLUMN solemd.corpus_selection_runs.status IS
    'Corpus-selection lifecycle code from db/schema/enum-codes.yaml.corpus_selection_run_status.';
COMMENT ON COLUMN solemd.corpus_selection_runs.phase_started_at IS
    'Phase start timestamps keyed by phase name for resumable corpus-selection runs.';
COMMENT ON COLUMN solemd.corpus_selection_runs.plan_checksum IS
    'Stable SHA-256 digest of the validated corpus-selection plan manifest for resume/drift checks.';

COMMENT ON COLUMN solemd.corpus_selection_signals.phase_name IS
    'Selection phase that wrote the signal row; used for deterministic phase reruns.';
COMMENT ON COLUMN solemd.corpus_selection_signals.signal_kind IS
    'Stable signal-family name such as journal_match, pattern_match, vocab_entity_match, or mapped_journal_match.';
COMMENT ON COLUMN solemd.corpus_selection_signals.detail IS
    'Structured signal payload capturing matched alias, venue, concept, or other rule-family context.';

COMMENT ON COLUMN solemd.paper_corpus_assignments.assigned_by_run_id IS
    'Selection run that first created or most recently refreshed this S2-release paper assignment.';
COMMENT ON COLUMN solemd.paper_corpus_assignments.entity_signal_checksum IS
    'Entity asset checksum used by the admission run that created this assignment, when entity signals contributed to the plan.';

COMMENT ON COLUMN solemd.corpus_selection_artifacts.artifact_kind IS
    'Stable artifact or checkpoint key such as paper_scope, paper_scope_identity_reconciliation, relation_aggregate, mapped_entity_detail, or mapped_relation_detail.';
COMMENT ON COLUMN solemd.corpus_selection_artifacts.storage_table IS
    'Physical unlogged scratch table name in storage_schema, or corpus_selection_artifacts for logged checkpoints without a scratch table.';
COMMENT ON COLUMN solemd.corpus_selection_artifacts.status IS
    'Artifact lifecycle: building, complete, failed, stale, or dropped.';

COMMENT ON COLUMN solemd.paper_entity_signals.entity_signal_checksum IS
    'Checksum over the vocab term, vocab alias, and entity-rule assets that produced this signal row.';

COMMENT ON COLUMN solemd.corpus_selection_chunks.bucket_id IS
    'Configured corpus_id hash bucket claimed independently for bounded materialization work.';
COMMENT ON COLUMN solemd.corpus_selection_chunks.row_counts IS
    'Per-surface row counts written by the materialization chunk.';

COMMENT ON COLUMN solemd.paper_selection_summary.current_status IS
    'Current corpus membership state mirrored from solemd.corpus.domain_status for the owning selection run.';
COMMENT ON COLUMN solemd.paper_selection_summary.publication_year IS
    'Release-scoped publication year copied from s2_papers_raw so mapped and evidence policy can gate without rescanning raw rows.';
COMMENT ON COLUMN solemd.paper_selection_summary.mapped_family_keys IS
    'Distinct mapped-promotion family keys that promoted the paper during the owning selection run.';
COMMENT ON COLUMN solemd.paper_selection_summary.has_locator_candidate IS
    'True when the canonical paper row has at least one current PMC/PMID/DOI locator candidate for the evidence acquisition lane.';
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
COMMENT ON COLUMN solemd.paper_selection_summary.mapped_priority_score IS
    'Deterministic paper-level rollout score for mapped-universe serving work computed once during selection-summary refresh.';
COMMENT ON COLUMN solemd.paper_selection_summary.evidence_priority_score IS
    'Deterministic evidence-wave ranking score for downstream full-text acquisition and chunk/evidence work.';

COMMENT ON COLUMN solemd.corpus_wave_runs.status IS
    'Mapped-wave lifecycle code from db/schema/enum-codes.yaml.corpus_wave_run_status.';
COMMENT ON COLUMN solemd.corpus_wave_runs.phase_started_at IS
    'Phase start timestamps keyed by phase name for resumable child-wave dispatch runs.';
COMMENT ON COLUMN solemd.corpus_wave_runs.plan_checksum IS
    'Stable SHA-256 digest of the validated child-wave plan manifest for resume/drift checks.';

COMMENT ON COLUMN solemd.corpus_wave_members.actor_name IS
    'Downstream actor target for the wave member; initial slice dispatches to evidence.acquire_for_paper.';
COMMENT ON COLUMN solemd.corpus_wave_members.priority_score IS
    'Persisted evidence-wave ranking score copied from paper_selection_summary at selection time.';
COMMENT ON COLUMN solemd.corpus_wave_members.selection_detail IS
    'Snapshot of the ranking inputs used when the wave selected the paper.';

COMMENT ON COLUMN solemd.vocab_terms.source_asset_sha256 IS
    'SHA-256 of the source vocab_terms.tsv asset used for the current table refresh.';
COMMENT ON COLUMN solemd.vocab_term_aliases.normalized_alias IS
    'Normalized lookup key derived from alias text for fast warehouse-local PubTator joins.';
COMMENT ON COLUMN solemd.vocab_term_aliases.source_asset_sha256 IS
    'SHA-256 of the source vocab_aliases.tsv asset used for the current table refresh.';

COMMENT ON FUNCTION solemd.clean_venue(TEXT) IS
    'Normalize venue names for corpus journal matching by lowercasing, stripping trailing dots, subtitles, leading \"the\", and trailing parentheticals.';

RESET ROLE;
