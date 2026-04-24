# Audit: db-and-infra

Slice scope: PostgreSQL + pgvector schemas (`warehouse`, `serve`), forward-only timestamped migrations, Docker compose stack, pgbouncer, root configs, GitHub Actions, and `.mcp.json`.

## Slice inventory (schema files, migrations count, infra files)

Schema files
- `db/schema/warehouse/`: 21 files (4 table modules, 4 index modules, 4 comment modules, 4 grant modules, plus `00_roles.sql`, `10_schemas.sql`, `20_extensions.sql`, `30_functions.sql`, `README.md`).
- `db/schema/serve/`: 11 files following the documented `00_roles → 10_schemas → 20_extensions → 30_fdw → 40_tables_core → 50_indexes → 60_functions → 70_triggers → 80_comments → 90_grants` ordering, plus `README.md`.
- `db/schema/enum-codes.yaml` is the canonical SMALLINT code register cited from comments throughout.

Migrations (forward-only, timestamped)
- `db/migrations/warehouse/`: 19 SQL migrations (2026-04-18 → 2026-04-22) plus `README.md`.
- `db/migrations/serve/`: 1 baseline migration (`20260418203000_serve_baseline.sql`) plus `README.md`. The baseline is a single `\ir` chain across the whole serve schema directory.

Infra
- `infra/docker/compose.yaml` (4 services: `graph-db-warehouse`, `graph-db-serve`, `pgbouncer-serve`, `graph-redis`).
- `infra/docker/pgbouncer/{pgbouncer.ini,userlist.txt,README.md}`.
- `infra/vercel/README.md` (placeholder only).
- `.github/workflows/quality.yml` (single CI workflow).
- Root: `.env.example`, `.gitignore`, `.dockerignore`, `.mcp.json`, `package.json`, `postBuild.bash`, `variables.env`, `package-lock.json` (committed, 657 KB).

## Schema architecture review (warehouse vs serve, modularization)

The two clusters are cleanly separated and the documented file-prefix convention (`00_roles → 10_schemas → 20_extensions → ... → 90_grants`) is followed. Schema ownership is consistent:
- `warehouse`: `engine_warehouse_admin` owns; `engine_ingest_write` writes; `engine_warehouse_read` and `warehouse_grounding_reader` are default-read-only (`db/schema/warehouse/00_roles.sql:26-29`).
- `serve`: `engine_admin` owns; `engine_serve_read` is default read-only with one narrow `UPDATE` exception on `solemd.api_projection_runs` (`db/schema/serve/90_grants.sql:9-10`); `pgbouncer_auth` is a separate `NOINHERIT` role used only for `auth_query` lookups.

Domain split is sensible:
- Warehouse contains the canonical `solemd.*` paper spine (`papers`, `paper_text`, `paper_authors`, `paper_citations`), the chunking/grounding spine (`paper_blocks`, `paper_sentences`, `paper_chunks`, `paper_chunk_members`, `paper_evidence_units`), the S2 raw staging surfaces (`s2_papers_raw`, `s2_paper_authors_raw`, `s2_authors_raw`, `s2orc_documents_raw`, `s2_paper_reference_metrics_raw`, `s2_paper_reference_metrics_stage`, `s2_paper_references_raw`, `s2_paper_assets_raw`), and the `pubtator.*` stage + canonical pair. Hash-partitioned by `corpus_id` (32 partitions) for `paper_blocks`, `paper_sentences`, `paper_chunks`, `paper_chunk_members`, `pubtator.entity_annotations`, and `pubtator.relations` (`db/schema/warehouse/40_tables_core.sql:364-385,446-466`, `41_tables_chunking.sql:50-179`).
- Serve holds the lean projection/serving runtime: `graph_run_metrics`, `graph_clusters`, `graph_points`, `paper_api_cards`, `paper_api_profiles`, `paper_semantic_neighbors`, `wiki_*`, `serving_*`, `api_projection_runs`, `active_runtime_pointer`. Schema-modularization is intentional and the `warehouse_grounding` schema is reserved for FDW grounding (`db/schema/serve/10_schemas.sql:8-9`, `30_fdw.sql`).

Comments and grants are centralized per cluster (warehouse `80_*`/`90_*` split into core/chunking/hot_text/corpus families; serve consolidates into single `80_comments.sql`/`90_grants.sql`). Enum coding is centralized in `db/schema/enum-codes.yaml` and `COMMENT ON COLUMN` references are consistent.

Notes:
- `umls` schema is created (`db/schema/warehouse/10_schemas.sql:8-9`) but has no tables — explicitly documented as reserved (`80_comments.sql:7-8`). Acceptable.
- `auth` schema is created in serve as a Better Auth placeholder (`db/schema/serve/10_schemas.sql:5-6`, `80_comments.sql:33-34`) — also acceptable.
- `pgbouncer_auth` schema is created with `AUTHORIZATION CURRENT_USER` (`10_schemas.sql:11`); only the `user_lookup(TEXT)` SECURITY DEFINER lives there and its owner is pinned to `postgres` via `60_functions.sql:178`.

## Migration hygiene review

- All warehouse/serve migrations use `IF NOT EXISTS` / `IF EXISTS` and `DO $$ … EXCEPTION WHEN undefined_column THEN NULL` patterns where they touch existing rows (`20260419193000_warehouse_corpus_boundary_cutover.sql:21-27`). Idempotency is consistent.
- The cluster baseline migrations are pure `\ir` chains into the schema directory (`20260418224500_warehouse_baseline.sql`, `20260418203000_serve_baseline.sql`). This means the migration *files* are not self-contained — they depend on the current state of the `db/schema/...` files. That is consistent with the README note about “single ordered baseline” but creates a coupling: editing `40_tables_core.sql` retroactively changes what `20260418224500_*` would do on a fresh apply. Forward-only migrations after baseline mitigate this for already-applied envs, but a fresh-apply contract drift is possible. See "Critical issues".
- All migrations are wrapped under `SET ROLE engine_warehouse_admin;` / `RESET ROLE;` for warehouse and `engine_admin` for serve — clean ownership pattern. Two migrations explicitly use `BEGIN;`/`COMMIT;` (`20260419235800_*`, `20260419235930_*`).
- Naming is consistent: `<UTC ts>_<cluster>_<slug>.sql`. Timestamps are monotonic.
- `ck_*` constraint names are stable and replaced via `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT` pattern (`20260419193000_*:5-19`, `20260419024000_*:35-44`).
- Forward-only is explicit in the README; no down migrations exist. Consistent with the project contract.
- `20260419020000_warehouse_ingest_raw_surfaces.sql:9-12` does `ADD COLUMN IF NOT EXISTS` for `tldr`, `is_open_access`, `source_venue_id` on `s2_papers_raw` — none NOT NULL, so safe on existing rows. Other schema additions are similarly safe.
- One migration touches a previously-keyed table: `20260419024000_warehouse_s2_reference_checksum.sql` backfills `reference_checksum`, dedupes by `ctid`, drops the existing PK and re-adds a new one keyed on `(source_release_id, reference_checksum)` (`:35-44`). This locks the table during the dedup-and-rekey, which is acceptable for a still-low-volume staging surface but worth flagging if `s2_paper_references_raw` ever gets populated from a hot ingest before re-application — see "Major issues".

## Index / constraint coverage

Strong coverage:
- Identity uniqueness with partial indexes on `pmid`, `doi_norm`, `pmc_id`, `s2_paper_id` for `solemd.papers` (`db/schema/warehouse/50_indexes.sql:40-51`).
- `uq_*_active_lock` partial unique indexes on `advisory_lock_key WHERE status BETWEEN ...` for `ingest_runs`, `corpus_selection_runs`, `corpus_wave_runs` enforce single-active-run semantics (`50_indexes.sql:10-13`, `53_indexes_corpus.sql:31-34,77-80`). Excellent.
- BRIN on `ingest_runs.started_at` (`50_indexes.sql:14-16`) is the right shape for time-monotone audit data.
- GIN on `paper_text.fts_vector` (generated column from title+abstract) (`50_indexes.sql:58-60`); GIN on `wiki_pages.fts_vector`, `outgoing_links`, `tags` (`serve/50_indexes.sql:52-64`); GIN trigram on `paper_api_profiles.full_title` (`serve/50_indexes.sql:41-43`). All match the obvious read patterns.
- Per-partition indexes are created via `DO $$` loops over the 32 hash partitions (`51_indexes_chunking.sql:10-37`) — consistent with PG18 partitioned-index limits.
- Covering index `idx_paper_api_cards_list ... INCLUDE (...)` (`serve/50_indexes.sql:21-36`) is shaped exactly for graph side-panel listing reads.
- CHECK constraints are dense and align with the SMALLINT enum ranges in `enum-codes.yaml` (e.g., `ck_ingest_runs_status CHECK (status BETWEEN 1 AND 7)` matches `ingest_run_status: 1..7`; `ck_corpus_selection_runs_status BETWEEN 1 AND 8` matches `corpus_selection_run_status: 1..8`).

Issues / gaps:
- `solemd.s2_paper_reference_metrics_stage` is `UNLOGGED` (intended) and has **no indexes**; it is keyed informally by `(ingest_run_id, source_release_id, file_name, batch_ordinal, citing_paper_id)` but no PRIMARY KEY or UNIQUE constraint is declared (`db/schema/warehouse/40_tables_core.sql:252-263`). The "single ordered final merge" note in the comment (`80_comments.sql:40-41`) implies the writer guarantees uniqueness, but a duplicate-fragment bug would silently double-count metrics. Worth adding at least a `(ingest_run_id, source_release_id, file_name, batch_ordinal, citing_paper_id)` UNIQUE or a deduping hash.
- `solemd.s2_paper_reference_metrics_stage` rows reference `ingest_run_id UUID NOT NULL` and `source_release_id INTEGER NOT NULL` but **no FKs** (consistent with UNLOGGED + transient, but worth a comment confirming intent).
- `s2_paper_reference_metrics_raw` carries `idx_s2_paper_reference_metrics_raw_release_citing` AND `idx_s2_paper_reference_metrics_raw_release_counts` where the second has the same leading `(source_release_id, citing_paper_id)` plus `influential_reference_count` (`50_indexes.sql:104-105` and `53_indexes_corpus.sql:94-99`). The first is fully covered by the second's prefix and is redundant for index lookup, though it stays smaller for plain ordering. Minor.
- `paper_authors` lacks an index on `(corpus_id)` alone — fine because the PK is `(corpus_id, author_ordinal)` and the leading column is queryable. `idx_paper_authors_author` only covers reverse lookup `(author_id, corpus_id)`. OK.
- `solemd.graph_runs` has `idx_graph_runs_status_built` (`50_indexes.sql:78-79`) but `serve.graph_run_metrics` has `idx_graph_run_metrics_published` only — the serve-side `(serving_run_id, ...)` lookup paths are covered by PKs.
- `serve.serving_runs` has no index covering `(opensearch_alias_swap_status, ...)`; if the worker polls for `pending` swaps, that scan is currently a seq scan. Minor.
- `serve.active_runtime_pointer` enforces singleton via `singleton_key BOOLEAN PRIMARY KEY DEFAULT true` + `CHECK (singleton_key = true)` (`serve/40_tables_core.sql:281-300`). Clean.
- Triggers `trg_freeze_published_serving_run` and `trg_validate_active_runtime_pointer` (`serve/70_triggers.sql`) close the consistency loop on the serving run lifecycle and active pointer. Good.

Stale tables/columns:
- `solemd.paper_text.title_hash`/`abstract_hash BYTEA` (`40_tables_core.sql:101-103`) are never written by visible grants/migrations; these may be vestigial or reserved for a writer that hasn't landed. Worth a `COMMENT ON COLUMN` describing intent.
- `paper_documents.text_hash BYTEA` (`41_tables_chunking.sql:10`) — same observation.
- `chunk_runs` is granted INSERT/UPDATE/SELECT but no DELETE; its row growth is unbounded over time. Add a retention plan or `DELETE` grant later.

## Critical issues (security / data-loss / prod-blocker)

1. `pg_cron`/`pg_partman` deferred but partitioning is hash-only — not a critical issue today, but the 32-way hash partitioning of `paper_blocks`, `paper_sentences`, `paper_chunks`, `paper_chunk_members`, `pubtator.entity_annotations`, `pubtator.relations` is permanent without a re-partition plan. If volume ever grows to where range-by-time becomes preferable for pruning, this is a forklift migration. Document it explicitly. (`db/schema/warehouse/40_tables_core.sql:364-385,446-466`).

2. **Baseline migrations are `\ir`-chains over a mutable schema directory**. `db/migrations/warehouse/20260418224500_warehouse_baseline.sql` is `\ir ../../schema/warehouse/40_tables_core.sql` etc. — and `40_tables_core.sql` was last modified `Apr 22 20:46` (per `ls -l`), well after the baseline timestamp. The forward-only post-baseline migrations correctly add the new surfaces, so an env that has applied all migrations is correct, but a *fresh apply* would land the *current* `40_tables_core.sql` content, which already includes things like `s2_paper_reference_metrics_stage` (added in the `20260422153000_*` migration). Re-applying the post-baseline migrations on top would still be idempotent (`CREATE TABLE IF NOT EXISTS`), so functionally it works, but the contract “baseline + N post-baseline migrations applied in order” is not what fresh-apply actually does. This is a subtle drift risk: if someone adds a destructive change to `40_tables_core.sql` (e.g., DROP COLUMN) without a matching forward migration, fresh apply silently differs from incremental apply. Recommend: freeze baseline files at apply time (snapshot into the migration text), or document the contract explicitly that schema/* IS the source of truth and post-baseline migrations are only delta scripts for already-deployed envs.

3. **Default `postgres`/`postgres` superuser passwords in compose.yaml** (`infra/docker/compose.yaml:9,36` and `.env.example:44,47`). `.env.example` is the documented copy-template; the README implies these defaults are used in dev. Loopback-only binding (`127.0.0.1:...`) makes this not internet-exposed, but a workstation user in any other VM/WSL on the same host can connect. Acceptable for local dev, but call it out explicitly in `.env.example` that these are for loopback-only dev and must be changed for any other env.

## Major issues

1. `s2_paper_references_raw` mid-life PK rebuild (`20260419024000_*:35-44`) is an `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT PRIMARY KEY` on a referenced table — locks ACCESS EXCLUSIVE during the operation. Safe today because the table is staging and fully rewritable per ingest, but worth a comment in the migration noting the lock window if the table grows.
2. `engine_ingest_write` has both INSERT/UPDATE/DELETE/SELECT on the canonical `pubtator.entity_annotations` and `pubtator.relations` partitioned tables (`91_grants_chunking.sql:52-57`). This is duplicated from a SELECT-only grant earlier in the same file (`:46-50`); functionally fine because GRANT is additive, but the duplication suggests a copy-paste residue. Clean up.
3. The `engine_serve_read` role gets a single `UPDATE` exception on `solemd.api_projection_runs` (`serve/90_grants.sql:10`). The serve schema also exposes mutable rows like `serving_runs` only via DDL paths (admin), but `api_projection_runs.build_status`, `rows_written`, etc., are now writable by the serve-read role. Consider separating projection-status writes into a `engine_projection_writer` role to keep the read role truly read-only — or accept this and add a row-level CHECK that pinpoints the allowed transitions. The trigger doesn't currently constrain what `engine_serve_read` can change.
4. `pgbouncer_auth.user_lookup(TEXT)` is `SECURITY DEFINER` and owned by `postgres` (`serve/60_functions.sql:149-178`). It correctly restricts the username allowlist to `engine_serve_read` only, sets `search_path = pg_catalog, pg_temp`, and revokes from PUBLIC. Solid — flagged as positive but call out: if a future migration adds another username (e.g., `engine_admin`) to the allowlist, the surface widens silently. Add a unit/integration test that asserts the allowlist contents.
5. `paper_text.fts_vector` is a STORED generated tsvector (`40_tables_core.sql:111-114`). Combined with the GIN index (`50_indexes.sql:58-60`), every UPDATE to title or abstract rewrites the row + GIN entries. Fine for low-write paths; if a re-curation pass mass-updates titles, expect significant write amplification. Document the contract.

## Minor issues

1. `serve/30_fdw.sql:12` enumerates `extensions 'pgcrypto,pg_trgm'` but `pg_buffercache`, `pg_prewarm`, `pg_stat_statements` are also installed. If FDW pushdown ever needs to rely on others, list them — or document why only those two are listed.
2. `paper_selection_summary` evolved across migrations (`20260419190000`, `20260419193000`, `20260419204500`); each `ADD COLUMN ... NOT NULL DEFAULT ...` rewrites the table on PG before 11 — fine on PG 18, but worth a one-line comment that the project intentionally targets PG 18 for the fast `ADD COLUMN ... DEFAULT` path.
3. `infra/docker/pgbouncer/pgbouncer.ini:9` binds `listen_addr = 0.0.0.0` inside the container. The host port mapping is loopback-only (`compose.yaml:63`), so this is fine, but a cleaner contract would set `listen_addr = 127.0.0.1` if all access is through the loopback host port (it's not — other containers reach pgbouncer via the docker network DNS). Current setup is correct for the docker-network use case; flag for documentation.
4. `compose.yaml:5` puts `graph-db-warehouse` under `profiles: ["db"]` while `graph-db-serve`, `pgbouncer-serve`, `graph-redis` are always-up. The serve cluster has `restart: unless-stopped` but warehouse does not. This is intentional per `infra/docker/README.md`, but the asymmetry should be explicit in a one-line comment near the warehouse service.
5. `.dockerignore:32` ignores `*.md` but `!docker/**` only re-includes `docker/`. Various READMEs aren't needed in the build context, so this is fine, but the project's actual web Dockerfile is not visible in scope; verify the dockerfile path matches the dockerignore assumptions (the comment on `:2` says `docker/graph/Dockerfile` exists, but I cannot read outside scope).
6. `.gitignore:147` has the comment `# (cleaned — old SoleMD.Web archive path removed)` which is dead annotation. Optional cleanup.
7. `chunk_runs.completed_at` and `corpus_selection_runs.completed_at` are nullable but no CHECK enforces `completed_at >= started_at` when set. Trivial constraint to add.
8. `paper_evidence_units.evidence_key UUID PRIMARY KEY` has no DEFAULT — the writer derives it (`81_comments_chunking.sql:34-35`). Documented. Good.
9. Per the audit checklist, `package-lock.json` is committed (657 KB) — confirmed at root. ✓
10. The serve baseline migration has no concurrent-build hint for any of the indexes; for first-apply on an empty cluster, `CREATE INDEX` (not `CONCURRENTLY`) is correct. Future post-baseline serve migrations that add indexes on populated tables should use `CREATE INDEX CONCURRENTLY` — flag for documentation in `db/migrations/serve/README.md`.

## Secrets handling review (.env.example, .gitignore, .dockerignore, compose, pgbouncer)

- `.env.example` contains only placeholder credentials (`postgres`/`postgres`, `pgbouncer_auth`/`pgbouncer_auth`, `engine_admin`/`engine_admin`, etc.) and is explicitly the template (`:1-3` header). No real secrets. ✓
- `.gitignore:43-49` ignores `.env*` with `!.env.example` re-included. Covers `.env`, `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`. ✓
- `.gitignore` does **not** explicitly ignore `*.key`, `*.pem`, `id_rsa`, `*.pfx`, `credentials.json`, or `service-account*.json`. Add these as defense-in-depth. **Minor gap**.
- `.dockerignore:16-17` ignores `*.log`, `.env*` with `!.env.example` re-included. Also ignores `.git/`, `.vscode/`, `.claude/`. ✓
- `infra/docker/pgbouncer/userlist.txt` is committed and contains `"pgbouncer_auth" "pgbouncer_auth"` (`:1`) — a placeholder credential matching `.env.example:48`. The README (`pgbouncer/README.md:23-24`) explicitly notes this is intentional for local-dev only and **not a production secret-management pattern**. Verdict: acceptable for a tracked dev scaffold, but the file is **NOT in `.gitignore`** which is correct given it's intentionally tracked. ✓
- `compose.yaml:9,36` defaults are `postgres`/`postgres` superuser passwords — see Critical #3. Loopback-only binding mitigates exposure but does not eliminate it on shared workstations.
- `compose.yaml:11,38,63,91` all bind `127.0.0.1:*` — explicit loopback. ✓ No `0.0.0.0` host binding.
- Inside-container pgbouncer binds `0.0.0.0:6432` (`pgbouncer.ini:9`); see Minor #3.
- `.mcp.json:34` contains a Neo4j password `solemd.infra`. This is a local Neo4j credential for the SoleMD.Infra MCP server. Since `.mcp.json` is committed, this *is* a leaked credential, but it's a known shared-dev credential per the cross-project contract. **Minor risk** — if the Neo4j ever becomes reachable from outside the workstation, this is a blank check. Recommend env-var injection at the MCP-server script level (the comment says `_generated by solemd mcp-sync`, so the canonical fix is in `SoleMD.Infra/mcp/config/`, out of scope here).
- `.github/workflows/quality.yml`: `permissions: contents: read` (`:7-8`) is correctly restrictive. The workflow runs on `pull_request:` and `push:` (`:3-5`) with no environment secrets referenced. **Important**: there is no `pull_request_target:` use, so secrets are not exposed to forked-PR untrusted code. ✓ The workflow runs `npm ci` and `uv sync --extra dev` and `npm run quality`. No third-party action with `secrets.*`.
- `package-lock.json` committed. ✓

**Overall secrets handling verdict: solid for a local-dev scaffold.** The committed `userlist.txt`, default postgres credentials, and Neo4j password in `.mcp.json` are all intentional, scoped to loopback dev, and explicitly documented. The one defense-in-depth gap is `*.key`/`*.pem`/credential filename patterns missing from `.gitignore`.

## Reuse / consolidation opportunities

1. The 32-partition hash bootstrap `DO $$ ... FOR partition_idx IN 0..31 LOOP ... END $$` is duplicated across 6 tables (`40_tables_core.sql:367-385,448-466`, `41_tables_chunking.sql:53-71,90-108,127-145,161-179`) and again for per-partition indexes (`51_indexes_chunking.sql:10-37`). Extract into a `solemd.create_hash_partitions(parent regclass, modulus int, fillfactor int)` admin function and call it once per table. Reduces ~150 LOC and makes partition-count changes a one-line edit.
2. Comments referencing `db/schema/enum-codes.yaml.<key>` are repeated verbatim in `80_comments.sql`/`81_comments_chunking.sql`/`82_comments_hot_text.sql`/`83_comments_corpus.sql`. Could be generated from `enum-codes.yaml` to prevent drift. Optional.
3. The grant patterns "INSERT, UPDATE, SELECT … TO engine_ingest_write" + "SELECT … TO engine_warehouse_read" repeat across `90_grants.sql`, `91_grants_chunking.sql`, `92_grants_hot_text.sql`, `93_grants_corpus.sql`. Centralizing via `ALTER DEFAULT PRIVILEGES` (already used in `90_grants.sql:84-87` for SELECT) could remove most explicit per-table grants for the read role. The write role still needs explicit per-table grants because of the INSERT/UPDATE/DELETE asymmetry — leave as-is.
4. `solemd.normalize_lookup_key` and `solemd.clean_venue` (in `30_functions.sql`) are warehouse-side normalization helpers; the serve cluster has no equivalent. If serve-side projections ever need consistent normalization (e.g., `paper_api_profiles.full_title` lookup), centralize via FDW or repeat the function definition in serve to keep parity.

## What's solid

- Clean role split: `engine_warehouse_admin`/`engine_ingest_write`/`engine_warehouse_read`/`warehouse_grounding_reader` for warehouse; `engine_admin`/`engine_serve_read`/`pgbouncer_auth` for serve. Default-read-only enforced via `ALTER ROLE … SET default_transaction_read_only = on` (`warehouse/00_roles.sql:26-29`, `serve/00_roles.sql:24`).
- pgbouncer `auth_query` design is correct: app users (`engine_serve_read`) authenticate through a `SECURITY DEFINER` lookup, and only the bootstrap `pgbouncer_auth` user lives in the on-disk `userlist.txt`. Pool mode `transaction` (`pgbouncer.ini:19`) matches a serve-read workload pattern; prepared-statement support is enabled (`max_prepared_statements = 200`).
- Active-runtime singleton with trigger validation (`serve/40_tables_core.sql:280-300`, `serve/60_functions.sql:111-145`, `serve/70_triggers.sql:10-15`) is a well-shaped publish-cutover contract.
- Published-row immutability via `freeze_published_serving_run` trigger (`serve/60_functions.sql:87-109`).
- Centralized enum register (`enum-codes.yaml`) cross-referenced from comments — single source of truth.
- Forward-only migration discipline with timestamps; consistent `SET ROLE` / `RESET ROLE` framing.
- Thoughtful index choices: BRIN for time-monotone audit (`ingest_runs.started_at`), partial unique for active-lock keys, GIN for FTS/trigram, INCLUDE for list-projection covering.
- LZ4 compression on every wide-text column (`paper_text.abstract`, `paper_text.tldr`, `s2_papers_raw.abstract`, `s2_papers_raw.tldr`, `s2orc_documents_raw.document_payload`, `paper_blocks.text`, `paper_sentences.text`, `paper_chunks.text`, `pubtator.entity_annotations.mention_text`, etc.) — saves substantial heap.
- Correct fillfactor strategy: 80 for high-update audit/lifecycle tables, 90 for moderately-mutable identity tables, 100 for append-only / immutable rows.
- CI workflow is minimal-permission (`contents: read`), runs only `quality`, no secret usage. Safe.
- `.gitignore` covers `.env*`, `.next`, build artifacts, `.claude/{cache,tmp,worktrees,settings*}`, Python venv/cache, etc.
- Clean per-cluster READMEs documenting in-scope vs deferred (`db/schema/warehouse/README.md`, `db/schema/serve/README.md`, `db/migrations/{warehouse,serve}/README.md`).

## Recommended priority (top 5)

1. **Document baseline-vs-incremental fresh-apply contract.** Decide whether the baseline migration freezes a snapshot (preferred) or whether `db/schema/*` is the always-current truth and post-baseline migrations only exist for already-deployed envs. Today it is ambiguous; this risks silent drift on fresh applies. (See Critical #2.)
2. **Add a UNIQUE/PK to `solemd.s2_paper_reference_metrics_stage`** keyed on `(ingest_run_id, source_release_id, file_name, batch_ordinal, citing_paper_id)` to make duplicate fragments a hard error rather than silent double-counting. (`db/schema/warehouse/40_tables_core.sql:252-263`.)
3. **Tighten secrets defense-in-depth in `.gitignore`.** Add `*.key`, `*.pem`, `*.pfx`, `id_rsa*`, `credentials.json`, `service-account*.json`, `*.crt` patterns. The current dev-credential surface is intentional and isolated; the gap is for accidental future secret files.
4. **Split the `engine_serve_read` UPDATE exception** off `solemd.api_projection_runs` into a dedicated `engine_projection_writer` role, OR add a row-level trigger that constrains which columns / status transitions the read role may write. Today the contract reads "read-only with one exception" but the exception is full-row UPDATE.
5. **Extract the 32-partition bootstrap** into a single admin function (`solemd.create_hash_partitions(...)`) to eliminate ~150 LOC of duplicated `DO $$ ... LOOP` blocks across `40_tables_core.sql`, `41_tables_chunking.sql`, and `51_indexes_chunking.sql`. Lowers blast radius for future partition-count tuning.
