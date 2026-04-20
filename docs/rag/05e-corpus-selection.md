# 05e — Canonical Corpus Selection

> **Status**: landed for the selected-corpus builder and the first
> mapped-paper evidence-wave dispatcher under `apps/worker/app/corpus`,
> including the locked ladder `raw -> corpus -> mapped -> evidence`, curated
> vocab materialization into `solemd.vocab_terms` /
> `solemd.vocab_term_aliases`, release-pair run tracking, durable signal
> provenance, canonical-corpus materialization into `papers` / `paper_text` /
> `paper_authors` / `paper_citations` / `pubtator.entity_annotations` /
> `pubtator.relations`, and per-paper selection summary refresh. `mapped`
> promotion now uses journal, venue-pattern, entity-rule, and relation-rule
> families with second-gate logic for noisy entity families. Evidence-wave
> dispatch now runs under `corpus.dispatch_evidence_wave` with wave key
> `evidence_missing_pmc_bioc`, selecting recent, high-signal, locator-aware
> mapped papers and enqueuing them into `evidence.acquire_for_paper`.
> **Provisional**: threshold
> calibration against larger warehouse cohorts, S2ORC-as-canonical
> evidence-source fallback when PMC BioC is absent, and the long-term
> UMLS-backed concept derivation substrate. **Deferred**: full-200 M+ S2
> canonicalization as a single activation event, graph-bundle publication
> policy, S2 embedding fetch for the mapped graph wave, and any operator UI for
> review.
>
> **Date**: 2026-04-19
>
> **Scope**: the worker slice that turns published raw Semantic Scholar and
> PubTator warehouse releases into the selected SoleMD canonical paper corpus.
> This doc sits between raw release ingest (`05`) and downstream chunking /
> graph / retrieval planes (`05a`, `05b`, `07`). It does not redesign raw
> release ingest. It specifies and records the worker lane now landed in
> `apps/worker/app/corpus`.
>
> **Schema authority**: `02-warehouse-schema.md` remains authority for existing
> warehouse tables such as `solemd.corpus`, `solemd.papers`,
> `solemd.paper_text`, `solemd.vocab_terms`, and `solemd.vocab_term_aliases`.
> This doc is the runtime / workflow authority for corpus selection. If this
> slice introduces new durable warehouse tables such as `corpus_selection_runs`,
> `corpus_selection_signals`, `paper_selection_summary`, or revived curated rule
> tables, `02` must be amended in the implementation batch that lands them.

## Purpose

Make one previously implicit decision fully operational:

- **Broad upstream raw** is not the same thing as the **selected canonical
  corpus**.

The Semantic Scholar universe is much larger than the paper universe SoleMD
actually intends to carry into the canonical corpus, then the mapped
paper-level universe, and eventually the evidence subset. The historically
useful ~14 M-paper backbone was not "all of S2." It
was a selected corpus derived from stable domain signals:

- curated journal families
- curated vocabulary and aliases
- PubTator entity / relation evidence
- citation / corroboration gates for ambiguous rule families

This slice exists so downstream workers stop guessing whether "canonical"
means:

1. every paper seen in the upstream raw releases, or
2. the selected paper universe SoleMD intends to enrich, chunk, embed, project,
   and serve.

The answer is **(2)**.

Working ladder for the warehouse contract:

- **full upstream raw**
  - `s2_*_raw`
  - `pubtator.*_stage`
- **selected canonical corpus**
  - broad corpus membership is
    `solemd.corpus.domain_status IN ('corpus', 'mapped')`
  - canonical paper/fact tables: `papers`, `paper_text`, `paper_authors`,
    `paper_citations`, `pubtator.entity_annotations`, `pubtator.relations`
- **mapped**
  - stricter paper-level active universe inside the canonical corpus
  - owns paper-level rollout behaviors such as graph/SPECTER2/UMAP and
    paper-grounded retrieval/indexing
- **evidence**
  - smaller subset inside mapped
  - owns full-text acquisition, chunking, grounding, and evidence-unit
    downstream work

Mapped now absorbs what earlier drafts called "warm." The first-wave runtime
now uses `evidence` naming for the evidence-acquisition lane.

## Current state

The raw-refresh worker lane already exists in `apps/worker/app`, and the
explicit selection lane now exists beside it in `apps/worker/app/corpus`.

- Landed already: release-safe raw ingest for S2 and PubTator into warehouse
  raw / stage tables, and the explicit corpus worker lane that decides which
  raw papers become the selected SoleMD corpus by setting
  `solemd.corpus.domain_status` deterministically.
- Landed in the first wave:
  - `corpus.start_selection` on queue `corpus`
  - `corpus.dispatch_evidence_wave` on queue `corpus` as the first evidence
    dispatcher
  - durable `corpus_selection_runs`, `corpus_selection_signals`,
    `paper_selection_summary`, `corpus_wave_runs`, and `corpus_wave_members`
  - curated-vocab materialization in the `assets` phase
  - corpus admission from exact journal match, curated venue-pattern match,
    and PubTator alias hits against `solemd.vocab_term_aliases`
  - mapped promotion from journal inventory, curated venue patterns, curated
    entity-rule families, and curated relation-rule families, with
    `requires_second_gate` noisy-entity families requiring corroboration from a
    direct mapping signal before final promotion
  - canonical materialization gated by
    `solemd.corpus.domain_status IN ('corpus', 'mapped')`
  - first evidence-wave policy `evidence_missing_pmc_bioc`
- Legacy inventory under
  `legacy/pre-cutover-2026-04-18:engine/app/corpus/` shows how the prior
  selected corpus was actually derived. That inventory is salvage material, not
  authority, but it is the right implementation reference for signal families,
  promotion phases, and curated assets.

The remaining work in this area is no longer "create the selector" or "finish
the corpus boundary." The remaining work is policy calibration and downstream
evidence readiness: preview cohort sizes against larger warehouse releases,
tighten evidence-grade rules, and add source-aware fallback when PMC BioC is
missing but a usable S2 full-text source exists.

## Immediate execution split after `05f`

Because `05f` evidence-text acquisition is now landed, the practical corpus work
split into two tightly related steps rather than one undifferentiated
"selection" block. Both are now implemented in the first production worker:

- **A. Selected-corpus builder**
  - build the worker lane that turns published S2 / PubTator raw releases plus
    curated assets into the durable `corpus -> mapped` warehouse state
  - corpus work has to do two distinct jobs: (1) decide what enters the
    selected canonical corpus from raw upstream data; (2) ensure the canonical
    paper/fact tables actually reflect that selected universe rather than the
    entire raw release breadth
  - this slice therefore owns `solemd.corpus.domain_status`, run tracking,
    signal provenance, per-paper selection summary, and the idempotent
    promotion/backfill boundary into the canonical paper layer
- **B. Mapped-paper rollout + evidence dispatch**
  - once mapped papers exist, define the explicit mapped-paper rollout surfaces
    that fan out from them
  - mapped is the paper-level active universe; paper-level embedding, graph,
    UMAP, and paper-grounded retrieval/indexing should be modeled as mapped
    rollout behavior rather than a separate warm status
  - the immediate landed requirement is a worker-owned dispatcher that selects
    which mapped papers should be enqueued into `evidence.acquire_for_paper`
    (`05f`) for the evidence lane rather than making `05f` guess its own
    target set
  - this dispatch layer must not absorb chunk/evidence work from `05a`

`C` remains downstream:

- **C. Chunking / evidence activation**
  - consume the canonical document spine produced by raw S2ORC and `05f`
  - stays in `05a`, not in the selector or the evidence-text dispatcher

This preserves the intended hierarchy:

`full raw upstream -> selected canonical corpus -> mapped paper-level rollout -> evidence fetch -> chunk/evidence`

## Eight load-bearing properties

1. **Raw release scope and selected corpus scope are different.** Raw S2 /
   PubTator loads can be broad and rebuildable. The selected canonical corpus is
   the smaller intentional paper universe that downstream lanes consume.
2. **Corpus work has two distinct jobs.** It decides `raw -> corpus -> mapped`
   membership in `solemd.corpus`, and it ensures the canonical paper/fact
   tables (`papers`, `paper_text`, `paper_authors`, `paper_citations`,
   `pubtator.entity_annotations`, `pubtator.relations`) actually reflect the
   selected canonical corpus rather than the entire raw release breadth.
   Selection is not just labeling rows.
3. **Selection is reproducible and warehouse-local.** It must be reconstructable
   from published raw releases plus curated editorial assets and versioned rule
   inputs. Live APIs and operator memory are not allowed to define membership.
4. **Selection is a cross-source lane.** The first selector consumes both an S2
   release and a PubTator release together. It is not one source-specific actor
   per upstream source.
5. **Mapping is stricter than corpus admission, and canonical backfill follows
   corpus admission.** Corpus admission is deliberately high-recall.
   `mapped` promotion is the higher-precision decision that defines the active
   paper-level universe inside the canonical corpus. Canonical paper/fact
   promotion/backfill must be idempotent for the full selected corpus, and
   mapped-specific rollout must stay downstream of that broader boundary.
6. **Broad selected-corpus surfaces stop at paper/fact baseline.** The broad
   selected-corpus surfaces are paper metadata/text baseline,
   references/citations, and canonical PubTator entity/relation coverage for
   selected papers. Full-text document spine, chunking, evidence units, and
   OpenSearch evidence indexes are downstream child waves.
7. **Mapped rollout and evidence are child waves, not alternate corpus
   definitions.** Mapped owns the paper-level active universe. Paper-grounded
   retrieval/indexing/embedding is modeled as mapped rollout behavior, not a
   separate warm status. Evidence is the smaller full-text
   parsed/chunked/grounded child wave. Neither wave redefines corpus
   membership.
8. **The historical ~14 M backbone is an explicit result, not an import rule.**
   Reproducing that backbone is a valid target for this slice; silently treating
   "all raw S2 papers" as the selected corpus is forbidden.

## Prerequisites and dependency boundary

The corpus selector has one hard prerequisite and one remaining substrate
follow-on.

### Hard prerequisite

Published upstream raw releases must already exist in warehouse:

- one Semantic Scholar release promoted by the raw-ingest lane
- one PubTator release promoted by the raw-ingest lane

The selector must refuse to start if either upstream release is absent or still
mid-ingest.

### Curated vocab is now materialized; UMLS remains a separate follow-on

The landed selector still starts from the curated assets already present
in-repo:

- `data/vocab_terms.tsv`
- `data/vocab_aliases.tsv`
- `data/nlm_neuro_psych_journals.json`

Those assets encode the editorial vocabulary and journal inventory that the
legacy selector used. The landed `assets` phase versions and checksums them,
bulk-refreshes `solemd.vocab_terms` and `solemd.vocab_term_aliases`, and then
uses those warehouse tables for the later selection phases.

Two follow-up substrate slices are still separate from the first shipped
selector:

- **UMLS concept derivation**
  - load / refresh `umls.*`
  - derive canonical concept surfaces such as `solemd.concepts`,
    `concept_aliases`, `concept_search_aliases`, `concept_xrefs`, and
    `concept_relations`
  - support later UMLS-backed crosswalk generation or concept-centric rule
    synthesis
- **Curated rule-surface expansion**
  - generate or validate journal/entity/relation rule tables from the curated
    vocabulary inputs
  - expand mapped promotion beyond the current journal/pattern-first gate set

Neither should be described as a blocker for the landed first-wave selector.

## Legacy inventory to salvage

The pre-cutover selector was not a vague heuristic. The useful parts should be
modernized and modularized, not rediscovered from scratch.

- `engine/app/corpus/filter.py`
  - Built an initial broad admitted set from normalized journal identity, curated
    venue patterns, and PubTator alias/entity evidence.
  - Assigned a primary `admission_reason` such as `journal_and_vocab`,
    `journal_match`, `pattern_match`, or `vocab_entity_match`.
  - Promoted admitted papers to mapped via curated journal, entity, and relation
    rules.
- `engine/app/corpus/venues.py`
  - Provided the `clean_venue()` normalization contract and an NLM-derived
    journal inventory.
- `engine/app/corpus/vocab.py`
  - Scanned PubTator entities against curated aliases to build PMID-level domain
    evidence without depending on live APIs.
- `engine/app/corpus/vocab_aliases.py`
  - Refreshed the runtime alias catalog from curated TSVs and derived acronym
    aliases safely.
- `engine/db/migrations/004_candidate_tier_and_mapping.sql`
  - Captured the original separation between broad admission and mapped
    promotion, even though the old `candidate` label should now be read as the
    broader `corpus` tier and the old `is_in_current_map` /
    `is_in_current_base` flags themselves should not return.
- `engine/db/migrations/004b_entity_rule.sql` and
  `004c_baseline_expansion_and_relation_rules.sql`
  - Captured the useful conceptual split between journal rules, entity rules,
    relation rules, and confidence / citation gates.
- `engine/db/migrations/020_add_paper_evidence_summary.sql` and
  `038_add_paper_relation_evidence.sql`
  - Captured the useful idea of a durable per-paper derived summary so publish /
    review steps do not have to rescan raw PubTator every time.

## What must not be carried forward

- No monolithic sync script mixing selection, promotion, enrichment, and graph
  side-effects in one file.
- No row-at-a-time loops where set-based SQL or COPY-backed staging is the
  native answer.
- No S2 API as a corpus-admission gate.
- No hardcoded policy lists buried in Python when the value should be a curated
  asset or warehouse rule table.
- No lossy single-string `admission_reason` as the only persisted evidence
  record; multi-signal provenance must survive the run.
- No graph-only quality gates masquerading as corpus membership rules.
- No duplicated gate logic in multiple places.
- No reintroduction of `engine/` as the runtime home.
- No new run-state flags on `solemd.corpus`; run / wave state belongs in run or
  projection tables, not the membership ledger.

## Target implementation

The first production selector should land as a sibling worker lane to `ingest`,
not as a special case buried inside it.

### Runtime layout

Landed structure:

- `apps/worker/app/corpus/__init__.py`
- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/errors.py`
- `apps/worker/app/corpus/cli.py`
- `apps/worker/app/corpus/runtime.py`
- `apps/worker/app/corpus/selection_runtime.py`
- `apps/worker/app/corpus/wave_runtime.py`
- `apps/worker/app/corpus/assets.py`
- `apps/worker/app/corpus/policies.py`
- `apps/worker/app/corpus/materialize.py`
- `apps/worker/app/corpus/selectors/corpus.py`
- `apps/worker/app/corpus/selectors/mapped.py`
- `apps/worker/app/corpus/selectors/provenance.py`
- `apps/worker/app/actors/corpus.py`
- `apps/worker/app/corpus_worker.py`
- `apps/worker/tests/test_corpus_cli.py`
- `apps/worker/tests/test_corpus_runtime.py`

Optional split points:

- `apps/worker/app/corpus/sql/` for large query strings
- `apps/worker/app/corpus/materialize/` if curated asset refresh and selection
  staging become large enough to deserve a dedicated module

Note: the landed runtime now uses `selectors/corpus.py` and the phase name
`corpus_admission`; older `candidate_*` wording in earlier drafts should be
read as historical language rather than an active runtime contract.

### Queue and worker root

- Dramatiq queue: `corpus`
- Worker root: `apps/worker/app/corpus_worker.py`
- Broker bootstrap: reuse `configure_broker()` from `app/broker.py`
- Pool bootstrap: reuse `WorkerPoolBootstrap` from `app/db.py`
- Pools bound for the selector worker process:
  - `warehouse_read`
  - `ingest_write`

The selector must not depend on `warehouse_admin` just to simplify promotion.
All membership and promotion writes stay on `ingest_write`.

### Actor entrypoint

Canonical actor:

```python
corpus.start_selection(
    s2_release_tag,
    pt3_release_tag,
    selector_version,
    force_new_run=False,
    ...
)
```

Notes:

- The selector is keyed by the upstream release pair plus the selector /
  editorial asset version. It is not keyed by one source alone.
- One Dramatiq message represents one full selection run.
- There is no per-shard or per-rule Dramatiq fan-out.
- If any step needs bounded concurrency internally, keep it inside the actor via
  `asyncio.TaskGroup` or semaphore-bounded tasks.

Companion evidence-wave actor:

```python
corpus.dispatch_evidence_wave(
    s2_release_tag,
    pt3_release_tag,
    selector_version,
    wave_policy_key="evidence_missing_pmc_bioc",
    max_papers=...,
)
```

### CLI and dispatch contract

Manual CLI and automated dispatch must enqueue the same validated payload
shape, just as raw ingest does today.

Implemented request model:

```python
class StartCorpusSelectionRequest(BaseModel):
    s2_release_tag: str
    pt3_release_tag: str
    selector_version: str
    force_new_run: bool = False
    trigger: Literal["manual", "dispatch"] = "manual"
    requested_by: str | None = None
    phase_allowlist: tuple[str, ...] | None = None
```

Implemented CLI surfaces:

- `python -m app.main enqueue-corpus-selection ...`
- `python -m app.main dispatch-corpus-selection ...`
- `python -m app.main run-corpus-selection-now ...`
- `python -m app.main enqueue-evidence-wave ...`
- `python -m app.main run-evidence-wave-now ...`

Dispatch does not mean filesystem manifest parsing here. It means:

- resolve or receive the upstream published S2 / PubTator release pair
- resolve the curated asset / selector version
- validate the same `StartCorpusSelectionRequest`
- enqueue the same actor payload

## Plan and run models

The selector should follow the same durable pattern as the raw-ingest lane:

- advisory lock
- deterministic plan payload
- open-or-resume run record
- resumable step list
- terminal failure / abort status
- structured event logging

Recommended plan model:

```python
class CorpusPlan(BaseModel):
    schema_version: int = 1
    s2_release_tag: str
    pt3_release_tag: str
    s2_source_release_id: int
    pt3_source_release_id: int
    selector_version: str
    selection_policy: SelectionPolicy
    plan_checksum: str
    asset_checksums: dict[str, str]
    phases: tuple[str, ...]
```

Implemented phases:

- `assets`
- `corpus_admission`
- `mapped_promotion`
- `canonical_materialization`
- `selection_summary`

Recommended run-identity key:

- `(s2_release_tag, pt3_release_tag, selector_version)`

Recommended advisory-lock key:

- `corpus:{s2_release_tag}:{pt3_release_tag}:{selector_version}`

## Selector lifecycle

### 1. Preflight

Validate before any writes:

- both upstream source releases exist and are `published`
- required raw / stage tables for those releases exist and are populated
- required curated assets are present
- selector / asset checksums can be computed
- requested phases are a subset of the plan phases

Fail fast on deterministic bad-input cases:

- `CorpusSelectionAlreadyInProgress`
- `CorpusSelectionAlreadyPublished`
- `UpstreamReleaseMissing`
- `UpstreamReleaseNotPublished`
- `SelectorPlanDrift`
- `AssetDrift`
- `MissingCuratedAssets`

### 2. Open or resume the selection run

Open or resume a worker-owned run record analogous to `ingest_runs`.

Minimum useful run metadata:

- run id
- upstream source release ids
- selector version
- plan payload / checksum
- phases completed
- last completed phase
- status
- started / completed / failed timestamps
- failure reason

Resume rule:

- if the same plan checksum is still valid and the run is incomplete, resume
  from the next incomplete phase
- if the upstream releases or curated asset checksums differ, fail with
  `SelectorPlanDrift` or `AssetDrift`
- `force_new_run=True` may create a new run only when the prior run is terminal
  and unpublished, never while another run is active

### 3. Materialize selection inputs

Materialize the curated inputs required by the run.

This can be implemented in either of two valid ways for the first slice:

- load curated TSV / JSON assets into temporary or logged staging tables for the
  run, or
- consume already materialized warehouse tables such as
  `solemd.vocab_term_aliases` if a separate curated-vocab slice has already
  populated them

The first selector should not block on the second path existing.

At minimum, materialize:

- normalized journal inventory
- curated venue-pattern overrides
- curated vocab alias catalog
- curated journal / entity / relation promotion rules

Locked first-wave implementation note:

- the landed `assets` phase bulk-refreshes `solemd.vocab_terms` and
  `solemd.vocab_term_aliases` from `data/vocab_terms.tsv` and
  `data/vocab_aliases.tsv`
- journal inventory remains file-backed via `data/nlm_neuro_psych_journals.json`
- mapped promotion rule families are materialized into selector-owned temporary
  tables from versioned embedded policy assets in the worker runtime, not from
  live APIs or operator scripts

### 4. Corpus admission

Corpus admission is intentionally high-recall and warehouse-local.

Primary signal families to preserve:

- normalized journal identity
- curated venue-pattern gaps
- PubTator entity mentions matched against curated aliases

Corpus-admission semantics:

- create or refresh `solemd.corpus` rows for papers hit by at least one stable
  signal
- set `domain_status = 'corpus'` for newly admitted papers
- update `first_seen_at` / `last_seen_at` appropriately
- choose a primary `admission_reason` for operator readability, but also persist
  the detailed signal ledger separately

Primary `admission_reason` precedence should remain stable and explicit:

1. `journal_and_vocab`
2. `journal_match`
3. `pattern_match`
4. `vocab_entity_match`

This preserves continuity with the old selector while no longer pretending that
one string is the whole provenance record.

### 5. Mapped promotion

Mapped promotion is where the stricter paper-level active universe is decided.

Promotion families now locked for the first production worker:

- journal-family promotion
- venue-pattern promotion
- entity-family promotion
- relation-family promotion

Gating principles to preserve:

- high-confidence journal families can promote directly
- high-confidence venue-pattern families can promote directly
- entity and relation families may carry reference-count floors
- ambiguous entity families require a second gate such as:
  - another high-confidence entity family, or
  - a corroborating relation family such as `treat` / `cause`

Locked first-wave mapped policy:

- quality floor: publication year must be `NULL` or `>= 1945`
- direct mapped signals:
  - exact journal-inventory match
  - mapped-promoting venue pattern
  - high-confidence entity-rule hit
  - relation-rule hit
- second-gate entity signals:
  - noisy entity families such as neurotransmitter-gene concepts are recorded
    as mapped signals but only contribute to promotion when corroborated by a
    direct mapped signal in the same paper
- the current worker keeps these rule families in one SQL-backed selector
  contract; summary refresh consumes the same signal ledger rather than
  reimplementing mapping logic

Implementation rule:

- all promotion gates must live in one shared SQL contract or rule surface
- do not duplicate one set of gates in promotion and another in summary refresh

Mapped-promotion semantics:

- promote qualifying `corpus` papers to `mapped`
- leave admitted-but-not-promoted papers as `corpus`
- never fold graph-only quality filters such as pre-1945 / editorial / base-wave
  policy into the membership decision itself
- use `retired` only for explicit rule-version churn, not for run-scoped wave
  membership

### 6. Selection provenance and summary refresh

The selector must leave behind more than `admission_reason`.

Minimum durable outputs:

- a detailed per-paper signal ledger
- a compact per-paper selection summary

Recommended target surfaces:

- `corpus_selection_signals`
  - one row per paper x signal / rule hit x run
  - stores signal kind, family key, matched concept / alias / venue, confidence,
    counts, and whether it contributed to admission or mapped promotion
- `paper_selection_summary`
  - one row per paper
  - stores normalized venue, publication year, locator readiness,
    corpus-admission booleans, mapped-rule booleans, signal counts,
    entity / relation hit counts, promoted family keys, derived mapped /
    evidence priority scores, and the rule / selector version used

Why both are needed:

- the signal ledger preserves auditability and replay
- the summary table avoids rescanning raw PubTator and raw S2 inputs for routine
  review, downstream wave-building, or publish steps

Locked summary additions for the current worker:

- `publication_year`
- `has_locator_candidate`
- `has_mapped_pattern_match`
- `has_mapped_entity_match`
- `has_mapped_relation_match`
- `mapped_entity_signal_count`
- `mapped_relation_signal_count`
- `mapped_priority_score`
- `evidence_priority_score`

### 7. Publish the selection run

A run becomes published only after:

- all requested phases complete successfully
- the run status is advanced to terminal success
- downstream readers can rely on `domain_status = 'mapped'` for that selector
  version

This slice does **not** publish graph bundles, mapped-paper rollout artifacts,
or evidence outputs. It only publishes the selected canonical corpus state in
warehouse.

## Data surfaces this slice should own

### Existing tables it reads or updates

- `solemd.source_releases`
- raw-ingest-controlled `solemd.s2_*_raw` staging / raw tables
- raw-ingest-controlled PubTator raw / stage tables
- `solemd.corpus`
- `solemd.papers`
- `solemd.paper_text`
- `solemd.paper_authors`
- `solemd.paper_citations`
- `pubtator.entity_annotations`
- `pubtator.relations`
- `solemd.vocab_terms`
- `solemd.vocab_term_aliases`

### New durable surfaces this slice should introduce in the implementation batch

Minimum useful new warehouse surfaces:

- `solemd.corpus_selection_runs`
- `solemd.corpus_selection_signals`
- `solemd.paper_selection_summary`

Likely revived curated rule surfaces:

- `solemd.journal_rule`
- `solemd.entity_rule`
- `solemd.relation_rule`

The currently landed worker instead materializes the mapped rule families from
versioned worker-owned policy assets into temp tables inside the selection run.
If these rules later become durable warehouse-local curated tables, they should
still remain warehouse inputs, not serve tables and not graph-run flags.

## Performance and operational rules

1. Use one release-pair actor invocation per selection run. No per-shard or
   per-partition Dramatiq fan-out.
2. Favor set-based SQL over Python loops. Corpus admission and mapped
   promotion should mostly be `INSERT ... SELECT`, `UPDATE ... FROM`, and
   summary refresh queries.
3. Use `COPY` only where it is actually native for loading staged curated assets
   or large signal ledgers. Do not force a file-writer abstraction onto pure SQL
   selection steps.
4. Keep all promotion and membership writes on `ingest_write`.
5. Treat warehouse as a separate cluster. Never route selected-corpus writes
   through serve.
6. Do not depend on future `CREATE` surfaces for later `UNLOGGED` or partition
   tweaks. The first selector must be correct with ordinary warehouse DDL.
7. Keep logs / metrics phase-specific:
   - `corpus.selection.started`
   - `corpus.selection.phase.completed`
   - `corpus.selection.published`
   - `corpus.selection.failed`

## Current telemetry surface

The landed corpus worker telemetry uses Dramatiq's Prometheus
middleware plus `prometheus_client` application metrics on the same
scope-local multiprocess store prepared by `app.telemetry.bootstrap`.
`app.corpus_worker` owns the `corpus` scope and, by default, exposes it
on local port `9465`.

Current corpus-selection metric families:

- `corpus_selection_phase_duration_seconds`
- `corpus_selection_runs_total`
- `corpus_selection_signals_total`
- `corpus_selection_materialized_papers_total`
- `corpus_selection_summary_rows_total`
- `corpus_selection_failures_total`
- `corpus_selection_active_lock_age_seconds`

Current evidence-wave metric families on the same `corpus` scope:

- `corpus_wave_phase_duration_seconds`
- `corpus_wave_runs_total`
- `corpus_wave_members_selected_total`
- `corpus_wave_enqueued_total`
- `corpus_wave_failures_total`
- `corpus_wave_active_lock_age_seconds`

The same `/metrics` listener also carries Dramatiq middleware families
for the `corpus` queue. Keep `WORKER_METRICS_PORT` unset locally so the
`corpus` root stays on its own port rather than colliding with other
queue-owned roots.

## Downstream contract

This doc gives downstream workers two explicit scope rules:

```sql
WHERE c.domain_status IN ('corpus', 'mapped')
```

for broad canonical-corpus membership, and:

```sql
WHERE c.domain_status = 'mapped'
```

for the stricter mapped paper-level active universe.

Selection is not complete until the canonical paper/fact tables reflect the
same canonical corpus universe. Everything else is a child-wave refinement
layered on top of that, with mapped defining the narrower paper-level active
subset.

Therefore:

- chunking (`05a`) consumes evidence-selected mapped papers with chunkable text
  surfaces
- paper-grounded retrieval (`07`) indexes mapped-paper rollout cohorts rather
  than a separate warm status
- graph build consumes mapped papers or an explicit graph wave inside them
- evidence remains the much smaller subset selected from mapped papers and is
  acquired through the `evidence` lane

The selected corpus is the parent universe. Mapped is the paper-level active
universe inside it. Evidence is the granular child subset.

Locked first-wave evidence policy under `wave_policy_key = 'evidence_missing_pmc_bioc'`:

- parent universe: `paper_selection_summary.current_status = 'mapped'`
- only papers missing an active `pmc_bioc` canonical document are eligible
- the evidence wave is locator-aware and currently requires at least one
  canonical PMC / PMID / DOI locator candidate
- the evidence wave is recency-gated and currently admits only papers with
  `publication_year IS NULL OR publication_year >= current_year - 10`
- the evidence wave is high-signal-gated and currently requires
  `evidence_priority_score >= 150`
- ranking then orders by `evidence_priority_score`, `mapped_priority_score`,
  relation/entity rule counts, vocab signal density, and citation/reference
  support

## Explicit follow-on slices after this one

This slice is not the end of the pipeline. It makes the parent corpus explicit.

The next follow-on slices are:

1. **UMLS concept derivation**
   - refresh `umls.*` and canonical concept surfaces for later concept-centric
     mapping and retrieval work.
2. **Policy calibration against real release sizes**
   - preview larger warehouse cohorts and tune corpus breadth, mapped
     precision, and evidence-wave ceilings without changing the durable
     `corpus -> mapped -> evidence` status model.
3. **Mapped-paper rollout / graph-wave selection**
   - define which mapped papers enter the active graph rollout wave.
   - keep paper-level retrieval/indexing/embedding as mapped rollout behavior,
     not as a separate warm status tier.
4. **S2 embedding fetch / materialization for the selected graph wave**
   - fetch or load the S2 embedding surface for mapped graph-wave papers. This
     is where the historical ~14 M ceiling matters, not in the raw selector.
5. **Evidence-source fallback + chunking / evidence-unit activation**
   - add source-aware canonical full-text fallback when PMC BioC is absent but
     a usable S2 document source exists, then build the downstream
     evidence-wave document spine, chunking, and evidence units for mapped
     papers selected into that narrower lane.

This ordering preserves the intended hierarchy:

`full upstream raw -> selected canonical corpus -> mapped paper-level rollout -> evidence subset`

## Definition of done for this slice

The first-wave corpus-selection slice is done when:

1. the selected canonical corpus can be rebuilt reproducibly from published raw
   releases plus curated editorial assets;
2. `solemd.corpus.domain_status` is the unambiguous warehouse source of truth
   for both canonical-corpus membership and mapped-paper eligibility;
3. the canonical paper/fact tables reflect the canonical corpus universe rather
   than the full raw release breadth;
4. manual CLI and automated dispatch enqueue the same validated request payload;
5. rerunning the same release pair / selector version is idempotent and
   resume-safe;
6. at least one integration test proves deterministic corpus + mapped resume
   behavior for a combined S2 / PubTator sample;
7. at least one end-to-end local sample selection writes real warehouse rows,
   updates the selection run table, and dispatches a bounded mapped subset into
   the evidence-acquisition lane under wave key
   `evidence_missing_pmc_bioc` (`evidence` in the current downstream runtime);
8. downstream chunking / graph / mapped-paper rollout workers no longer need
   to read legacy
   `engine/app/corpus/*` to know what papers they are allowed to consume;
9. if new durable rule / run / provenance tables are introduced, `02` is
   amended in the same implementation batch.

## Recommended remaining implementation order

1. Calibrate the locked corpus/mapped/evidence policies against larger real
   release cohorts before raising volume ceilings.
2. Add source-aware evidence fallback so the evidence lane can use a canonical
   non-PMC document source when PMC BioC is absent.
3. Keep downstream handoff explicit:
   mapped-paper rollout and evidence child waves consume mapped papers only.
4. Preserve deterministic resume and replay:
   rerunning the same release/rule set must reproduce the same mapped universe.

This slice should modernize the prior selector, not port the old script.
