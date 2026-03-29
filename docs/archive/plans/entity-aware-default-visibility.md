# Entity-Aware Default Visibility

> This is an upstream **base-admission policy** document.
> Forward-looking runtime work is now tracked in [../design/future.md](../design/future.md).

Status: Implemented architecture / policy v4
Date: 2026-03-27
Scope: Narrow first paint without collapsing the broader graph substrate

## Purpose

Document the implemented path for narrowing the graph's **default-visible**
cohort so the initial map is centered on the neuroscience / psychology /
psychiatry / neuropsychiatry / neurology overlap, while preserving:

- the full `~14M` corpus
- the broader mapped/renderable graph substrate
- the native Cosmograph + DuckDB runtime architecture already stabilized

This is the policy layer that followed `render-cohort-stabilization.md`.
The architectural split is now in place and `core_rescue_bridge_v5` is the
active centralized policy version. The important journal expansion now runs
through `solemd.journal_family`, which is deliberately visibility-only and kept
separate from `solemd.venue_rule` graph-tier promotion.

`v3` adds a bounded representative-rescue path for `rescue.canonical_neuro`
journals. This is the mechanism for journals like `Brain Research` or `Journal
of Neuroscience`: they can surface representative papers on first paint without
regaining blanket venue-driven admission.

`v5` keeps those flagship journal families in the centralized policy system,
but restores the canonical renderability guard. Curated journals like `NEJM`,
`JAMA`, `Lancet`, `World Psychiatry`, `Neuron`, and `Cell` can still become
`core` or `bridge`, but only if they are already renderable under the spatial
outlier filter.

---

## The Actual Product Question

The question is not:

- should these papers exist in the corpus?
- should these papers be mapped at all?

The question is:

- should these papers be in the **first thing the user sees** when the graph opens?

That means the main problem is **default-visible policy**, not corpus membership
and not renderability.

---

## Current Architecture

The graph stack now separates three concepts correctly:

1. **Renderable cohort**
   - engine/export-owned
   - published to the browser as the canonical base-point substrate
   - dense browser-facing `point_index`
   - no browser-side reindexing, render filtering, or link remapping

2. **Default-visible cohort**
   - upstream-generated policy field: `is_default_visible`
   - synced onto `solemd.corpus` for the current published run
   - carried into the base-point artifact during export
   - intended to support first-paint / initial emphasis policy

3. **Current visible / emphasized set**
   - frontend-local read model only
   - native Cosmograph + Mosaic visibility clauses
   - DuckDB-local visibility-budget query over base points

Current implementation detail:

- `default-visible` is canonical and distinct from renderability
- graph-db materializes compact run-scoped outputs:
  - `default_visibility_lane`
  - `default_visibility_rank`
  - `is_default_visible`
- the browser uses `is_default_visible = true` only for first paint through a
  native `baseline:*` Cosmograph visibility clause
- the broader renderable cohort remains local in DuckDB and becomes available
  immediately once native visibility interactions expand or replace that
  baseline

---

## Why This Is The Right Next Step

The user concern is valid:

- many papers in the current mapped/renderable graph are technically legitimate
  graph-tier papers
- but some are still weakly related to the actual C-L neuro / psych interest
  space
- they add noise to first paint even if they are still useful for broader
  retrieval, bridge exploration, or later reveal

The architecture now in place is exactly what made this fix possible:

- keep the corpus broad
- keep the renderable cohort broader than first paint
- narrow only the default-visible cohort

That gives a cleaner initial map without losing the broader mapped universe
that search / timeline / filters can still emphasize later.

---

## What This Should Not Become

Do **not** solve this by:

- removing off-interest papers from the full corpus
- shrinking renderability to match the first-paint baseline
- pushing browser-side filters into `session.ts`
- rebuilding point tables in JS
- treating `is_default_visible` as render eligibility
- forcing every product question into the current search budget lane

Those would undo the boundaries we just cleaned up.

---

## Correct Architectural Interpretation

### Corpus membership

Broad by design.

The corpus should remain generous enough to preserve:

- bridge papers
- systemic medicine overlap
- general-medical contexts where neuropsychiatric concepts matter
- future retrieval / evidence workflows outside the map's first paint

### Renderable cohort

Still broader than first paint.

This is the mapped local substrate that makes the graph feel alive:

- points already have coordinates
- points can appear instantly after search, timeline, or filter changes
- the browser can emphasize them without fetching or rebuilding

### Default-visible cohort

This is where the interest-space policy belongs.

This cohort should answer:

- what is the best initial map for a neuro / psych / neuropsychiatric user?
- what deserves first-paint emphasis before any interaction?

This can be narrower than the renderable cohort while preserving the larger
renderable universe underneath.

---

## Important Constraint

The right answer is probably **not**:

- "only papers with at least one vocab entity"

That is directionally useful, but too blunt as the final policy.

Why:

- it may exclude important bridge papers
- it may over-reward trivial single-hit papers
- it can become too lexical and too brittle
- it does not account for cluster context, centrality, or bridge importance

A better policy is:

- dense core of clearly in-domain papers
- plus a bounded quota of high-value bridge papers
- plus optionally some representative coverage per retained cluster

This keeps the first paint on-topic without amputating the C-L overlap.

---

## Recommended Direction

Treat `is_default_visible` as a **scored admission policy** into the initial map,
not a simple mirror of renderability and not a raw one-hit entity gate.

Implemented shape:

1. Keep the current broad renderable mapped cohort.
2. Materialize reusable run-scoped features in `solemd.graph_visibility_features`.
3. Adjudicate each paper into `core`, `rescue`, `bridge`, or `hidden`.
4. Export compact base outputs:
   - `is_default_visible`
   - `default_visibility_lane`
   - `default_visibility_rank`
5. Preserve enough bridge structure so the initial map does not become a narrow
   monoculture.

---

## Candidate Signal Families

These should be computed upstream, not in the browser.

### Strong positive signals

- venue membership in core neuro / psych / neuropsychiatric space
- `entity_rule` matches for high-value concept families
- `relation_rule` matches that are core to the target clinical-neuroscience
  space
- cluster labels strongly aligned with the target domain
- paper title / abstract / search-text affinity to curated domain seed terms
- citation centrality within the induced in-domain subgraph
- high-confidence mapped clusters whose representatives are clearly within scope

### Moderate positive signals

- papers in systemic specialties that repeatedly co-occur with target concepts
- bridge papers connecting psychiatry / neurology to critical care, nephrology,
  endocrine, oncology, cardiology, rheumatology, GI, and related C-L domains
- papers frequently co-cited by clearly in-domain papers

### Negative signals

- broad off-topic mapped papers with weak concept alignment
- clusters whose representatives are clearly outside the intended domain
- low-information or low-quality edge cases already downweighted elsewhere
- spatial outliers or noise-like regions already excluded from renderability

---

## Candidate Policy Variants To Test

These are useful experiments, not final recommendations.

### A. `entity_rule` concepts only

Very tight.

Pros:

- high precision
- easy to explain
- already uses curated domain concepts

Cons:

- probably too narrow
- misses valid bridge papers and adjacent concepts

### B. `entity_rule` + `relation_rule` concepts

Slightly broader.

Pros:

- keeps curated core plus toxicity / syndrome bridge families

Cons:

- still likely too brittle as a final rule

### C. Broader entity-type gating

Example:

- all `disease` and `chemical` entities above some frequency floor

Pros:

- broader recall

Cons:

- much noisier
- weak domain precision

### D. Curated interest-space vocabulary table

Create a new explicit table broader than `entity_rule` but still hand-gated.

Pros:

- cleanest long-term policy surface
- explicit and inspectable

Cons:

- curation overhead

### E. Paper-level score from multiple signals

Example:

- entity alignment
- venue alignment
- bridge score
- cluster/domain score
- optional minimum entity-count or concept-diversity rules

Pros:

- best long-term direction
- matches the architecture we just built

Cons:

- needs analysis and tuning

Recommended starting point:

- use A/B as measurement baselines
- aim to land on E

---

## Better Framing

The first-paint baseline should be:

- high precision
- not purely lexical
- bridge-aware
- cluster-aware

In practice that suggests:

- a domain-core score
- a bridge score
- a final quota policy

Example conceptual policy:

- admit all papers above a strong domain-core threshold
- then admit the best bridge papers up to a capped fraction
- then guarantee some minimum representation for retained clusters if needed

This is much safer than a single boolean rule like "has one vocab hit".

---

## Where The Policy Should Live

The right integration point is still the engine-side render/default-visible
policy layer.

Relevant files:

| File | Why |
|------|-----|
| `engine/app/graph/render_policy.py` | canonical render / default-visible policy surface |
| `engine/app/graph/build.py` | publish + backfill sync onto `solemd.corpus` |
| `engine/app/graph/export_bundle.py` | carries per-run `is_default_visible` into the base bundle |
| `features/graph/stores/slices/visibility-slice.ts` | separate runtime emphasis lane, downstream of upstream policy |
| `features/graph/duckdb/session.ts` | local query/read-model layer, not where policy should be invented |

Important correction:

- do **not** solve this by changing renderability to equal the narrower baseline
- instead, split `default_visible_point_predicate_sql(...)` from the current
  renderable predicate, or move to a scored helper that still preserves the
  broader renderable cohort

---

## Analysis Queries To Run First

Before locking a policy, measure how much survives under different variants.

### How many graph-tier papers have at least one `entity_rule` match?

```sql
SELECT COUNT(DISTINCT c.corpus_id)
FROM solemd.corpus c
JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
JOIN solemd.entity_rule er
  ON er.entity_type = ea.entity_type
 AND er.concept_id = ea.concept_id
WHERE c.corpus_tier = 'graph';
```

### How many have at least one broader disease/chemical annotation?

```sql
SELECT COUNT(DISTINCT c.corpus_id)
FROM solemd.corpus c
JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
WHERE c.corpus_tier = 'graph'
  AND ea.entity_type IN ('disease', 'chemical');
```

### Distribution of entity counts per graph-tier paper

```sql
SELECT
  CASE
    WHEN cnt = 0 THEN '0'
    WHEN cnt BETWEEN 1 AND 3 THEN '1-3'
    WHEN cnt BETWEEN 4 AND 10 THEN '4-10'
    ELSE '10+'
  END AS bucket,
  COUNT(*) AS papers
FROM (
  SELECT c.corpus_id, COUNT(ea.pmid) AS cnt
  FROM solemd.corpus c
  LEFT JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
  WHERE c.corpus_tier = 'graph'
  GROUP BY c.corpus_id
) sub
GROUP BY 1
ORDER BY 1;
```

### Additional analysis worth adding

- overlap of `entity_rule` vs `relation_rule` hits
- counts by venue class
- counts by cluster label
- counts by cluster size
- bridge specialty breakdown
- how many current renderable points would remain under candidate policies

---

## UX / Runtime Implications

If the default-visible set shrinks materially:

- first paint becomes less dense and more on-topic
- the broader renderable cohort can still remain local in DuckDB
- search/timeline/filter can still expand emphasis into the broader mapped
  universe
- a "show all renderable" or equivalent affordance may still be useful later,
  but it should not be required to preserve the architecture

Important note:

- the base bundle already carries `is_default_visible`
- the field is available end-to-end
- but the main unresolved step is the upstream narrowing policy itself, not a
  browser-side workaround

---

## Suggested Implementation Sequence

### Phase 1: Define the upstream policy

- decide what "interest space" means operationally
- choose score inputs
- choose quota / guardrail rules
- measure how many papers would remain under candidate policies

### Phase 2: Materialize it in the engine

- compute `default_visible_score` or equivalent during build/export
- keep `renderable` and `default-visible` distinct
- derive `is_default_visible` from that canonical score/policy
- record QA counts per policy family

### Phase 3: Update first-paint behavior

- let initial emphasis respect the narrower `is_default_visible`
- keep the broader renderable cohort local and revealable
- do not push this logic into browser-side filtering code

### Phase 4: Tune against real graph behavior

- inspect the opening map visually
- inspect whether important bridge regions remain represented
- inspect whether obvious off-domain regions drop out
- inspect whether search still expands naturally into the broader mapped cohort

---

## Questions To Answer In The Next Context

1. What are the must-have interest-space signals?
2. What are the must-keep bridge specialties?
3. Do we want:
   - cluster-level admission
   - paper-level admission
   - or a mixed policy?
4. Should first paint be:
   - only default-visible points emphasized while other renderable points remain
     present but greyed
   - or a truly narrower initially shown subset?
5. Do we want to export a scored field for future runtime tuning even if the
   boolean stays upstream-owned?

---

## Recommended Starting Position

Start with this assumption:

- renderable cohort stays broad
- default-visible becomes narrower
- bridge papers are admitted intentionally, not accidentally
- browser runtime remains structurally unchanged

That gives the best first paint without undoing the architecture we just fixed.

---

## Concrete Proposal: Core / Rescue / Bridge

This proposal keeps all canonical policy inside SoleMD.Graph's own database and
export path.

No external service-specific dependency is required. The policy should be
computed from the existing `solemd` + `pubtator` tables already present in the
project database, then exported into the graph bundle as compact base fields.

### Product rule

Default-visible should be a three-lane admission policy:

- `core`
  - clearly in-domain papers
  - included by default
- `rescue`
  - venue-led papers that would be too weak alone, but sit inside a strongly
    in-domain cluster
  - included by default, but bounded
- `bridge`
  - intentionally retained adjacent papers that preserve C-L overlap and
    cross-specialty continuity
  - included by default, but capped

Everything else remains:

- in corpus
- in graph tier if already promoted
- renderable if it passed renderability
- available for later reveal via search / timeline / filters

It is simply not first-paint visible.

### Implemented database columns

#### `solemd.graph`

Add run-scoped point-policy columns here. This is the canonical location for
paper-level default-visible policy for a specific graph run.

- `default_visibility_lane TEXT NOT NULL DEFAULT 'hidden'`
  - allowed values: `core`, `rescue`, `bridge`, `hidden`
- `default_visibility_rank REAL NOT NULL DEFAULT 0`
  - final paper-level score used to sort / cap admissions

The heavier evidence decomposition now lives in the run-scoped
`solemd.graph_visibility_features` table rather than being copied onto
`solemd.graph`.

#### `solemd.graph_clusters`

Add compact cluster-rescue metadata here.

- `domain_core_count INTEGER`
  - number of papers in the cluster with direct domain signal
- `domain_core_fraction REAL`
  - `domain_core_count / paper_count`
- `rescue_count INTEGER`
  - how many journal-only papers were admitted through rescue
- `bridge_count INTEGER`
  - how many papers were admitted through bridge quota
- `rescue_enabled BOOLEAN NOT NULL DEFAULT false`
  - cluster is eligible to rescue bounded venue-only papers

### Tier rules

#### `core`

Paper is `core` if any of the following is true:

- `has_vocab_domain_signal = true`
- `has_entity_rule_hit = true`
- `has_relation_rule_hit = true`

This keeps the default-visible baseline centered on direct domain evidence
instead of venue identity alone.

#### `rescue`

Paper is `rescue` when all of the following are true:

- `is_journal_only = true`
- paper is in a cluster with `domain_core_fraction >= 0.35`
- paper ranks near the top of its cluster by citation prominence
  - recommended starting guardrail:
    - top `15%` of cluster papers by citation count
    - minimum `25`
    - maximum `150`

Interpretation:

- the paper is weak if judged alone
- but the neighborhood around it is clearly in-domain
- so it gets rescued in a bounded way instead of discarded

This is the main anti-overrestriction lane.

#### `bridge`

Paper is `bridge` when all of the following are true:

- paper is not already `core`
- cluster has some real in-domain mass, but not enough for `rescue`
  - recommended starting band:
    - `domain_core_fraction >= 0.15`
    - and `< 0.35`
- paper ranks high enough within that cluster to represent the bridge region
  - recommended starting guardrail:
    - top `5%` of cluster papers by citation count
    - minimum `10`
    - maximum `50`

Global cap:

- `bridge` should be capped to a fixed fraction of the final default-visible
  set
- recommended starting cap: `10-15%`

This keeps adjacent oncology / neurosurgery / systemic medicine overlap
available without letting venue-only adjacency flood first paint.

#### `hidden`

Everything else is `hidden` for first paint:

- still renderable if it passed render policy
- still searchable
- still revealable later

### Recommended scoring model

Start simple and keep the tier explainable.

Example:

```text
domain_core_score =
  4.0 * has_vocab_domain_signal
+ 3.0 * has_entity_rule_hit
+ 2.5 * has_relation_rule_hit
+ 0.5 * log1p(paper_entity_count)

bridge_score =
  2.0 * is_journal_only
+ 2.0 * cluster_domain_core_fraction
+ 0.5 * cluster_citation_rank_boost

default_visibility_rank =
  domain_core_score + bridge_score
```

The boolean tier decision remains the primary contract. The score exists to:

- order papers within rescue / bridge quotas
- make tuning easier without changing schema again
- support later local debugging and QA

### Engine integration

#### 1. Build cluster stats

After graph points and clusters are written:

- compute `domain_core_count` and `domain_core_fraction` per cluster
- write them onto `solemd.graph_clusters`

This should be a graph-run-scoped query over:

- `solemd.graph`
- `solemd.corpus`
- `pubtator.entity_annotations`
- `solemd.entity_rule`
- `pubtator.relations`
- `solemd.relation_rule`

#### 2. Materialize paper policy

Add a dedicated engine step after cluster stats and before publish:

- compute paper-level direct-signal flags
- compute `is_journal_only`
- join cluster rescue stats
- write reusable run facts into `solemd.graph_visibility_features`
- assign:
  - `default_visibility_lane`
  - `default_visibility_rank`

Recommended code location:

- keep the public predicate surface in `engine/app/graph/render_policy.py`
- add the run-scoped materialization query in `engine/app/graph/build.py`
  or a small helper module such as `engine/app/graph/visibility_policy.py`

#### 3. Derive `is_default_visible`

Then change the default-visible predicate to:

- `default_visibility_lane IN ('core', 'rescue', 'bridge')`

`renderable` remains:

- outlier / map-quality based

So:

- `renderable` answers "can this point live on the map?"
- `default-visible` answers "should this point be in the opening map?"

#### 4. Sync current-run bool upstream

Keep the current sync behavior:

- `solemd.corpus.is_default_visible` is still updated for the current
  published run

But it becomes:

- a synced summary flag
- not the canonical place where policy is invented

### Bundle integration

Export only the compact fields that are useful for first paint, debugging, or
future local tuning.

#### Add to `base_points.parquet`

- `default_visibility_lane`
- `default_visibility_rank`

Recommended first pass:

- export `default_visibility_lane` and `default_visibility_rank`
- keep the heavier explanatory decomposition in `solemd.graph_visibility_features`
  and the graph-run QA summary

This satisfies the base-field rule because these fields:

- directly affect first paint
- are compact
- do not duplicate a richer universe representation

#### Keep cluster rescue data local

Add to `base_clusters.parquet` if cluster-level debugging or UI explanation
becomes useful:

- `domain_core_fraction`
- `rescue_enabled`

Not required for the first implementation.

### Frontend integration

The browser should continue to load the full renderable base table locally.

The change is only the initial scope:

- first paint should initialize current visibility from
  `is_default_visible = true`
- not from the entire renderable table

After that:

- filters, timeline, and search can still expand emphasis into the broader
  renderable set
- runtime visibility logic remains DuckDB-local
- no browser-side reinvention of policy is needed

### DuckDB Alignment

This policy should be designed around the current SoleMD.Graph runtime:

- backend / graph build owns canonical policy derivation
- export publishes compact base columns into Parquet
- export can now split the mapped run into:
  - `base_points.parquet` as the base default-visible baseline
  - `universe_points.parquet` as the premapped universe from the same run
- browser DuckDB-WASM is a thin local read model over those exported columns
- Cosmograph native selection / filter state defines the current scope

That means:

#### 1. No browser-side policy joins

Do **not** make DuckDB-WASM derive default-visible policy by joining:

- `pubtator.entity_annotations`
- `pubtator.relations`
- `solemd.entity_rule`
- `solemd.relation_rule`
- venue-rule / policy-family tables

Those joins belong in graph-db during build.

DuckDB in the browser should receive:

- final lane
- final rank
- final boolean
- only the compact fields needed to scope / facet / debug locally

#### 2. Keep base fields compact and scalar

The base artifact should only carry small, query-friendly columns:

- `is_default_visible`
- `default_visibility_lane`
- `default_visibility_rank`
- existing compact metadata already used for filtering and search

Avoid pushing explanation-heavy JSON or verbose evidence payloads into base just
to justify a policy decision. If richer provenance is needed later, it belongs
in:

- graph-db QA tables
- optional universe artifacts
- or a debug-only fetch path

#### 3. Prefer SQL-scoped visibility over JS arrays

The current runtime already prefers SQL-backed current scope over eagerly
maintained point-index arrays. The first-paint default-visible policy should fit
that pattern.

Recommended shape:

- initialize current scope with a SQL predicate such as
  `is_default_visible = true`
- keep later filter / timeline / budget interactions as SQL-backed scope where
  possible
- do not materialize giant JS-side index lists just to represent the opening set

This keeps the design aligned with the current `currentPointScopeSql` direction.

#### 4. Precompute cluster rescue inputs once per run

Cluster rescue is compatible with DuckDB only if the expensive cluster-domain
reasoning has already been materialized upstream.

So:

- compute cluster purity / rescue eligibility once during build
- persist the result for the current graph run
- export only the compact outputs needed by the browser

Do **not** ask DuckDB-WASM to infer cluster purity from raw evidence tables on
interaction.

#### 5. Preserve projection and filter pushdown

The policy columns should improve local filtering, not force wider scans.

In practice:

- queries should filter by exported scalar columns
- tables/panels should project only the columns they need
- no query should require reading richer payloads just to decide first-paint
  visibility

This is the reason to keep the default-visible outcome in the base points table.

#### 6. Treat policy tables as backend config, not frontend data dependencies

The modular policy system should live in graph-db as config + materialized
results.

Frontend should depend only on:

- exported result columns
- optional compact cluster debug fields

This keeps the policy system scalable as:

- graph size grows
- more concepts are added
- new bridge families are curated
- rescue thresholds are tuned

without increasing browser query complexity.

#### 7. Optimize for graph-run recomputation, not per-interaction recomputation

The expensive work should happen:

- once per graph run
- once per policy version

not:

- once per page load
- once per search
- once per filter change

That gives the right asymmetry:

- backend pays the heavy policy computation cost infrequently
- frontend gets fast repeated reads over compact exported results

#### 8. Keep the contract stable if a future `graph.db` artifact is introduced

The current default publish path is Parquet-first, not a persisted DuckDB file.
If a future `graph.db` artifact is added, the same rule should still hold:

- policy is computed upstream
- local DuckDB consumes precomputed policy results
- browser-local DuckDB is not the place where canonical policy is invented

So the architecture should target:

- **graph-db / build** = derive and materialize policy
- **bundle base table** = carry compact policy outputs
- **DuckDB-WASM runtime** = query and scope those outputs locally

### QA outputs

Record QA counts on the graph run for:

- total renderable
- total default-visible
- count by `default_visibility_lane`
- count by `filter_reason`
- hidden journal-only count
- rescued journal-only count
- bridge count
- top hidden venues by paper count

This is the main way to verify that the policy is reducing weak venue-only
spillover without collapsing useful adjacency.

### Why this is the right first version

It is not too restrictive because:

- direct-signal papers always survive
- venue-only papers are not globally banned
- high-value venue-only papers can return through cluster rescue
- bridge papers are retained intentionally through a quota lane

And it is simple enough to tune:

- adjust rescue thresholds
- adjust bridge cap
- adjust cluster domain-fraction bands

without rewriting the architecture.
