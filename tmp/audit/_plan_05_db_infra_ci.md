# Plan: DB + Infra + CI

Author: **db-infra-ci-planner** (team `solemd-graph-improvement-plan`)
Scope: PostgreSQL schema/migrations, Docker + pgbouncer + Vercel infra,
GitHub Actions CI/CD, secrets handling, dependency hygiene.
Sources consumed: `tmp/audit/db-and-infra.md`,
`tmp/audit/web-app-routes.md`, `tmp/audit/_codex_cross_review.md`.

---

## 1. Headline summary

The schema itself is in strong shape — roles, grants, partitioning, and
pgbouncer `auth_query` are well-constructed
(`db-and-infra.md:129-143`). The risk surface is the **boundary around
the schema**: baseline migrations coupled to a mutable `db/schema/*`
directory, one staging table missing a PK, default-postgres dev
passwords easy to mistake for production, `.gitignore` that catches
`.env` but not `*.key`/`*.pem`, and — most critically — **CI that
never runs the test suites** (`quality.yml:36-37` runs `npm run
quality` only; no Jest, no pytest — `_codex_cross_review.md:122-127`).

That is the meta-bug. The worker has two CRITICAL correctness bugs
across slices (pool starvation during HTTP, abort-cleanup on poisoned
connection) and the merge gate cannot detect a regression in either
because the gate does not run tests. Fix CI first; every other fix in
every other planner's document compounds until it is fixed.

---

## 2. Phase order

**Phase A — data correctness (before next ingest run):**
- A1. PK/UNIQUE on `solemd.s2_paper_reference_metrics_stage`.
- A2. Freeze baseline-vs-incremental contract (three options; pick C now).
- A3. `.gitignore` defense-in-depth for credential filenames.
- A4. Rename compose/`.env.example` dev creds to `DEV_ONLY_*` + banner.

**Phase B — test enforcement (before any further merge to main):**
- B1. `web-tests.yml` — Jest in `apps/web` with `--runInBand`.
- B2. `worker-tests.yml` — pytest with ephemeral PG service container.
- B3. `api-tests.yml` — pytest skeleton for `apps/api` (zero tests today).
- B4. Split `quality.yml` steps so branch protection can target each.
- B5. Required-status-check enforcement on `main` (GitHub settings doc).

**Phase C — release gates (before any public deploy):**
- C1. `no-env-committed.yml` — no `.env*` other than `.example` in tree.
- C2. `security-headers.test.ts` — asserts CSP/HSTS/COOP/COEP.
- C3. `deps-scan.yml` — `npm audit --production` + `pip-audit`.
- C4. Lab-route guard test — `/smoke`, `/loading-preview`,
  `/field-lab`, `/ambient-field-lab`, `/surface-lab` → 404 in prod.

**Phase D — hardening:**
- D1. Migration-safety lint (NOT NULL without backfill, non-CONCURRENTLY
  index).
- D2. pgbouncer `pool_mode` docs for worker-through-pgbouncer future.
- D3. Index backlog from `db-and-infra.md:65-68`.
- D4. `completed_at >= started_at` CHECK on `chunk_runs`,
  `corpus_selection_runs`.
- D5. Hand-off note to SoleMD.Infra re: `.mcp.json:34` Neo4j password.

---

## 3. Detailed work items

### Phase A — data correctness

#### A1. PK/UNIQUE on `s2_paper_reference_metrics_stage`

Ref: `db-and-infra.md:63-64, 147` (priority #2).

`db/schema/warehouse/40_tables_core.sql:252-263` declares the `UNLOGGED`
stage table. No PK, no UNIQUE. Writer-side uniqueness is claimed by
`80_comments.sql:40-41` but not schema-enforced. Duplicate fragments
would silently double-count citation metrics.

Forward migration:
```sql
SET ROLE engine_warehouse_admin;
ALTER TABLE solemd.s2_paper_reference_metrics_stage
  ADD CONSTRAINT uq_s2_paper_reference_metrics_stage_row
  UNIQUE (ingest_run_id, source_release_id, file_name, batch_ordinal, citing_paper_id);
RESET ROLE;
```

Gotchas:
- UNLOGGED supports UNIQUE; table is truncated on crash, so no
  backfill risk.
- Update `40_tables_core.sql:252-263` inline too so fresh apply is
  consistent (this is exactly the drift concern A2 addresses).
- If the stage is currently populated mid-run when the migration lands,
  prepend `DELETE FROM solemd.s2_paper_reference_metrics_stage;`.

Coordinate: **worker-planner** — grep `apps/worker/app/ingest/writers/s2.py`
for this table and confirm the INSERT doesn't need `ON CONFLICT DO NOTHING`.

#### A2. Freeze baseline-vs-incremental contract

Ref: `db-and-infra.md:81, 146` (Critical #2, priority #1).

`db/migrations/warehouse/20260418224500_warehouse_baseline.sql` is an
`\ir` chain over `db/schema/warehouse/*`, which was last touched
2026-04-22 — well after the baseline timestamp. Fresh apply lands
current file content; post-baseline migrations stack idempotently, but
the contract "baseline + N deltas" is not what fresh-apply does. A
destructive edit to `db/schema/*` (e.g., DROP COLUMN) without a
matching forward migration would drift silently.

Three options:
- **A: Freeze-at-release.** Generate a new baseline at each release
  snapshotting schema text inline. Pros: fresh == incremental. Cons:
  needs tooling.
- **B: Schema-is-truth.** Document that `db/schema/*` IS the current
  contract; post-baseline migrations are delta scripts for deployed
  envs only. Pros: zero tooling. Cons: accepts drift by policy.
- **C: Checksum/diff check.** CI fails if `db/schema/**` changes
  without a new `db/migrations/**/*.sql` in the same PR. Pros: ~30
  lines. Cons: catches drift, doesn't eliminate the coupling.

**Recommendation: C now, A within next release cycle.** Option B is too
loose.

Option C sketch (`.github/workflows/schema-drift-check.yml`):
```yaml
on: pull_request
jobs:
  schema-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: |
          base=$(git merge-base origin/main HEAD)
          schema_diff=$(git diff --name-only "$base" HEAD -- 'db/schema/**')
          migr_diff=$(git diff --name-only --diff-filter=A "$base" HEAD -- 'db/migrations/**/*.sql')
          if [ -n "$schema_diff" ] && [ -z "$migr_diff" ]; then
            echo "::error::Schema changed without new migration:"; echo "$schema_diff"; exit 1
          fi
```

Gotchas: renaming/splitting a schema file without an intended behavior
change triggers a false positive. Add a `@skip-schema-drift`
commit-message escape hatch.

Coordinate: **worker-planner** — schema-to-code parity (worker SQL with
hard-coded column lists, per `_codex_cross_review.md:233-238` Gap 7) is
a separate concern, covered by worker tests not this lint.

#### A3. `.gitignore` defense-in-depth

Ref: `db-and-infra.md:110, 148` (priority #3).

`.gitignore:43-49` catches `.env*`; does not catch credential filename
patterns. Append under "Environment files":
```
# Credential filename patterns (defense-in-depth)
*.key
*.pem
*.pfx
*.p12
*.jks
*.crt
id_rsa
id_rsa.*
id_ed25519
id_ed25519.*
credentials.json
credentials.*.json
service-account*.json
service_account*.json
*.p8
```

Also delete dead annotation at `.gitignore:148` ("cleaned — old
SoleMD.Web archive path removed").

Gotchas: if future work uses dev `*.pem` certs, add `!dev/*.pem`
explicitly.

Coordinate: **security-planner** lists this same entry. Agree a single
PR owns it.

#### A4. Rename dev credentials to `DEV_ONLY_*`

Ref: `db-and-infra.md:82-83` (Critical #3).

`.env.example:44,47` carries `POSTGRES_PASSWORD=postgres` used by
`infra/docker/compose.yaml:9,36`. Loopback-only binding mitigates
exposure, but the name `postgres` is easy to copy into a deploy.

Actions:
1. Rename env vars to `DEV_ONLY_POSTGRES_PASSWORD_WAREHOUSE` /
   `_SERVE` in `.env.example` and `compose.yaml`.
2. Prepend `.env.example` header:
   ```
   # ==========================================================
   # LOCAL DEVELOPMENT ONLY — 127.0.0.1 binding.
   # Do NOT copy to any deployed env. Prod/CI must inject real
   # secrets via 1Password / Vercel env / GH Actions secrets.
   # ==========================================================
   ```
3. Add a compose `command:` wrapper that echoes a DEV_ONLY banner on
   container start.
4. Document the rename in `infra/docker/README.md`.

Gotchas: breaking change for local workstations — devs must re-copy
`.env.example` and re-up containers. Do NOT change the value, only the
variable name. Keep `pgbouncer/userlist.txt:1` as-is (documented
bootstrap credential).

Coordinate: **security-planner** (launch checklist);
**worker-planner** (env consumer lists need the same rename).

### Phase B — test enforcement

#### B1. `web-tests.yml` — Jest in apps/web

`apps/web/package.json` has `"test": "jest --runInBand"`. CI doesn't run
it today.

```yaml
name: Web Tests
on:
  pull_request:
    paths: ['apps/web/**','packages/**','package.json','package-lock.json','.github/workflows/web-tests.yml']
  push: { branches: [main] }
permissions: { contents: read }
jobs:
  jest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - working-directory: apps/web
        run: npm test -- --runInBand --ci
```

Gotchas: `--runInBand` is non-negotiable per project CLAUDE.md (test
ordering). `paths:` filter skips doc-only PRs; `push: branches: [main]`
keeps main green.

#### B2. `worker-tests.yml` — pytest + ephemeral PG

`apps/worker/tests/` has 15+ files (`conftest.py`,
`test_ingest_runtime.py`, `test_evidence_runtime.py`, …). Not in CI.

```yaml
name: Worker Tests
on:
  pull_request:
    paths: ['apps/worker/**','db/schema/warehouse/**','db/migrations/warehouse/**','.github/workflows/worker-tests.yml']
  push: { branches: [main] }
permissions: { contents: read }
jobs:
  pytest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:18
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: warehouse }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/warehouse
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with: { enable-cache: true }
      - name: Apply warehouse baseline + deltas
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -d warehouse \
            -v ON_ERROR_STOP=1 -f db/migrations/warehouse/20260418224500_warehouse_baseline.sql
          for f in $(ls db/migrations/warehouse/*.sql | sort | grep -v baseline); do
            PGPASSWORD=postgres psql -h localhost -U postgres -d warehouse \
              -v ON_ERROR_STOP=1 -f "$f"
          done
      - working-directory: apps/worker
        run: uv sync --extra dev && uv run pytest -q --maxfail=3
```

Gotchas:
- `\ir` in baseline resolves relative to the including file — must
  invoke `psql` from repo root with the full path. Works.
- Roles: `SET ROLE engine_warehouse_admin` requires roles to exist;
  `00_roles.sql` must be idempotent (`CREATE ROLE ... IF NOT EXISTS`).
  If not, add a pre-step.
- Worker `conftest.py` likely reads `DATABASE_URL`; **worker-planner
  must confirm** the fixture accepts a pre-applied schema.

Coordinate: **worker-planner** owns `conftest.py` + fixture contract.

#### B3. `api-tests.yml` — pytest skeleton for apps/api

`apps/api` has **zero tests** (`_codex_cross_review.md:122-127`). Land
a skeleton that goes green today and red when tests exist.

```yaml
name: API Tests
on:
  pull_request: { paths: ['apps/api/**','.github/workflows/api-tests.yml'] }
  push: { branches: [main] }
permissions: { contents: read }
jobs:
  pytest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with: { enable-cache: true }
      - working-directory: apps/api
        run: |
          uv sync --extra dev || uv sync
          if ls tests/test_*.py 2>/dev/null | head -1 > /dev/null; then
            uv run pytest -q
          else
            echo "No tests yet — skipping."
          fi
```

Gotchas: the `if -d tests` guard means empty suite ≠ fail. Remove it
the moment the api-planner lands a first test file. Confirm
`apps/api/pyproject.toml` has `[project.optional-dependencies] dev`;
if not, stub it with `pytest>=8`.

#### B4. Split `quality.yml` steps

`quality.yml:36-37` runs `npm run quality` as a single step. Branch
protection can only target the job name `quality`, not individual
lint/typecheck. Split:
```yaml
      - name: Frontend lint
        run: npm run lint
      - name: Frontend typecheck
        run: npm run typecheck
      - name: Python lint (ruff)
        working-directory: apps/worker
        run: uv run ruff check app tests
      - name: Python typecheck (mypy)
        working-directory: apps/worker
        run: uv run mypy app
```

Gotchas: `quality.yml:33-34` uses `working-directory: engine` — that
path looks stale given current `apps/worker` layout. Verify and fix.

#### B5. Required-status-check enforcement on main

Not a file edit. Document in `docs/ci.md` (new) the list of required
checks (see §5). Configure via GitHub Settings → Branches. Do NOT
"Include administrators" — keep a hotfix escape hatch.

### Phase C — release gates

#### C1. `no-env-committed.yml`

```yaml
name: No Env Committed
on: [pull_request, push]
permissions: { contents: read }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          offenders=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' || true)
          if [ -n "$offenders" ]; then echo "::error::$offenders"; exit 1; fi
```

Gotchas: regex catches `.env*` while allowing `.env.example`. Does NOT
catch `prod.env` — add a second pass for `\.env$` if needed.

#### C2. `security-headers.test.ts`

Pairs with security-planner's `next.config.ts headers()` fix. Lives in
`apps/web` Jest suite (runs via B1). Assertion shape:
```ts
it('emits CSP, HSTS, COOP, COEP on /', async () => {
  const r = await fetch(`${base}/`);
  expect(r.headers.get('content-security-policy')).toMatch(/default-src/);
  expect(r.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
  expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  expect(r.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
});
```

Gotchas: DuckDB-WASM threading needs COOP+COEP. If security-planner
declines COEP (breaks cross-origin resources), drop COEP.

#### C3. `deps-scan.yml`

```yaml
name: Deps Scan
on:
  schedule: [{ cron: '0 9 * * 1' }]
  pull_request: { paths: ['package-lock.json','**/pyproject.toml','**/uv.lock'] }
  workflow_dispatch:
permissions: { contents: read }
jobs:
  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npm audit --production --audit-level=high
  pip-audit:
    runs-on: ubuntu-latest
    strategy: { matrix: { project: [apps/worker, apps/api] } }
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with: { enable-cache: true }
      - working-directory: ${{ matrix.project }}
        run: uv sync --extra dev || uv sync && uv run pip-audit --strict
```

Gotchas: `--production` filters noisy dev-only advisories.
`--audit-level=high` blocks only high/critical. Add
`.github/dependabot.yml` separately.

#### C4. Lab-route guard test

Pairs with frontend-runtime-planner's prod gate on `/smoke`,
`/loading-preview`, `/field-lab`, `/ambient-field-lab`, `/surface-lab`
(web-app-routes C5). Test lives in B1 Jest suite:
```ts
it.each(['/smoke','/loading-preview','/field-lab','/ambient-field-lab','/surface-lab'])(
  'returns 404 for %s in prod', async (p) => {
    process.env.NODE_ENV = 'production';
    expect((await fetch(`${base}${p}`)).status).toBe(404);
  });
```

Gotchas: Next folds `NODE_ENV` at build time — test needs a fresh
prod-mode server. Frontend-runtime-planner owns the boot shape.

### Phase D — hardening

#### D1. Migration-safety lint

`scripts/check-migration-safety.mjs` invoked by
`.github/workflows/migration-safety.yml`. Rules:
1. `ADD COLUMN ... NOT NULL` without `DEFAULT` or preceding `UPDATE`.
2. `CREATE INDEX` (not `CONCURRENTLY`) outside baseline.
3. `ALTER TABLE ... DROP COLUMN` → flag for review (never block).
4. Missing `SET ROLE` framing → warning.

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const offenders = [];
for (const root of ['db/migrations/warehouse','db/migrations/serve']) {
  for (const f of readdirSync(root)) {
    if (!f.endsWith('.sql') || f.includes('baseline')) continue;
    const src = readFileSync(join(root,f),'utf8');
    if (/ADD COLUMN[^;]*NOT NULL(?![^;]*DEFAULT)/i.test(src) && !/UPDATE.+SET/i.test(src))
      offenders.push(`${f}: NOT NULL ADD COLUMN without DEFAULT/backfill`);
    if (/CREATE\s+INDEX\s+(?!CONCURRENTLY)/i.test(src))
      offenders.push(`${f}: CREATE INDEX without CONCURRENTLY`);
    if (!/SET ROLE/.test(src)) offenders.push(`${f}: missing SET ROLE framing`);
  }
}
if (offenders.length) { console.error(offenders.join('\n')); process.exit(1); }
```

Gotchas: regex is best-effort. Allow `-- @safe-migration: <reason>`
escape comment. Demote SET ROLE check to warning.

#### D2. pgbouncer pool_mode review for worker

Ref: `db-and-infra.md:132` + team-lead item 7.

`pgbouncer.ini:19` is `pool_mode = transaction` — correct for the
serve-read workload. The worker does NOT route through pgbouncer today
(compose exposes both clusters loopback; only serve has pgbouncer in
front). So the asyncpg `statement_cache_size=0` requirement is
currently moot.

Add a comment to `pgbouncer.ini:19`:
```
;; transaction-mode is correct for engine_serve_read. If the worker
;; is ever routed through this pgbouncer, asyncpg MUST set
;; statement_cache_size=0 because transaction-mode breaks prepared-
;; statement reuse across connections.
```

Coordinate: **worker-planner** confirms asyncpg config; flag if a
future `pgbouncer-warehouse` is planned.

#### D3. Index backlog

From `db-and-infra.md:65-68`:
- `idx_s2_paper_reference_metrics_raw_release_citing` is subsumed by
  `idx_s2_paper_reference_metrics_raw_release_counts`. Drop.
- `serve.serving_runs` has no index on `opensearch_alias_swap_status`.
  Add partial index on pending status.

```sql
SET ROLE engine_warehouse_admin;
DROP INDEX IF EXISTS solemd.idx_s2_paper_reference_metrics_raw_release_citing;
RESET ROLE;

-- separate statement, outside transaction:
SET ROLE engine_admin;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_serving_runs_swap_pending
  ON solemd.serving_runs (opensearch_alias_swap_status)
  WHERE opensearch_alias_swap_status = 1; -- look up 'pending' in enum-codes.yaml
RESET ROLE;
```

Gotchas: `CONCURRENTLY` cannot be in a transaction.

#### D4. Timestamp-monotonicity CHECK

```sql
SET ROLE engine_warehouse_admin;
ALTER TABLE solemd.chunk_runs
  ADD CONSTRAINT ck_chunk_runs_completed_after_started
  CHECK (completed_at IS NULL OR completed_at >= started_at) NOT VALID;
ALTER TABLE solemd.chunk_runs VALIDATE CONSTRAINT ck_chunk_runs_completed_after_started;
-- repeat for corpus_selection_runs
RESET ROLE;
```

`NOT VALID` + `VALIDATE` = zero-downtime path.

#### D5. Hand-off to SoleMD.Infra re: `.mcp.json` Neo4j password

Ref: `db-and-infra.md:116` + team-lead item 10.

Out of scope for this repo. File issue in `SoleMD.Infra`:

> **Neo4j password committed in generated `.mcp.json`** —
> `SoleMD.Graph/.mcp.json:34` carries plaintext. Regenerated by
> `solemd mcp-sync`. Generator should emit
> `"password": "${env:NEO4J_PASSWORD}"` and require 1Password injection
> at MCP server start. Ref: `SoleMD.Graph/tmp/audit/db-and-infra.md:116`.

Do NOT modify Infra repo (cross-project protocol).

---

## 4. Cross-team handoffs

**To worker-planner**:
- B2 requires `apps/worker/tests/conftest.py` accepts a pre-applied
  schema over `DATABASE_URL`, OR the fixture builds roles/grants
  idempotently. Confirm.
- A1 requires `apps/worker/app/ingest/writers/s2.py` not to emit
  duplicate stage tuples — audit the INSERT path; add `ON CONFLICT DO
  NOTHING` if needed.
- D2 assumes asyncpg sets `statement_cache_size=0` iff routed through
  pgbouncer. Confirm current config.

**To frontend-runtime-planner**:
- C4 (lab-route test) requires a build-time or server-runtime gate on
  the five lab routes. This plan only wires the test; implementation is
  in `apps/web/app/*/page.tsx`.
- C2 (security-headers test) requires the headers to exist in
  `next.config.ts headers()`. Implementation owned by security-planner;
  test owned here.

**To security-planner**:
- A3 (`.gitignore` hardening) — coordinate single PR.
- A4 (DEV_ONLY rename) — include in public-launch checklist.
- C1 (`no-env-committed.yml`) — defense-in-depth.
- C3 (`deps-scan.yml`) — CVE surface.

**Cross-project to SoleMD.Infra**: D5 `.mcp.json` Neo4j password —
issue only, no repo edit.

---

## 5. Required-status-check list

By phase, so partial rollout is possible.

**After Phase A:**
- `Quality / quality` (existing)
- `No Env Committed / check`
- `Schema Drift Check / schema-drift`

**After Phase B:**
- `Web Tests / jest`
- `Worker Tests / pytest`
- `API Tests / pytest` (skeleton; red when first test lands)

**After Phase C:**
- `Deps Scan / npm-audit`
- `Deps Scan / pip-audit`
- Security-headers assertion inside `Web Tests / jest`
- Lab-route guard inside `Web Tests / jest`

**After Phase D (optional):**
- `Migration Safety / lint`

Branch protection:
- Require up-to-date branches: **yes**
- Require status checks: **yes** (list above)
- Include administrators: **no** (hotfix escape hatch)

---

## Open questions (3)

1. **Baseline contract** (A2): Option A (freeze-at-release) vs C
   (drift check). Recommendation: C now, A within a release cycle.
2. **`apps/api` pyproject shape** (B3): does `pyproject.toml` declare
   a `dev` extras group? If not, api-planner stubs it.
3. **pgbouncer-warehouse future** (D2): any plan to front the warehouse
   with pgbouncer? If yes, worker's `statement_cache_size=0` becomes
   hard-required.

---

## Priority top 3

1. **B1-B3 (CI test enforcement)** — the meta-bug. Every other fix
   compounds until the merge gate runs tests. CRITICAL per
   `_codex_cross_review.md:122-127`.
2. **A1 (stage table UNIQUE)** — silent double-count risk on a metric
   feeding graph-run citation counts. One-line migration. Ref:
   `db-and-infra.md:63-64, 147`.
3. **A2 (baseline drift)** — silent divergence between fresh and
   incremental apply. Option C is ~30 workflow lines. Ref:
   `db-and-infra.md:81, 146`.
