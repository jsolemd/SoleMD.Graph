SET ROLE engine_warehouse_admin;

ALTER TABLE solemd.corpus
    ALTER COLUMN domain_status SET DEFAULT 'corpus';
ALTER TABLE solemd.corpus
    DROP CONSTRAINT IF EXISTS ck_corpus_domain_status;
ALTER TABLE solemd.corpus
    ADD CONSTRAINT ck_corpus_domain_status
        CHECK (domain_status IN ('candidate', 'corpus', 'mapped', 'retired'));

UPDATE solemd.corpus
SET domain_status = 'corpus'
WHERE domain_status = 'candidate';

ALTER TABLE solemd.corpus
    DROP CONSTRAINT IF EXISTS ck_corpus_domain_status;
ALTER TABLE solemd.corpus
    ADD CONSTRAINT ck_corpus_domain_status
        CHECK (domain_status IN ('corpus', 'mapped', 'retired'));

DO $$
BEGIN
    ALTER TABLE solemd.corpus_selection_signals
        RENAME COLUMN contributes_to_candidate TO contributes_to_corpus;
EXCEPTION
    WHEN undefined_column THEN NULL;
END $$;

UPDATE solemd.corpus_selection_signals
SET phase_name = 'corpus_admission'
WHERE phase_name = 'candidate_admission';

WITH normalized AS (
    SELECT
        runs.corpus_selection_run_id,
        array_replace(
            runs.phases_completed,
            'candidate_admission',
            'corpus_admission'
        ) AS phases_completed,
        CASE
            WHEN runs.last_completed_phase = 'candidate_admission' THEN 'corpus_admission'
            ELSE runs.last_completed_phase
        END AS last_completed_phase,
        CASE
            WHEN runs.phase_started_at ? 'candidate_admission' THEN
                (runs.phase_started_at - 'candidate_admission')
                || jsonb_build_object(
                    'corpus_admission',
                    runs.phase_started_at -> 'candidate_admission'
                )
            ELSE runs.phase_started_at
        END AS phase_started_at,
        CASE
            WHEN runs.plan_manifest ? 'phases' THEN
                jsonb_set(
                    runs.plan_manifest,
                    '{phases}',
                    to_jsonb(
                        array_replace(
                            ARRAY(
                                SELECT jsonb_array_elements_text(runs.plan_manifest -> 'phases')
                            ),
                            'candidate_admission',
                            'corpus_admission'
                        )
                    ),
                    true
                )
            ELSE runs.plan_manifest
        END AS plan_manifest
    FROM solemd.corpus_selection_runs runs
)
UPDATE solemd.corpus_selection_runs runs
SET phases_completed = normalized.phases_completed,
    last_completed_phase = normalized.last_completed_phase,
    phase_started_at = normalized.phase_started_at,
    plan_manifest = normalized.plan_manifest,
    plan_checksum = encode(digest(normalized.plan_manifest::text, 'sha256'), 'hex')
FROM normalized
WHERE runs.corpus_selection_run_id = normalized.corpus_selection_run_id;

ALTER TABLE solemd.paper_selection_summary
    DROP CONSTRAINT IF EXISTS ck_paper_selection_summary_status;
ALTER TABLE solemd.paper_selection_summary
    ADD CONSTRAINT ck_paper_selection_summary_status
        CHECK (current_status IN ('candidate', 'corpus', 'mapped', 'retired'));

UPDATE solemd.paper_selection_summary
SET current_status = 'corpus'
WHERE current_status = 'candidate';

ALTER TABLE solemd.paper_selection_summary
    DROP CONSTRAINT IF EXISTS ck_paper_selection_summary_status;
ALTER TABLE solemd.paper_selection_summary
    ADD CONSTRAINT ck_paper_selection_summary_status
        CHECK (current_status IN ('corpus', 'mapped', 'retired'));

ALTER TABLE solemd.paper_selection_summary
    ADD COLUMN IF NOT EXISTS has_open_access BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_pmc_id BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_abstract BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reference_out_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS influential_reference_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mapped_priority_score INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS evidence_priority_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE solemd.corpus_wave_members
    ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS selection_detail JSONB;

ALTER TABLE solemd.corpus_wave_members
    DROP CONSTRAINT IF EXISTS ck_corpus_wave_members_priority_score;
ALTER TABLE solemd.corpus_wave_members
    ADD CONSTRAINT ck_corpus_wave_members_priority_score
        CHECK (priority_score >= 0);

WITH normalized AS (
    SELECT
        runs.corpus_wave_run_id,
        CASE
            WHEN runs.wave_policy_key = 'mapped_missing_pmc_bioc'
                THEN 'evidence_missing_pmc_bioc'
            ELSE runs.wave_policy_key
        END AS wave_policy_key,
        CASE
            WHEN runs.plan_manifest ->> 'wave_policy_key' = 'mapped_missing_pmc_bioc' THEN
                jsonb_set(
                    runs.plan_manifest,
                    '{wave_policy_key}',
                    to_jsonb('evidence_missing_pmc_bioc'::TEXT),
                    true
                )
            ELSE runs.plan_manifest
        END AS plan_manifest
    FROM solemd.corpus_wave_runs runs
)
UPDATE solemd.corpus_wave_runs runs
SET wave_policy_key = normalized.wave_policy_key,
    plan_manifest = normalized.plan_manifest,
    plan_checksum = encode(digest(normalized.plan_manifest::text, 'sha256'), 'hex')
FROM normalized
WHERE runs.corpus_wave_run_id = normalized.corpus_wave_run_id;

CREATE INDEX IF NOT EXISTS idx_paper_selection_summary_run_status_evidence_rank
    ON solemd.paper_selection_summary (
        corpus_selection_run_id,
        current_status,
        evidence_priority_score DESC,
        mapped_priority_score DESC,
        corpus_id
    );

CREATE INDEX IF NOT EXISTS idx_s2_paper_references_raw_release_citing
    ON solemd.s2_paper_references_raw (
        source_release_id,
        citing_paper_id,
        is_influential
    );

COMMENT ON TABLE solemd.corpus_selection_runs IS
    'One row per release-pair corpus-selection run that refreshes corpus, mapped, and retired paper membership.';
COMMENT ON TABLE solemd.paper_selection_summary IS
    'Compact per-paper selection summary refreshed from durable selection signals and release-scoped counts used for mapped rollout and evidence-wave ranking.';
COMMENT ON TABLE solemd.corpus_wave_runs IS
    'One row per mapped-paper evidence child-wave dispatch run feeding downstream document acquisition.';
COMMENT ON TABLE solemd.corpus_wave_members IS
    'Deterministic mapped-paper membership for one evidence-wave dispatch plus enqueue progress and ranking snapshot.';

COMMENT ON COLUMN solemd.paper_selection_summary.mapped_priority_score IS
    'Deterministic paper-level rollout score for mapped-universe serving work computed once during selection-summary refresh.';
COMMENT ON COLUMN solemd.paper_selection_summary.evidence_priority_score IS
    'Deterministic evidence-wave ranking score for downstream full-text acquisition and chunk/evidence work.';
COMMENT ON COLUMN solemd.corpus_wave_members.priority_score IS
    'Persisted evidence-wave ranking score copied from paper_selection_summary at selection time.';
COMMENT ON COLUMN solemd.corpus_wave_members.selection_detail IS
    'Snapshot of the ranking inputs used when the wave selected the paper.';

RESET ROLE;
