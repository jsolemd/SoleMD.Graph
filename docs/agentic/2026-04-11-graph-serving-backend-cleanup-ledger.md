# 2026-04-11 SoleMD.Graph Graph Serving Backend Cleanup Ledger

## Scope
- Separate serving surfaces from warehouse/build tables for graph, wiki, and entity runtime paths.
- Move graph-facing paper metadata off `paper_evidence_summary` and onto a canonical serving table.
- Centralize storage/runtime decisions so Postgres and warehouse IO stop depending on accidental host-path choices.

## End State
- FastAPI/Pydantic and Next runtime paths read only canonical serving tables and repositories.
- Internal evidence/build tables remain internal and rebuildable.
- Docker and local config use stable Linux mountpoints, with host-path changes centralized behind a small set of variables.
- WSL/Windows networking stays on mirrored mode without stale NAT-era `netsh interface portproxy` rules colliding with local dev ports.

## Operating Decision
- Keep the live serving Postgres where it is now:
  - Docker named volume `solemd-graph_pgdata`
  - Linux-side storage under Docker Desktop / WSL ext4
  - this remains the canonical serving database for FastAPI, Pydantic, and Next/BFF runtime reads
- Keep `E:\\wsl2-solemd-graph.vhdx` as the canonical `/mnt/solemd-graph` disk:
  - this is the correct home for runtime artifacts, graph bundles, and rebuild scratch/checkpoint paths
  - it is not the right destination for the full live Postgres data directory in the current plan
- Move large local warehouse filesystem content to E-backed Linux storage and stop using `/mnt/e/...` bind mounts for hot runtime/build paths.

## Target Data Tiers
### 1. Serving tables: API/runtime may read these directly
- Graph runtime:
  - `solemd.graph_runs`
  - `solemd.graph_points`
  - `solemd.graph_clusters`
  - `solemd.graph_paper_summary` (canonical universal frontend paper-card surface)
- Entity runtime:
  - `solemd.entities`
  - `solemd.entity_aliases` (broad exact-query alias projection used by RAG/entity resolution)
  - `solemd.entity_runtime_aliases`
  - `solemd.entity_corpus_presence` (target canonical entity-to-paper surface)
- Paper-level serving:
  - `solemd.paper_evidence_summary`
  - `solemd.paper_relation_evidence`
- Stable metadata used by serving projections:
  - `solemd.corpus`
  - `solemd.papers`
- Wiki runtime should resolve through serving repositories and serving projections, not directly through warehouse/source tables.

### 2. Canonical build tables: local backend may use these to generate serving surfaces
- `solemd.entity_rule`
- `solemd.relation_rule`
- `solemd.journal_rule`
- `solemd.vocab_terms`
- `solemd.paper_authors`
- `solemd.citations`
- UMLS helper matviews such as:
  - `umls.cui_aliases`
  - `umls.mesh_to_cui`
  - `umls.gene_to_cui`
  - `umls.tradename_bridge`

### 3. Warehouse/source tables: never query these from the public API surface
- `pubtator.entity_annotations`
- `pubtator.relations`
- raw ingest/build files and checkpoint directories
- any large local export/intermediate artifact used only to build the serving surfaces

### 4. Filesystem content on E-backed Linux storage
- `/mnt/solemd-graph/bundles`
- `/mnt/solemd-graph/tmp`
- graph build scratch, DuckDB temp, citation temp, RAG refresh temp
- local warehouse file trees such as raw dataset drops, graph export intermediates, and rebuild artifacts

## Ranked Worklist
1. Finish the last graph-owned runtime cleanup under RAG and keep runtime reads on serving repositories only.
2. Prune stale runtime artifacts from `/mnt/solemd-graph` now that the E-backed cutover is complete and verified.
3. Move larger warehouse filesystem trees and hot rebuild scratch/checkpoint paths onto `/mnt/solemd-graph`.
4. Remove remaining wiki/entity request-contract duplication across FastAPI, TS wire types, and feature-layer DTOs.
5. Keep serving Postgres on the Docker named volume and avoid backsliding into `/mnt/e/...` host-path dependencies.

## Active TODO
- [x] Fix the entity projection stage/swap owner so `solemd.entities`, `solemd.entity_aliases`, and `solemd.entity_runtime_aliases` rebuild through one canonical code path.
- [x] Make `graph_paper_summary` stage/swap repeat-safe by renaming staged constraints and indexes during cutover.
- [x] Fix graph artifact cleanup so it preserves the current graph run and removes stale replayable checkpoints/bundles instead of accumulating them forever.
- [x] Implement the durable schema migration ledger bootstrap migration and explicit runner.
- [x] Add and verify an explicit migration-ledger adoption path for the pre-ledger live DB so existing applied migrations can be recorded without rerunning them.
- [x] Apply the new durable schema migration ledger bootstrap migration and adopt the current live DB into it so future schema readiness is machine-verifiable.
- [x] Restore and verify the current graph bundle after the earlier cleanup removed stale and current derived bundle dirs while the keep-run selection bug was still live.
- [x] Promote prerequisite serving-schema changes on the live DB:
  - `065_extend_paper_evidence_summary_for_graph_attachment.sql`
  - `066_add_graph_paper_summary.sql`
- [x] Finish the canonical evidence refresh and verify `solemd.graph_paper_summary` is fully populated on the live DB.
- [ ] Make the alias/UMLS serving split explicit end to end:
  - keep `solemd.entity_aliases` as the broad exact-query serving projection for RAG/entity resolution
  - keep `solemd.entity_runtime_aliases` as the minimal hot-path highlight/matcher subset
  - do **not** introduce a duplicate query alias table unless a measured query need proves the existing serving projection insufficient
  - [x] activate the pending UMLS/anatomy alias flow with the real rebuild after the completed `enrich_vocab_terms.py` run and the full entity pipeline run
- [x] Make the full entity rebuild resumable and stage-aware:
  - durable checkpoint metadata now lives under `graph_tmp_root_path / entity_build / checkpoint.json`
  - `--resume` reuses fully built staged projection tables when available instead of dropping them unconditionally
  - `--from-step` allows deterministic restart at `catalog`, `aliases`, or `presence`
  - `--parallel-post-catalog` allows the alias/runtime projection rebuild and the entity-to-corpus projection rebuild to run in parallel after catalog completion
- [x] Backfill and verify `solemd.entity_corpus_presence` on the live DB.
- [x] Apply safe redundant-index drops after projection cutover:
  - `060_drop_redundant_corpus_pmid_index.sql`
  - `062_drop_redundant_pubtator_entity_partial_indexes.sql`
- [ ] Finish remaining runtime contract cleanup:
  - centralize any remaining graph-owned release/ref/scope logic on the graph-owned adapter and keep RAG on retrieval/evidence concerns only
- [ ] Replace the last raw runtime relation scan:
  - `fetch_relation_matches()` still reads `pubtator.relations` directly for bundle hydration
  - publish a serving relation-match surface keyed by `corpus_id` and stop reading warehouse relation rows on live requests
- [ ] Remove remaining direct runtime vocab fallback reads from RAG concept normalization:
  - fold the remaining `vocab_term_aliases` / `vocab_terms` exact-match fallback into the serving alias/entity projections
  - keep runtime entity normalization on serving tables only
- [ ] Prune replayable runtime artifacts on the E-backed disk after verifying live ownership:
  - old bundle generations not referenced by the current graph release
  - dead scratch trees under `/mnt/solemd-graph/tmp`
  - orphaned checkpoint/export artifacts that are not source-of-truth data
  - partial progress complete:
    - removed stale `/tmp/citations/*.csv`
    - removed stale `/tmp/citations_bulk/*.csv`
    - removed orphaned `graph_embeddings_*.f32`
    - reclaimed about `10.2G`
    - remaining root-owned graph-build checkpoint dirs need elevated cleanup if they are confirmed stale
- [ ] Restore and verify the current published bundle before bundle pruning:
  - live DB current run `2b96f229-2c48-407a-8d32-d9db15c8bca9` points at `/mnt/solemd-graph/bundles/2b96f229-2c48-407a-8d32-d9db15c8bca9`
  - that directory was missing at first verification after the E-backed cutover
  - local `uv run python -m app.graph.build --re-export --local --json` was started to republish the active bundle before deleting legacy bundle dirs
- [ ] Move larger local warehouse filesystem trees to `/mnt/solemd-graph` and keep hot build paths Linux-native.

## Done
- `solemd.entity_runtime_aliases` split from warehouse aliases for the hot matcher path.
- `solemd.entity_aliases` is now treated as the broad exact-query serving projection for RAG/entity resolution rather than a raw warehouse source table.
- Entity detail aliases now read from `solemd.entity_runtime_aliases`, so all frontend-facing entity APIs stay on serving surfaces instead of the warehouse alias catalog.
- `solemd.entity_corpus_presence` introduced as a serving projection for entity-to-corpus lookups.
- `solemd.entity_corpus_presence` is now populated live with `312,328,688` rows and the wiki page-context endpoint is reading it successfully.
- `solemd.entities` moved to a stage/swap rebuild path.
- Full entity rebuild orchestration is now checkpointed and resumable:
  - authoritative resume metadata is written to the durable entity-build checkpoint file, not inferred heuristically from audit rows
  - projection stage tables (`entities_next`, `entity_aliases_next`, `entity_runtime_aliases_next`, `entity_corpus_presence_next`) can now be reused safely after a failed swap/build instead of always being dropped on restart
  - `solemd.load_history` remains the audit trail for stage and pipeline progress
  - selective parallelism is now explicit: `aliases` and `presence` may run in parallel only after `catalog` is complete
- UMLS/anatomy entity serving is now live:
  - `solemd.entities` includes `122` anatomy entities
  - `solemd.entity_aliases` now contains `125,777` `umls` / `umls_tradename` aliases
  - `solemd.entity_runtime_aliases` now contains `125,770` runtime-eligible `umls` / `umls_tradename` aliases
- Wiki semantic-group serving is now live:
  - `068_add_wiki_page_semantic_group` is applied and recorded
  - `solemd.wiki_pages.semantic_group` is now the canonical wiki/runtime color field
  - the live sync path refreshes `semantic_group` even for unchanged markdown pages, so ontology updates do not require content edits to republish runtime metadata
  - wiki graph nodes now read stored `semantic_group` instead of re-deriving it from `entity_type` inside the service layer
- Wiki entity-page context is now substantially faster and cleaner:
  - the backend no longer runs separate parallel count/top-paper queries over the same entity hit set
  - `PostgresWikiRepository.get_entity_page_context()` now delegates to one combined serving query in `EntityGraphProjectionRepository.fetch_page_context()`
  - that query scans `entity_corpus_presence` once, materializes graph-scoped hits once, computes counts from those CTEs, and reads top papers from the canonical `graph_paper_summary` surface
  - the wiki top-paper path no longer depends on `entity_corpus_presence.pmid`, so it avoids heap reads on the 38 GB entity-presence table
  - live `delirium` benchmark:
    - old top-paper query: about `3.99 s`
    - rewritten combined page-context query: about `0.35 s`
  - the frontend now starts entity page-context fetches immediately for canonical `entities/*` routes instead of waiting for the page payload to confirm `page_kind = entity`
- Schema migration readiness is now fully clean again:
  - `059_add_entity_corpus_presence` adopted after live verification
  - `060_drop_redundant_corpus_pmid_index` applied and recorded
  - `062_drop_redundant_pubtator_entity_partial_indexes` applied and recorded
  - `068_add_wiki_page_semantic_group` applied and recorded
  - `engine/db/scripts/schema_migrations.py status` now reports `ready: true`
- Redundant index cleanup is now reflected physically as well as logically:
  - `solemd.idx_corpus_pmid` is gone
  - `pubtator.idx_pt_entity_disease` is gone
  - `pubtator.idx_pt_entity_chemical` is gone
  - `pubtator.idx_pt_entity_gene` is gone
- `solemd.paper_evidence_summary` and `solemd.paper_relation_evidence` now refresh through a durable stage/swap cutover instead of truncate-in-place.
- Graph attachment no longer hits raw `pubtator.*`.
- Graph-facing paper identity now has a canonical serving table: `solemd.graph_paper_summary`.
- Wiki browser/BFF contract now exposes `graph_release_id` only; `graph_run_id` remains an internal backend resolution detail.
- Shared `schema` skill updated and synced with Postgres operating rules.
- Docker/storage audit completed:
  - `/mnt/e` is `9p/drvfs`, not acceptable for Postgres or hot warehouse reads.
  - `E:\\wsl2-solemd-graph.vhdx` is a valid VHDX containing a raw ext4 filesystem labeled `solemd-graph`, UUID `2b5c3e6f-18a1-4943-999e-555596cec91a`, last mounted at `/mnt/solemd-graph`.
  - `/mnt/solemd-graph` now resolves to the dedicated ext4 disk `/dev/sdd`, not the root filesystem.
  - Current verified mount state:
    - `/mnt/solemd-graph` -> `/dev/sdd`
    - ext4 label `solemd-graph`
    - about `1.1T` total, `878G` used, `150G` free at verification time
  - Root WSL ext4 is now separate:
    - `/` -> `/dev/sde`
    - about `1007G` total, `65G` used, `892G` free at verification time
  - Docker Desktop Postgres remains on its named volume; runtime artifacts are no longer sharing the same ext4 mountpoint as the root distro.
- Graph runtime artifact cleanup is now fixed in code:
  - stale replayable graph checkpoints are removed by run ID rather than only deleting incomplete dirs
  - stale bundle directories are cleaned alongside checkpoint dirs
  - keep-run selection now preserves `is_current = true` graph runs and falls back to the newest completed run if current metadata is missing
  - filesystem keep-run IDs are normalized to strings, so UUID-valued DB rows no longer cause the current bundle/checkpoint dir to be mistaken for stale data
- E-backed runtime-artifact pruning has started safely:
  - stale citation temp CSVs under `/mnt/solemd-graph/tmp/citations` are gone
  - stale legacy bulk-citation CSVs under `/mnt/solemd-graph/tmp/citations_bulk` are gone
  - the loose replayable `graph_embeddings_*.f32` scratch blob is gone
  - `/mnt/solemd-graph` free space increased from about `150G` to about `160G`
  - remaining graph-build checkpoint dirs are intentionally being left in place until live ownership and root-owned cleanup are handled explicitly
- The current graph bundle has been restored and verified live:
  - `solemd.graph_runs` now contains only the active current run
  - `/graph-bundles/<checksum>/base_points.parquet` returns `200 OK`
  - bundle and manifest files exist again under `/mnt/solemd-graph/bundles/<current-run-id>`
- Live root filesystem headroom improved materially after cleanup:
  - before cleanup: ~`3.3 GB` free on `/dev/sdf`
  - after cleanup: ~`31 GB` free on `/dev/sdf`
- Live serving-schema prerequisites are now applied:
  - `065_extend_paper_evidence_summary_for_graph_attachment.sql`
  - `066_add_graph_paper_summary.sql`
  - `solemd.graph_paper_summary` is now populated live from the canonical evidence refresh/backfill
- Serving-table rebuild owners are now stage/swap based in code:
  - `solemd.graph_paper_summary`
  - `solemd.paper_evidence_summary`
  - `solemd.paper_relation_evidence`
  - the active live evidence refresh was restarted under the corrected `graph_paper_summary` swap logic after a verified PostgreSQL rename conflict was found in the old implementation
- Graph runtime reload path is now materially cleaner:
  - hot `base_points` / `base_clusters` tables are persisted in a browser-local OPFS DuckDB file when supported, so same-checksum full reloads can reopen the hot cache instead of rebuilding those tables from parquet
  - immutable bundle assets now serve from `/graph-bundles/<checksum>/...` through checksum-addressed published aliases under `/mnt/solemd-graph/bundles/by-checksum/<checksum>`
  - published checksum aliases are now created at bundle export/publish time and preserved during runtime artifact cleanup
  - the old asset route/database-resolution path was removed from the frontend asset server contract
  - existing completed bundle aliases were backfilled once for the live current checksum so the new serving path is already active on this machine
- Live schema migration state is now durable and machine-verifiable:
  - `067_schema_migration_ledger.sql` is applied on the live DB
  - the live DB has been explicitly adopted into `solemd.schema_migration_ledger`
  - ledger status now reports only three legitimately pending migrations:
    - `059_add_entity_corpus_presence`
    - `060_drop_redundant_corpus_pmid_index`
    - `062_drop_redundant_pubtator_entity_partial_indexes`
- Runtime contract cleanup landed further than the original list:
  - public wiki API/service no longer exposes `graph_run_id`
  - dead entity `summary` payload has been removed across backend schemas, service, TS wire models, and hover-card consumers
  - dead wiki-local graph paper/ref SQL has been removed; graph-paper resolution stays owned by `app.graph.repository`
  - wiki page responses now carry stored `semantic_group`, so frontend/wiki runtime no longer depends on service-side ontology inference
  - `PostgresRagRepository.resolve_selected_corpus_id()` no longer duplicates graph-ref candidate normalization before delegating to `PostgresGraphRepository`
  - the legacy `selected_paper_id` RAG request/response field has been removed end to end; the canonical paper-selection seam is now `selected_graph_paper_ref`
  - dead RAG-local graph release SQL/export surface has been removed; graph release lookup SQL now lives only in `app.graph.repository`
  - graph query scope selection (`selection` vs `current_map` vs explicit `graph_run`) now lives in `app.graph.repository`; the private RAG route helper has been removed and metadata/entity/relation retrieval delegate to the graph-owned resolver instead
  - graph-run paper-count estimation SQL/caching used for dense exact-vs-ANN routing now lives in `app.graph.repository`; RAG vector search delegates to the graph repository directly instead of keeping a private sizing wrapper
  - frontend ask-flow and direct RAG-query paths now share one graph selection/request-context builder instead of separately re-deriving the same `graph_release_id` / selected-node / selection-scope payload
  - entity overlay sync now uses the shared `resolveGraphReleaseId(bundle)` helper instead of manually reconstructing the same bundle checksum / run-id fallback chain
  - the wiki graph BFF route now uses the shared wiki request parser for required `graph_release_id`, so wiki page, wiki context, and wiki graph routes all resolve request scope through one helper layer
  - `lib/engine/wiki.ts` no longer hand-builds its graph/list/search/backlinks paths; wiki engine-path construction is centralized in `lib/engine/wiki-paths.ts`
  - prompt-controller coverage now asserts the canonical panel state (`openPanels.wiki`) instead of the dead `wikiOpen` flag
  - graph release/ref resolution is further centralized; RAG still delegates through its public repository contract, but private graph-scope routing is no longer duplicated there
  - graph release/scope/selected-paper resolution no longer lives on the public `RagRepository` contract; `RagService`, `execute_search()`, and `retrieve_search_state()` now depend on an explicit graph-runtime adapter instead of treating the retrieval repository as a graph facade
  - RAG paper-result hydration now uses one shared paper-runtime contract backed by `solemd.graph_paper_summary` for canonical paper-card/runtime metadata:
    - the shared runtime column/join contract lives in `app.graph.paper_runtime_contract`
    - primary RAG paper/title/chunk/metadata result queries now join `solemd.graph_paper_summary` through that one contract instead of hand-building paper-card metadata from `solemd.papers` + `solemd.corpus` in each query family
    - direct paper rehydration paths (`PAPER_LOOKUP_SQL`, `PAPER_LOOKUP_DIRECT_SQL`) now use the same canonical serving join shape
    - regression coverage now asserts that the major runtime paper-hydration query families all include `JOIN solemd.graph_paper_summary gps`
- Local PostgreSQL tooling is now clean enough for file-backed scripted migrations again:
  - the local `psql` wrapper now handles host-side `-f` scripts and nested `\\i` includes by expanding them before piping into containerized `psql`
  - URI-style `-d postgresql://...` invocation still resolves cleanly to the local `solemd_graph` container
  - follow-up: the current shell lost `docker` on `PATH`, so container-backed `psql` verification is temporarily blocked until shell tooling is normalized again
- WSL/Windows localhost forwarding is cleaner now:
  - `.wslconfig` is on `networkingMode=mirrored`
  - stale NAT-era `netsh interface portproxy` rules pointing at old `172.30.*` WSL addresses have been removed for:
    - `127.0.0.1:3000`
    - `0.0.0.0:2222`
  - `localhost:3000` is back to being owned by the Next.js dev server instead of a stale Windows `iphlpsvc` portproxy entry
  - remaining Windows portproxy entries are intentional local-tool bridges, not WSL NAT leftovers:
    - `23120 -> 23119` for Zotero/Better BibTeX access from WSL and Docker
    - `9222` / `9223` for Chrome DevTools access
    - `27124` retained pending explicit tool-owner cleanup, because it is loopback-targeted rather than a stale WSL address

## Why This Matters
- The main bottleneck was not only query shape. It was also that the WSL root filesystem was nearly full while large rebuild jobs were scanning and writing through the same storage pool.
- Moving runtime artifacts and warehouse file content off the root filesystem reduces pressure on:
  - Postgres temp/WAL/checkpoint behavior
  - Docker overlay churn
  - graph build scratch and bundle export I/O
- The backend cleanup is about two things at once:
  - lean serving surfaces for the API
  - predictable local build surfaces for generating those serving tables
- The wiki runtime no longer re-derives semantic color metadata on every request. That semantic contract is now stored once in `wiki_pages`, published during sync/backfill, and served directly to the frontend.

## Relationship To Prior Optimization Work
- Index cleanup:
  - runtime-serving indexes stay
  - redundant or dead source-table indexes are candidates for drop only after projection cutover is verified
  - examples already identified:
    - `solemd.idx_corpus_pmid`
    - `pubtator.idx_pt_entity_disease`
    - `pubtator.idx_pt_entity_chemical`
    - `pubtator.idx_pt_entity_gene`
- Alias cleanup/backfill:
  - `solemd.entity_aliases` is the broad exact-query serving projection built from PubTator, vocab, and UMLS
  - `solemd.entity_runtime_aliases` is the lean hot-path subset for match/detail/highlight
  - the real UMLS/anatomy activation path is still pending the non-dry-run entity rebuild
  - no second query-alias serving table is planned because that would duplicate a large derived projection without changing the source-of-truth boundary
- Pydantic/FastAPI cleanup:
  - endpoint contracts should map to serving repositories only
  - raw `pubtator.*` and broad warehouse alias tables stay behind projection-build codepaths
  - wiki graph semantic-group metadata is now part of the stored serving contract instead of a service-local fallback mapping
  - graph ask / RAG request parsing, engine DTOs, and backend query models now agree on one selected-paper field instead of carrying a dead alias through the stack
- Projection rebuild discipline:
  - stage/swap rebuilds
  - session-local ETL settings
  - add indexes after bulk load
  - keep replayable rebuilds eligible for lower durability settings when safe
- Serving index discipline:
  - measured candidate indexes must earn their storage cost
  - a live test of `idx_graph_paper_summary_corpus_serving` added roughly `1.3 GB` to `graph_paper_summary` and did not materially improve the hot wiki/entity top-paper plan, so it was dropped instead of being carried forward as speculative bloat

## Current Gaps
- The in-flight evidence refresh started before the `paper_evidence_summary` / `paper_relation_evidence` stage/swap refactor landed, so that stronger rebuild path will be exercised on the next refresh rather than this already-running one.
- The live DB still has old graph rows for one non-current run because the serving cutover is not complete yet.
- Some backend search/build paths still read canonical foundations directly where a serving projection should exist.
- Repo-wide frontend typecheck is currently blocked by unrelated missing `features/learn/*` modules, not by the serving/backend cleanup paths touched in this ledger.
- `solemd.entities` is improved structurally, but the heavy aggregate itself is still one of the slowest rebuild phases and needs the same disciplined ETL treatment end to end.
- The UMLS alias handoff is code-complete but not fully activated on live serving tables until:
  - `engine/scripts/enrich_vocab_terms.py` runs for the anatomy/network vocab terms
  - the full entity rebuild republishes `solemd.entities`, `solemd.entity_aliases`, and `solemd.entity_runtime_aliases`
- The real `enrich_vocab_terms.py` run has now completed successfully:
  - category/family mapping updated `1917` vocab terms
  - cached UMLS crosswalks were reused without needing new UMLS API fetches
  - `1192` MeSH IDs were written to `solemd.vocab_terms`
  - anatomy/network families (`brain_region`, `neural_network`) are now populated in the vocab layer

## Active Blockers
- Attaching `E:\\wsl2-solemd-graph.vhdx` requires Windows elevation from outside this session.
- Windows interop is still failing for real PowerShell/Hyper-V commands from this WSL shell (`UtilAcceptVsock ... failed 110`), so in-session execution of `Get-VHD`, `Mount-VHD`, or `wsl --mount --vhd` is currently blocked even though `powershell.exe` is present on `PATH`.
- The VHDX is visible from Linux at `/mnt/e/wsl2-solemd-graph.vhdx` and is currently about `85G`, but it is not attached as a WSL block device (`lsblk -f` shows no dedicated `solemd-graph` disk or label).
- User environment is already sufficient for the eventual cutover:
  - `WSL version: 2.6.3.0`
  - `Kernel version: 6.6.87.2-1`
  - so `wsl --mount --vhd` support should be available once the user can run the Windows-side commands
- The visible VHDX is currently about 100 GB virtual size, which is enough for runtime artifacts but not enough for the full local warehouse footprint.
- Because the dedicated E-backed Linux disk is not mounted, a clean `/mnt/solemd-graph` cutover cannot be completed entirely from this session.
- The VHDX should be treated as the correct home for `/mnt/solemd-graph` runtime artifacts, but not as the destination for the full live Postgres data directory in the current plan.

## Deferred Operator Step
When the user is ready to do the storage cutover, the required sequence is:

1. Open an elevated Windows terminal.
2. Run:
   - `wsl --shutdown`
3. Expand the VHD in `diskpart`:
   - `select vdisk file="E:\wsl2-solemd-graph.vhdx"`
   - `expand vdisk maximum=<target-mb>`
4. Attach it to WSL:
   - `wsl --mount --vhd E:\wsl2-solemd-graph.vhdx --bare`
5. Back in WSL:
   - `lsblk -f`
   - `sudo e2fsck -f /dev/<device>`
   - `sudo resize2fs /dev/<device>`
   - mount to `/mnt/solemd-graph-next`
   - `sudo rsync -aHAX --delete /mnt/solemd-graph/ /mnt/solemd-graph-next/`
   - swap `/mnt/solemd-graph` to the attached ext4 disk
6. Verify:
   - `findmnt -T /mnt/solemd-graph`
   - `df -Th /mnt/solemd-graph`
   - `lsblk -f`

## Storage Cutover Plan
1. Expand `E:\\wsl2-solemd-graph.vhdx` to a comfortable size for runtime artifacts and local warehouse file content.
2. Attach it inside WSL as a real Linux ext4 filesystem and restore it as the actual `/mnt/solemd-graph` mount.
3. Mount it at a temporary path first and compare it against the current `/mnt/solemd-graph` directory.
4. Prune stale bundle directories and dead temp directories during the sync:
   - old bundle generations no longer referenced by current graph releases
   - dead scratch trees under `tmp/`
5. Repoint Docker/runtime config so hot artifact paths use Linux mountpoints only, not `/mnt/e/...`.
6. Keep Postgres on the existing named volume for now.
7. Move large local warehouse file trees to E-backed Linux storage after the runtime-artifact cutover is stable.
8. Remove stale `/mnt/e/SoleMD.Graph/data` binds after verification.

## Next Workstream
1. Restore the current graph bundle and rerun graph cleanup if needed with the fixed keep-run logic so only the active run remains on disk and in graph DB rows.
2. Finish the serving projection cutover in Postgres:
  - keep `graph_paper_summary` as the canonical universal frontend paper-card surface and continue verifying its hot serving plans
  - `enrich_vocab_terms.py` is complete; next full entity projection rebuild should now carry anatomy/network vocab terms into the canonical entity catalog
  - [x] continue the resumable full entity rebuild so UMLS-backed aliases and the anatomy additions republish `solemd.entities`, `solemd.entity_aliases`, and `solemd.entity_runtime_aliases`
  - [x] keep `entity_corpus_presence` on the live serving projection already backfilled and verified
  - keep entity match/detail on `entity_runtime_aliases`
  - keep RAG/entity exact concept resolution on `entity_aliases` as the broad serving projection
3. Complete the remaining safe index pruning after projection verification.
4. Finish the lean API contract cleanup:
  - one canonical TS wire layer
  - Pydantic models aligned to serving surfaces only
  - no frontend re-derivation of backend semantics
  - [x] remove the dead `selected_paper_id` alias and keep one canonical graph paper-ref contract
  - [x] route entity overlay graph-release resolution through the shared bundle release helper
  - [x] route the wiki graph BFF through the shared required-graph-release parser
  - continue centralizing remaining graph-owned RAG runtime decisions on graph-owned repositories where the logic is genuinely graph-specific
5. Defer the E-backed VHDX cutover until the user can run the required Windows-side `wsl --shutdown` + `wsl --mount --vhd` sequence, and keep advancing code/runtime cleanup that does not depend on that mount.

## Next Verification
- `ruff check` on touched Python files.
- Focused engine pytest for entity repository/API, graph attachment, paper evidence, wiki repository, and entity projections.
- `npm run typecheck` after the wiki/entity contract cleanup.
- After storage cutover, verify mount types with `findmnt`, `df -Th`, and `docker exec solemd-graph-db df -Th /var/lib/postgresql/data`.
