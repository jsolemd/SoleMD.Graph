# 2026-04-11 SoleMD.Graph Graph Serving Backend Cleanup Ledger

## Scope
- Separate serving surfaces from warehouse/build tables for graph, wiki, and entity runtime paths.
- Move graph-facing paper metadata off `paper_evidence_summary` and onto a canonical serving table.
- Centralize storage/runtime decisions so Postgres and warehouse IO stop depending on accidental host-path choices.

## End State
- FastAPI/Pydantic and Next runtime paths read only canonical serving tables and repositories.
- Internal evidence/build tables remain internal and rebuildable.
- Docker and local config use stable Linux mountpoints, with host-path changes centralized behind a small set of variables.

## Operating Decision
- Keep the live serving Postgres where it is now:
  - Docker named volume `solemd-graph_pgdata`
  - Linux-side storage under Docker Desktop / WSL ext4
  - this remains the canonical serving database for FastAPI, Pydantic, and Next/BFF runtime reads
- Expand and reactivate `E:\\wsl2-solemd-graph.vhdx` as the canonical `/mnt/solemd-graph` disk:
  - this is the correct home for runtime artifacts, graph bundles, and rebuild scratch/checkpoint paths
  - it is not the right destination for the full live Postgres data directory in the current plan
- Move large local warehouse filesystem content to E-backed Linux storage and stop using `/mnt/e/...` bind mounts for hot runtime/build paths.

## Target Data Tiers
### 1. Serving tables: API/runtime may read these directly
- Graph runtime:
  - `solemd.graph_runs`
  - `solemd.graph_points`
  - `solemd.graph_clusters`
  - `solemd.graph_paper_summary` (target canonical graph/wiki paper-card surface)
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
1. Complete `graph_paper_summary` serving projection and switch graph attachment/wiki paper-ref lookups to it.
2. Collapse wiki graph paper/ref resolution onto one canonical runtime surface.
3. Split graph release/ref resolution away from `PostgresRagRepository` into graph-owned repositories.
4. Remove remaining wiki/entity request-contract duplication across FastAPI, TS wire types, and feature-layer DTOs.
5. Finish storage cutover to a Linux-backed E-mounted VHD for warehouse/checkpoints and optionally Postgres.

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
  - centralize remaining RAG graph release/ref resolution on the graph-owned adapter
- [ ] Expand and remount `E:\\wsl2-solemd-graph.vhdx` as the actual `/mnt/solemd-graph`.

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
- Schema migration readiness is now fully clean again:
  - `059_add_entity_corpus_presence` adopted after live verification
  - `060_drop_redundant_corpus_pmid_index` applied and recorded
  - `062_drop_redundant_pubtator_entity_partial_indexes` applied and recorded
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
  - `/mnt/solemd-graph` currently resolves to the nearly-full root ext4 filesystem, not a separate data disk.
  - `E:\\wsl2-solemd-graph.vhdx` is a valid VHDX containing a raw ext4 filesystem labeled `solemd-graph`, UUID `2b5c3e6f-18a1-4943-999e-555596cec91a`, last mounted at `/mnt/solemd-graph`.
  - That ext4 volume is 100 GB total, with roughly 35.6 GB used and 71.7 GB free.
  - The VHDX root contains `bundles/` and `tmp/`, so it is the dormant runtime-artifact volume for graph bundles/checkpoints, not an empty placeholder.
  - The visible VHDX is still far too small to be the active backing store for the current 800+ GB warehouse footprint or the 274 GB live Postgres database.
  - Docker Desktop Postgres volume still has headroom; the root distro is the immediate bottleneck.
- Graph runtime artifact cleanup is now fixed in code:
  - stale replayable graph checkpoints are removed by run ID rather than only deleting incomplete dirs
  - stale bundle directories are cleaned alongside checkpoint dirs
  - keep-run selection now preserves `is_current = true` graph runs and falls back to the newest completed run if current metadata is missing
  - filesystem keep-run IDs are normalized to strings, so UUID-valued DB rows no longer cause the current bundle/checkpoint dir to be mistaken for stale data
- The current graph bundle has been restored and verified live:
  - `solemd.graph_runs` now contains only the active current run
  - `/api/graph-bundles/<checksum>/base_points.parquet` returns `200 OK`
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
  - graph release/ref resolution is partially centralized; RAG is mid-cutover onto `app.graph.repository`

## Why This Matters
- The main bottleneck was not only query shape. It was also that the WSL root filesystem was nearly full while large rebuild jobs were scanning and writing through the same storage pool.
- Moving runtime artifacts and warehouse file content off the root filesystem reduces pressure on:
  - Postgres temp/WAL/checkpoint behavior
  - Docker overlay churn
  - graph build scratch and bundle export I/O
- The backend cleanup is about two things at once:
  - lean serving surfaces for the API
  - predictable local build surfaces for generating those serving tables

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
- Projection rebuild discipline:
  - stage/swap rebuilds
  - session-local ETL settings
  - add indexes after bulk load
  - keep replayable rebuilds eligible for lower durability settings when safe

## Current Gaps
- `solemd.graph_paper_summary` is now live, but it is not yet populated until the canonical evidence refresh finishes.
- The in-flight evidence refresh started before the `paper_evidence_summary` / `paper_relation_evidence` stage/swap refactor landed, so that stronger rebuild path will be exercised on the next refresh rather than this already-running one.
- The live DB still has old graph rows for one non-current run because the serving cutover is not complete yet.
- Some backend search/build paths still read canonical foundations directly where a serving projection should exist.
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
- The visible VHDX is currently about 100 GB virtual size, which is enough for runtime artifacts but not enough for the full local warehouse footprint.
- Because the dedicated E-backed Linux disk is not mounted, a clean `/mnt/solemd-graph` cutover cannot be completed entirely from this session.
- The VHDX should be treated as the correct home for `/mnt/solemd-graph` runtime artifacts, but not as the destination for the full live Postgres data directory in the current plan.

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
  - finish and verify the canonical evidence refresh/backfill for `graph_paper_summary`
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
  - centralize remaining RAG graph release/ref resolution on graph-owned repositories
5. Expand and remount the E-backed VHDX for `/mnt/solemd-graph`.

## Next Verification
- `ruff check` on touched Python files.
- Focused engine pytest for entity repository/API, graph attachment, paper evidence, wiki repository, and entity projections.
- `npm run typecheck` after the wiki/entity contract cleanup.
- After storage cutover, verify mount types with `findmnt`, `df -Th`, and `docker exec solemd-graph-db df -Th /var/lib/postgresql/data`.
