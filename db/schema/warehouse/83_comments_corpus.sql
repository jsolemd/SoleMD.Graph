SET ROLE engine_warehouse_admin;

COMMENT ON TABLE solemd.vocab_terms IS
    'Curated editorial vocabulary loaded from data/vocab_terms.tsv for corpus selection and later concept derivation.';
COMMENT ON TABLE solemd.vocab_term_aliases IS
    'Curated alias catalog loaded from data/vocab_aliases.tsv and joined against PubTator mention surfaces.';

COMMENT ON TABLE solemd.corpus_selection_runs IS
    'One row per release-pair corpus-selection run that refreshes corpus, mapped, and retired paper membership.';
COMMENT ON TABLE solemd.corpus_selection_signals IS
    'Durable per-paper selection signal ledger keyed to one corpus-selection run.';
COMMENT ON TABLE solemd.paper_selection_summary IS
    'Compact per-paper selection summary refreshed from durable selection signals and release-scoped counts used for mapped rollout and evidence-wave ranking.';
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

COMMENT ON COLUMN solemd.paper_selection_summary.current_status IS
    'Current corpus membership state mirrored from solemd.corpus.domain_status for the owning selection run.';
COMMENT ON COLUMN solemd.paper_selection_summary.publication_year IS
    'Release-scoped publication year copied from s2_papers_raw so mapped and evidence policy can gate without rescanning raw rows.';
COMMENT ON COLUMN solemd.paper_selection_summary.mapped_family_keys IS
    'Distinct mapped-promotion family keys that promoted the paper during the owning selection run.';
COMMENT ON COLUMN solemd.paper_selection_summary.has_locator_candidate IS
    'True when the canonical paper row has at least one current PMC/PMID/DOI locator candidate for the evidence acquisition lane.';
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
    'Downstream actor target for the wave member; initial slice dispatches to hot_text.acquire_for_paper.';
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
