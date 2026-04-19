# 05e — Canonical Corpus Selection

> **Status**: locked for the separation between broad upstream raw releases and
> the selected canonical corpus, the use of `solemd.corpus` as the durable
> selection ledger, the `candidate -> mapped -> retired` progression, the
> worker-runtime home under `apps/worker/app`, the one-message-per-selection-run
> topology, and the downstream rule that chunking / graph / warm retrieval only
> consume mapped papers or an explicit child wave of them. **Provisional**: the
> exact warehouse DDL for revived selection-rule / provenance tables, the first
> graph-wave policy after mapping, and the long-term UMLS-backed vocabulary
> refresh substrate. **Deferred**: full-200 M+ S2 canonicalization as a single
> activation event, graph-bundle publication policy, S2 embedding fetch for the
> mapped graph wave, and any operator UI for review.
>
> **Date**: 2026-04-18
>
> **Scope**: the worker slice that turns published raw Semantic Scholar and
> PubTator warehouse releases into the selected SoleMD canonical paper corpus.
> This doc sits between raw release ingest (`05`) and downstream chunking /
> graph / retrieval planes (`05a`, `05b`, `07`). It does not redesign raw
> release ingest. It specifies the next worker lane to build in
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
actually intends to carry into graph, warm retrieval, and eventually hot
evidence. The historically useful ~14 M-paper backbone was not "all of S2." It
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

## Current state

The raw-refresh worker lane already exists in `apps/worker/app`, but the
explicit selection lane does not.

- Landed already: release-safe raw ingest for S2 and PubTator into warehouse
  raw / stage tables, plus first canonical warehouse promotion paths.
- Not landed yet: the explicit selection worker that decides which raw papers
  become the selected SoleMD corpus by setting `solemd.corpus.domain_status`
  deterministically.
- Legacy inventory under
  `legacy/pre-cutover-2026-04-18:engine/app/corpus/` shows how the prior
  selected corpus was actually derived. That inventory is salvage material, not
  authority, but it is the right implementation reference for signal families,
  promotion phases, and curated assets.

This is the next slice that should land before chunking, graph-bundle
selection, or S2 embedding fetch are scaled beyond a narrow test cohort.

## Immediate execution split after `05f`

Because `05f-hot-text-acquisition.md` is now landed, the practical next work
should be treated as two tightly related steps rather than one undifferentiated
"selection" block:

- **A. Selected-corpus builder**
  - build the worker lane that turns published S2 / PubTator raw releases plus
    curated assets into the durable `candidate -> mapped` warehouse state
  - this is the actual implementation of the selected canonical corpus
  - this slice owns `solemd.corpus.domain_status`, run tracking, signal
    provenance, and per-paper selection summary
- **B. Mapped-paper hot/warm dispatch**
  - once mapped papers exist, define the first explicit child-wave surfaces that
    fan out from them
  - the immediate requirement is a worker-owned dispatcher that selects which
    mapped papers should be enqueued into `hot_text.acquire_for_paper`
    (`05f`) rather than making `05f` guess its own target set
  - this dispatch layer may also define a warm / graph child-wave contract, but
    it must not absorb chunk/evidence work from `05a`

`C` remains downstream:

- **C. Chunking / evidence activation**
  - consume the canonical document spine produced by raw S2ORC and `05f`
  - stays in `05a`, not in the selector or the hot-text dispatcher

This preserves the intended hierarchy:

`full raw upstream -> selected canonical corpus -> child waves -> hot-text fetch -> chunk/evidence`

## Eight load-bearing properties

1. **Raw release scope and selected corpus scope are different.** Raw S2 /
   PubTator loads can be broad and rebuildable. The selected canonical corpus is
   the smaller intentional paper universe that downstream lanes consume.
2. **`solemd.corpus` is the durable membership ledger.** For this slice:
   `candidate` means "admitted by at least one stable domain signal";
   `mapped` means "inside the selected canonical corpus"; `retired` means
   "historically admitted but no longer active after an explicit rules change."
3. **Selection is reproducible and warehouse-local.** It must be reconstructable
   from published raw releases plus curated editorial assets and versioned rule
   inputs. Live APIs and operator memory are not allowed to define membership.
4. **Selection is a cross-source lane.** The first selector consumes both an S2
   release and a PubTator release together. It is not one source-specific actor
   per upstream source.
5. **Mapping is stricter than admission.** Candidate admission is deliberately
   high-recall. `mapped` promotion is the higher-precision decision that defines
   the selected canonical corpus.
6. **Enrichment is downstream of selection.** S2 API enrichment, references
   sync, citation expansion, OpenAlex hints, chunking, graph embeddings, warm
   indexing, and hot promotion all happen after a paper is mapped. They do not
   decide corpus admission.
7. **Warm / graph / hot are child waves, not alternate corpus definitions.**
   Warm retrieval and graph build read the selected canonical corpus or an
   explicit child wave of it. Hot evidence remains the much smaller
   `practice_hot` cohort on serve.
8. **The historical ~14 M backbone is an explicit result, not an import rule.**
   Reproducing that backbone is a valid target for this slice; silently treating
   "all raw S2 papers" as the selected corpus is forbidden.

## Prerequisites and dependency boundary

The corpus selector has one hard prerequisite and one optional substrate
prerequisite.

### Hard prerequisite

Published upstream raw releases must already exist in warehouse:

- one Semantic Scholar release promoted by the raw-ingest lane
- one PubTator release promoted by the raw-ingest lane

The selector must refuse to start if either upstream release is absent or still
mid-ingest.

### Optional substrate prerequisites: curated vocab materialization and UMLS

The first selector **does not require** a prior combined vocab / UMLS substrate
lane. It can start from the curated assets already present in-repo:

- `data/vocab_terms.tsv`
- `data/vocab_aliases.tsv`
- `data/nlm_neuro_psych_journals.json`

Those assets already encode the editorial vocabulary and journal inventory that
the legacy selector used. They are sufficient for the first production selector
as long as the selection run versions and checksums them.

Two follow-up substrate slices are still needed, but they should remain
separate:

- **Curated-vocab materialization**
  - refresh or materialize `solemd.vocab_terms`
  - refresh or materialize `solemd.vocab_term_aliases`
  - generate or validate rule-seed artifacts from curated vocabulary inputs
  - make Postgres-backed vocab assets the long-term runtime authority instead of
    file parsing
- **UMLS concept derivation**
  - load / refresh `umls.*`
  - derive canonical concept surfaces such as `solemd.concepts`,
    `concept_aliases`, `concept_search_aliases`, `concept_xrefs`, and
    `concept_relations`
  - support later UMLS-backed crosswalk generation or concept-centric rule
    synthesis

Neither should be described as a blocking prerequisite for shipping the first
selector skeleton. Until the curated-vocab materialization slice lands, the
selector may bootstrap from the curated TSV / JSON assets directly, provided
the run records their checksums in the plan manifest.

## Legacy inventory to salvage

The pre-cutover selector was not a vague heuristic. The useful parts should be
modernized and modularized, not rediscovered from scratch.

- `engine/app/corpus/filter.py`
  - Built an initial candidate set from normalized journal identity, curated
    venue patterns, and PubTator alias/entity evidence.
  - Assigned a primary `admission_reason` such as `journal_and_vocab`,
    `journal_match`, `pattern_match`, or `vocab_entity_match`.
  - Promoted candidates to mapped via curated journal, entity, and relation
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
  - Captured the original separation between candidate admission and mapped
    promotion, even though the old `is_in_current_map` / `is_in_current_base`
    flags themselves should not return.
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

Target structure:

- `apps/worker/app/corpus/__init__.py`
- `apps/worker/app/corpus/models.py`
- `apps/worker/app/corpus/errors.py`
- `apps/worker/app/corpus/cli.py`
- `apps/worker/app/corpus/runtime.py`
- `apps/worker/app/corpus/assets.py`
- `apps/worker/app/corpus/selectors/candidate.py`
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

### CLI and dispatch contract

Manual CLI and automated dispatch must enqueue the same validated payload
shape, just as raw ingest does today.

Recommended request model:

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

Recommended CLI surfaces:

- `python -m app.main enqueue-corpus-selection ...`
- `python -m app.main dispatch-corpus-selection ...`

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
    plan_checksum: str
    asset_checksums: dict[str, str]
    phases: tuple[str, ...]
```

Recommended phases:

- `assets`
- `candidate_admission`
- `mapped_promotion`
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

### 4. Candidate admission

Candidate admission is intentionally high-recall and warehouse-local.

Primary signal families to preserve:

- normalized journal identity
- curated venue-pattern gaps
- PubTator entity mentions matched against curated aliases

Candidate-admission semantics:

- create or refresh `solemd.corpus` rows for papers hit by at least one stable
  signal
- set `domain_status = 'candidate'` for newly admitted papers
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

Mapped promotion is where the selected canonical corpus is decided.

Promotion families to preserve:

- journal-family promotion
- entity-family promotion
- relation-family promotion

Minimum first-wave requirement:

- the first production selector should be able to ship with alias-based
  candidate admission plus journal / manual-venue mapped promotion
- richer entity / relation promotion should use the same lane and plan shape,
  but it may be staged behind curated rule-materialization work rather than
  blocking the first end-to-end worker proof

Gating principles to preserve:

- high-confidence journal families can promote directly
- entity families may carry citation floors
- ambiguous entity families require a second gate such as:
  - another high-confidence entity family, or
  - a corroborating relation family such as `treat` / `cause`

Implementation rule:

- all promotion gates must live in one shared SQL contract or rule surface
- do not duplicate one set of gates in promotion and another in summary refresh

Mapped-promotion semantics:

- promote qualifying `candidate` papers to `mapped`
- leave admitted-but-not-promoted papers as `candidate`
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
  - stores normalized venue, signal flags, entity / relation hit counts,
    promoted family keys, and the rule / selector version used

Why both are needed:

- the signal ledger preserves auditability and replay
- the summary table avoids rescanning raw PubTator and raw S2 inputs for routine
  review, downstream wave-building, or publish steps

### 7. Publish the selection run

A run becomes published only after:

- all requested phases complete successfully
- the run status is advanced to terminal success
- downstream readers can rely on `domain_status = 'mapped'` for that selector
  version

This slice does **not** publish graph bundles, warm indexes, or hot evidence.
It only publishes the selected canonical corpus state in warehouse.

## Data surfaces this slice should own

### Existing tables it reads or updates

- `solemd.source_releases`
- raw-ingest-controlled `solemd.s2_*_raw` staging / raw tables
- raw-ingest-controlled PubTator raw / stage tables
- `solemd.corpus`
- `solemd.papers`
- optionally `solemd.vocab_terms` and `solemd.vocab_term_aliases`

### New durable surfaces this slice should introduce in the implementation batch

Minimum useful new warehouse surfaces:

- `solemd.corpus_selection_runs`
- `solemd.corpus_selection_signals`
- `solemd.paper_selection_summary`

Likely revived curated rule surfaces:

- `solemd.journal_rule`
- `solemd.entity_rule`
- `solemd.relation_rule`

These should be treated as warehouse-local curated rule inputs, not as serve
tables and not as graph-run flags.

## Performance and operational rules

1. Use one release-pair actor invocation per selection run. No per-shard or
   per-partition Dramatiq fan-out.
2. Favor set-based SQL over Python loops. Candidate admission and mapped
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

## Downstream contract

This doc gives downstream workers one explicit scope rule:

```sql
WHERE c.domain_status = 'mapped'
```

Everything else is a child-wave refinement layered on top of that.

Therefore:

- chunking (`05a`) consumes mapped papers with chunkable text surfaces
- warm retrieval (`07`) indexes an explicit warm wave inside mapped papers
- graph build consumes mapped papers or an explicit graph wave inside them
- hot evidence remains the much smaller serve-controlled `practice_hot` cohort

The selected corpus is the parent universe. These are child projections.

## Explicit follow-on slices after this one

This slice is not the end of the pipeline. It makes the parent corpus explicit.

The next follow-on slices are:

1. **Curated-vocab materialization**
   - refresh `solemd.vocab_terms`, `solemd.vocab_term_aliases`, and rule-seed
     materialization so curated vocabulary stops being file-first.
2. **UMLS concept derivation**
   - refresh `umls.*` and canonical concept surfaces for later concept-centric
     mapping and retrieval work.
3. **Graph-wave / graph-bundle selection**
   - define which mapped papers enter the active graph rollout wave.
4. **S2 embedding fetch / materialization for the selected graph wave**
   - fetch or load the S2 embedding surface for mapped graph-wave papers. This
     is where the historical ~14 M ceiling matters, not in the raw selector.
5. **Chunking / evidence-unit activation**
   - build the sentence / block / chunk / evidence spine for mapped papers.

This ordering preserves the intended hierarchy:

`full upstream raw -> selected canonical corpus -> {graph projection, warm retrieval projection} -> hot evidence subset`

## Definition of done for this slice

The corpus-selection slice is done when:

1. the selected canonical corpus can be rebuilt reproducibly from published raw
   releases plus curated editorial assets;
2. `solemd.corpus.domain_status` is the unambiguous warehouse source of truth
   for downstream paper eligibility;
3. manual CLI and automated dispatch enqueue the same validated request payload;
4. rerunning the same release pair / selector version is idempotent and
   resume-safe;
5. at least one integration test proves deterministic candidate + mapped resume
   behavior for a combined S2 / PubTator sample;
6. at least one end-to-end local sample selection writes real warehouse rows and
   updates the selection run table;
7. downstream chunking / graph / warm workers no longer need to read legacy
   `engine/app/corpus/*` to know what papers they are allowed to consume;
8. if new durable rule / run / provenance tables are introduced, `02` is
   amended in the same implementation batch.

## Recommended implementation order

1. Add the worker skeleton:
   `app/corpus`, `app/actors/corpus.py`, `app/corpus_worker.py`, CLI, request
   model, runtime, and tests.
2. Implement preflight:
   upstream release validation, advisory lock, plan build, open-or-resume run.
3. Implement curated asset materialization:
   venue normalization assets, vocab aliases, and rule inputs.
4. Implement candidate admission:
   journal, pattern, and vocab-signal high-recall admission.
5. Implement mapped promotion:
   journal, entity, relation, and citation / corroboration gates.
6. Implement provenance / summary refresh:
   durable audit surface plus compact per-paper summary.
7. Wire the downstream handoff:
   chunking / graph / warm workers consume mapped papers only.

This slice should modernize the prior selector, not port the old script.
