# Graph Bundle Bootstrap Reference

The browser-side handoff from server-resolved `GraphBundle` metadata into a
running DuckDB session that Cosmograph can render. This is the failure-triage
reference: where each bootstrap step lives, what it owns, and how to localize
faults without crossing into `/graph` territory.

## End-to-End Pipeline

1. **Server resolves bundle metadata.** Owned by `/graph`. Produces the
   `GraphBundle` object carrying `bundleChecksum`, `bundleManifest.tables[*]`,
   `tableUrls`, and `bundleVersion`.
2. **`DashboardShellClient`** receives the bundle, calls
   `useDashboardShellController(bundle)`.
3. **`useDashboardShellController`** owns shell timing, mode chrome, and
   loading-overlay drop. Calls `useGraphBundle(bundle)`.
4. **`useGraphBundle`** reuses the active session for the same checksum,
   registers the remote attachment provider, subscribes to progress, and calls
   `loadGraphBundle(bundle)`.
5. **`createConnection`** opens one DuckDB-WASM worker-backed connection. OPFS
   when capability is detected.
6. **`registerBundleTableFiles`** eagerly fetches each parquet, sha256-verifies
   against the manifest, then `db.registerFileBuffer(...)`.
7. **`prepareHotBundleCache`** decides whether the OPFS hot tables can be
   reused (matching checksum + bundle version + cache schema version + column
   set + presence). Returns `{ reused }`.
8. **Hot table CTAS** (when `reused: false`): `CREATE TABLE base_points AS
   SELECT * FROM read_parquet('graph-bundles/<checksum>/base_points.parquet')`,
   same for `base_clusters`. Then `markHotBundleCacheReady(...)`.
9. **`registerAllViews`** (`features/graph/duckdb/views/register-all.ts`)
   creates the canonical active views and query aliases
   (`current_points_canvas_web`, `current_links_web`, etc.).
10. **`GraphRenderer`** binds Cosmograph 2 props/events and signals first paint
    only after camera state is applied.

## Registered File Contract

| Concept | Value |
|---------|-------|
| Logical namespace | `graph-bundles` |
| Logical name format | `graph-bundles/<bundleChecksum>/<table.parquetFile>` |
| Source of `parquetFile` | `bundle.bundleManifest.tables[tableName].parquetFile` |
| Source of `bundleChecksum` | `bundle.bundleChecksum` |
| Source of bytes | `await fetch(getAbsoluteUrl(bundle.tableUrls[tableName]))` |
| Integrity check | SHA-256 against `bundle.bundleManifest.tables[t].sha256` |
| Registration call | `db.registerFileBuffer(name, bytes)` |

These names are what `read_parquet('graph-bundles/...')` resolves against in
SQL. **They are NOT filesystem paths.** Replacing one with a guess at a disk
path will fail.

## Active View Layering

Hot tables sit at the bottom; views/aliases stack on top:

```
Cosmograph
   |
   v
current_points_canvas_web   current_links_web
   |                           |
   v                           v
[view layering — overlays, scope, focus]
   |                           |
   v                           v
base_points                 (parquet-backed)  universe_links etc.
base_clusters
   |
   v
read_parquet('graph-bundles/<checksum>/<table>.parquet')
   |
   v
registerFileBuffer (verified bytes)
```

Hard rules:

- Cosmograph reads `current_points_canvas_web` and `current_links_web`. Period.
- Overlay mutates membership tables. Do NOT copy rich point tables to mutate them.
- Optional large relations stay lazy. Do NOT eagerly hydrate `universe_points`,
  `universe_links`, or evidence-heavy tables on first paint.

## Session Reuse for Same-Checksum Remounts

If the bundle checksum hasn't changed across remount/rerender:

- Reuse the live connection
- Skip `registerBundleTableFiles` (the buffers are still registered)
- Skip CTAS (the hot tables are still there)
- Re-run camera state + first-paint sequence only

If the bundle checksum changes:

- Tear down via `closeConnection(...)` (the full 5-step dispose lifecycle)
- Open a new connection
- Re-register, re-CTAS as needed

The decision logic lives in `useGraphBundle()`. Do NOT add a parallel session
manager.

## Failure Triage Triangle

When a graph bundle / bootstrap error appears in the browser, walk these three
checkpoints in order. Don't skip ahead.

### Checkpoint 1: Asset URL serves

```bash
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/base_points.parquet
```

- Not `200`: this is a `/graph` publication or asset-serving issue. Hand off.
  Common: bundle alias missing, checksum drift, server route 404.
- `200`: continue.

### Checkpoint 2: Registration path

Check:

- `features/graph/duckdb/bundle-files.ts` — registration
- `bundle.tableUrls[tableName]` — what URL is being fetched
- `getRegisteredBundleTableFileName(bundle, tableName)` — what logical name
  is being registered
- `features/graph/duckdb/views/relations.ts` — what name `read_parquet` uses

Common faults:

- `tableUrls[tableName]` undefined for a manifest table → upstream
  manifest/route mismatch (`/graph` issue)
- Logical name mismatch between registration and `read_parquet` → in-skill bug
- SHA-256 mismatch → bundle was republished without alias bump (`/graph` issue)

Do NOT "fix" a registered-file error by replacing the logical file name with a
filesystem guess or by adding run-id-specific browser logic.

### Checkpoint 3: Session/bootstrap behavior

Check:

- `features/graph/hooks/use-graph-bundle.ts` — session reuse decisions
- `features/graph/duckdb/connection.ts` — connection open + dispose
- `features/graph/duckdb/views/register-all.ts` — view layering
- `features/graph/components/shell/use-dashboard-shell-controller.ts` — overlay timing

Common runtime failures (in-skill):

- session recreated unnecessarily on same checksum (perf regression)
- hot tables rebuilt repeatedly instead of reused (OPFS misconfiguration)
- optional tables attached too early (first-paint stall)
- loading overlay dropped before camera/first paint settles (visual flash)
- renderer workaround added outside the adapter boundary (boundary bleed)

## Common Boot-Time Errors

| Symptom | Likely root | Owner |
|---------|-------------|-------|
| `read_parquet('graph-bundles/...')` fails | Asset URL not 200, or registration name mismatch | Step 1 → `/graph`; Step 2 → in-skill |
| `Graph bundle integrity check failed` | Bundle republished without alias bump | `/graph` |
| `Graph bundle is missing table URL for "X"` | Manifest/tableUrls divergence | `/graph` |
| `DuckDB bundle selection did not resolve a mainWorker URL` | Bundle config broken (likely Next bundling regression) | In-skill |
| `enableSimulation must be false` (or similar config error) | Static-position contract violated | In-skill |
| Loading overlay never drops | `onGraphRebuilt` fired during hidden tab; visibility retry path broken | In-skill |
| Camera flashes wrong position then snaps | Relying on `fitViewOnInit` instead of explicit `fitView(0, padding)` | In-skill |

## Boundaries to Respect

- **Do not** import `@cosmograph/react` outside `features/graph/cosmograph/**`
  or `packages/graph/src/cosmograph/**`.
- **Do not** derive run directories, `bundleUri`, or published filesystem
  paths in the browser.
- **Do not** add a second loader to bypass `useGraphBundle()`.
- **Do not** swallow integrity check errors — escalate to `/graph`.
- **Do not** flip `enableSimulation` to true. Force layout is server-side
  (`/graph`).
