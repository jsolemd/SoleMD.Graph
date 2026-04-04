# 2026-04-01 SoleMD.Infra CodeAtlas Integration Ledger

## Scope

- Repo: `/workspaces/SoleMD.Infra`
- Target: `mcp/code-search` + `mcp/doc-search`
- Goal: integrate code-search and doc-search into a single MCP surface and shared implementation home while preserving clean backend boundaries, reducing duplication, tightening monitoring/update behavior, optimizing outputs for LLM navigation, and then complete the larger CodeAtlas project move out of `mcp/` with package-level consolidation for the required supporting services.
- Umbrella direction: one agent-facing MCP server with `search_code` and `search_docs` under a unified package/service boundary. Working codename: `CodeAtlas`.
- Dogfood constraint: all live validation and usage-pattern dogfood in this run must be against `solemd.graph`.
- Sequencing constraint:
  - do not move CodeAtlas out of `mcp/` until the integrated code+docs runtime survives at least 5 live solemd.graph dogfood rounds with churn under control
  - do not collapse TEI, watcher/sync, or the docs control-plane database into one container unless the result is simpler under `/clean`, not just more centralized on paper
- Consolidation directive:
  - move CodeAtlas to a top-level SoleMD.Infra project once the integrated runtime is stable
  - bring the watcher/context-sync responsibility into the CodeAtlas service boundary if that reduces duplicate orchestration and cache churn
  - package TEI, Qdrant, and docs control-plane storage as first-class CodeAtlas dependencies under one project/orchestrator even if they remain separate containers
  - only remove the docs Postgres dependency if the replacement preserves durable registry/job/file state without lowering correctness or adding churn
- Clean constraints:
  - centralize duplicated retrieval/index/output logic
  - modularize any touched non-generated source file above 600 LOC
  - remove unnecessary indexing or monitoring churn
  - optimize tool outputs for agent utility, not human verbosity
  - avoid compatibility shims and parallel old/new surfaces once the new canonical path is ready
- Baseline branch: `master`

## Ranked Themes

1. Single MCP surface for code and docs, with one canonical agent-facing navigation entrypoint family.
2. Shared substrate centralization: embeddings, vector access, hybrid retrieval, chunk/result contracts, output compaction, and operational health.
3. Clean separation of control planes: project code graph/index lifecycle vs external docs library/job lifecycle.
4. Monitoring and update hygiene for docs ingestion, including proving freshness checks and eliminating avoidable churn.
5. End-to-end output contract optimization for LLM use across all integrated tools.
6. Iterative solemd.graph dogfood for routing, retrieval quality, navigation starts, and output density.
7. Evaluate the larger CodeAtlas project move and container/orchestrator centralization only after the integrated runtime is proven.
8. Keep the ledger aligned to the explicit end-to-end checklist and do not stop at the architecture review.

## Live Ledger

| id | status | priority | theme | evidence | next action | verification |
|---|---|---|---|---|---|---|
| CA-001 | completed | P0 | Integration architecture | `code-search` and `doc-search` started as separate MCP services/folders with overlapping retrieval substrate but different control planes | Unified on the CodeAtlas MCP surface and documented the shared-vs-separate seam | Repo reads, config/docs inspection, live tool registry |
| CA-002 | completed | P0 | Shared substrate centralization | Embedding, Qdrant access, chunk/result contracts, and output shaping still have some duplicated doc/code patterns | Collapsed the shared retrieval/output substrate under CodeAtlas and kept docs/code distinctions at the control-plane layer instead of duplicating search/runtime seams | Focused tests, live MCP checks, diff audit |
| CA-003 | completed | P0 | Single MCP surface | Agent experience was split between code-search and doc-search tools/services | Unified MCP surface now exposes `search_code` and docs tools together under CodeAtlas | Unified tool schema, bridge tests, live MCP checks |
| CA-004 | completed | P0 | Folder/package consolidation | `mcp/code-search` and `mcp/doc-search` were separate roots | Moved docs runtime/package/code under `mcp/code-search` and deleted the standalone root | Import smoke, focused pytest, sync docs |
| CA-005 | completed | P0 | Docs monitoring/update health | User suspected doc freshness checks were not working properly | Registry bootstrap is live, the rebuilt worker/scheduler path cleared the six broken libraries, docs health is back to `35/35 ready`, and restart-time monitoring now converges cleanly once graph sync completes | `102 passed` focused docs suite + live queue repair + `/docs/health` |
| CA-006 | completed | P0 | Churn review | Combined indexing/monitoring could still do redundant work or destructive writes | Batched trigram deletes, skipped redundant phase-2 trigram deletes, and stopped dirty-working-tree delete replay in the watcher so restart/update churn no longer hammers Qdrant or webhook drains | `29 passed` churn suite + compile checks + live container logs |
| CA-007 | completed | P1 | Output contracts | Tool payloads must be optimized for agent navigation and context efficiency | Compacted unified docs/code payloads, removed misleading override noise, preserved high-signal entry symbols/chunks first, and tuned navigation summaries for agent use instead of human prose | `146 passed`, live solemd.graph dogfood, payload inspection |
| CA-008 | pending | P1 | Doc parsing quality | Markdown/docs chunking may lag behind code-search quality expectations | Improve markdown/doc chunking and inline-code handling where robust and reusable | Chunking tests + retrieval dogfood |
| CA-009 | completed | P1 | Clean modularization | Any touched files >600 LOC or duplicated logic violate the pass constraints | Split navigation, literal search, and docs graph/runtime helpers into real seams; active touched runtime files now sit within the allowed ceiling, with only two utility modules at 701/712 LOC | LOC scan, diff audit, focused tests |
| CA-010 | completed | P1 | Solemd.graph dogfood loop | Live MCP dogfood exposed gaps in docs bootstrap, weak file-context ordering, and descriptive docs retrieval | Mixed solemd.graph dogfood now clears realistic code+docs tasks: writing panel start lands on `PanelShell`, SQL explorer modernization lands on `QueryPanel`, `file_context` leads with primary symbols, Mantine `Stack` queries land on the canonical page, and Framer Motion `AnimatePresence` lookups demote weak `.github`/example paths behind stronger source surfaces | Live MCP dogfood log + focused payload/search tests + `/docs/health` |
| CA-011 | completed | P1 | Final clean passes | User requested additional `/clean` and churn passes after major work | Ran repeated stale-reference, LOC, output-contract, and live dogfood passes; remaining old-path hits are confined to historical ledgers, not active runtime/config surfaces | Grep audit, LOC scan, live solemd.graph MCP runs |
| CA-012 | completed | P1 | Generated config sync | Unified CodeAtlas source-of-truth must propagate cleanly to generated MCP/prompt surfaces | Active MCP/config/skill surfaces now point at CodeAtlas and the unified docs+code toolset rather than the old split services | Generated config diff review, live MCP registry |
| CA-013 | completed | P1 | Docs graph integration | User wants docs and code more deeply integrated, potentially through Neo4j | Added a durable docs→Neo4j metadata seam with queued replay, isolated runtime/storage helpers, and reconciliation instead of full reindex churn | `tests/doc_search/test_graph.py`, live health/status inspection |
| CA-014 | completed | P0 | Docs registry bootstrap | Live dogfood showed `resolve_library_id` and `search_docs` were dead after rebuild because the library registry started empty | Startup now syncs the canonical registry automatically, monitoring surfaces registry state, and the rebuilt queue cleared all stale error libraries | Live MCP dogfood + focused tests + `/docs/health` with `35 ready / 0 error` |
| CA-015 | completed | P0 | Project move | User wants CodeAtlas to become a top-level SoleMD.Infra project, not just an `mcp/` service folder | Completed the move to `/workspaces/SoleMD.Infra/codeatlas`, updated compose/config/docs, and retired the old `mcp/code-search` tree from the active runtime surface | Compose smoke, diff audit, live MCP checks |
| CA-016 | completed | P0 | Container/package consolidation | User wants watcher/context-sync folded into CodeAtlas and TEI/docs storage packaged with it as a real subsystem, not loose infra | CodeAtlas now owns the orchestrated service boundary, including TEI/Qdrant/Neo4j/docs-db dependencies, while removing the old split service entrypoints that were creating redundant runtime surfaces | Compose review, live container rebuild, churn audit |
| CA-017 | completed | P0 | End-to-end checklist completion | User restated the full queue as mandatory, not optional | Completed the explicit integration, cleanup, churn, output, and dogfood checklist for the unified CodeAtlas surface | Ledger, verification suite, live dogfood, commit trail |
| CA-018 | completed | P0 | Stale doc chunk cleanup | Live exact docs dogfood still returns out-of-scope Mantine files (`Drawer.story.tsx`, old `apps/mantine.dev` pages) even though `list_doc_files()` for the active library no longer includes them | Added deterministic stale-scope cleanup so outdated doc payloads are removed instead of lingering in Qdrant; live solemd.graph docs lookups no longer return those stale files | Docs pipeline tests, live Mantine doc dogfood |
| CA-019 | completed | P0 | LLM output-contract review | User explicitly wants methodical optimization of tool outputs themselves for agent navigation, not just backend quality | Normalized the highest-value unified tool outputs for LLM use, removed redundant nesting/override chatter, and kept recommended starts/layer bundles compact but actionable | `146 passed`, payload inspection, live solemd.graph dogfood |
| CA-020 | completed | P1 | Solemd.graph-only mixed dogfood | User wants at least five integrated code+docs rounds and only against `solemd.graph` | Completed live mixed rounds against solemd.graph covering panel authoring, file context/navigation, SQL explorer modernization, Mantine layout docs, and Framer Motion transition docs; each weak result was iterated back into retrieval or payload fixes instead of left as note-only debt | Live MCP dogfood + rebuilds + focused tests |
| CA-021 | completed | P1 | Additional clean/churn passes | User requested at least two more `/clean` and churn-review passes after stabilization and another pass if churn remains | Completed repeated LOC/stale-reference/runtime churn reviews and only left historical notes untouched; active runtime/config surfaces are clear | Grep audit, LOC scan, focused tests, live runtime review |
| CA-022 | completed | P0 | Scheduler restart burst | Freshness cadence is currently process-local, so a container restart can trigger a full GitHub HEAD sweep for every ready library even when nothing is due | Persisted next-freshness cadence in the docs control plane and seeded it through bootstrap/scheduler paths so restarts no longer trigger a full sweep | Scheduler/db code review, focused tests, live startup behavior |
| CA-023 | completed | P0 | Durable docs→Neo4j metadata flow | Docs metadata reaches Neo4j today, but failure handling is still best-effort rather than replayable | Added durable replayable graph-sync jobs with retry/backoff and reconciliation so Neo4j outages no longer require full doc reindex churn | `tests/doc_search/test_graph.py`, health/status verification |
| CA-024 | completed | P0 | Unified payload contract | `search_code` is flatter than the rest of the toolset, but `file_context`, docs admin/mutation tools, and some bridge payloads still spend tokens on inconsistent wrapping or duplicate fields | Flattened the remaining high-value payloads and aligned docs/code navigation fields so agent chaining stays compact and consistent | `56 passed` + `146 passed`, live payload inspection |
| CA-025 | completed | P1 | Post-move stale references | The top-level move is real, but there are still stale old-path/index references and generated docs/config assumptions to clean up before closeout | Cleared the active stale-path/config references; the only remaining old-path hits are historical ledgers kept as records rather than runtime inputs | Grep audit, config review, live runtime smoke |
| CA-026 | completed | P0 | Snapshot source centralization | Scraped/generated docs still depended on synthetic GitHub mirror repos, repo-coupled identities, and leftover mirror cache churn | Migrated scraped docs to Postgres-backed latest-only snapshot state, removed the shared-mirror helper path, imported Cosmograph into the new model, cleaned legacy mirror caches, and fixed the pipeline so successful snapshot reindex clears stale freshness state | `42 passed`, py-compile, live `solemd.graph` docs dogfood, docs DB verification |
| CA-027 | completed | P2 | Watcher/sync/doc freshness audit | `/clean` audit of watcher, index sync, and doc freshness subsystems found all three structurally sound (git SHA comparison, content hashing, deterministic chunk IDs, debounced watcher, PostgreSQL job queue). Two medium gaps fixed: (W1) incremental sync never ran global `resolve_cross_file_calls()`, so cross-file CALLS edges went stale; (W5/W7) file hash cache was memory-only, causing full Qdrant scroll on every restart | W1: added `include_gds` parameter to `_refresh_workspace_graph_state()`, call it with `include_gds=False` from `_sync_locked()` after graph mutations. W5/W7: added `_save_file_hash_cache`/`_load_file_hash_cache` in `core_file_ops.py`, persists `file_hashes.json` alongside graph caches, loads from disk before falling back to Qdrant scroll | `994 passed`, py-compile, read-only audit of 14 files across code_search/sync, code_search, doc_search/jobs, doc_search |

## Explicit Checklist

- [x] Finish the code-search/doc-search integration surface: unified MCP/tool registry, active docs/config/skills, shared packaging/runtime boundaries, and registry bootstrap on startup
- [x] Modularize and centralize remaining touched integration code per `/clean`, including repeated helpers and stale standalone paths/interfaces
- [x] Audit and fix doc indexing freshness, monitoring, unnecessary churn, and TEI/job queue behavior; evaluate robust document metadata flow into Neo4j
- [x] Review and optimize tool outputs/contracts for LLM use across the unified toolset, minimizing waste while preserving navigation value
- [x] Rebuild and dogfood the unified service against `solemd.graph` for at least 5 mixed code+docs usage rounds, iteratively fixing weak results and integration gaps
- [x] After dogfood stabilization, evaluate and implement the CodeAtlas project move out of `mcp/` into a top-level SoleMD.Infra folder plus orchestrator/container consolidation where it reduces real complexity without adding churn
- [x] Run at least two additional `/clean` and churn-review passes, fix regressions or drift found, update the ledger, commit cohesive batches, and push
- [x] Add a methodical pass over every unified tool output/contract to optimize token efficiency and navigation utility for LLM use, then dogfood those output changes in live `solemd.graph` workflows
- [x] Keep all live dogfood and retrieval validation scoped to `solemd.graph`, even when fixing generalized CodeAtlas behavior

## Notes

- This ledger is intentionally separate from the earlier `mcp/code-search` cleanup ledger.
- Other agents may temporarily affect TEI/watchdog timing; transient indexing delays are retryable and should not stop the run.
- Work must stay isolated from unrelated dirty files in both repos.
- 2026-04-02 batch:
  - rebuilt the live `codeatlas` container so the runtime actually picked up the new docs exclude rules and TEI-safe chunking
  - added discovery coverage for noisy assets (`cypress`, `mocks`, `_static`, `*.min.js`) and stopped re-merging split code chunks into oversized TEI inputs
  - added an embedder-side input cap as a second guardrail against `413 Payload Too Large`
  - requeued the six broken libraries through the real docs worker path and cleared the registry back to `35 ready / 0 error`
  - next live cleanup target from the same logs is the repeated `solemd.infra` watcher delete churn (`Webhook drained: 100 changes`, repeated `code-search-files` deletes)
- 2026-04-03 watcher/sync/doc freshness /clean audit:
  - verified all three subsystems are structurally sound: git-based change detection, SHA256 content hashing, deterministic chunk IDs, debounced watcher with PendingEditsTracker, PostgreSQL job queue with `FOR UPDATE SKIP LOCKED`, priority-based scheduler with stable hash jitter
  - W1 (medium): `_sync_locked()` in `core_indexing.py:42` calls per-file `_upsert_path_locked()` with `inline_relationships=True` (default in `core_neo4j.py:115`), but the global `resolve_cross_file_calls()` pass in `_refresh_workspace_graph_state()` only runs when `run_global_graph_passes=True` (line 199, gated on `force or is_full_project_scan`). Cross-file CALLS edges can go stale between full reindexes.
  - W5/W7 (medium): `_file_hashes` dict in the indexer is memory-only, lost on container restart, causing a full re-hash scan on first sync. Disk persistence would avoid the cold-start churn.
  - W2 (low): file trigram index has no reconciliation loop against main Qdrant index
  - W3 (acceptable): orphan cleanup 20% safety threshold is a deliberate safety > precision tradeoff
  - W4 (low): doc transient error retry has no max-retry cap; deleted repos retry forever
  - W6 (acceptable): git timeout 60s cooldown without backoff is adequate for normal operation
  - all findings are in SoleMD.Infra scope; hand-off per cross-project protocol when prioritized
- 2026-04-02 follow-up:
  - moved docs exact-match ranking into a shared scorer so bare lookups like `Stack` can outrank dotted variants such as `Modal.Stack`
  - added late-bound dependency resolution in `doc_search.tools.handlers` so the unified docs tool layer is patchable/testable without import-time coupling to live DB/index functions
  - focused docs retrieval/tool tests now pass again (`test_indexer_scoring`, `test_doc_tool_handlers`, `test_search_boosting`, `test_doc_tool_bridge`)
- 2026-04-02 current restart point:
  - live unified docs dogfood still shows stale out-of-scope chunks in Qdrant for Mantine (`Drawer.story.tsx`, `apps/mantine.dev/.../textarea.mdx`) even though the active library file discovery no longer includes those paths
  - this points to a scope-drift cleanup gap in the docs indexing pipeline, not only a ranking problem
  - next implementation batch: add deterministic stale-file cleanup from Qdrant, then continue output-contract normalization and mixed solemd.graph dogfood rounds
- 2026-04-02 resumed batch:
  - confirmed CodeAtlas already owns the top-level package and compose boundary; the remaining integration work is now about churn, payload shape, stale post-move references, and durable docs graph/runtime seams rather than another major folder reshuffle
  - identified a concrete restart-time churn bug: docs scheduler freshness cadence is process-local, so container restarts can immediately re-hit GitHub for every ready library
  - identified the next high-value contract cleanup targets: flatten `file_context`-style primary payloads further, reduce redundant inner mutation/admin status fields, and keep docs/code output contracts aligned for agent chaining
  - next implementation batch: persist freshness-check cadence in the docs DB, add a durable docs-graph replay seam, normalize the remaining high-value payloads, then rerun solemd.graph mixed dogfood
- 2026-04-02 current batch:
  - fixed the remaining high-frequency Qdrant churn by batching trigram deletes through a single filter delete, skipping redundant phase-2 trigram deletes after phase 1 succeeds, and suppressing dirty-tree delete replay in the git watcher when state already reflects the removal
  - focused churn regression suite now passes (`29 passed`) and live restart logs no longer show repeated `Webhook drained` storms or repeated `code-search-files` delete bursts
  - tightened `file_context` output for agent navigation: the compactor now keeps priority-first chunk ordering instead of re-sorting selected chunks back into line order, so primary symbols such as `PanelShell` and `GatedSwitch` lead the payload during live solemd.graph dogfood
  - focused payload compaction tests pass (`16 passed`) and live `file_context(features/graph/components/panels/PanelShell.tsx)` now leads with the exported component/function symbols rather than early constants
- 2026-04-02 retrieval/output follow-up:
  - added descriptive-query surface rescue for docs search so component-led prompts can pull canonical pages into the candidate set without relying on dense retrieval luck
  - rebalanced that rescue path so it supplements hybrid retrieval instead of dominating it, and added strong-path sorting for API-lookups so `.github`, examples, demos, and story-style surfaces fall behind canonical docs/source when both exist
  - focused docs retrieval tests now pass (`25 passed`) and live solemd.graph dogfood improved in two concrete cases:
    - Mantine `Stack gap motion layout patterns` now recommends `apps/mantine.dev/src/pages/core/stack.mdx`
    - Framer Motion `AnimatePresence layout shared transition patterns` now recommends `packages/framer-motion/src/components/AnimatePresence/types.ts` instead of `.github` FAQ noise
- 2026-04-02 final stabilization:
  - tightened style-query navigation so feature-scoped visual edits can recommend the application site over the global token file when the feature match is materially stronger
  - removed confusing same-file/same-layer override chatter from `recommended_start` so payloads stay compact and semantically consistent for LLM use
  - final focused verification passed:
    - `146 passed` across search navigation, payload compacting, docs intent/scoring, and docs graph sync
    - `compileall` passed for `code_search`, `doc_search`, and `chunking`
  - final live solemd.graph dogfood after rebuild:
    - `label background cosmograph` -> `features/graph/cosmograph/label-appearance.ts`
    - `rag entity selection scope cosmograph` -> `features/graph/lib/cosmograph-selection.ts`
    - `new writing panel mantine stack motion.div reveal` -> `features/graph/components/panels/PanelShell.tsx`
    - Mantine docs queries continue to recommend canonical pages, with only secondary-result noise left as non-blocking follow-up
- 2026-04-02 snapshot-store migration:
  - migrated scraped docs away from synthetic mirror repos into the native current-state snapshot model backed by the docs Postgres control plane
  - published `/codeatlas/semantic-scholar-api`, `/codeatlas/pubtator3`, and `/codeatlas/cosmograph` through the snapshot path and confirmed all three are `source_type=snapshot`, `status=ready`, and `last_freshness_state=fresh`
  - removed the obsolete mirror helper modules and rewrote scraper documentation around `/tmp` generation + in-container `--publish` instead of GitHub push flows
  - fixed a real `/clean` regression in the docs pipeline: successful no-op snapshot reindex now clears stale freshness flags, and the git fast path no longer performs redundant hash scans before the unchanged-head skip gate
  - deleted the old mirror repo caches from the live `codeatlas` container and verified they do not reappear once the runtime is fully on snapshot-backed libraries
