# 2026-04-01 SoleMD.Infra Code-Search Agentic Ledger

## Scope

- Repo: `/workspaces/SoleMD.Infra`
- Target: `mcp/code-search`
- Goal: long-running `/clean` pass on code-search, including modularization, centralization, indexing/runtime churn reduction, Neo4j quality improvements, live dogfood against `solemd.graph`, and iterative tool/search ergonomics improvements for agent use.
- Dogfood constraint: all live validation and usage-pattern dogfood in this run must be against `solemd.graph`, not deprecated `solemd.web` or generic example repos.
- Baseline branch: `master`
- Baseline HEAD: `74fa81842b9fa73bf8370dce45dbd2284ee0141a`

## Architecture Baseline

- `graph_overview` shows `analyze_file_facets`, `CodeSearchTools.__init__`, `Neo4jGraphWriter.__init__`, and server path helpers as central nodes.
- Latest live `graph_overview` confirms `normalize_project_path`, `analyze_file_facets`, `dedupe_preserve_order`, Neo4j read/write entrypoints, and sync runtime gates remain central. Any duplication here has broad blast radius.
- Current clone scan still reports a duplicated compatibility surface between `chunking/facet_format.py` and `chunking/file_facets.py`.
- Current in-scope non-test Python files above the hard 600 LOC target are now only:
  - `code_search/server/tool_definitions.py` (`694`)
  - `chunking/facet_domains.py` (`684`)
  - `code_search/config.py` (`682`)
  - `code_search/server/handlers/patterns.py` (`654`)
  - `code_search/tools/semantic_search.py` (`650`)
  - `code_search/server/handlers/search.py` (`642`)
  - `code_search/server/slices.py` (`623`)
  - `chunking/languages/css.py` (`607`)
- No in-scope non-test Python files remain above the hard 700 LOC ceiling; the current maximum is `699`.

## Ranked Themes

1. Reduce remaining indexing and graph-write churn without regressing parity.
2. Improve agent-facing dogfood for mixed frontend/backend queries and tool ergonomics, always against `solemd.graph`.
3. Finish Neo4j `/clean` pass: deprecations, retry posture, duplicated query fragments, and incremental write churn.
4. Remove compatibility duplication and centralize facet/search/rerank helper ownership.
5. Re-scan touched areas after each batch and keep iterating until churn evidence is gone, including explicit index/watchdog churn review.
6. Optimize every tool response for LLM navigation utility: enough structure and guidance to reduce context use, but no wasted token-heavy prose.

## Live Ledger

| id | status | priority | theme | evidence | next action | verification |
|---|---|---|---|---|---|---|
| CS-001 | done | P0 | Modularization | `tools.py`, `indexer.py`, `sync.py`, `watcher/client.py`, `transport/http_server.py`, `writer.py` all exceeded the 600 LOC rule before this run | Split along stable mixin/module seams and preserve compatibility barrels where needed | Focused pytest slices passed; current source inventory now capped to 694 LOC |
| CS-002 | done | P0 | Cross-stack facets | Broad frontend/backend queries lacked enough structure for agent use | Added deterministic domain/cross-stack facets and wired them into indexing and ranking | `test_file_facets.py`, `test_boost.py`, `test_search_output_shape.py`, `test_tools_quality.py` |
| CS-003 | done | P0 | Exact frontend surfaces | CSS variables/selectors/data attributes were indexed but not retrieved robustly | Added exact frontend-surface candidate path using indexed facets first | `test_integration_qdrant_literal_search_exact_frontend_surface.py` |
| CS-004 | done | P0 | Dogfood gaps | Mixed-domain searches still needed stronger guidance and clearer starts | Added top-level navigation payloads, start-specific confidence, override explainers, and re-dogfooded weak `solemd.graph` queries until reusable panel/query entrypoints ranked correctly | Live MCP search runs + focused tests |
| CS-005 | done | P0 | Neo4j quality | Earlier logs showed deprecated Cypher patterns, duplicated overview/dead-code query logic, and write churn risk | Patched Neo4j query/writer surfaces, centralized query fragments, added retry-safe write helpers, and revalidated with focused Neo4j tests plus live logs | `test_neo4j_writer.py`, `test_neo4j_queries.py`, `test_neo4j_gds_analysis.py`, live container logs |
| CS-006 | done | P1 | Churn review | Sync/indexer/transport needed another explicit churn audit after modularization | Re-ran trigram, transport, watcher, and live log checks; no remaining file >700 LOC, no focused churn test failures, and no live ingestion errors during `solemd.graph` dogfood | `test_sync_trigram_churn.py`, `test_transport_monitor.py`, `test_transport_runtime_cache.py`, `test_watcher_filter_alignment.py`, live logs |
| CS-007 | done | P1 | Centralization | Response shaping, facet coercion, search navigation, Neo4j query specs, and sync/runtime helpers had split ownership | Centralized the remaining hot-path ownership into dedicated helper modules and trimmed compatibility surfaces to thin barrels | `find_clones`, line-count scan, focused tests |
| CS-008 | done | P1 | Agent ergonomics | Tool responses still left avoidable work to the LLM and hid query-aware overrides | Added top-level `navigation`, `workflow_bundle.kind`, `response_confidence`, `override_used`, `why_not_top_ranked`, and exact-surface precision stats | `test_search_output_shape.py`, `test_search_handler.py`, live MCP search runs |
| CS-009 | done | P1 | Final clean rounds | User requested 1-2 more `/clean` and churn passes after optimization, plus another cycle whenever churn evidence remained | Ran another clone/orphan scan, line-count pass, focused test batches, live log review, and `solemd.graph` dogfood loop; only next-tier future improvements remain | `find_clones`, `find_patterns`, line-count scan, focused tests, live dogfood |
| CS-010 | done | P2 | Batch commits | Verified code-search work was landed in two scoped `mcp/code-search` batches while unrelated Infra edits stayed out of scope | Keep future follow-ups isolated to `mcp/code-search` only and continue using `solemd.graph` dogfood before landing them | `git log`, pushed commits, focused tests, live dogfood |
| CS-011 | done | P1 | LLM dogfood loop | Needed at least 10 `solemd.graph` workflows plus subagent feedback distilled into robust improvements | Ran 12 live `solemd.graph` MCP workflows, checked exact-surface retrieval through the public literal path, and captured sidecar feedback themes | Ledger entries + focused tests + live MCP runs |
| CS-012 | done | P1 | Consolidation sweep | User requested an explicit pass to centralize/modularize repeated patterns discovered during this run | Re-scanned changed modules for duplicated helpers, response shaping, query fragments, and indexing code paths after the final refactor rounds | `find_clones`, `find_patterns`, focused tests |
| CS-013 | done | P1 | LLM output optimization | User requested a methodical review of every tool’s response density, guidance, and token efficiency for agent use rather than human readability | Added centralized payload compaction/minified JSON output, removed duplicate ranking/navigation/facet mirrors, shortened low-signal notes, and re-dogfooded tool outputs against `solemd.graph` | `test_payload_compact.py`, `test_search_handler.py`, `test_tools_quality.py`, live MCP dogfood |
| CS-014 | done | P1 | Iterative output contracts | Second-stage live dogfood still showed oversized `analyze_impact`/`index_status` payloads and a misleading `slice_build(entry_points=[file])` path | Added another compaction round for `analyze_impact`, `graph_overview`, and `index_status`, then fixed file-path entry-point resolution so `slice_build` anchors to the intended symbol instead of an arbitrary constant | `test_payload_compact.py`, `test_slice_handlers.py`, live `solemd.graph` MCP runs |
| CS-015 | done | P0 | Runtime churn | Live forced reindex plus watcher/apply-changes activity exposed overlapping Neo4j writes and deadlock risk | Serialized graph mutation batches under the full-index lock, reduced graph write concurrency for change batches, and added churn regression coverage | `test_sync_trigram_churn.py`, live reindex against `solemd.graph` |
| CS-016 | done | P1 | Autoheal hygiene | Fresh/dirty workspaces were still eligible to queue redundant autoheal reindexes | Gated the pending-change autoheal path on actual staleness so only stale dirty indexes queue reindex work | `test_tools_quality.py`, live `index_status` review |
| CS-017 | done | P1 | Output navigation polish | Final live dogfood still showed `file_context` preferring early low-signal constants and `slice_build`/`slice_view` needing stronger entry anchoring in their output cards | Prioritized high-signal chunks in compacted file-context payloads, pinned entry symbols first in slice output cards, and revalidated the live `solemd.graph` outputs | `test_payload_compact.py`, `test_slice_handlers.py`, live `file_context` + `slice_build` MCP runs |

## Completed Batches

- Split oversized code-search hot spots into smaller modules across tools, indexer, sync, transport, watcher, server helpers, and chunking facets.
- Added deterministic domain and cross-stack facets for better frontend/backend retrieval.
- Added robust exact-surface retrieval for CSS custom properties, selectors, data attributes, and related frontend override surfaces.
- Added JSX/render-site edges so symbol navigation can surface real mounting sites instead of falling back to coarse file dependents.
- Added stylesheet import lineage so CSS files can answer "what loads this stylesheet?" via the same graph/navigation surfaces as TS/Python modules.
- Added alias-aware import-origin jump hints for unresolved hook/store callees surfaced by navigation and symbol inspection.
- Reduced file-trigram churn by caching availability once per batch and added regression coverage.
- Added transient Neo4j write retries for update/remove/rename mutation paths.
- Relaxed tool schema friction for `analyze_impact(detail="card")` and `trace_flow(detail=...)`.
- Added a dedicated pending output-optimization track for tool response shaping so retrieval quality and response utility are treated as one end-to-end surface.
- Narrowed CSS-authoring query detection so broad graph-selection queries no longer misclassify as styling work.
- Carried file-scope rescue metadata into final ranking, output shaping, and rank explanations.
- Centralized result facet coercion in `server/facet_helpers.py` to preserve runtime-only ranking metadata consistently.
- Split `tools/semantic_search.py` into orchestration plus `semantic_intent.py` and `semantic_file_scope.py`, bringing the source file under the 600-line target.
- Added a generic backend/data-intent query detector and used it to prefer backend/query-layer owners during file-scope rescue without overfitting to `solemd.graph`.
- Moved facet-key ownership and payload/search-text helpers fully into `chunking/facet_format.py`, so `file_facets.py` is no longer a parallel formatter surface.
- Added top-level search `navigation` payloads with `recommended_start`, layered starts, workflow bundle metadata, and start-specific confidence/override reasons so agent consumers can act on mixed-layer search results without reverse-engineering ranking internals.
- Tightened exact frontend-surface retrieval so CSS variable/selector owner files are prioritized before candidate trimming and exposed when the exact-surface path had to degrade precision.
- Revalidated the final retrieval ergonomics against live `solemd.graph` queries for panel authoring, SQL explorer modernization, RAG route/service traversal, DuckDB scope SQL, CSS token lookup, Mantine override lookup, and loading-overlay styling.
- Centralized output compaction in `server/payload_compact.py`, switched JSON responses to a minified serialization path, trimmed duplicate `recommended_start`/ranking/facet mirrors, and shortened low-signal explanatory notes for agent use.
- Eliminated live Neo4j mutation churn by serializing change-batch graph writes under the full-index lock and lowering graph mutation batch concurrency for incremental apply paths.
- Stopped redundant autoheal churn for fresh-but-dirty workspaces by requiring real staleness before the pending-change threshold can queue a reindex.
- Added a second compaction pass for `analyze_impact`, `graph_overview`, and `index_status`, so high-traffic JSON outputs keep navigation signal while shedding repeated ranking/history noise.
- Fixed `slice_build(entry_points=[file path])` to resolve the file to a file-scoped entry symbol instead of landing on an arbitrary constant, then re-dogfooded it live against `PanelShell.tsx`.
- Prioritized `file_context` chunks by navigation value instead of raw file order, so high-signal exported functions and interfaces survive truncation ahead of trivial constants.
- Pinned slice entry symbols first in `slice_build` and `slice_view` output cards, so entrypoint-driven workflows start at the requested symbol even when related helpers rank higher by relevance.

## Commits

- `9b973c6` — `Improve code-search navigation and MCP payload quality`
- `0902211` — `Polish code-search slice and context outputs`

## Blockers / Constraints

- Another agent is working on watchdog/code-sync and TEI. Reindex timing can temporarily depend on that work; indexing delays are retryable and should not terminate this run.
- The worktree already contains unrelated Infra changes outside `mcp/code-search`; batch commits must avoid scooping those up.
- All live dogfooding in this run must stay on `solemd.graph`.

## Final Verification

- Full suite before the final no-code verification round: `uv run --extra dev pytest` -> `610 passed, 7 skipped`
- Focused render-edge/import-lineage/output-contract verification:
  - `uv run --extra dev pytest -q tests/test_import_graph.py tests/test_css_parser.py tests/test_callgraph.py tests/test_tools_quality.py tests/test_formatters.py` -> `124 passed`
  - `uv run --extra dev pytest -q tests/test_payload_compact.py tests/test_search_handler.py tests/test_tools_quality.py` -> `33 passed`
  - `uv run --extra dev pytest -q tests/test_payload_compact.py tests/test_search_handler.py tests/test_formatters.py tests/test_callgraph.py tests/test_css_parser.py tests/test_import_graph.py tests/test_tools_quality.py` -> `131 passed`
  - `uv run --extra dev pytest -q tests/test_payload_compact.py tests/test_search_handler.py tests/test_tools_quality.py` -> `37 passed`
- Final focused clean/churn/query batches:
  - `uv run --extra dev pytest -q tests/test_sync_trigram_churn.py tests/test_neo4j_writer.py tests/test_neo4j_queries.py tests/test_search_output_shape.py tests/test_search_handler.py tests/test_tools_quality.py` -> `144 passed`
  - `uv run --extra dev pytest -q tests/test_neo4j_gds_analysis.py tests/test_transport_monitor.py tests/test_transport_runtime_cache.py tests/test_watcher_filter_alignment.py` -> `23 passed`
  - `uv run --extra dev pytest -q tests/test_server_core_quality.py tests/test_slice_handlers.py tests/test_slices.py` -> `67 passed`
  - `uv run --extra dev pytest -q tests/test_sync_trigram_churn.py tests/test_import_graph.py tests/test_css_parser.py tests/test_callgraph.py tests/test_tools_quality.py tests/test_formatters.py tests/test_neo4j_writer.py` -> `160 passed`
  - `uv run --extra dev pytest -q tests/test_payload_compact.py tests/test_search_handler.py tests/test_server_core_quality.py tests/test_tools_quality.py tests/test_sync_trigram_churn.py` -> `65 passed`
  - `uv run --extra dev pytest -q tests/test_payload_compact.py tests/test_tools_quality.py tests/test_sync_trigram_churn.py` -> `36 passed`
  - `uv run --extra dev pytest -q tests/test_slice_handlers.py tests/test_payload_compact.py tests/test_tools_quality.py tests/test_sync_trigram_churn.py` -> `50 passed`
  - `uv run --extra dev pytest -q tests/test_slice_handlers.py tests/test_payload_compact.py` -> `23 passed`
- Targeted compile checks:
  - `python3 -m compileall code_search chunking tests`
  - `python3 -m compileall code_search/server/payload_compact.py tests/test_payload_compact.py`
  - `python3 -m compileall code_search/server/slices.py tests/test_slice_handlers.py`
- Non-test Python LOC scan: `OVER_700 = 0`
- Live services: `context-indexer`, `context-sync`, `tei`, and `qdrant` all healthy during the final dogfood loop.
- Live reindex after the final rebuild completed successfully for `solemd.graph` and restored the full indexed file set before dogfood.

## Final Dogfood Highlights

- `new writing panel mantine stack motion.div reveal` -> `features/graph/components/panels/PanelShell.tsx#PanelShell`
- `new lecture panel mantine stack motion.div reveal` -> `features/graph/components/panels/PanelShell.tsx#PanelShell`
- `modernize SQL query explorer panel mantine textarea stack` -> `features/graph/components/explore/query-panel/QueryPanel.tsx#QueryPanelComponent`
- `prompt panel graph sync selected scope rag` -> `features/graph/components/panels/prompt/use-rag-query.ts#useRagQuery`
- `route service repository for rag search endpoint` -> query-aware override to `engine/app/api/rag.py#search_evidence` over the rank-1 service
- `selection graph paper refs scope sql` -> query-aware override to `features/graph/duckdb/queries/node-selection.ts#querySelectionScopeGraphPaperRefs` over the rank-1 repository
- `label background cosmograph` -> query-aware override to `app/styles/tokens.css` with `label-appearance.ts` still visible as the implementation file
- `inspect_symbol(ConfigPanel)` -> live caller `features/graph/components/explore/DashboardShellClient.tsx#DashboardShellClient`, proving render-site edges are active in `solemd.graph`
- `dependents(app/styles/vendor-overrides.css)` -> `app/globals.css`, proving stylesheet import lineage is now indexed and queryable
- `slice_build(entry_points=['features/graph/components/panels/PanelShell.tsx'])` -> file-scoped entrypoint `PanelShell`, proving file-path slice entry resolution no longer collapses to `PANEL_TOP`
- `file_context(features/graph/components/panels/PanelShell.tsx)` -> now surfaces `interactivePillBase`, `GatedSwitch`, `PanelShell`, and `PanelShellProps` in the truncated chunk list instead of only early constants
- `search_code(mode='literal')` exact-surface queries still route through `candidate_source = exact_frontend_surface`:
  - `--graph-label-bg` -> `app/styles/tokens.css`, `features/graph/cosmograph/label-appearance.ts`
  - `[data-combobox-selected]` -> `app/styles/vendor-overrides.css`
  - `.mantine-Select-option` -> `app/styles/vendor-overrides.css`
- Public JSON tool outputs are now compact and minified, with duplicate ranking/navigation/facet mirrors removed from `search_code` and `inspect_symbol`, additional low-value history/ranking noise removed from `index_status` and `analyze_impact`, and `graph_overview` orientation lists capped for agent use.

## Remaining Queue

1. Consider next-tier navigation improvements only if repeated dogfood shows they matter: richer JSX mount-path edges, stylesheet cascade ancestry, or stronger import-origin jump hints beyond the new alias-aware baseline.
2. Continue periodic per-tool output contract reviews against `solemd.graph` as new tools or payload fields are added, so density stays optimized for agent use rather than regressing toward human-oriented verbosity.
