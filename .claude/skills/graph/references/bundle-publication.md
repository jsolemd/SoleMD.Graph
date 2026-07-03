# Bundle Publication Contract

Agent-facing contract for the SoleMD.Graph bundle publish flow, the
checksum-addressed asset surface, and the load-bearing divergence between the
warehouse `solemd.graph_runs` table and the Drizzle `graph_runs` row consumed
by the Next.js asset route.

You publish bundles. You serve them by checksum. You recover from broken
aliases without breaking the browser URL contract.

## Canonical Artifacts

A graph bundle is the immutable parquet set plus a manifest. Browser-visible
assets live under one URL shape only:

```text
/graph-bundles/<checksum>/manifest.json
/graph-bundles/<checksum>/base_points.parquet
/graph-bundles/<checksum>/base_clusters.parquet
/graph-bundles/<checksum>/universe_points.parquet     (lazy attach)
/graph-bundles/<checksum>/paper_documents.parquet     (lazy attach)
/graph-bundles/<checksum>/cluster_exemplars.parquet   (lazy attach)
```

Rules:
- `base_points` and `base_clusters` are the hot first-paint tables. They are
  always present in the published bundle.
- Optional tables (`universe_points`, `paper_documents`, `cluster_exemplars`)
  ship with the bundle but are attached lazily by the browser runtime.
- Every asset URL is checksum-addressed. Do not invent run-id URLs, filesystem
  paths, or a second browser-facing asset route.
- The published parquet bytes are immutable per checksum. Cache headers are
  `Cache-Control: public, max-age=31536000, immutable`.

## `manifest.json` Shape

`manifest.json` is part of the same immutable contract as the parquet assets.
It is the per-bundle metadata document the browser consumes to register tables
in DuckDB-WASM.

The **on-disk JSON keys are snake_case** (`parquet_file`, `sha256`, `bytes`,
`row_count`, `columns`, `schema`). The TypeScript normalizer in
`apps/web/features/graph/lib/fetch/normalize.ts` projects them into
camelCase (`parquetFile`, `sha256`, `bytes`, `rowCount`, ...).

Per-table entries carry at minimum:

| On-disk JSON key | Normalized TS field | Notes |
|---|---|---|
| `parquet_file` | `parquetFile` | Asset filename, e.g. `base_points.parquet` |
| `sha256` | `sha256` | Hex digest of the parquet bytes; cache integrity key |

The per-table shape is enforced by `assertCanonicalBundleManifest` /
`normalizeBundleManifest` in
`apps/web/features/graph/lib/fetch/normalize.ts`. Any change to the manifest
contract must update those normalizers in the same batch.

### Two manifest sources, one contract

Today the manifest the browser actually consumes for first-paint metadata
comes from the **`bundle_manifest` JSONB column** on the serve-cluster
Drizzle `graph_runs` row (see `apps/web/features/graph/lib/fetch.ts`
`buildGraphBundle`), not from streaming `manifest.json` over the asset
route. The on-disk `manifest.json` is still served via
`/graph-bundles/<checksum>/manifest.json` and is part of the immutable
bundle contract — but the database row already carries the same JSON
verbatim, and the GraphBundle the frontend boots from reads it from
Postgres. Keep the two sources byte-equivalent at publish time. If they
diverge, the asset route can serve a stale or inconsistent
`manifest.json` while the bootstrap still works, which is harder to
diagnose than a 404.

## `graph_runs` Has Two Shapes — This Is Load-Bearing

There are **two** independent definitions of `graph_runs`. Both exist in the
checked-in codebase. The fork is the load-bearing publication contract today.

### Warehouse SQL: `solemd.graph_runs`

Defined in `db/schema/warehouse/40_tables_core.sql:269-283`. This is the
warehouse-side row that the publish job writes when a build completes.

```sql
CREATE TABLE solemd.graph_runs (
    graph_run_id UUID PRIMARY KEY DEFAULT uuidv7(),
    built_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    source_release_watermark INTEGER NOT NULL REFERENCES ...,
    layout_policy_version TEXT NOT NULL,
    embedding_model_key SMALLINT,
    status SMALLINT NOT NULL DEFAULT 1,
    qa_summary JSONB,
    CONSTRAINT ck_graph_runs_status CHECK (status BETWEEN 1 AND 5)
);
```

Status enum is a 1-5 small integer. The warehouse row does **not** carry
`bundle_uri`, `bundle_checksum`, `graph_name`, `node_kind`, or `is_current`.

### Drizzle ORM: `graphRuns` in the serve cluster

Defined in `apps/web/lib/db/schema.ts:14-28`. This is the row the Next.js
asset route reads when it resolves a checksum to a bundle directory.

Note: `db/schema/serve/40_tables_core.sql` does **not** carry a matching
`CREATE TABLE solemd.graph_runs` definition — only `graph_run_metrics`,
`graph_clusters`, `graph_points`, etc. The Drizzle schema is the only
source-of-truth for the serve-cluster `graph_runs` shape today. The
publish job is responsible for materializing the table (e.g. via
`drizzle-kit push` or an explicit migration) when it lands. If you find
the serve cluster running without a `solemd.graph_runs` table, the
publish bring-up script is the missing piece.

```ts
export const graphRuns = solemd.table('graph_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  graphName: varchar('graph_name', { length: 128 }).notNull(),
  nodeKind: varchar('node_kind', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),       // text status
  isCurrent: boolean('is_current').notNull().default(false),
  bundleUri: text('bundle_uri').notNull(),
  bundleFormat: varchar('bundle_format', { length: 32 }).notNull(),
  bundleVersion: varchar('bundle_version', { length: 32 }).notNull(),
  bundleChecksum: varchar('bundle_checksum', { length: 128 }).notNull(),
  bundleBytes: integer('bundle_bytes'),
  bundleManifest: jsonb('bundle_manifest'),
  qaSummary: jsonb('qa_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Status is a free-form text column with `'completed'` as the published filter.
Primary key is `id`, not `graph_run_id`.

### How they relate

Today the **Drizzle row in the serve cluster is the runtime source of truth**
for the published bundle catalog the frontend consumes. The web asset route
queries it through `apps/web/features/graph/lib/bundle-assets.ts` and
`apps/web/features/graph/lib/fetch.ts`.

The warehouse `solemd.graph_runs` row is the build-side ledger. It records the
run lifecycle (status enum 1..5: built, published, qa, current, retired-shape)
and ties back to `solemd.source_releases` via `source_release_watermark`.

Until the rebuilt backend collapses the two shapes, treat the divergence as a
boundary: backend write paths land in the warehouse row, and the publish step
projects the runtime fields (`bundle_uri`, `bundle_checksum`, `is_current`)
into the serve-cluster `graph_runs` shape that the Next.js app reads. Do not
add a third `graph_runs` shape. Do not query the warehouse row from the web
asset route. Do not pretend the divergence is gone.

## Asset URL Resolver Flow

The current resolver lives at
`apps/web/features/graph/lib/bundle-assets.ts:resolvePublishedGraphBundleAsset`.
The route handler is `apps/web/app/graph-bundles/[checksum]/[asset]/route.ts`.

Resolution order for a request to `/graph-bundles/<checksum>/<asset>`:

1. **Resolve bundle directory.**
   - Prefer the published checksum alias under
     `GRAPH_BUNDLE_PUBLISHED_ROOT` (canonical:
     `/mnt/solemd-graph/bundles/by-checksum/<checksum>`).
   - If the alias is missing, fall back to recovering the run directory from
     the Drizzle `graph_runs` row (`bundleUri` + status `'completed'` +
     latest `createdAt`).
   - If recovery succeeds, repair the alias on disk so subsequent reads hit
     the published root directly.
2. **Resolve asset path** within that directory, asserting it does not escape
   via path traversal.
3. **Stream bytes** with HTTP range support, `ETag` derived from
   `<checksum>:<asset>:<size>:<mtimeMs>`, immutable cache headers, and 416
   for malformed ranges.

Recovery is a backend concern. The browser URL stays
`/graph-bundles/<checksum>/<asset>` regardless of where bytes were read from.

## Canonical Asset Paths On Disk

| Path | Role |
|---|---|
| `/mnt/solemd-graph/bundles/<run-id>/...` | Real run directory (referenced by `bundle_uri`) |
| `/mnt/solemd-graph/bundles/by-checksum/<checksum>/...` | Published checksum alias (the resolver's first hit) |

The browser never sees `bundle_uri` or run-id paths. If you find frontend
code reading `bundleUri` or constructing run-directory URLs, it is wrong —
fix it at the boundary, not by working around the resolver.

## Failure Classes And Recovery

| Symptom | First-cause check | Owner |
|---|---|---|
| `404 /graph-bundles/<sha>/base_points.parquet` | Alias missing on disk; run row exists in serve cluster | Backend resolver |
| `404` after recovery still fails | Drizzle row not `'completed'`, or `bundleUri` directory gone | Publish job |
| `500` on asset route with path-escape error | Caller request crafted an asset name that resolves outside bundle dir | Treat as request bug, not resolver bug |
| Manifest validation fails | `manifest.json` shape changed without updating `normalizeBundleManifest` | Web fetch normalizer |
| Two checksums claim "current" | `isCurrent` not deduped at publish time | Publish job |

When a bundle 404s:

```bash
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/manifest.json
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/base_points.parquet
ls -la /mnt/solemd-graph/bundles/by-checksum/<checksum>/
```

If `by-checksum/<checksum>` is missing but a row exists in the Drizzle
`graph_runs` table with that checksum and status `'completed'`, the resolver
should self-heal on the next request. If it does not, recovery logic is the
bug.

## Clean Implementation Rules

- Keep one canonical browser URL shape: `/graph-bundles/<checksum>/<asset>`.
- Recover broken aliases in the backend resolver, not in the browser bundle
  loader.
- Do not add parallel "current bundle" lookup paths in the web app.
- Do not hide the warehouse-vs-serve `graph_runs` divergence; it is the
  durable contract until the rebuild collapses it.
- Treat `manifest.json` as part of the immutable bundle: if you change its
  shape, you re-publish, you do not patch in place.

## References

- `../SKILL.md` for graph ownership and failure-triage routing
- `database-schema.md` for the warehouse schema universe
- `apps/web/features/graph/lib/bundle-assets.ts` resolver source
- `apps/web/features/graph/lib/fetch.ts` and `lib/fetch/normalize.ts` for
  manifest normalization
- `db/schema/warehouse/40_tables_core.sql` lines 269-283 for the warehouse row
- `apps/web/lib/db/schema.ts` lines 14-28 for the Drizzle row
