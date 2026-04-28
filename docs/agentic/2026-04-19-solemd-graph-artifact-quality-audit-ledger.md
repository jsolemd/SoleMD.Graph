# 2026-04-19 SoleMD.Graph Artifact Quality Audit Ledger

- Date: `2026-04-19`
- Repo: `SoleMD.Graph`
- Scope: corpus-fill gating plus warehouse-first quality review of the
  currently measured `raw -> corpus -> mapped -> evidence` artifacts after
  contract visibility and telemetry hardening
- Status: `active`

## Intent

The monitored pipeline and Grafana contract panels are now working. This pass
now has two ordered questions:

- do we actually have enough relevant upstream raw loaded to fill the corpus?
- once we do, are the resulting artifacts in Postgres actually high quality,
  not just present?

The audit should stay warehouse-local and reuse the new shared contract
surfaces:

- `paper_selection_summary`
- `corpus_selection_signals`
- `corpus_wave_runs` / `corpus_wave_members`
- `paper_text_acquisition_runs`
- `paper_text_contract_audit`
- `paper_documents` / `paper_sections` / `paper_blocks` / `paper_sentences`

## Shared Scope

- S2 release tag: `2026-03-10-audit`
- PT3 release tag: `2026-03-21-audit`
- selector version: `selector-v2-contract-visibility-r1`
- wave policy key: `evidence_missing_pmc_bioc`
- corpus selection run id: `019da8ac-23a2-788b-a4d9-38326fc91151`
- evidence wave run id: `019da8ac-a285-7436-a013-930503af7920`

## Current Warehouse Reality

Current loaded release inventory means the next pass has to separate
`quality / contract semantics` from `population-scale sizing`.

Loaded release facts:

- largest real loaded S2 release:
  - `source_release_key = 2026-03-10`
  - `source_release_id = 1`
  - raw rows in `solemd.s2_papers_raw = 10`
- current monitored audit S2 release:
  - `source_release_key = 2026-03-10-audit`
  - `source_release_id = 11`
  - raw rows in `solemd.s2_papers_raw = 2`
- largest loaded PT3 release:
  - `source_release_key = 2026-03-21`
  - `source_release_id = 6`
  - stage rows in `pubtator.entity_annotations_stage = 500000`

Current canonical warehouse state:

- `solemd.papers = 19`
- `paper_selection_summary current_status IN ('corpus', 'mapped') = 6`
- `paper_selection_summary current_status = 'mapped' = 5`
- active `paper_documents = 3`
- `paper_text_contract_audit.active_document_text_availability_mismatch = 1`
- `paper_text_contract_audit.parsed_abstract_storage_mismatch = 1`

Implication:

- the warehouse is already large enough for a broader artifact-quality review
  than the `2`-paper monitored slice
- the warehouse is **not** large enough to lock final stage-volume contracts
  from observed release-pair counts alone
- before the next audit-heavy pass, the actual operational need is
  **corpus fill from a larger relevant cohort**
- until that happens, the contract we can lock is the **stage criteria and
  quality gate**, not the final stage population

## Audit Slices

1. Corpus / mapped quality
   - admission and promotion reason mix
   - abstract / locator / PT3 support
   - venue and year plausibility
2. Evidence readiness and locator quality
   - evidence cohort vs satisfied vs backlog
   - latest paper-text acquisition outcomes and resolver ladders
3. Full-text structure quality
   - active document rows
   - sections / blocks / sentences
   - obvious malformed documents or outliers

## Coordinator Notes

- Treat `paper_selection_summary` as the primary denormalized QA surface.
- Use `corpus_selection_signals` only to explain anomalies discovered in the
  summary.
- Treat `corpus_wave_members.actor_name` as fixed to
  `evidence.acquire_for_paper` in the live DB after the contract repair from
  the prior pass.

## Completed Batches

### Batch 1

- opened the dedicated quality-audit ledger after the contract-visibility pass
- fixed the shared run scope for the latest monitored release pair
- prepared bounded sub-agent slices for:
  - corpus / mapped quality
  - evidence readiness / locator quality
  - document-structure quality

### Batch 2

- merged the bounded corpus / mapped, evidence readiness, and document
  structure sub-agent readouts into one run-scoped quality pass
- confirmed the monitored release pair is still only a spot-check cohort, not
  a population-level estimate

### Batch 3

- added `solemd.paper_text_contract_audit` and verified it against the live
  warehouse state
- confirmed the new view flags the previously manual anomaly automatically:
  `corpus_id = 11` returns both mismatch booleans as `true`

### Batch 4 — Phase 1 Release-Scope Gate

- attempted the true real pair first:
  - S2 `2026-03-10`
  - PT3 `2026-03-21`
- the queue-backed corpus selection failed with the expected upstream gate:
  - worker exception: `UpstreamReleaseNotPublished`
  - actual warehouse release state:
    - S2 `2026-03-10` = `loaded`
    - PT3 `2026-03-21` = `ingesting`
- switched to the largest currently usable loaded pair:
  - S2 `2026-03-10`
  - PT3 `2026-03-21-audit`
- ran the queue-backed monitored pass successfully:
  - selector version: `selector-v2-phase1-usablepair-r1`
  - corpus selection run id: `019da8e8-808a-7c64-b1bd-bbd1b6e3bc01`
  - evidence wave run id: `019da8e8-cefe-7732-935f-25f2beeb0105`
- measured outcome for the usable pair:
  - `raw = 10`
  - `corpus = 0`
  - `mapped = 0`
  - `evidence_cohort = 0`
  - `evidence_backlog = 0`
  - `evidence_selected = 0`
  - `evidence_enqueued = 0`
- the selector executed cleanly and quickly:
  - `assets = 0.776 s`
  - `corpus_admission = 0.045 s`
  - `mapped_promotion = 0.045 s`
  - `canonical_materialization = 0.090 s`
  - `selection_summary = 0.018 s`
  - `member_selection = 0.009 s`
  - `enqueue = 0.005 s`

### Batch 5 — Phase 2 Fill Decision And Runtime Repair

- traced the true PT3 block to a real ingest control-path bug:
  - `_ensure_source_release()` could regress a `loaded` release row back to
    `ingesting` before `_open_or_resume_run()` raised `IngestAlreadyPublished`
  - that left `pt3 2026-03-21` selection-ineligible even though its latest
    ingest run was terminal `published`
- patched the ingest runtime so:
  - source-release metadata upsert no longer flips release status eagerly
  - a release is marked `ingesting` only after a real run is opened or resumed
  - a no-op published rerun leaves the release row `loaded`
- added a regression test for that exact failure mode
- traced the next operational blocker for real release fill:
  - `--force-new-run` was still blocked by `PlanDrift` against the latest
    partial run manifest
  - that would have prevented widening `2026-03-10` and `2026-03-21` into
    full release runs
- patched the ingest runtime so `PlanDrift` only blocks resume of an unfinished
  run; it no longer blocks a genuine forced replay
- added a regression test covering a forced replay with a wider family plan
- verified the focused worker suite after both fixes:
  - `14 passed, 2 warnings`
- measured the real release fill scope from the live `/mnt` root:
  - PT3 `2026-03-21`
    - `bioconcepts2pubtator3.gz`: `1` file, `6.04 GB`
    - `relation2pubtator3.gz`: `1` file, `0.29 GB`
    - `biocxml`: `10` tarballs, `208.73 GB`
  - S2 `2026-03-10`
    - `publication-venues`: `1` file, `0.02 GB`
    - `authors`: `30` files, `3.48 GB`
    - `papers`: `60` files, `51.47 GB`
    - `abstracts`: `30` files, `24.49 GB`
    - `citations`: `358` files, `361.19 GB`
    - optional `tldrs`: `30` files, `6.41 GB`
    - optional `s2orc_v2`: `214` files, `221.51 GB`
- measured the current partial-state reality in warehouse:
  - S2 `2026-03-10` is `loaded` but only has `10` raw papers and `0` raw
    citations
  - PT3 `2026-03-21` has `500000` entity rows and `500000` relation rows but
    is still blocked at release-state level until the repaired runtime is used
- Phase 2 decision:
  - do **not** mint another bounded cohort
  - do **not** treat the existing partial real releases as representative
  - rerun the real PT3 release first, then rerun the real S2 core families,
    then rerun monitored selection on the real pair

### Batch 6 — Phase 2 Fill Execution Started

- restarted only the ingest worker lane so the live queue-backed runtime picked
  up the repaired ingest control path
- verified startup health against the live worker env:
  - Redis `127.0.0.1:57379`
  - warehouse read / write / admin `127.0.0.1:54432`
  - serve read `127.0.0.1:56432`
  - serve admin `127.0.0.1:55432`
- enqueued the full PT3 rerun on the real release:
  - command:
    `python -m app.main enqueue-release pt3 2026-03-21 --force-new-run --requested-by codex --family biocxml --family bioconcepts --family relations`
  - new live run id: `019da910-4208-7701-81cc-78ec4aaf6883`
  - current status at first poll: `loading`
  - current release state at first poll: `ingesting`
- verified the widened PT3 plan in the live worker log:
  - all `10` `biocxml` tarballs are in scope
  - `bioconcepts2pubtator3.gz` is in scope
  - `relation2pubtator3.gz` is in scope
- measured early warehouse movement while the PT3 run remains in `loading`:
  - `pubtator.entity_annotations_stage last_seen_run_id = 019da910-4208-7701-81cc-78ec4aaf6883`
    -> `543330` rows
  - `pubtator.relations_stage last_seen_run_id = 019da910-4208-7701-81cc-78ec4aaf6883`
    -> `16670` rows
- enqueued the real S2 core fill behind the running PT3 job on the same ingest
  lane:
  - command:
    `python -m app.main enqueue-release s2 2026-03-10 --force-new-run --requested-by codex --family publication_venues --family authors --family papers --family abstracts`
  - updated decision:
    - broad `citations` is no longer a corpus-fill prerequisite; citation
      enrichment is mapped-tier and should refetch or stream-filter against
      mapped paper ids later
- operational note:
  - the long-running Phase 2 work is now genuinely in progress on the real
    releases
  - monitored selection on `2026-03-10 + 2026-03-21` stays deferred until both
    reruns return to `release_status = loaded`

## Findings

### Scope and representativeness

- the monitored S2 release sample is only `2` papers total
- this pass is useful for contract validation and anomaly discovery, not for
  estimating final corpus / mapped / evidence volumes
- the wider loaded usable pair confirms the same scaling problem from a
  different angle:
  - the runtime path is healthy
  - but the currently loaded S2 inventory is not yet a representative domain
    cohort for final stage-volume lock

### Phase 1 release-scope gate result

- the true real pair is still blocked upstream:
  - `s2 2026-03-10` is selection-eligible
  - `pt3 2026-03-21` is not yet selection-eligible because its warehouse
    release state is still `ingesting`
- the largest currently usable pair produced:
  - `raw = 10`
  - `corpus = 0`
  - `mapped = 0`
  - `evidence = 0`
- all `10` summary rows were `retired` with `primary_admission_reason =
  selection_retired`
- `corpus_selection_signals` rows for that run: `0`
- interpretation:
  - this is not an implementation-performance failure
  - it is a content / cohort-relevance result
  - the loaded S2 release currently available for a broader run contains no
    papers that the current corpus policy wants to admit
- Phase 1 decision:
  - stage-size lock is still unresolved
  - move to a real release fill pass next, and only revisit stage-volume
    estimates after the warehouse has materially more relevant upstream raw

### Corpus / mapped quality

- `paper_selection_summary` rows in scope: `2`
- status mix: `1 mapped`, `1 retired`
- rows with any current-run signal provenance: `1 / 2`
- `corpus_selection_signals` rows in scope: `15`
- signal mix:
  - `14` `vocab_entity_match` rows totaling `136` mentions
  - `1` `mapped_entity_rule_match` row totaling `26` mentions
- abstract support: `1 / 2`
- locator support: `2 / 2`
- PT3 entity support: `1 / 2`
- PT3 relation support: `0 / 2`
- clear noise row:
  - `corpus_id = 11`
  - PMID `38635510`
  - title `What factors affecting investment decision? The moderating role of fintech self-efficacy`
  - off-topic finance paper, currently `retired`, no current-run support
- defensible active mapped row:
  - `corpus_id = 900001`
  - PMID `30112764`
  - title `Cancer and dementia: Two sides of the same coin?`
  - stable across recent selection runs
  - current-run admission dominated by `vocab_entity_match`
  - current-run promotion comes from one mapped entity rule for
    `Cognitive impairment`
- current mapped risk:
  - promotion is coherent for `900001` but thin
  - the admission family is abbreviation-heavy because alias `AD` dominates the
    corpus admission evidence in this tiny slice
- wider usable-pair cross-check:
  - all `10` rows retired
  - zero admission signals
  - titles span obviously off-domain material such as:
    - Bayesian categorical inference
    - bond splice length
    - legal authority
    - lunar regolith chemistry
  - that result supports the current selector's precision, not a broader
    corpus-size estimate

### Evidence readiness and locator quality

- evidence cohort counts for the monitored run:
  - `evidence_cohort = 1`
  - `evidence_satisfied = 1`
  - `evidence_backlog = 0`
  - `evidence_selected = 0`
- evidence-eligible paper:
  - `corpus_id = 900001`
  - S2 paper id `52013067`
  - PMCID `PMC6220770`
  - abstract-bearing, locator-ready, open-access
  - `entity_annotation_count = 759`
  - `evidence_priority_score = 370`
- latest monitored wave semantics are correct:
  - no backlog remained after the direct evidence-text refresh
  - therefore the bounded wave selected and enqueued `0` rows
- current caution:
  - repeated successful reacquisition of an already satisfied paper appears in
    recent text runs; some of that is explained by explicit forced refresh, but
    it is still worth watching when we widen the cohort

### Full-text structure quality

- active `paper_documents` rows in warehouse: `3`
- documents with zero sections: `0`
- documents with zero blocks: `0`
- documents with zero sentences: `0`
- blocks missing sentence rows: `0`
- `corpus_id = 900001`
  - structurally healthy: `14` sections, `118` blocks, `475` sentences
  - mild labeling anomaly: the tail `CONFLICT OF INTEREST` section also holds
    the references spine
- `corpus_id = 900003`
  - outside the latest monitored selection scope but structurally sane:
    `21` sections, `62` blocks, `444` sentences
  - same low-priority tail-label issue where `Supporting Information` contains
    references
- highest-priority artifact anomaly:
  - `corpus_id = 11` has an active `pmc_bioc` document spine with
    `31` sections, `193` blocks, and `779` sentences
  - but `paper_text.text_availability = 0`
  - and `paper_text.abstract` is empty despite one abstract section and one
    abstract-role block being present in the parsed document
  - this is the clearest warehouse-contract mismatch uncovered in the bounded
    pass

## Suspicious IDs

- high priority: `11`
- mild structural labeling: `900001`
- low-priority structural labeling: `900003`

## Execution Plan

### Phase 1 — Release-Scope Gate

Goal:

- establish what can be learned from the currently loaded warehouse and what
  requires a broader bounded ingest first

Plan:

1. Treat `s2 2026-03-10` + `pt3 2026-03-21` as the next best loaded real pair
   for a wider monitored run because it is the largest real S2 scope currently
   present.
2. Record the resulting `raw -> corpus -> mapped -> evidence cohort ->
   evidence backlog` counts under a fresh selector version.
3. If the `raw` count is still too small to be representative, explicitly mark
   `stage sizing` as unresolved and do not present those counts as a final
   contract.

Exit criteria:

- one wider monitored run recorded against the largest currently loaded real
  pair
- a written yes/no decision on whether the loaded warehouse is sufficient for
  stage-volume lock

### Phase 2 — Corpus Fill / Relevant Cohort Ingest

Goal:

- finish the real upstream releases already present on `/mnt` so the selector
  can populate a meaningful domain corpus from actual release scope instead of
  proving only that truncated or off-domain slices are rejected

Plan:

1. Fix the ingest control-path bug that can regress a `loaded` release row back
   to `ingesting` on a no-op rerun.
2. Rerun the real PT3 release `2026-03-21` with `--force-new-run` and the full
   required families:
   - `biocxml`
   - `bioconcepts`
   - `relations`
3. Rerun the real S2 release `2026-03-10` with `--force-new-run` and the core
   corpus-fill families:
   - `publication_venues`
   - `authors`
   - `papers`
   - `abstracts`
4. Leave `citations`, `s2orc_v2`, and `tldrs` as later tiered waves until stage
   counts stabilize; they are not needed to decide `raw -> corpus -> mapped ->
   evidence`.
5. Once both real releases are back to `loaded`, run a fresh monitored
   `raw -> corpus -> mapped -> evidence` pass on the real pair under a new
   selector version.
6. Record:
   - `raw`
   - `corpus`
   - `mapped`
   - `evidence_cohort`
   - `evidence_backlog`
   - `evidence_selected`
   - phase durations and enqueue outcomes

Exit criteria:

- both real releases are back to `loaded`
- one non-trivial monitored fill run on the real release pair
- at least some admitted `corpus` rows from the current selector
- a clear yes/no on whether the loaded cohort is finally suitable for
  downstream quality audit and contract calibration

### Phase 3 — Warehouse-Wide Artifact Audit

Goal:

- audit the actual quality of the canonicalized paper inventory after the corpus
  has been meaningfully filled

Plan:

1. Build one merged keyed audit table using:
   - `paper_selection_summary`
   - `corpus_selection_signals`
   - `paper_text_acquisition_runs`
   - `paper_text_contract_audit`
2. Key every row by:
   - `corpus_id`
   - `s2_paper_id`
   - `current_status`
   - `top_anomaly_reason`
   - `latest_text_run_outcome`
3. Produce warehouse-wide anomaly buckets:
   - off-topic or low-value corpus/mapped rows
   - thin mapped promotions
   - locator-ready but source-unsatisfied evidence papers
   - document-structure mismatches

Exit criteria:

- one merged audit worksheet saved into the ledger
- ranked anomaly buckets with explicit counts
- a list of keep / inspect / exclude paper ids when needed

### Phase 4 — Corpus And Mapped Contract Calibration

Goal:

- tighten `raw -> corpus` and `corpus -> mapped` from measured signal families
  instead of taste

Plan:

1. Quantify admission-family dominance:
   - journal inventory
   - venue pattern
   - vocab alias/entity hit
2. Quantify promotion-family dominance:
   - mapped journal
   - mapped pattern
   - mapped entity rule
   - mapped relation rule
3. Review false-positive risk from abbreviation-heavy alias families such as
   `AD`.
4. Decide whether mapped promotion needs additional corroboration for
   entity-only cases when PT3 relations are absent.

Exit criteria:

- recommended `corpus admission` rule statement
- recommended `mapped promotion` rule statement
- explicit note on which signal families stay first-gate vs second-gate

### Phase 5 — Evidence Contract And Backlog Hygiene

Goal:

- lock `mapped -> evidence cohort -> evidence backlog` semantics and remove
  ambiguity between eligibility and dispatch

Plan:

1. Keep `evidence cohort`, `evidence satisfied`, `evidence backlog`, and
   `selected / enqueued` as separate measured stages.
2. Audit evidence-ready mapped papers for:
   - recency
   - evidence priority
   - locator readiness
   - active `pmc_bioc` presence
3. Review reacquisition noise to decide whether already-satisfied papers need a
   stronger no-op guard or a separate operator-only refresh path.
4. Use `paper_text_contract_audit` to keep evidence quality separate from
   evidence quantity.

Exit criteria:

- recommended `evidence policy` rule statement
- explicit distinction between `evidence cohort` and `evidence backlog`
- recommendation on reacquisition suppression or acceptance

### Phase 6 — Contract Publication

Goal:

- publish the locked contract once it is supported by measured quality and the
  best available cohort

Plan:

1. Update `docs/rag/05e-corpus-selection.md` with the final locked criteria for
   `corpus`, `mapped`, and `evidence`.
2. Update `docs/rag/02-warehouse-schema.md` if new audit or policy surfaces are
   added.
3. Keep Grafana as the live operator view:
   - criteria in the text panel
   - stage counts in the absolute-count panels
   - backlog dispatch in the selected/enqueued panel
4. If contract review needs richer tabular inspection in Grafana, only add it
   after the rule set is stable.

Exit criteria:

- docs lock proposal ready for `docs/rag`
- Grafana panels aligned with the final contract
- ledger upgraded from active audit to completed contract-review pass

## Immediate Next Pass

This is the concrete next sequence from this ledger:

1. Finish the upstream prerequisites for a real corpus-fill run:
   - repair the ingest control-path bug
   - finish PT3 `2026-03-21`
   - finish S2 `2026-03-10`
2. Run the monitored fill pass on the real pair.
3. Only after that, build the merged warehouse-wide audit table for the
   resulting canonical inventory.
4. Use the fill result plus the merged audit to decide:
   - whether scale can be discussed at all from the loaded warehouse
   - which corpus / mapped / evidence rules are actually defensible
5. If the fill run is still trivial, stop contract tuning and fix cohort ingest
   instead.

## Decision Gates

- If the true PT3 pair is still not `loaded`, release-state repair takes
  precedence over contract tuning.
- If the real S2 release is still only partially loaded, corpus fill takes
  precedence over any warehouse-wide artifact audit.
- If the next relevant fill run still yields `corpus = 0`, do not proceed to
  threshold tuning; fix cohort ingest or source scope first.
- If the larger loaded real pair still yields a trivial `raw` count, do not
  lock final stage-volume expectations.
- If `paper_text_contract_audit` returns more than the current single mismatch,
  artifact-quality repair takes precedence over threshold tuning.
- If mapped promotion remains mostly entity-only without corroboration on the
  wider pass, mapped gating should tighten before evidence-volume expansion.
