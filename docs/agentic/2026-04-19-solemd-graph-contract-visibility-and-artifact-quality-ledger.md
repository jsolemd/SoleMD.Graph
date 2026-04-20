# 2026-04-19 SoleMD.Graph Contract Visibility And Artifact Quality Ledger

- Date: `2026-04-19`
- Repo: `SoleMD.Graph`
- Scope: make the current `raw -> corpus -> mapped -> evidence` contract
  visible in Grafana, add any missing telemetry needed to answer policy and
  quality questions cleanly, and define the warehouse-first artifact-quality
  audit workflow for later sub-agent review
- Status: `completed`

## Intent

The previous passes proved that the worker slices run and that the monitored
pipeline can be measured. This pass exists to remove the remaining operator
ambiguity:

- Grafana should show the business contract, not only low-level counters
- the current evidence wave should be presented as backlog dispatch, not the
  whole evidence stage
- warehouse quality review should start from one indexed audit surface and one
  shared run-scoping contract

This pass is still not a chunking or grounding pass.

## Current Contract

- `raw`
  - published upstream S2/PT3 release-pair paper rows
- `corpus`
  - selected canonical warehouse papers with
    `current_status IN ('corpus', 'mapped')`
- `mapped`
  - stronger paper-level active subset with `current_status = 'mapped'`
- `evidence cohort`
  - mapped papers that satisfy the current evidence gate whether or not the
    preferred full-text source already exists
- `evidence satisfied`
  - evidence-cohort papers that already have active `pmc_bioc`
- `evidence backlog`
  - evidence-cohort papers still missing active `pmc_bioc`
- `evidence selected / enqueued`
  - backlog papers chosen by one dispatch run

Current locked stage criteria:

- `raw`
  - all paper rows in the published S2 release scope for the monitored release
    pair before selection
- `corpus`
  - admitted by one or more broad signals:
    - exact journal inventory match
    - curated venue-pattern match
    - curated vocabulary alias/entity hit
- `mapped`
  - corpus papers promoted by stronger direct mapping signals:
    - mapped journal match
    - mapped venue-pattern match
    - mapped entity-rule match
    - mapped relation-rule match
  - noisy entity families still require the second gate before final promotion
  - broad policy floor remains `publication_year >= 1945`
- `evidence cohort`
  - mapped papers that satisfy the current evidence gate whether or not the
    preferred full-text source already exists
- `evidence satisfied`
  - evidence-cohort papers with an active `pmc_bioc` document already present
- `evidence backlog`
  - evidence-cohort papers still missing active `pmc_bioc`
- `selected / enqueued`
  - evidence-backlog papers chosen by one dispatch run
  - `max_papers` is an operator cap, not a membership rule

Current locked evidence gate:

- `publication_year >= current_year - 10`, null allowed
- `evidence_priority_score >= 150`
- `has_locator_candidate = true`
- missing active `pmc_bioc`

## New Data Tracking In This Pass

The prior observability surface had run totals and signal totals, but not the
absolute stage sizes needed to answer contract questions directly.

This pass adds:

- `corpus_pipeline_stage_papers`
  - latest `raw`, `corpus`, and `mapped` counts per
    `(selector_version, s2_release_tag, pt3_release_tag)`
- `corpus_evidence_policy_papers`
  - latest `evidence_cohort`, `evidence_satisfied`,
    `evidence_backlog`, and `evidence_selected` counts per
    `(wave_policy_key, selector_version, s2_release_tag, pt3_release_tag)`

These are absolute gauges, not event counters. They exist specifically so
Grafana can display the contract as numbers.

## Grafana Changes

Provisioned dashboard target:

- `/home/workbench/SoleMD/SoleMD.Infra/infra/observability/grafana/dashboards/solemd-graph-workers.dashboard.json`

Current additions:

- `Pipeline Contract And Criteria` markdown panel
- `Pipeline Stage Counts (Latest)` panel backed by
  `corpus_pipeline_stage_papers`
- `Evidence Cohort / Satisfied / Backlog / Selected (Latest)` panel backed by
  `corpus_evidence_policy_papers`
- renamed the old selected/enqueued panel to
  `Evidence Acquisition Backlog Dispatch: Selected vs Enqueued (24h)`

## Warehouse Audit Authority

Primary audit surfaces:

- `solemd.paper_selection_summary`
  - main denormalized quality-review table
- `solemd.corpus_selection_signals`
  - drilldown explainer for corpus/mapped admission and promotion
- `solemd.corpus_wave_runs` + `solemd.corpus_wave_members`
  - current evidence-child-wave review surface
- `solemd.paper_text_acquisition_runs`
  - locator-quality and fetch-outcome surface
- `solemd.paper_text_contract_audit`
  - warehouse-local evidence-text contract mismatch surface
- `solemd.paper_documents`, `paper_sections`, `paper_blocks`,
  `paper_sentences`
  - full-text structure quality surface

Known drift discovered in this pass:

- `solemd.corpus_wave_members.actor_name` still carried the old
  `hot_text.acquire_for_paper` default/comment in schema authoring even though
  runtime dispatch now uses `evidence.acquire_for_paper`

## Shared Run Scope Worksheet

Every later audit should resolve the release pair and latest published
selection run once, then reuse those ids everywhere:

```sql
WITH release_pair AS (
  SELECT
    max(source_release_id) FILTER (
      WHERE source_name = 's2' AND source_release_key = :s2_release_tag
    ) AS s2_source_release_id,
    max(source_release_id) FILTER (
      WHERE source_name = 'pt3' AND source_release_key = :pt3_release_tag
    ) AS pt3_source_release_id
  FROM solemd.source_releases
),
selection_run AS (
  SELECT csr.*
  FROM solemd.corpus_selection_runs csr
  CROSS JOIN release_pair rp
  WHERE csr.status = 7
    AND csr.selector_version = :selector_version
    AND csr.s2_source_release_id = rp.s2_source_release_id
    AND csr.pt3_source_release_id = rp.pt3_source_release_id
  ORDER BY csr.started_at DESC
  LIMIT 1
)
SELECT * FROM selection_run;
```

## Quality Audit Questions

High-level review:

- How many papers are in `raw`, `corpus`, `mapped`, `evidence cohort`, and
  `evidence backlog` for the monitored release pair?
- What admission and promotion families dominate the selected sets?
- Are mapped and evidence papers actually useful:
  abstract-bearing, locator-ready, PT3-supported, and venue/year plausible?
- Are published full-text artifacts structurally healthy:
  non-zero sections/blocks/sentences and no obviously broken document rows?

Sub-agent slices once the live counts are stable:

- corpus admission quality and false positives
- mapped promotion quality and second-gate review
- evidence cohort/backlog quality and locator readiness
- full-text structure quality for successful evidence-text runs

## Completed Batches

### Batch 1

- re-read the current policy and schema authority:
  - `docs/rag/02-warehouse-schema.md`
  - `docs/rag/05e-corpus-selection.md`
  - `docs/rag/05f-evidence-text-acquisition.md`
  - `docs/rag/10-observability.md`
  - `docs/rag/14-implementation-handoff.md`
- indexed the current `/agentic` graph-policy ledgers in `docs/agentic/README.md`

### Batch 2

- added explicit absolute-count gauges for:
  - pipeline stage sizes
  - evidence policy cohort / satisfied / backlog / selected sizes
- added the corresponding runtime writes in the selection and wave runtimes
- added runtime test coverage for the new gauges

### Batch 3

- patched the provisioned Grafana worker dashboard so the contract is visible
  beside the live metrics
- discovered and queued a fix for stale `actor_name` schema metadata on
  `solemd.corpus_wave_members`

### Batch 4

- updated current doc authority surfaces:
  - `docs/rag/05e-corpus-selection.md`
  - `docs/rag/10-observability.md`
- realigned the warehouse authoring and live database metadata for
  `solemd.corpus_wave_members.actor_name`
  from `hot_text.acquire_for_paper` to `evidence.acquire_for_paper`
- added migration file:
  - `db/migrations/warehouse/20260419235800_warehouse_evidence_actor_name_contract.sql`
- verified warehouse migration ledger state after a manual ledger sync because
  the current migration runner still requires higher database privileges during
  `apply` / `adopt` bootstrap than `engine_warehouse_admin` has on this host

### Batch 5

- restarted the live ingest / corpus / evidence worker roots on the new code
- cleared the scope-local Prometheus DB files for those worker roots before
  restart so the new gauges came from the current process set
- ran a fresh monitored release-pair pass:
  - selector version: `selector-v2-contract-visibility-r1`
  - corpus selection run id: `019da8ac-23a2-788b-a4d9-38326fc91151`
  - evidence wave run id: `019da8ac-a285-7436-a013-930503af7920`
  - direct evidence-text refresh: `corpus_id = 900001`
- reloaded the provisioned Grafana dashboard live and verified the new panels
  through Grafana's own Prometheus datasource

### Batch 6

- expanded the Grafana contract panel from simple stage names to explicit stage
  criteria so the dashboard now states what qualifies a paper for each stage
- completed the first bounded warehouse artifact-quality review and recorded the
  current anomaly set for the monitored run
- added `solemd.paper_text_contract_audit` as a durable warehouse view so the
  evidence-text mismatch checks are queryable without bespoke joins

## Verification

Repo verification:

- `uv run --project apps/worker pytest apps/worker/tests/test_corpus_runtime.py apps/worker/tests/test_telemetry_bootstrap.py apps/worker/tests/test_evidence_runtime.py -q`
- result: `14 passed`

Warehouse verification:

- `solemd.corpus_wave_members.actor_name` default now resolves to
  `'evidence.acquire_for_paper'::text`
- warehouse migration verify:
  - `uv run scripts/schema_migrations.py verify --cluster warehouse --dsn 'postgresql://engine_warehouse_admin:engine_warehouse_admin@127.0.0.1:54432/warehouse?application_name=schema-migrations-warehouse' --check`
  - result: `ready = true`

Live metric verification:

- corpus worker `/metrics` now exposes:
  - `corpus_pipeline_stage_papers{stage="raw"} = 2`
  - `corpus_pipeline_stage_papers{stage="corpus"} = 1`
  - `corpus_pipeline_stage_papers{stage="mapped"} = 1`
  - `corpus_evidence_policy_papers{stage="evidence_cohort"} = 1`
  - `corpus_evidence_policy_papers{stage="evidence_satisfied"} = 1`
  - `corpus_evidence_policy_papers{stage="evidence_backlog"} = 0`
  - `corpus_evidence_policy_papers{stage="evidence_selected"} = 0`
- evidence worker `/metrics` now exposes:
  - `paper_text_acquisitions_total{outcome="published",locator_kind="pmcid",resolver_kind="paper_row_pmcid"} = 1`
  - `paper_text_document_rows_total{structure_kind="sections"} = 14`
  - `paper_text_document_rows_total{structure_kind="blocks"} = 118`
  - `paper_text_document_rows_total{structure_kind="sentences"} = 475`

Initial warehouse quality snapshot for
`selector-v2-contract-visibility-r1` on the monitored release pair:

- `corpus_count = 1`
- `mapped_count = 1`
- `has_abstract = 1 / 2 summary rows`
- `has_locator_candidate = 2 / 2 summary rows`
- `entity_annotation_count > 0 = 1 / 2 summary rows`
- `relation_count > 0 = 0 / 2 summary rows`

Bounded artifact-quality findings for the same monitored scope:

- release scope remains intentionally tiny:
  - `2` summary rows total
  - `1 mapped`
  - `1 retired`
- the active mapped paper is defensible:
  - `corpus_id = 900001`
  - title `Cancer and dementia: Two sides of the same coin?`
  - abstract present, locator-ready, open-access, PMC-backed
  - mapped support is narrow but coherent:
    - current-run corpus admission dominated by `vocab_entity_match`
    - current-run mapped promotion comes from one mapped entity rule for
      `Cognitive impairment`
- the clearest off-topic row is retained noise, not an active promotion:
  - `corpus_id = 11`
  - title `What factors affecting investment decision? The moderating role of fintech self-efficacy`
  - status `retired`
  - no current-run selection support
  - no PT3 support
- evidence-text structure is usable overall but exposes one contract anomaly:
  - `corpus_id = 11` has an active `pmc_bioc` document spine while
    `paper_text.text_availability = 0` and the stored abstract is empty
  - `corpus_id = 900001` is structurally healthy but still has coarse tail
    section labeling where references sit under `CONFLICT OF INTEREST`
- the new `solemd.paper_text_contract_audit` view now returns this anomaly
  directly:
  - `corpus_id = 11` -> both mismatch flags `true`
  - `corpus_id IN (900001, 900003)` -> mismatch flags `false`

Grafana verification:

- the `Pipeline Contract And Criteria` markdown panel renders in the
  provisioned dashboard with the explicit stage rules above
- the new `Pipeline Stage Counts (Latest)` query resolves to:
  - `raw = 2`
  - `corpus = 1`
  - `mapped = 1`
- the new `Evidence Cohort / Satisfied / Backlog / Selected (Latest)` query
  resolves to:
  - `evidence_cohort = 1`
  - `evidence_satisfied = 1`
  - `evidence_backlog = 0`
  - `evidence_selected = 0`
- dashboard reload verification:
  - Grafana provisioning reload returned `200`
  - rendered dashboard `No data` panel count = `0`
  - `evidence_satisfied = 1`
  - `evidence_backlog = 0`
  - `evidence_selected = 0`
- Grafana page check showed `No data` count = `0`

## Next Recommended Passes

1. Rotate the live worker roots and run one fresh monitored campaign so the new
   gauges and Grafana panels are populated.
2. Use the shared run-scope worksheet to launch bounded sub-agent artifact
   audits against Postgres.
3. Merge the audit findings back into one contract ledger before widening
   ingestion or locking new thresholds.
