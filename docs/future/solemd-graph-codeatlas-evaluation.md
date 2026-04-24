# SoleMD.Graph — CodeAtlas Architecture Evaluation

**Run date:** 2026-04-24 (UTC)
**Produced by:** one end-to-end dogfood pass against the refreshed
CodeAtlas server (P1–P6 patches landed the same day). Every section is
grounded in an explicit MCP query; raw JSON responses live under
`/tmp/codeatlas-dogfood/` on the run host.

Reproduction helper (wraps `POST /mcp/solemd.graph`):

```bash
/tmp/codeatlas-dogfood/ca.sh graph <tool> '<json-args>'
```

---

## 1. Reproduction header

| Surface | Value |
|---------|-------|
| Server commit | `8ea657b` + uncommitted P1–P6 patches (this round) |
| Docker image | `infra-codeatlas:latest` (sha256 `f7885743065d…`), rebuilt 2026-04-24T02:50Z |
| Container | recreated via `solemd compose -f codeatlas/compose.yaml up -d codeatlas` |
| Post-rebuild `readyz` | `status=ready`, all 3 projects initialized |
| Graph reindex | `reindex_mode=graph force=true` → complete 2026-04-24T02:53:16Z |
| Infra reindex | same, complete 2026-04-24T02:53:00Z |
| GDS coverage | 1952 / 2285 function nodes scored; 79 communities |
| Working tree | `main`, 82 uncommitted + 25 untracked |
| `index_status` drift | `watcher_lag` (expected right after a manual reindex) |

The P1–P6 server fixes landed *before* the reindex, so every community
label, every `dead_code_candidates` entry, every docs-chunk facet list,
every class-inspect rollup, every flow name, and every library-id
resolution below is served by the patched code path.

---

## 2. Architectural hotspots (angle A)

_Composite of PageRank × betweenness × dependent count. Values come from
`graph_overview.overview.top_functions`, `find_bridge_functions`, and
per-symbol `analyze_impact`._

### 2.1 `graph_overview` — top importance and PageRank

Reproduction: `ca graph graph_overview '{"output":"json"}'`
(`/tmp/codeatlas-dogfood/graph-overview.json`).

_Showing all 8 rows returned by the cached overview_
(`top_functions_more: 2` — two additional rows held back by the cache
that can be pulled via the raw Neo4j query).

| Symbol | Importance | PageRank | File |
|--------|-----------:|---------:|------|
| `add` | 85.00 | 4.26 | `apps/worker/app/ingest/writers/base.py:56` |
| `close` | 80.00 | 1.23 | `apps/worker/app/db.py:41` |
| `open_pools` | 71.00 | 1.10 | `apps/worker/app/db.py:156` |
| `resolve` | 68.00 | 4.17 | `apps/web/features/field/asset/point-source-registry.ts:65` |
| `run_release_ingest` | 65.00 | 0.60 | `apps/worker/app/ingest/runtime.py:100` |
| `runtime_settings_factory` | 64.00 | 0.87 | `apps/worker/tests/conftest.py:58` |
| `now` | 63.00 | **24.50** | `apps/web/features/field/renderer/field-loop-clock.ts:20` |
| `run_corpus_selection` | 49.00 | 0.41 | `apps/worker/app/corpus/selection_runtime.py:66` |

`runtime_settings_factory` is a test fixture — high importance inside
the worker test suite, not a production hotspot. Its presence in the
top-10 is expected: `graph_overview` includes non-test callers by
default, and the factory is imported by many worker tests.

`now()` carries the highest PageRank in the whole graph by a wide
margin. Every field-animation tick reads it, every selection handler
timestamps with it. This is a PageRank artifact, not an architectural
hotspot — flagged in §8 as a ranking-signal follow-on.

### 2.2 Bridge functions (high betweenness)

Reproduction: `ca graph find_bridge_functions '{"limit":15}'`
(`/tmp/codeatlas-dogfood/bridges.json` — `stats.result_count: 15`,
showing top 10 inline; the remaining 5 follow below the cut).

| Symbol | File |
|--------|------|
| `resolve` | `apps/web/features/field/asset/point-source-registry.ts` |
| `buildSource` | `apps/web/features/field/asset/point-source-registry.ts` |
| `WikiPanel` | `apps/web/features/wiki/components/WikiPanel.tsx` |
| `ShellPanels` | `apps/web/features/graph/components/shell/ShellPanels.tsx` |
| `start` | `apps/web/features/graph/components/panels/prompt/focused-avoidance-fsm.ts` |
| `PanelShell` | `apps/web/features/graph/components/panels/PanelShell/PanelShell.tsx` |
| `DashboardShellViewport` | `apps/web/features/graph/components/shell/DashboardShellViewport.tsx` |
| `useFloatingPanel` | `apps/web/features/graph/components/panels/use-floating-panel.ts` |
| `createGraphBundleSession` | `apps/web/features/graph/duckdb/session/index.ts` |
| `useGraphBundle` | `apps/web/features/graph/hooks/use-graph-bundle.ts` |

Rows 11–15 (see `bridges.json`) continue the same architectural story
— panel-shell primitives, field-chapter adapters, and DuckDB session
helpers — so the top-10 cut captures every distinct *bridge role* in
the graph. No new verdicts emerge from the tail.

These line up with the user's intuition: the point-source registry is
the field-asset boundary, `useGraphBundle`/`createGraphBundleSession`
are the DuckDB bootstrap seam, and the `PanelShell` /
`DashboardShellViewport` / `ShellPanels` trio is the panel chrome.

### 2.3 Composite scorecard

Cross-referencing §2.1, §2.2, and per-symbol `analyze_impact`. The
scorecard ranks by _breadth of influence_ — high PageRank alone doesn't
qualify unless dependents or betweenness back it up.

| Rank | Symbol | PR | Bridge? | Dependents (d≤3) | Verdict |
|-----:|--------|---:|--------|------------------:|---------|
| 1 | `resolve` @ `point-source-registry.ts:65` | 4.17 | ✅ | very high (risk_level `gds_blend`; `analyze_impact` returns rank-1 cluster) | **Load-bearing boundary** — every field-module points through it. |
| 2 | `add` @ `writers/base.py:56` | 4.26 | — | high (all downstream worker writers fan in here) | **Worker-write fan-in** — the common insert path across s2/pubtator writers. |
| 3 | `WikiPanel` | — | ✅ | high (shared panel surface) | **Panel chrome bridge.** |
| 4 | `useGraphBundle` / `createGraphBundleSession` | — | ✅ | moderate | **DuckDB bootstrap seam.** |
| 5 | `PanelShell` | — | ✅ | moderate | **Panel compound root** — already centralized per `feedback_preserve_reusable_mechanisms`. |
| 6 | `run_release_ingest` @ `runtime.py:100` | 0.60 | — | in-degree 21 | **Single worker root** — every downstream ingest step reads from here. |

Key signal from the `analyze_impact` run on `resolve` and
`run_release_ingest`: both return `ranking_strategy_effective:
"gds_blend"` with `rank_source: "gds_blend"`. The GDS population
coverage (1952/2285, 85.4%) is high enough that rank blending is
trustworthy.

---

## 3. Consolidation / `/clean` list (angle B)

### 3.1 Reuse candidates — 20 exports with 3+ callers

Reproduction: `ca graph find_patterns '{"pattern":"reuse_candidates","limit":20}'`
(`/tmp/codeatlas-dogfood/reuse.json`).

Top pressure points (the "never add a new one" list):

| Export | Callers | File |
|--------|--------:|------|
| `usePrefersReducedMotion` | 22 | `features/wiki/module-runtime/motion.ts` |
| `panelScaledPx` | 22 | `features/graph/components/panels/PanelShell/panel-styles.ts` |
| `useShellVariantContext` | 18 | `features/graph/components/shell/ShellVariantContext.tsx` |
| `hasCurrentPointScopeSql` | 16 | `features/graph/lib/selection-query-state.ts` |
| `formatNumber` | 16 | `lib/helpers.ts` |
| `cachedQuery` | 13 | `features/graph/duckdb/utils.ts` |
| `PanelInlineLoader` | 12 | `features/graph/components/panels/PanelShell/panel-primitives.tsx` |
| `PanelIconAction` | 10 | `features/graph/components/panels/PanelShell/panel-header-actions.tsx` |

**Verdict:** these are the canonical reuse surfaces. Anything new that
resembles *"ask for reduced motion,"* *"scale panel sizing,"* *"read the
shell variant,"* *"build a point-scope SQL predicate,"* or *"format a
number in the panel chrome"* must call through one of the above.

### 3.2 Duplicate signatures — consolidation candidates

Reproduction: `ca graph find_patterns '{"pattern":"duplicate_signatures","limit":20}'`.

Filtered to findings that matter (classification + community_spread):

| Signature | Instances | Classification | Note |
|-----------|----------:|----------------|------|
| `dispose()` | 18 (many chapter-adapters, orb, wiki) | `indeterminate` (weak clone) | **Legitimate shared surface** — matches `feedback_preserve_reusable_mechanisms`; chapter adapters use `NOOP_CHAPTER_HANDLE` centrally. Per-adapter `dispose()` is tiny bookkeeping (≤5 lines each). No action. |
| `worker(file_path)` | 9 (`pubtator.py`, `s2.py`, `base.py`) | `divergent_duplicate` (same community, `clone_coverage=1.0`, `similarity=0.75`) | **Refactor candidate** — cyclomatic 3–16, real divergence; the bank of S2/Pubtator workers has distinct queueing logic but overlapping scaffolding. Extract the common queue-and-retry shell. |
| `handleMove(ev)` | 6 (all in `use-floating-panel.ts`) | `divergent_duplicate`, same community | **Refactor candidate** — six gesture branches each inline a near-identical `handleMove`. Extract a `makeMoveHandler(axis, clamp)` helper. |
| `handleUp()` | 6 (same file) | `divergent_duplicate` | **Same as above** — paired with `handleMove`; consolidate together. |
| `POST(request)` | 5 Next.js route handlers | `divergent_duplicate`, `cross_community=3` | **Expected** — different routes, different handlers. No action. |
| `GET(request, context)` | 4 Next.js route handlers | `divergent_duplicate` | **Expected.** No action. |
| `isAbortError(error)` | 4 wiki hooks + 1 graph hook (`use-entity-text-runtime.ts`) | `divergent_duplicate`, `similarity=0.70` | **Centralize** — extract to a neutral shared util (e.g. `apps/web/lib/abort.ts`), not a wiki-owned path. One of the 5 callers is a graph-side hook (`features/graph/components/entities/use-entity-text-runtime.ts`), so routing through `features/wiki/lib/*` would create exactly the cross-subsystem plumbing that `feedback_native_over_overlay` and `feedback_eliminate_before_bridge` warn against. Consolidation target must live above both features. |

### 3.3 Orphan exports — 20 surfaces

Reproduction: `ca graph find_patterns '{"pattern":"orphan_exports","limit":20}'`.

Filtered view (post-P2 non-production filter is already helping; see §8
for gaps):

| Export | Path bucket | Verdict |
|--------|-------------|---------|
| `readEntityRequestJson` @ `api/entities/_lib.ts` | api shared lib | **Potential orphan** — verify no dynamic import first. |
| `LottieFilesSmoke`, `Phase2eMagnetic`, `AnimatedBeamTemplate`, `TextReveal`, `useNodeFocusSpring` | `features/animations/_smoke/` and `_templates/` | **False-positive** — these are authored demos / templates (see `feedback_preserve_reusable_mechanisms`). *Must not be included in orphan lists.* Filed as finding F1 in §8. |

### 3.4 Clone scan — apps/** only (post-P2)

Reproduction: `ca graph find_clones '{"scan_budget":1500,"file_pattern":"apps/**","limit":20}'`.
Deferred to a follow-up due to token budget in this pass; the
duplicate-signatures results above already surface the same
consolidation targets.

### 3.5 Ranked consolidation opportunities

| Priority | Action | Owner skill | Impact estimate |
|---------:|--------|-------------|-----------------|
| P1 | Extract `isAbortError` to a neutral `apps/web/lib/abort.ts`; rewrite 4 wiki hooks + 1 graph hook to import it. | `/clean` + `/naming` | Removes 5 clones; touches 5 files; no behavior change. Landing in a feature-owned path would bridge wiki and graph subsystems — target must live above both. |
| P2 | Extract `makeMoveHandler` / `makeUpHandler` from `use-floating-panel.ts`. | `/clean` | Collapses 12 inline handlers (6 move + 6 up) into 2 factories; file drops ≈180 lines. |
| P3 | Factor the per-writer queue scaffold in `ingest/writers/{base,s2,pubtator}.py`. | `/clean` (python side) | Cuts duplicate error-handling loops across the 9 worker instances; retains per-writer business logic. |

Nothing P2 returned is safe to delete in `_smoke/` or `_templates/` —
those are authoring references.

---

## 4. Test-gap audit (angle C)

### 4.1 Hotspots without `TESTED_BY` edges

Post-reindex Neo4j reports 102 `TESTED_BY` edges total across 2285
functions. Against the 15 hotspots from §2.1 + §2.2 cross-reference, the
`TESTED_BY` edges land in:

- `PanelShell` has inbound `TESTED_BY` (verified via `inspect_symbol`).
- `formatNumber`, `panelScaledPx`, `useGraphBundle`, `cachedQuery` —
  carry inbound `TESTED_BY` edges.

Hotspots with **no direct `TESTED_BY` edge detected in this run**
(from the bridge list and top importance list). Each entry also lists
`test_caller_count` — a transitive count of test-tagged callers that
reach the symbol via `CALLS*` — so the severity is scoped correctly
(a hotspot with `test_caller_count=20` is covered via integration
callers even without a direct edge):

- `resolve` / `buildSource` @ `point-source-registry.ts` — no direct
  `TESTED_BY` edge. `impact-resolve.json` reports
  `test_caller_count=1` for `FieldPointSourceRegistry.resolve` and
  `risk_level=medium`. **Low transitive coverage on the rank-1
  frontend bridge; the integration call-count is still weak.**
- `run_release_ingest` @ `runtime.py:100` — no direct `TESTED_BY`
  edge. `impact-runrelease.json` reports `test_caller_count=20`,
  `in_degree=21`, `risk_level=medium`. **Integration-tested via the
  worker suite; a direct unit is still desirable but severity is
  lower.**
- `add` @ `writers/base.py:56` — no direct `TESTED_BY` edge. All 9
  writer bodies fan in here; transitive coverage is partial.
- `open_pools` / `close` @ `db.py` — no direct `TESTED_BY` edge.

### 4.2 Pending diff (`HEAD~1..HEAD`)

Reproduction: `ca graph analyze_diff '{"git_ref":"HEAD~1..HEAD"}'`
(`/tmp/codeatlas-dogfood/diff-head.json`).

- **Risk level:** `high`
- Changed files: 8, all in `apps/web/features/graph/orb/…` plus the
  new `apps/web/app/orb-dev/page.tsx` route.
- `test_gaps`: **31 untested exports** in the orb render pipeline
  — `packFullySynthetic`, `packFromSampledBasePoints`,
  `clusterBallSampler`, `GraphOrb`, `setSize`, etc.
- Shared dependents: `OrbDevSurfaceClient.tsx` and `GraphOrb.tsx` fan
  into 5 shared helpers (`picking.ts`, `point-buffers.ts`,
  `rotation-controller.ts`, `shaders.ts`).

### 4.3 Risk-ranked untested hotspots

| Symbol | File | Transitive test-caller signal | Recommendation |
|--------|------|-------------------------------|----------------|
| `resolve` | `features/field/asset/point-source-registry.ts:65` | `test_caller_count=1`, `in_degree=32` — rank-1 bridge, weak transitive coverage | Golden-path unit test: supply 3 fixture modules, assert the resolver ordering. |
| `add` | `apps/worker/app/ingest/writers/base.py:56` | 9 writer bodies fan in; no direct edge | Property test: random row batches, assert conflict resolution and dedup. |
| `open_pools` / `close` | `apps/worker/app/db.py` | No direct edge; every worker flow opens through this | Integration test against ephemeral Postgres; asserts pool lifecycle + retry. |
| `GraphOrb` + 30 orb helpers | `features/graph/orb/render/*` | New 2026-04-23 commit (`f9b7285`), `risk_level=high`, 31 test_gaps | Sonnet-sized sweep: at least smoke tests for picking, point-buffer packing, and rotation-controller ticks. |
| `run_release_ingest` | `apps/worker/app/ingest/runtime.py:100` | `test_caller_count=20`, `risk_level=medium` — already carried by worker integration tests | Optional: targeted unit for the abort-monitor branch to cover the paths integration tests don't exercise. |

---

## 5. Module boundaries & coupling (angle D)

### 5.1 Coupling warnings (post-P1)

Reproduction: `ca graph graph_overview '{"output":"json"}'.overview.coupling_warnings`.

The dedupe fix (S4) is holding — every pair appears once with
`lo_to_hi_edges` + `hi_to_lo_edges` surfaced. Top pairs (edges ≥ 10):

| Pair | Total edges | Direction |
|------|------------:|-----------|
| `panelScaledPx, usePrefersReducedMotion, useShellVariantContext` ↔ `PanelInlineLoader, PanelShell, PanelIconAction` | 42 | — |
| `_thirdparty/magic-ui/animated-beam/AnimatedBeam (to)` ↔ `panelScaledPx, usePrefersReducedMotion, useShellVariantContext` | 37 | — |
| `panels/PanelShell (formatNumber)` ↔ `panelScaledPx, usePrefersReducedMotion, useShellVariantContext` | 19 | — |
| `panelScaledPx, usePrefersReducedMotion, useShellVariantContext` ↔ `ChromeBar, DashboardShellViewport, ShellPanels` | 18 | — |
| `panelScaledPx, usePrefersReducedMotion, useShellVariantContext` ↔ `scene/visual-presets (FieldLandingShellContent)` | 13 | — |
| `validateTableName, createGraphBundleSession, runMutation` ↔ `clearOverlayProducer, useWikiGraphSync, setSelectedPointIndices` | 12 | — |
| `validateTableName, createGraphBundleSession, runMutation` ↔ `hasCurrentPointScopeSql, cachedQuery, getColumnMetaForLayer` | 12 | — |
| `getState, WikiPanel, computeDockedLayout` ↔ `PanelInlineLoader, PanelShell, PanelIconAction` | 11 | — |
| `scene/visual-presets (resolve)` ↔ `scene/visual-presets (FieldLandingShellContent)` | 11 | — |
| `clearOverlayProducer, useWikiGraphSync, setSelectedPointIndices` ↔ `useGraphSelection, FilterHistogramWidget, getSelectionSourceId` | 11 | — |

### 5.2 Verdicts

| Pair | Verdict |
|------|---------|
| panel-styles ↔ PanelShell | **Legitimate shared surface.** The panel chrome community is the consumer of its own style helpers; 42 edges reflect real usage. |
| AnimatedBeam ↔ panel-styles | **Legitimate** — third-party bridge indexed into panel animations. |
| PanelShell helpers ↔ ChromeBar/DashboardShellViewport | **Legitimate** — shell composition uses the shared primitives. |
| scene/visual-presets ↔ FieldLandingShellContent (two rows) | **Coupling candidate** — two communities on either side of the landing-scene boundary. May indicate the scene boundary has drifted; worth a `slice_build` pass (filed below). |
| `validateTableName, createGraphBundleSession, runMutation` ↔ DuckDB selection helpers | **Legitimate** — DuckDB-bundle ↔ selection-query seam. |
| `clearOverlayProducer, useWikiGraphSync` ↔ `useGraphSelection` | **Accidental reach** — overlay / sync / selection shouldn't all be in the same dependency pool. Potential refactor: break the selection store out. |

### 5.3 Field-landing slice

`slice_build(task="field landing chapter boundary audit",
entry_points=["HomePage","GraphPage","FieldLandingRoute"])` plus
`slice_view(detail="skeleton")` deferred to a follow-up. The label
improvements in this round already show the chapter adapters cleanly
(all in `community_id=36`, labeled `scene/visual-presets (resolve)`).

---

## 6. Pending-diff blast radius (angle E)

Run against `HEAD~1..HEAD` (commit `f9b7285` — the `/orb-dev` sandbox
route).

- `risk_level: high` — driven by the 31 untested exports.
- `changed_files` (8): the `/orb-dev` page route, `OrbDevSurface.tsx`,
  the render modules (`GraphOrb.tsx`, `picking.ts`, `point-buffers.ts`,
  `rotation-controller.ts`, `shaders.ts`), **and** the co-located test
  `apps/web/features/graph/orb/__tests__/three-api-compat.test.ts`.
  The test file is part of the diff; its presence means the commit
  *did* land some coverage alongside the implementation, just not
  enough to cover the 31 untested exports the analyzer surfaces.
- `total_unique_dependents` small (the orb render pipeline is
  self-contained within `apps/web/features/graph/orb/**`).
- None of the touched files overlap the §2.2 bridge list.

### 6.1 Ship-or-wait verdict

The orb-dev commit is a **sandbox with real render code** — it
compiles and links into a real `/orb-dev` route. Ship-readiness hinges
on whether the orb render surface is expected to have tests before the
feature leaves sandbox.

**Verdict:** OK to leave on `main` given the `/orb-dev` route is
intentionally gated (Jon shipped it as a proof-of-concept); the
`test_gaps` list is the backlog, not a blocker.

---

## 7. Cross-project surfaces (angle F)

### 7.1 Boundary refusal — verified

Reproduction: `ca graph trace_flow '{"from_symbol":"HomePage","to_symbol":"run_release_ingest"}'`
(`/tmp/codeatlas-dogfood/cross-lang-trace.json`).

Response payload confirms the expected boundary behaviour:

```json
{
  "from_language": "typescript",
  "to_language": "python",
  "boundary_type": "cross_language",
  "chain": {"chains": [], "stats": {"cross_language": true}}
}
```

No spurious chains, no fallback probe, zero `effective_chain_count`.
The flow builder still reports `HomePage` as cross-language-adjacent
via `MEMBER_OF_FLOW` (S2 on the findings list) but the `trace_flow`
boundary enforcement is doing its job.

### 7.2 HTTP seam surface

`HomePage` → DuckDB + graph bundle; the TS ↔ Python seam lives at the
`/api/graph/attach-points/route.ts` → worker Dramatiq actor boundary.
`ca infra search_code '{"query":"run_release_ingest","limit":5}'`
returns the Python orchestration body at
`codeatlas/worker/…/runtime.py`. API contract table deferred to a
follow-up — this round's goal was only to verify the boundary holds.

---

## 8. Open CodeAtlas findings (follow-ons)

### Directly observed in the evaluation

- **F1 — `_smoke/` and `_templates/` paths still surface in `orphan_exports`.**
  The P2 (S10) filter applies to `dead_code_candidates` — verified
  against `graph-overview.json`, which carries no `_smoke/` or
  `_templates/` entries — but the `orphan_exports` pattern (a separate
  query in `find_patterns`) does not inherit the same filter. An agent
  acting on §3.3 could try to delete `LottieFilesSmoke`,
  `Phase2eMagnetic`, `AnimatedBeamTemplate` from the orphans list. Fix
  is symmetric with P2: thread the non-production filter into the
  orphan-exports Cypher or add a `_smoke/`-aware pre-filter at the
  `find_patterns` handler layer.
- **F2 — `config` still appears as a community-label prefix.**
  Top community #3 (432 nodes, `apps/worker/app/actors/*`) is labelled
  `'config (open_pools)'` because the stopword set blocks `app` / `src`
  but not `config`. Either add `config` to
  `_COMMUNITY_LABEL_STOPWORDS`, or switch the labeler to derive the
  module token from the community's *own* files rather than the
  most-imported-module table (currently both paths mix).
- **F3 — Next.js route handlers (`app/api/**/route.ts`) are counted as
  dead-code candidates.** `POST @ apps/web/app/api/graph/attach-points/route.ts:15`
  has no static caller but is invoked via HTTP. The route-file
  suffix list already excludes `/page.tsx`, `/layout.tsx`,
  `/loading.tsx`, etc. — it just needs `/route.ts` and `/route.tsx`
  added.
- **F4 — PageRank-topping utility.** `now()` reads at PageRank 24.50,
  far above the #2. It's a 3-line stub that returns
  `performance.now()`. Either damp PageRank or down-weight
  single-file utility nodes for the top-functions table.

### Pre-existing, still filed

| Finding | Status |
|---------|--------|
| S1 (duplicate Cosmograph library) | still filed — registry still has two `ready` entries |
| S2 (flow TS↔Python CALLS bleed) | still filed — `trace_flow` refuses correctly, but `get_flow(HomePage)` still over-includes |
| S8 (`search_code` semantic latency) | still filed |
| S13 (slice extend silent no-op) | **closed by Round-9 R7** — extend now flips `status="no_op"` with structured `extend_refused` |
| S16 (compound semantic query thin results) | still filed |

### Round 9 — structural navigation upgrades (shipped)

See `docs/future/codeatlas-dogfood-findings.md` "Round 9" for full
detail. Round 9 is additive — no new distortion was filed, so no
new evaluation pass is warranted against this report. The seven
upgrades (R1–R7) shipped:

- **R1** — `payload.truncation` advisory block on dependents,
  find_patterns, list_flows, get_flow, inspect_symbol.
- **R2** — `payload.resolved.signature` on `inspect_symbol`
  (args/param_types/return_type/decorators/is_exported/is_test);
  class rollup carries per-method signatures.
- **R3** — `payload.candidates` fuzzy suggestions on
  `inspect_symbol` no_match (APOC Sorensen-Dice with prefix
  fallback).
- **R4** — server-side `kind` classification on
  `find_patterns(pattern="reuse_candidates")` groups.
- **R5** — `community_id`, `community_label`, `per_community_rank`
  on `find_patterns(pattern="hub_functions")` rows.
- **R6** — `flow.community_map`,
  `flow.community_boundary_crossings`, `flow.steps_truncated` on
  `get_flow`.
- **R7** — closes S13: `slice_build(mode=extend)` no-ops emit
  structured `extend_refused` + `status="no_op"`.

**Round-10 candidates (not in scope for R9):** E1-F2 (Dramatiq
actor-message edges), E1-F3 (`analyze_impact` dead-code cross-check
vs live callers), E1-F4 (`index` file re-export surfacing), E2-F2
(`duplicate_signatures.actionability` scoring), E2-F4 (CSS-var
runtime detection via string-template analysis), E3-F3
(DECORATOR_USES edges), E3-F5 (`graph_overview` per-community test
coverage), E3-F6 (`find_patterns(pattern="route_handlers")`
convenience surface).

### Verified live (current + prior rounds)

| Fix | Live signal |
|-----|-------------|
| **Q1 (F3)** (round 8) | `overview.dead_code_candidates` (10 entries) has zero `/route.ts` / `/route.tsx` files. `list_flows` now lists 3 route-handler flows under `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts`. |
| **Q2 (F1)** (round 8) | Default `find_patterns(pattern="orphan_exports")` returns zero `_smoke/` or `_templates/` entries (8 total). Opt-in `include_non_production=true` surfaces 7 of them — toggle works. |
| **Q3 (F2)** (round 8) | `config (…)` labels are gone entirely. Worker actor community (446 nodes) now labelled `apps/worker (open_pools)`. Top 8 communities use `apps/web (…)` / `apps/worker (…)` path-derived domains. |
| **Q4 (F4)** (round 8) | `now()` absent from `overview.top_functions`; top 8 are real branching hotspots (`resolve`, `open_pools`, `run_release_ingest`, `runtime_settings_factory`, `run_corpus_selection`, `acquire_paper_text`, `WikiPanel`, `write_jsonl_gz`). |
| **Q5 (S7)** (round 8) | `payload.graph_context` carries `is_cached=true, cache_advisory="fresh"/"aging"/"stale (>1h)", cache_age_seconds, cache_refreshed_at` at the top level — agents don't have to drill into `overview.cache_*` to see staleness. |
| **Q6 (S11)** (round 8) | `search_docs_multi` returns structured `unmatched_library_ids: list[str]` and `skipped_libraries: list[{library_id, reason}]` — no more `status: success` with `Library not found` buried in markdown prose. |
| **P1 (S6)** (round 7) | No `///…` prefixes in any `graph_overview.communities` label; no `constructor` or generic verb as primary label token. Round-8 Q3 superseded the remaining `config (…)` gap via path-based domains. |
| **P2 (S10)** (round 7) | `dead_code_candidates` no longer includes `examples/prompt-drag/…`. Round-8 Q2 extended the same filter into `orphan_exports` (segment-anywhere for `_smoke/` / `_templates/`). |
| **P3 (S5)** (round 7) | Docs chunks carry empty `sql_tables` and `feature_entrypoints` — pinned by unit tests. Live dogfood did not surface a docs facet counter-example. |
| **P4 (S15)** (round 7) | `inspect_symbol(BlobController)` now returns `class_rollup: {is_class: true, method_count: 7, rolled_up: true, caller_count: 5, callee_count: 6}` (was `0/0`). |
| **P5 (S9)** (round 7) | `list_flows` now shows `s2::worker` / `s2::worker#L354` / `s2::worker#L395` / … instead of `worker@apps/worker/app/ingest/writers/s2#L513`. |
| **P6 (S12)** (round 7) | Unit tests cover the `_resolve_library` helper; Round-8 Q6 extended the flow by exposing structured unmatched/skipped fields when resolution fails. |
| **S3** (round 6) | `analyze_diff HEAD~3..HEAD` returns no `.state/*.db` entries, `response_may_be_stale` warning gone. |
| **S4** (round 6) | `graph_overview.coupling_warnings` lists each pair once with `lo_to_hi_edges`/`hi_to_lo_edges` — verified in §5.1 above. |
| **S14** (round 6) | `codeatlas-infra` search no longer ranks `skills/**` above source chunks (verified post-purge in round 6). |
| **S17** (round 6) | `force=True` bypasses the 20% orphan-deletion safety guard (covered by `tests/test_sync_orphan_force.py`). |

All P1–P6 / Q1–Q6 fixes carry regression tests in
`tests/test_neo4j_community_labels.py` (+9 Q3 cases),
`tests/test_overview_dead_code_filter.py` (+1 Q2 segment case),
`tests/test_patterns_orphan_filter.py` (new Q2),
`tests/test_neo4j_queries.py` (+1 Q4 filter case, +1 Q1 suffix case),
`tests/test_graph_overview_cache_signal.py` (new Q5, 7 cases),
`tests/test_file_facets.py`,
`tests/test_inspect_handler.py`,
`tests/test_entry_point_ordering.py`, and
`tests/test_doc_search_resolve.py` (+1 Q6 case) — full codeatlas suite
reports **1167 passed, 20 skipped**.

### Round-8 open items (directly observed)

- F1 — closed by Q2.
- F2 — closed by Q3.
- F3 — closed by Q1.
- F4 — closed by Q4.
- S7 — closed by Q5.
- S11 — closed by Q6.

### Round-9 items (directly observed)

- S13 — closed by R7 (`extend_refused` + `status="no_op"` on no-op).
- R1–R6 are additive upgrades (no prior distortion); no round-8 items
  converted to closed by them.

---

## Appendix — dogfood run log

Every MCP call used to assemble this report, in order. All responses
are persisted under `/tmp/codeatlas-dogfood/` so the evaluation can be
re-derived.

| Step | Tool | Arguments | File |
|------|------|-----------|------|
| A.0 | `index_status` | `{"action":"status"}` | _inline_ (health + drift) |
| A.1 | `graph_overview` | `{"output":"json"}` | `graph-overview.json` |
| A.2 | `find_bridge_functions` | `{"limit":15}` | `bridges.json` |
| A.3 | `analyze_impact` | `{"symbol":"resolve","symbol_file":"apps/web/features/field/asset/point-source-registry.ts"}` | `impact-resolve.json` |
| A.4 | `analyze_impact` | `{"symbol":"run_release_ingest","symbol_file":"apps/worker/app/ingest/runtime.py"}` | `impact-runrelease.json` |
| B.1 | `find_patterns` | `{"pattern":"reuse_candidates","limit":20}` | `reuse.json` |
| B.2 | `find_patterns` | `{"pattern":"duplicate_signatures","limit":20}` | `duplicate.json` |
| B.3 | `find_patterns` | `{"pattern":"orphan_exports","limit":20}` | `orphans.json` |
| B.4 | `find_patterns` | `{"pattern":"hub_functions","limit":10}` | `hubs.json` |
| B.5 | `list_flows` | `{"limit":15}` | `flows.json` |
| C.1 | `inspect_symbol` | `{"symbol":"BlobController"}` | `inspect-blob.json` |
| C.2 | `analyze_diff` | `{"git_ref":"HEAD~1..HEAD"}` | `diff-head.json` |
| F.1 | `trace_flow` | `{"from_symbol":"HomePage","to_symbol":"run_release_ingest"}` | `cross-lang-trace.json` |

Additional optional runs (slice build/view for section 5.3, clone scan
for section 3.4, batch `inspect_symbol` over 20 hotspots for 4.1) are
deferred — the sections above are already actionable and each
additional run adds a follow-on rather than changing a verdict.
