# DuckDB-WASM Reference

DuckDB-WASM bootstrap, bundle selection, runtime pragmas, and dispose lifecycle
for SoleMD.Graph. Read `SKILL.md` first for the rules; come here for concrete
DuckDB-side detail.

## Bundle Selection

SoleMD uses a two-bundle manifest, anchored on the app origin via
`new URL('@duckdb/duckdb-wasm/dist/...', import.meta.url)`:

```ts
const LOCAL_DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  eh: {
    mainModule: new URL('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm', import.meta.url).toString(),
    mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js', import.meta.url).toString(),
  },
  mvp: {
    mainModule: new URL('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm', import.meta.url).toString(),
    mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js', import.meta.url).toString(),
  },
};
const bundle = await dd.selectBundle(LOCAL_DUCKDB_BUNDLES);
```

`selectBundle` picks `eh` (exception handling) when the browser supports it,
falls back to `mvp` otherwise.

**Why `coi` is excluded**: the Cross-Origin-Isolated pthread bundle requires
COOP+COEP headers which are intentionally NOT enabled in this project. Adding
the `coi` bundle without those headers leads to runtime breakage.

## Deferred Dynamic Import (SSR Boundary)

`@duckdb/duckdb-wasm`'s browser entry references `Worker` at module top level.
Next's Turbopack alias resolves the package to that browser entry in both
server and client bundles, so a static `import` crashes during SSR HTML
generation — SSR walks client-component import trees regardless of `'use client'`
or `'client-only'`.

**Pattern** (canonical: `apps/web/features/graph/duckdb/connection.ts`):

```ts
let duckdbModulePromise: Promise<typeof import('@duckdb/duckdb-wasm')> | null = null;

function loadDuckdbModule() {
  duckdbModulePromise ??= import('@duckdb/duckdb-wasm');
  return duckdbModulePromise;
}

export async function createConnection() {
  const dd = await loadDuckdbModule();
  // ...
}
```

Do not "fix" the dynamic import. It is a correctness contract.

## Worker URL Shim

When `bundle.mainWorker` is on a different origin (or an absolute URL), the
browser can refuse to instantiate it directly. SoleMD wraps it in a Blob
`importScripts(...)` shim:

```ts
const workerUrl = URL.createObjectURL(
  new Blob([`importScripts("${mainWorkerUrl}");`], {
    type: 'text/javascript',
  })
);
const worker = new Worker(workerUrl);
```

Always revoke the blob URL after `db.instantiate(...)` returns (see
`connection.ts` for the canonical try/finally).

## Connection Pragmas

Set immediately after `db.connect()`:

| Pragma | Value | Reason |
|--------|-------|--------|
| `enable_object_cache` | on | Repeated parquet scans benefit from cached object metadata |
| `preserve_insertion_order` | `false` | Allow query planner to reorder for speed |
| `memory_limit` | `'1500MB'` | Wasm ceiling is ~4GB per Chrome tab; this leaves headroom |
| `threads` | `1` | DuckDB-WASM is single-threaded without COI bundle |
| `filesystem.reliableHeadRequests` | `false` (in `DuckDBConfig`) | Avoid repeated HEAD probes on app-served parquets |

Canonical impl: `apps/web/features/graph/duckdb/connection.ts:147-153`.

## OPFS-Backed `db.open(...)`

When `canUsePersistentGraphDatabase()` returns true, `db.open` uses OPFS:

```ts
await db.open({
  ...baseConfig,
  opfs: { fileHandling: 'auto' },
  path: 'opfs://solemd-graph-runtime.duckdb',
});
```

`fileHandling: 'auto'` lets DuckDB decide between sync-access-handle (fast,
worker-only) and writable-stream (Safari fallback). The whole call is wrapped in
try/catch falling back to in-memory `db.open(baseConfig)` if OPFS open fails.

See `references/opfs-cache.md` for OPFS browser support and constraints.

## Registered File Pattern

DuckDB reads bundle parquets through registered logical names. SoleMD uses
`registerFileBuffer` (NOT `registerFileURL`):

```ts
const bytes = await fetchAndVerifyParquet(getAbsoluteUrl(tableUrl), expectedSha256, tableName);
await db.registerFileBuffer(
  `graph-bundles/<checksum>/${parquetFile}`,
  bytes,
);
```

Why `registerFileBuffer` not `registerFileURL`: SoleMD eagerly fetches the
parquet and SHA-256 verifies it against the manifest before registration. The
buffer pattern catches bundle-serving drift (republish without alias bump,
MITM tampering) — at the cost of holding the full bundle in memory, which is
acceptable for typical graph sizes.

Mismatch behavior: throw with a clear `Republish the bundle.` signal. Do NOT
swallow this.

Canonical impl: `apps/web/features/graph/duckdb/bundle-files.ts`.

## Prepared Statements

Pool prepared statements with the helpers in
`apps/web/features/graph/duckdb/queries/core.ts`:

- `executeStatement(conn, sql, params)` — execute and discard
- `queryRows(conn, sql, params)` — typed row read
- `closePreparedStatements(conn)` — flush the pool (called during dispose)

Do NOT manually create `await conn.prepare(...)` and forget to release. The
helper layer owns lifecycle.

## Streaming Large Results

For result sets that won't fit in memory (or where backpressure matters), use
`conn.send(sql)` to stream — it returns an `AsyncRecordBatchStreamReader`. Pull
batches with `for await (const batch of reader)`. SoleMD uses streaming for
`universe_*` reads on demand; do NOT stream `base_points` (it's hot, fully
materialized).

## Dispose Lifecycle (Hard Rule)

When tearing down a session, run **all five steps in order**, capturing errors
but propagating the first one. Skipping any step leaks DuckDB statements,
file handles, or workers:

```ts
async function closeConnection(conn, db, worker) {
  let firstError = null;
  try { await closePreparedStatements(conn); } catch (e) { firstError ??= e; }
  try { await db.flushFiles(); } catch (e) { firstError ??= e; }
  try { await conn.close(); } catch (e) { firstError ??= e; }
  try { await db.terminate(); } catch (e) { firstError ??= e; }
  worker.terminate();
  if (firstError) throw firstError;
}
```

Canonical impl: `apps/web/features/graph/duckdb/connection.ts:167-199`.

Step semantics:

1. `closePreparedStatements(conn)` — release statement pool first; later steps
   will close the connection that owns them.
2. `db.flushFiles()` — flush OPFS writes BEFORE close so persisted data isn't
   torn down mid-write.
3. `conn.close()` — shut the connection.
4. `db.terminate()` — shut the AsyncDuckDB instance and its message loop.
5. `worker.terminate()` — release the Web Worker.

## Memory Limits

Per-tab Chrome memory ceiling is ~4GB. SoleMD caps DuckDB at 1500MB to leave
headroom for:

- Cosmograph WebGL2 GPU memory mirror
- React/Zustand store overhead
- Bundle parquet buffers held in memory after `registerFileBuffer`

If you need more headroom, do NOT bump `memory_limit` blindly. Profile first;
the more sustainable fix is usually narrowing column projection or moving a
relation back to lazy parquet read.

## Fallback Paths

| Scenario | Fallback |
|----------|----------|
| No `eh` bundle | `selectBundle` picks `mvp` |
| OPFS unavailable (`canUsePersistentGraphDatabase` false) | In-memory `:memory:` DB |
| OPFS open throws (Safari quirks, quota) | try/catch falls back to in-memory |
| Bundle integrity mismatch | Throw — do NOT recover; signal `/graph` to republish |
| `mainWorker` URL not resolvable | Throw `'DuckDB bundle selection did not resolve a mainWorker URL'` |

## Browser Compat

| Feature | Min support | Notes |
|---------|------------|-------|
| WebGL2 | All target browsers | Cosmograph rendering backbone |
| OPFS | Chrome 86+, Firefox 111+, Safari 15.2+ | Capability-gate via `navigator.storage.getDirectory` |
| `createSyncAccessHandle` | Worker-only | DuckDB uses internally; do not call on main thread |
| `createWritable` | Not supported on Safari OPFS | Why `fileHandling: 'auto'` matters |
| SharedArrayBuffer / pthread | Needs COOP+COEP | Intentionally NOT enabled in this project |

## Logger

DuckDB-WASM defaults to `ConsoleLogger`. SoleMD uses `VoidLogger` to keep the
console quiet in production:

```ts
const db = new dd.AsyncDuckDB(new dd.VoidLogger(), worker);
```

If you need DuckDB diagnostics during local debugging, swap in
`new dd.ConsoleLogger()` temporarily — but don't ship it.
