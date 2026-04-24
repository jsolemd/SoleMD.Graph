# CodeAtlas Dogfood Findings (2026-04-23 → 2026-04-24)

Dogfood pass run against `mcp__codeatlas-graph__*` using real navigation
tasks in SoleMD.Graph. This doc records **server-side** issues that live
in `/workspaces/SoleMD.Infra/codeatlas/`.

## Round 9 (2026-04-23) — R1–R7 structural navigation upgrades

Round 8 closed the six distortions that would make an evaluating agent
take the *wrong* action. Round 9 pivots from "stop distorting" to **"make
navigation structurally better"** — new fields that surface already-
stored data, new server-side classifications, new advisory blocks, and
one closure of a long-filed deferred (S13). All seven are additive.

- ✅ **R1** — Cross-tool `payload.truncation` advisory block
  (`{hit_limit, kind, observed, limit, hint?}`) with `kind ∈ {result,
  depth, step}`. Helper in
  `code_search/server/response_postprocess.py`. Wired into
  `dependents` (`kind=depth` when BFS beyond `max_depth` shows more
  reach, otherwise `kind=result` when pagination cuts the list),
  `find_patterns` (`kind=result` when `groups == limit`), `list_flows`
  (`kind=result` when `flows == limit`), `get_flow` (`kind=step` when
  `node_count > len(steps)`), and `inspect_symbol` (caller/callee
  caps). Tests: new `tests/test_truncation_advisory.py` (8 cases).
- ✅ **R2** — `inspect_symbol` surfaces stored signature metadata.
  `payload.resolved.signature = {args, param_types, return_type,
  decorators, is_exported, is_test}` — pulled from the Function node
  the writer already populates. For class resolves, each method in
  `class_rollup.methods` carries the same fields. File:
  `code_search/server/handlers/inspect.py`,
  `code_search/server/handlers/inspect_class.py`,
  `code_search/neo4j/queries_analysis.py`. Tests: extended
  `tests/test_inspect_handler.py` (helper + class-rollup shape).
- ✅ **R3** — Fuzzy name candidates on `inspect_symbol` no_match.
  Bare-name Cypher with APOC `sorensenDiceSimilarity >= 0.72` and
  prefix fallback when APOC is unavailable. Emits
  `payload.candidates: [{name, file, line, kind}]` (top 3) and
  rewrites `next_action` to `"Did you mean …?"`. File:
  `code_search/server/handlers/inspect.py`. Tests: new
  `tests/test_inspect_fuzzy_candidates.py` (6 cases including the
  APOC-missing fallback).
- ✅ **R4** — Server-side `kind` classification on
  `find_patterns(pattern="reuse_candidates")` groups. 8-rule ordered
  classifier: `hook` > `class_method` > `component` > `store` >
  `css_constant` > `route_handler` > `constant` > `util`. Markdown
  formatter groups by kind. Files:
  `code_search/server/handlers/patterns.py`. Tests: new
  `tests/test_reuse_candidates_kind.py` (parametric ruleset + markdown
  section ordering).
- ✅ **R5** — Per-community rank on
  `find_patterns(pattern="hub_functions")`. Widened Cypher to project
  `community_id` + `community_label`; oversamples by
  `max(limit*5, limit+50)` (capped at 500) and computes
  `per_community_rank` in Python before display trimming, so a
  community whose top hub ranks globally #7 still shows as its
  community's #1. File:
  `code_search/server/handlers/patterns.py`. Tests: new
  `tests/test_hub_functions_per_community.py` (rank-per-community +
  display-cap-after-ranking).
  **Codex rescue verification:** handed the R5 diff to `codex:rescue`
  before merge. Verdict: "conditionally sound" — no correctness bug in
  returned rows. Codex flagged a tie-break concern on equal in_degree
  within the same community (fixed post-rescue by extending ORDER BY to
  `calls_in_degree DESC, importance_score DESC, name ASC`). Two noted
  *design limitations* kept as-is: (a) the 500-row oversample ceiling is
  always above the schema-max `limit=200`, but very large communities'
  tails beyond 500 are silently unranked; (b) null-community rows share
  one "unclustered" bucket and the markdown suppresses the line for
  those rows rather than emitting `rank=None`.
- ✅ **R6** — `get_flow` community summary + step truncation.
  `flow.steps_truncated: bool` (true when Flow node's stored
  `node_count` exceeds returned step count), `flow.community_map:
  [{community_id, label, node_count, file_count}]`,
  `flow.community_boundary_crossings: int`. Cypher in
  `code_search/neo4j/queries_flows.py` additionally projects
  `community_id` + `community_label` per step; enrichment in
  `code_search/tools/neo4j_tools.py`. Tests: new
  `tests/test_get_flow_community_summary.py` (multi-community flow +
  truncation case).
- ✅ **R7** — Close S13: `slice_build(mode=extend)` emits structured
  `extend_refused` on no-op. When zero symbols were added, flips
  `status` → `"no_op"` and attaches `extend_refused = {reason,
  budget_before, budget_after, new_symbols_resolved,
  new_symbols_added}` with reason in `{budget_exhausted,
  duplicate_entry_points, no_new_symbols}`. Success path gains an
  `added_symbols: int` count. File:
  `code_search/server/handlers/slices.py`. Tests: new
  `tests/test_slice_extend_observability.py` (4 cases — one per
  reason + success sanity).

**Tests:** full codeatlas suite — **1210 passed, 20 skipped** in 238.42s
(Round-8 baseline 1167 → +43 new tests for R1–R7: 8 truncation, 3
signature/class-rollup, 6 fuzzy-candidates, 14 reuse-kind, 2
hub-per-community, 2 get-flow community, 4 slice-extend).
**Image / rebuild:** `DOCKER_BUILDKIT=1 docker build -t
infra-codeatlas:latest -f service/Dockerfile .` →
`docker compose -f compose.shared.yaml -f codeatlas/compose.yaml -p
infra --project-directory codeatlas up -d codeatlas`. Smoke:
`curl http://localhost:8100/readyz` reports
`"status":"ready","projects":["solemd.graph","solemd.infra","solemd.make"]`.
**Live verification:** `/tmp/codeatlas-dogfood/round9/` —
`r1-dependents.json` (kind=step via get_flow below; dependents on
`apps/worker/app/db.py` had no truncation — 0 deps, not a
truncation scenario),
`r2-inspect-signature.json`
(`{args:["settings","names"], param_types:["Settings","tuple[PoolName, ...] | None"],
return_type:"WorkerPools", decorators:[], is_exported:false, is_test:false}`),
`r3-fuzzy-typo.json` (typo "FieldControler" → top candidate
`bindFieldControllers` at line 26 of `field-scroll-driver.ts`),
`r4-reuse-kind.json` (kinds observed: `hook`, `component`, `util`,
`store` across 30 Cypher rows — display-compacted to 8 per
`_compact_find_patterns_payload`; truncation attached with
`observed=30, limit=30`),
`r5-hub-per-community.json` (each returned row carries `community_id`
+ `community_label` e.g. `apps/worker (open_pools)`, `apps/web (add)` —
`open_pools` shows `per_community_rank: 2` behind `close` in
community #36),
`r6-get-flow.json` (`MapPage`: `steps_truncated: true` (476/479 steps),
`community_boundary_crossings: 105`, `community_map` size ≥ 3;
envelope also carries `truncation.kind: "step", observed: 476,
limit: 479`),
`r7-slice-extend-noop.json` (extend with empty `entry_points` →
`status: "no_op"`, `extend_refused: {reason: "no_new_symbols",
budget_before: 1184, budget_after: 1184, new_symbols_resolved: 0,
new_symbols_added: 0}`).

**Round-10 candidates (not in scope):** E1-F2 (Dramatiq actor-message
edges), E1-F3 (`analyze_impact` dead-code cross-check vs live callers),
E1-F4 (`index` file re-export surfacing), E2-F2
(`duplicate_signatures.actionability` scoring), E2-F4 (CSS-var runtime
detection via string-template analysis), E3-F3 (DECORATOR_USES edges),
E3-F5 (`graph_overview` per-community test coverage), E3-F6
(`find_route_handlers` — or `find_patterns(pattern="route_handlers")` —
convenience tool).


## Status legend

- ✅ IMPLEMENTED — code edits landed in `/workspaces/SoleMD.Infra/`;
  requires a server restart (`docker compose restart codeatlas` or the
  equivalent) to take effect.
- 📋 FILED — documented, not yet implemented.

## Round 8 (2026-04-23) — Q1–Q6 close the evaluation-distortion gap

Round 7's evaluation report named four new distortions (F1–F4) plus two
pre-existing S-findings (S7, S11) that would cause an agent to take the
wrong action if acted on blindly. Round 8 ships the subset of fixes
whose absence would produce wrong deletions, wrong hotspot calls,
missed cache staleness, or silently under-covered doc searches. All
six are VERIFIED live against a post-reindex distortion re-check
(cache refreshed 2026-04-24T03:56:21Z;
`/tmp/codeatlas-dogfood/round8/` has the persisted JSON).

- ✅ **Q1 (F3)** — `/route.ts` / `/route.tsx` added to
  `NEXTJS_ROUTE_SUFFIXES`. One-line change with dual effect: the
  dead-code Cypher now suppresses App-Router handlers (they have no
  static caller but are HTTP entry points), and `writer_metadata.py`
  sets `is_route_component=true` on them so they get promoted in
  `_ENTRY_POINT_QUERY` and flow detection. File:
  `code_search/neo4j/query_specs.py`. Tests: extended
  `tests/test_neo4j_queries.py::test_graph_overview_dead_code_uses_shared_route_suffix_params`.
  **Live check:** `overview.dead_code_candidates` (10 entries) has
  zero `/route.ts` files after reindex; `list_flows` now lists 3
  route-handler flows (`HEAD`, `route::GET#L150`, `serveAsset` all
  under `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts`).
- ✅ **Q2 (F1)** — `orphan_exports` inherits the non-production filter.
  Added new `_NON_PRODUCTION_PATH_SEGMENTS = ("/_smoke/", "/_templates/")`
  (CONTAINS-anywhere, not prefix-only) on top of the Round-7 prefix /
  suffix list; threaded through both `build_dead_code_query` and
  `_query_orphan_exports`. Exposed `include_non_production: bool =
  false` on the `find_patterns` handler (same opt-in shape as
  `dead_code_candidates`). Files:
  `code_search/neo4j/query_specs.py`,
  `code_search/server/handlers/patterns.py`,
  `code_search/server/tool_definitions.py`. Tests:
  `tests/test_overview_dead_code_filter.py` (extended with segment
  assertions), new `tests/test_patterns_orphan_filter.py` (2 tests).
  **Live check:** default `find_patterns(pattern="orphan_exports")`
  yields zero `_smoke/`/`_templates/` entries out of 8 orphans;
  `include_non_production=true` surfaces 7 — exact same surface,
  toggle works.
- ✅ **Q3 (F2)** — community labeler pivots from import-based to
  member-path-based domain. New `_dominant_path_prefix` (longest
  path-segment prefix covering ≥60% of member paths, counted against
  the matched cohort at each depth so non-co-occurring segments can't
  chain into a spurious prefix) feeds `_member_path_domain_label`.
  Falls back to the legacy `top_modules` import domain when the
  dominant prefix has <2 meaningful segments after stopword filtering.
  The Cypher subquery was widened to return `paths[0..200] AS
  member_paths`. File: `code_search/neo4j/writer_analysis.py`. Tests:
  `tests/test_neo4j_community_labels.py` — 9 new tests covering the
  dominance helper, cohort-narrowing regression, empty/singleton
  inputs, all-identical paths, stopword-only collapse, and end-to-end
  label flip.
  **Codex rescue verification:** handed the Q3 diff to
  `codex:rescue` before merge; it flagged a real bug (per-depth
  counting didn't narrow to the matched cohort, so a mixed-root
  community could assemble a spurious chained prefix), which was
  fixed before rebuild. Codex also noted missing edge-case coverage;
  tests were added for each.
  **Live check:** `config (…)` labels are gone entirely. The 446-node
  worker-actor community is now `apps/worker (open_pools)`. All
  top-8 communities use `apps/web (…)` / `apps/worker (…)` domains.
- ✅ **Q4 (F4)** — `_TOP_FUNCTIONS_QUERY` filters tiny utility nodes.
  Added `coalesce(fn.cyclomatic_complexity, 0) >= 3 AND
  coalesce(fn.end_line - fn.line_number, 0) >= 3` to the WHERE clause.
  The original plan specified `>= 2 / >= 3` but the live `now()`
  stub has `cc=2, span=3` (4-line function with one `if`), so the
  looser thresholds still admitted it — bumped the complexity floor to
  `>= 3`. This is a display filter only: the underlying
  `pagerank_score` is still stored on each node; the hotspot
  *readout* just demotes simple utilities. File:
  `code_search/neo4j/query_specs.py`. Tests: new
  `test_top_functions_filters_tiny_utility_nodes` in
  `tests/test_neo4j_queries.py`.
  **Live check:** `now()` is absent from `overview.top_functions`;
  top 8 are now real branching hotspots (`resolve`, `open_pools`,
  `run_release_ingest`, `runtime_settings_factory`,
  `run_corpus_selection`, `acquire_paper_text`, `WikiPanel`,
  `write_jsonl_gz`).
- ✅ **Q5 (S7)** — `graph_overview` surfaces cache staleness at the
  top-level `graph_context` block. Added `_compute_cache_advisory`
  helper in `response_postprocess.py` that derives
  `is_cached`, `cache_refreshed_at`, `cache_age_seconds`, and
  `cache_advisory` (`"fresh"` <10min, `"stale (>1h)"` >1h, else
  `"aging"`) from the precomputed overview's timestamp. Backward-compat
  fields inside `payload.overview.cache_source` /
  `.cache_refreshed_at` are preserved. File:
  `code_search/server/response_postprocess.py`. Tests: new
  `tests/test_graph_overview_cache_signal.py` (7 tests including
  boundary thresholds and a `Z`-suffix tolerance test).
  **Live check:** `payload.graph_context` now carries `is_cached=true,
  cache_advisory="fresh", cache_age_seconds=52.6,
  cache_refreshed_at="2026-04-24T03:56:21Z"`.
- ✅ **Q6 (S11)** — `search_docs_multi` splits the merged `errors`
  list into two structured fields: `unmatched_library_ids:
  list[str]` (IDs that resolved to nothing) and `skipped_libraries:
  list[{library_id, reason}]` (IDs that resolved but were unavailable,
  e.g. `reason: "pending_indexing"`). Humanized warning prose still
  appears in the markdown path unchanged. File:
  `doc_search/tools/search.py`. Tests:
  `tests/test_doc_search_resolve.py` — added
  `test_query_docs_multi_reports_unmatched_and_skipped_structurally`.
  **Live check:** calling with `library_ids=["/foo/bar",
  "/greensock/gsap"]` returns `unmatched_library_ids: ["/foo/bar"]`
  and `normalized_library_ids: {"/greensock/gsap": "/greensock/GSAP"}`.

**Tests:** full codeatlas suite — **1167 passed, 20 skipped** in 238.53s.
**Image:** `infra-codeatlas:latest` digest
`sha256:88c35fb37e20837bbb17593d435e1ff1613594dc03ea2e5b2e3aac346981ee10`.
**Rebuild / recreate:** `DOCKER_BUILDKIT=1 docker build -t
infra-codeatlas:latest -f service/Dockerfile .` →
`docker compose -f compose.shared.yaml -f codeatlas/compose.yaml -p
infra --project-directory codeatlas up -d codeatlas`.
**Persisted re-check JSON:** `/tmp/codeatlas-dogfood/round8/` —
`graph-overview.json`, `list-flows.json`, `orphan-exports.json`,
`orphan-exports-with-nonprod.json`, `search-docs-multi.json`,
`verification-summary.md`.

**Still filed (out of Round-8 scope):** S1 (duplicate Cosmograph
library registration — libraries.yaml curation), S2 (TS↔Python CALLS
bleed — multi-round refactor), S8 (`search_code` semantic latency —
performance investigation), S13 (`slice_build` extend no-op — narrow,
doesn't distort evaluation), S16 (compound-semantic ranking — ranking
tuning).

## Round 7 (2026-04-24) — P1–P6 + evaluation deliverable

Landed six targeted server fixes and used the refreshed server to
produce `docs/future/solemd-graph-codeatlas-evaluation.md` — the
architecture-health deliverable the dogfood program was always aiming
at. 93 tests pass across the affected modules. All six patches are
VERIFIED live against a post-reindex dogfood pass.

- ✅ **P1 (S6)** — community-label sanitation. Leading `/`, `.`, `:`
  prefixes stripped; internal `//` runs collapsed; generic verbs
  (`constructor`, `default`, `handler`, `render`, `close`, `open`,
  `init`, `config`, `main`, `run`, `start`, `stop`, `tick`) no longer
  win the primary-label slot. Files:
  `code_search/neo4j/writer_analysis.py`,
  `code_search/neo4j/writer_metadata.py`. Regression tests in
  `tests/test_neo4j_community_labels.py` (8 tests).
  **Live check:** `graph_overview.communities` labels read cleanly; no
  `///scene/…` prefix and no `constructor` as primary token.
  *Remaining gap:* `'config (open_pools)'` still appears because
  `config` isn't in the module-stopword set — tracked as
  **Round-7 F2** below.
- ✅ **P2 (S10)** — `dead_code_candidates` filters
  `examples/`, `scripts/`, `tests/`, `__tests__/`, `tmp` prefixes and
  `.test.ts`/`.test.tsx`/`.spec.ts` suffixes by default. Opt-in via
  `include_non_production=True`. File:
  `code_search/neo4j/query_specs.py`. Regression tests in
  `tests/test_overview_dead_code_filter.py` (5 tests).
  **Live check:** `graph-overview.dead_code_candidates` has zero
  `examples/prompt-drag/*` entries after reindex.
  *Remaining gap:* the `orphan_exports` pattern is a separate query
  and does not inherit the filter — `_smoke/`/`_templates/` surfaces
  still leak through (**Round-7 F1**).
- ✅ **P3 (S5)** — `file_facets` gate. Skip `sql_tables` and
  `feature_entrypoints` extraction for markdown/yaml/toml/json files
  and for `docs` path bucket. File: `chunking/facet_domains.py`.
  Regression tests appended to `tests/test_file_facets.py` (41 tests
  total, 2 new).
- ✅ **P4 (S15)** — class inspect rollup. `inspect_symbol` on a
  `KIND_CLASS` symbol now emits a `class_rollup` marker
  (`{is_class: true, method_count, rolled_up, caller_count,
  callee_count}`) into the payload, surfacing that the class's
  method edges were aggregated rather than the class node's own
  zero-edge count. File:
  `code_search/server/handlers/inspect_class.py`. Regression tests in
  `tests/test_inspect_handler.py` (3 new tests).
  **Live check:** `inspect_symbol(BlobController)` returns
  `class_rollup: {is_class: true, method_count: 7, rolled_up: true,
  caller_count: 5, callee_count: 6}` — was 0/0 before the patch.
- ✅ **P5 (S9)** — flow entry-name disambiguation via
  `{file_stem}::{raw_name}` escalation. Step 2 of the naming chain is
  now `s2::worker` (readable) instead of
  `worker@apps/worker/app/ingest/writers/s2` (unreadable); step 3 is
  `s2::worker#L354` (instead of `...#L354` buried after the long path).
  File: `code_search/neo4j/queries_flows.py`. Existing
  `tests/test_entry_point_ordering.py` updated + new uniqueness
  assertion added (14 tests total).
  **Live check:** `list_flows` for SoleMD.Graph now shows
  `s2::worker`, `s2::worker#L305`, `s2::worker#L354`, `s2::worker#L395`,
  `s2::worker#L458`, `s2::worker#L513` — readable top-to-bottom.
- ✅ **P6 (S12)** — library-id resolution goes case-insensitive via
  a new `_resolve_library` helper. `search_docs` and
  `search_docs_multi` now accept `/greensock/gsap`, `/greensock/GSAP`,
  `/greensock/Gsap` interchangeably, surface the canonical casing in
  `normalized_library_id` / `normalized_library_ids`, and reject
  truly ambiguous casings with `AmbiguousLibraryError`. File:
  `doc_search/tools/search.py`. Regression tests in
  `tests/test_doc_search_resolve.py` (6 tests).

**Image rebuild and container recreation:**
`DOCKER_BUILDKIT=1 docker build -t infra-codeatlas:latest -f
service/Dockerfile .` → `solemd compose -f codeatlas/compose.yaml up
-d codeatlas`. `readyz` clean; both SoleMD.Graph and SoleMD.Infra
force-reindexed in graph mode (2026-04-24T02:53Z).

### Round-7 follow-ons surfaced by the evaluation run

- **F1** — `_smoke/` and `_templates/` paths still appear in
  `orphan_exports`. The P2 filter applies to `dead_code_candidates`
  only; the `orphan_exports` pattern is a separate Cypher path. Fix
  symmetry: thread the non-production filter into the orphan-exports
  query (or pre-filter at the `find_patterns` handler).
- **F2** — `config` survives as a community-label prefix (e.g.
  `'config (open_pools)'`). Either add `config` to
  `_COMMUNITY_LABEL_STOPWORDS` in `writer_metadata.py`, or switch the
  labeler to derive the module token from the community's own files
  instead of the most-imported-module table.
- **F3** — Next.js route handlers (`app/api/**/route.ts`) are
  flagged as dead code (e.g. `POST @ .../attach-points/route.ts:15`).
  Add `/route.ts` and `/route.tsx` to `NEXTJS_ROUTE_SUFFIXES` so the
  dead-code filter recognizes them as entry-points.
- **F4** — PageRank-topping utility. `now()` reads at PageRank 24.50,
  far above every other node. Consider damping PageRank for tiny
  utility nodes (≤3 lines, no state) in the top-functions table, or
  adding a flag so agents don't read the top of the table as an
  architectural hotspot.

The full verdict catalog (hotspots, consolidation list, test gaps,
coupling verdicts, pending-diff blast radius, cross-project surfaces)
lives in
[`docs/future/solemd-graph-codeatlas-evaluation.md`](./solemd-graph-codeatlas-evaluation.md).

## Host-fullness runbook (2026-04-23)

The TEI embedder bind-mount `/mnt/solemd-graph/tei-models` returned
`Input/output error` mid-reindex during round-6. Root cause: the
WSL2 VHDX on the host Windows E: drive grew to fill the partition.
Triage order:

```bash
# 1. Check host (Windows) drive usage from WSL2 side
df -h /mnt/e

# 2. Free space inside the active VHDX so later reindexes don't
#    hit the same edge.
sudo fstrim -v /mnt/solemd-graph

# 3. Optional — PowerShell on Windows side, with WSL shut down:
#    Optimize-VHD -Path "C:\Users\Jon\…\ext4.vhdx" -Mode Full
```

If TEI stays unhealthy after the free-space recovery, restart the
container: `docker restart tei`. The CodeAtlas server itself doesn't
need restart — the embedder health check auto-recovers once TEI is
reachable again.

## Implemented in round 6 (2026-04-23) — all VERIFIED live

Image rebuilt (`infra-codeatlas:latest`), container recreated, Graph +
Infra reindexed. All three fixes are live and confirmed by re-running
the original dogfood queries:

- ✅ **S3** — `_is_source_file` extended with binary/state extensions
  (`.db`, `.sqlite`, `.parquet`, `.wasm`, `.pt`, `.pkl`, `.pyc`, etc.)
  and path-prefix rejection for `.state/`, `.cache/`, `.venv/`,
  `__pycache__/`, `node_modules/`, `dist/`, `build/`, `.next/`,
  `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.turbo/`,
  `coverage/`. File:
  `codeatlas/code_search/server/handlers/diff.py`. Regression tests in
  `tests/test_diff_handler.py::test_is_source_file_rejects_binary_and_state_artifacts`.
  **Live check:** `analyze_diff(git_ref="HEAD~3..HEAD")` returns 24
  source files — 0 `.state/*.db` entries, `response_may_be_stale`
  warning gone.
- ✅ **S4** — `_COUPLING_WARNINGS_QUERY` rewritten to collapse each
  directed pair onto the unordered `{lo, hi}` set, summing both
  directions into `edge_count` and surfacing asymmetry as
  `lo_to_hi_edges` / `hi_to_lo_edges`. Legacy keys (`src_community`,
  `tgt_community`, `edge_count`, `message`) preserved for compat. File:
  `codeatlas/code_search/neo4j/query_specs.py`. **Live check:** after
  forced `reindex_mode="graph"` refresh of the overview cache,
  `graph_overview` shows one entry per pair (e.g. a single `74 edges
  (33→, 41←)` row replaced the previous two split rows summing to
  the same number).
- ✅ **S14** — `project_excluded_globs("solemd.infra")` now returns
  `skills/**`, `**/skills/**`, `infra/backup/pgdata/**`, plus
  `.state/`, `.cache/`, `node_modules/`, `__pycache__/` globs. File:
  `codeatlas/chunking/facet_project.py`. Regression test in
  `tests/test_file_facets.py::test_infra_excluded_globs_include_skills_and_state`.
  **Live check (after a full Infra reindex AND a Qdrant purge — see
  S17 below):** `search_code("graph bundle publish checksum")` on
  `codeatlas-infra` no longer returns any `skills/**` hit; top results
  are real Infra source (`infra/backup/compose.yaml`, `export_bundle`
  in `codeatlas/doc_search/bundles.py`).

All six impacted test files run green (47 tests pass).

## New finding surfaced during live verification

### ✅ S17 — Reindex is additive; does not prune newly-excluded files (FIXED)

**Root cause found and patched.** The orphan-prune loop *does* exist
(`_index_codebase_locked` → `to_remove = indexed_files - files_seen`,
followed by `remove_file_chunks` + `_neo4j_remove_file`) — but it is
gated by `should_skip_orphan_deletion`, a safety check that refuses to
delete when the orphan ratio exceeds 20%. The safety message literally
reads *"Run with force=True to override"* — but `force` was never
threaded through. Even `reindex(force=true)` from the MCP tool could
not bypass it, so widening `exclude_patterns` was effectively a no-op
on already-indexed chunks.

**Fix landed** (code + tests):

- `codeatlas/code_search/sync/utils.py::should_skip_orphan_deletion`
  accepts a new `force: bool = False` parameter; when true, bypasses
  the ratio check entirely.
- `codeatlas/code_search/sync/core_indexing.py::_index_codebase_locked`
  passes `force=force` to both call sites (Qdrant orphan loop and
  file-trigram orphan loop).
- `_reindex_graph_only_locked` grows a `force: bool = False` parameter
  with matching pass-through, and the routing in `_index_codebase_locked`
  forwards `force` into it.
- Regression tests in `tests/test_sync_orphan_force.py` cover: the
  small-set fast path, the ratio trip, the `force=True` bypass, and
  the empty-input edge case. `51 passed in 0.69s` alongside the
  pre-existing diff/facets tests.

**Live verification:** after rebuilding the image and triggering
`reindex_mode="all", force=true` on Infra, indexed chunk count dropped
from 5989 → 4940 (~1049 chunks removed in one pass) before an
unrelated embedder outage stopped the re-add phase. Under the old
safety guard that delete count would have been 0 — so the bypass is
doing real work.

**Caveat on the live run:** the TEI (embedder) container failed
mid-reindex because its model bind-mount
(`/mnt/solemd-graph/tei-models`) returned an `Input/output error` at
the WSL2 host layer. That is a host-filesystem issue (not caused by
the S17 patch) and blocks the add-side of subsequent reindexes until
the mount is restored. File as infra-host, separate from CodeAtlas.

Running `index_status(action="reindex", force=true, reindex_mode="all")`
on Infra after widening `project_excluded_globs` added 0 removed files
and left ~240 `skills/**` chunks lingering in Qdrant. The exclude list
*is* honored on new writes (confirmed via
`Settings(project="solemd.infra").exclude_pattern_list` — 87 patterns,
including `skills/**` and `**/skills/**`) — but already-indexed points
stay until something else removes them.

**Why this matters:** changes to the exclude list (either via
`project_excluded_globs` or a runtime `exclude_patterns` override) have
no visible effect on search ranking until the operator manually purges
the now-excluded chunks from Qdrant (and presumably the File/Function
nodes from Neo4j).

**Reproduction trace:**

```python
# Before purge: skills chunks still ranked #1 for "graph bundle publish"
await qdrant.scroll(
    "code-search",
    scroll_filter=Filter(must=[
        FieldCondition(key="project", match={"value":"solemd.infra"}),
        FieldCondition(key="file_path", match=MatchText(text="/skills/")),
    ]), limit=5)
# returns 5 skills/animation-authoring/references/*.md points
```

**Fix sketch:** during a forced reindex, after computing the
post-exclude file set, issue a `qdrant.delete` with a filter for
`(project=$project)` AND `(file_path NOT IN $kept_paths)` — or the
equivalent tombstone sweep. Same idea in Neo4j for `File` nodes whose
relative path matches any newly-activated exclude glob. Without this,
widening excludes is effectively a no-op on search until the operator
intervenes.

Workaround until fixed: after changing excludes, open a shell in the
`codeatlas` container and run a purge like
`qdrant.delete(filter=Filter(must=[project=..., file_path matches
"/skills/"]))`.

Companion changes to the agent-facing skill doc
(`/home/workbench/.claude/skills/codeatlas/SKILL.md`) were applied in
the same pass (v3.1.0 → v3.2.0).

Codex rescue was used as an independent reviewer before writing; its
critique trimmed three weak findings and added two missed ones that are
included below.

## Cheap + local (recommended to fix soon)

### S1. Duplicate Cosmograph library entry

`list_doc_libraries(filter="cosmograph")` returns two `ready` libraries:

- `/cosmosgl/graph` — Cosmograph (git, 901 chunks, 85 files)
- `/codeatlas/cosmograph` — Cosmograph (snapshot, 2066 chunks, 74 files)

Agents hitting `search_docs` without a specific `library_id` will pick
the wrong one. **Fix:** consolidate in `libraries.yaml` or mark one as
`legacy`/`deprecated` so the registry has one authoritative Cosmograph
entry.

### S3. `analyze_diff` auto-detect includes binary / gitignored files

With `git_ref="HEAD~3..HEAD"` we got 5 `.state/prometheus/*.db` files in
`changed_files`, each with `dependent_count: 0`, and
`warnings: ["response_may_be_stale"]` citing those same files in
`stale_paths_in_response`. The binary state files are in `.gitignore`
but show up in the diff because they are uncommitted modifications.

**Fix:** before computing the diff set, filter out paths that match
`.gitignore` rules or are not in the indexed file set (extensions
outside the known source languages: `.db`, `.png`, `.jpg`, etc.). That
also removes the spurious `response_may_be_stale` warning.

### S4. `coupling_warnings` emits both directions of a pair as separate rows

`graph_overview` listed, among the top 10 warnings:

- `WikiPanel → panelScaledPx` — 34 edges
- `panelScaledPx → WikiPanel` — 24 edges

These are the same bidirectional pair. The agent has to mentally dedupe
and still ends up understating how many distinct high-coupling pairs
the overview found.

**Fix:** dedupe by unordered pair in the `graph_overview` aggregation,
and expose asymmetry as `edge_count_a_to_b` / `edge_count_b_to_a` or a
single `edge_count` + `directionality` ratio.

### S7. `graph_overview` cache staleness not surfaced at top level

Today the response carries `cache_source: "precomputed"` and
`cache_refreshed_at: 2026-04-23T17:06:30Z` deep in the payload, while
the rest of the call reported `is_stale: false`. The effective cache age
(~5 hours during this dogfood run) is invisible unless the agent
explicitly inspects the cache field — and node/relationship counts
disagreed with `index_status` as a direct consequence.

**Fix:** surface `is_cached: true`, `cache_age_seconds`, and a short
`cache_advisory` string at the top level of `graph_overview`, consistent
with the `graph_context` block other tools use.

## Edge-semantic / extraction / UX (file, do not quick-fix)

### S2. Flow builder crosses the TS ↔ Python boundary

`trace_flow(HomePage → BatchCopyBuffer.add)` correctly refused with
`boundary_type: "cross_language"` and a useful hint. But
`get_flow(HomePage)` includes `BatchCopyBuffer.add` and
`BatchCopyBuffer.flush` as steps 113–114 of the React landing flow.
`list_flows` reported 228-node `HomePage` criticality 0.9939 — the
inflated count is partly this contamination.

Codex critique: the real bug is **inconsistent edge semantics between
the two tools**, not that `get_flow` must refuse. A principled fix
either:

- tags flow edges with language / transport and exposes the boundary
  so `get_flow` can annotate or prune, or
- rebuilds flows with the same language-aware `CALLS` traversal
  `trace_flow` uses.

### S5. File-facet extractor leaks on non-source chunks

On docs/markdown results, `file_facets.sql_tables` contained stop-words
like `"js"`, `"the"`, `"at"`, and `feature_entrypoints` contained
`"js-query-layer"`, `"the-query-layer"`,
`"14-implementation-handoff-query-layer"`. These are not useful filters
for agents.

**Fix:** gate the SQL-table and feature-entrypoint extractors by file
type (language + path bucket) and/or add a stop-word list.

### S6. Community labels carry parsing artifacts

`graph_overview.communities` and `entry_points[].community` contained:

- `"///scene/visual-presets (FieldScene)"` — leading `///` prefix
- `"config (close)"` — bare common function name as community identity
- `"AnimationLottiePlayer, Phase2eHeartLottie, constructor"` —
  `constructor` is a JS-class default, not a meaningful label

**Fix:** strip leading path-separator artifacts, exclude common names
(`constructor`, `default`, `handler`) from community-label selection,
and prefer the highest-importance non-generic function name.

### S8. Semantic `search_code` latency is heavy

Two dogfood queries: `"DuckDB-WASM bootstrap"` 3584 ms,
`"field chapter adapter controller"` 2205 ms. At those latencies, three
parallel discovery calls cost ~10 s per agent turn — and the skill
promises mandatory recon on non-trivial edits. Worth a performance
investigation (embedding call caching, prewarm on index, per-query
limit tuning).

## Codex-added findings

### S9. Five flows share the name `worker`

`list_flows` returned `worker@apps/worker/app/ingest/writers/s2#L513`,
`#L354`, `#L458`, `#L395`, `#L305`, all from one file. Flow identity
is weakly addressable — `get_flow(flow_name="worker")` would not
disambiguate without the `@file#Lline` suffix.

**Fix:** synthesize a human-readable identity for unnamed entry points
(`s2::load_family`, `s2::acquire_for_paper`, …) or make the name
mandatory-unique with a deterministic suffix and surface it in the
server's naming contract.

### S10. `dead_code_candidates` includes non-production paths

`examples/prompt-drag/use-prompt-position.ts` showed up as a dead-code
candidate alongside real production hits. That is technically correct
(no callers) but it pollutes the "things to act on" list — an agent
running `/clean` on the result would try to delete example code.

**Fix:** add a `path_prefix` filter or a default-exclude list
(`examples/`, `scripts/`, `docs/`, `tmp*/`) to `dead_code_candidates`,
or annotate each result with a `path_bucket` so the caller can filter
before acting.

## Round 2–5 server findings (added 2026-04-23)

### S11. `search_docs_multi` library-not-found is in-band prose

When a `library_ids` entry doesn't match (case or typo), the call still
reports `status: "success"` and the failure appears as
`> **Warning:** Library not found: /greensock/gsap` inline in the
markdown/JSON body. Agents that only branch on `status` accept a
silently under-covered response.

**Fix:** return a structured `unmatched_library_ids: [...]` field in
the payload; leave `status: "success"` but flag coverage.

### S12. Library IDs are case-sensitive with no normalization

`resolve_library_id("gsap")` returns `/greensock/GSAP`, but
`search_docs_multi(library_ids=["/greensock/gsap"])` fails silently.
Libraries are a mix of casings (`/greensock/GSAP`,
`/codeatlas/cosmograph`, `/cosmosgl/graph`).

**Fix:** normalize library-id matching to case-insensitive, or
autocorrect and surface a `normalized_library_ids` echo field.

### S13. Slice extend with `slice_id` silently ignores new entry points
### and increased budget

`slice_build(slice_id, entry_points=[new...], budget_tokens=7000)` on an
existing 5000-budget slice returned the same 3 symbols and reported
`3296/5000 tokens used`. The docstring says "Call again with same
slice_id to extend" but the behavior is a no-op unless the walk
genuinely discovers new nodes.

**Fix:** honor `budget_tokens` override on extend, and surface a
`rejected_entry_points` or `no_growth: true` signal so the caller knows
extension didn't work.

### S14. `codeatlas-infra` indexes `skills/**` alongside source

A query for Infra source (`graph bundle publish checksum`) returned a
`skills/animation-authoring/references/component-libraries.md` chunk as
rank 1, ahead of the matching `codeatlas/doc_search/bundles.py`
`export_bundle` function. Skills are intentionally in the repo but they
are not the answer to source questions.

**Fix:** either (a) tag skills/docs with a lower prior in the ranker
when `prefer_source=true`, or (b) add a default `exclude_patterns` list
for the Infra project that filters `skills/**` from source-leaning
searches.

### S15. `inspect_symbol` class nodes report 0 callers/callees

Inspecting a class (`BlobController`) returns `0 callers, 0 callees`
because calls land on constructor/methods — misleading for a class the
agent knows is heavily used.

**Fix:** when the symbol is a class, either (a) roll up method-level
caller/callee counts into the class summary, or (b) return an explicit
`is_class: true, see_methods: [...]` hint so the caller knows to drill
down.

### S16. Compound semantic queries return thin results

"chapter adapter registry field landing" returned only 1 result where
"useChapterAdapter" would have returned the same hit with higher
confidence. Semantic mode penalizes multi-token queries more than
expected.

**Fix:** when auto-mode detects a long noun-phrase query with few hits
(<3), automatically fall back to a literal search on the strongest
token subset, or surface a `consider_literal: true` hint.

## Skill doc changes applied (for reference)

All five Codex-approved changes landed in
`/home/workbench/.claude/skills/codeatlas/SKILL.md` (v3.2.0):

1. Added `mcp__codeatlas__list_flows` + `mcp__codeatlas__get_flow` to
   `allowed-tools` — they were referenced in the body but missing
   from frontmatter.
2. Rewrote the `list_flows`/`get_flow` bullet: dropped the unverified
   "layout.tsx" claim; warned about CALLS-based flow membership and
   cross-language false positives; noted Python flows sharing names.
3. Added a cross-language clause to `trace_flow` explaining the
   `boundary_type: "cross_language"` refusal and the follow-up via
   `codeatlas-infra`/`codeatlas-make`.
4. Added a `recommended_start` docs-override caveat to "How CodeAtlas
   guides you" — agents looking for implementation should prefer the
   rank-1 source.
5. Expanded "Freshness And Confidence": enumerated `drift_classification`
   values, flagged that `graph_overview` is served from a precomputed
   cache whose node counts are not safely comparable to `index_status`,
   and added a note about non-production paths surfacing in pattern /
   clone / dead-code outputs.
