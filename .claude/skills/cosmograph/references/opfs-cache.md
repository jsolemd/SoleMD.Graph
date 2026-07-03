# OPFS Hot-Bundle Cache Reference

The Origin Private File System (OPFS) cache lets SoleMD.Graph reuse hot bundle
tables across full page reloads, not just same-checksum remounts. This file
documents capability gating, schema versioning, the column-set hash safety net,
and browser quirks. Read `SKILL.md` first for the rule that you cannot
"simplify" the column-set hash away.

## Capability Gate

`apps/web/features/graph/duckdb/persistent-cache.ts`:

```ts
export function canUsePersistentGraphDatabase() {
  return (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    typeof window.navigator.storage?.getDirectory === 'function'
  );
}
```

If the gate returns false, `connection.ts` opens an in-memory DB instead. The
connection layer also wraps `db.open({...opfs})` in try/catch, falling back to
`:memory:` if OPFS open throws (Safari quirks, quota exhausted).

## OPFS Path

```ts
export function getPersistentGraphDatabasePath() {
  return 'opfs://solemd-graph-runtime.duckdb';
}
```

One persistent file per origin. DuckDB-WASM owns serialization to/from this
single file; never write to it from outside DuckDB.

## Hot Tables

Two tables are persisted across reloads:

```ts
const HOT_BUNDLE_TABLES = ['base_points', 'base_clusters'] as const;
```

Optional large tables (`universe_points`, `universe_links`, evidence-heavy
tables) stay parquet-backed and are read lazily. Do NOT add tables to
`HOT_BUNDLE_TABLES` without measuring page-load impact.

## Cache Schema Versioning

Two independent invalidation triggers:

### 1. `cache_schema_version` bump

```ts
const GRAPH_RUNTIME_CACHE_SCHEMA_VERSION = 1;
```

Bump this constant when:

- Hot table column layout changes in a way that's incompatible with old caches
- Hot table set itself changes
- Cache metadata table layout changes

The metadata row stores the schema version. On open, mismatch = drop and rebuild.

### 2. Column-set hash mismatch (the safety net)

```ts
function computeHotBundleColumnSetHash(bundle: GraphBundle): string {
  const parts: string[] = [];
  for (const tableName of HOT_BUNDLE_TABLES) {
    const manifest = bundle.bundleManifest.tables[tableName];
    const columns = manifest?.columns ?? [];
    const sorted = [...columns].sort();
    parts.push(`${tableName}:${sorted.join(',')}`);
  }
  return parts.join('|');
}
```

Why it exists: same `bundleChecksum` does not guarantee same column set. A
republished bundle that reuses a checksum (or projection drift in the build
pipeline) would otherwise silently serve a stale schema. The column-set hash
catches that.

**Hard rule**: do not "simplify" this surface by removing the hash. It's the
agent's last line of defense against silent stale-schema reads.

## Cache Metadata Table

```sql
CREATE TABLE IF NOT EXISTS __graph_runtime_cache_meta (
  cache_slot VARCHAR PRIMARY KEY,
  bundle_checksum VARCHAR NOT NULL,
  bundle_version VARCHAR NOT NULL,
  cache_schema_version INTEGER NOT NULL,
  column_set_hash VARCHAR,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
ALTER TABLE __graph_runtime_cache_meta ADD COLUMN IF NOT EXISTS column_set_hash VARCHAR;
```

Cache reuse fires only when ALL match:

- `bundle_checksum`
- `bundle_version` (manifest's bundleVersion, falls back to bundle.bundleVersion)
- `cache_schema_version === GRAPH_RUNTIME_CACHE_SCHEMA_VERSION`
- `column_set_hash` matches the current bundle's hash
- All `HOT_BUNDLE_TABLES` actually exist in `information_schema.tables`

If any mismatch, drop the hot tables and force a fresh CTAS:

```sql
DROP TABLE IF EXISTS base_points;
DROP TABLE IF EXISTS base_clusters;
-- ...then re-materialize from registered parquet
```

## Lifecycle

`prepareHotBundleCache(conn, bundle)` returns `{ reused: boolean }`:

- `reused: true` — hot tables ready, just bump `updated_at`
- `reused: false` — caller must re-CTAS the hot tables, then call
  `markHotBundleCacheReady(conn, bundle)`

`markHotBundleCacheReady` does an `INSERT OR REPLACE` on the meta row. Always
call it AFTER the hot tables are populated; if you call it first and the CTAS
fails, the next session will read uninitialized cached state.

## Flush Files

`db.flushFiles()` is part of the dispose lifecycle (see `duckdb-wasm.md`). It
flushes pending OPFS writes before close. If you skip it, recently-written
hot-table data may not survive an unclean shutdown.

## Browser Support

| Browser | OPFS | `createSyncAccessHandle` | `createWritable` |
|---------|------|--------------------------|-------------------|
| Chrome 86+ | Yes | Worker only | Yes |
| Firefox 111+ | Yes | Worker only | Yes |
| Safari 15.2+ | Yes | Worker only | **No** |

`fileHandling: 'auto'` in `db.open` lets DuckDB pick the right handle type per
browser. Don't pin `'sync'` or `'writable'` — Safari will break.

`createSyncAccessHandle` is worker-only on every browser. DuckDB uses this
internally inside its Web Worker; do NOT call it from the main thread.

## Storage Quota

OPFS shares quota with IndexedDB. Chrome's default heuristic is generous (often
60% of free disk), but cleared on:

- User clears browsing data
- Aggressive eviction when disk pressure is high
- StorageManager `persist()` was never called and the site has low engagement

SoleMD does not currently call `navigator.storage.persist()`. If hot-bundle
cache eviction becomes a measured regression, add a one-time `persist()` request
during the bootstrap path.

## Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Same hot tables rebuilt every reload | Capability gate failing | Check `getDirectory` exists; check incognito mode (some browsers disable OPFS in private windows) |
| Stale schema served after bundle republish | Column-set hash bypassed | Re-add the hash check; do NOT shortcut on `bundleChecksum` alone |
| `db.open(opfs)` throws on Safari | Quota or sync-access-handle quirks | Already handled — try/catch falls back to in-memory |
| `flushFiles` slow | Many pending writes; first-load CTAS just completed | Expected; only flush during dispose |
| Multiple tabs corrupt cache | OPFS doesn't mediate concurrent writes | Browser owns this; DuckDB-WASM single-tab assumption is acceptable for SoleMD |
