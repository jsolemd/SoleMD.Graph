# DuckDB Agentic Ledger

Target: `features/graph/duckdb`

| id | status | priority | theme | evidence | next action | verification |
| --- | --- | --- | --- | --- | --- | --- |
| DDB-001 | completed | P0 | Prepared statement churn | `views/overlay.ts` and `views/selection.ts` were hand-preparing and closing hot parameterized statements even though `queries/core.ts` is the shared query boundary | Completed in `51388ee` by routing parameterized reads and writes through the shared statement cache and closing cached statements on connection shutdown | `features/graph/duckdb/__tests__/core-helpers.test.ts`; `npm test -- --runInBand features/graph/duckdb/__tests__`; `npm run typecheck`; `npm run build` |
| DDB-002 | completed | P0 | Overlay refresh query churn | `session.ts` re-queried overlay counts and canvas counts during overlay refresh even though `basePointCount` and materialized overlay counts were already available | Completed in `51388ee` by deriving `pointCounts` from `basePointCount + overlayCount` and carrying overlay counts through refresh paths | `features/graph/duckdb/__tests__/session.test.ts`; `npm test -- --runInBand features/graph/duckdb/__tests__`; `npm run typecheck`; `npm run build` |
| DDB-003 | completed | P0 | No-op selection writes | `setSelectedPointIndices` and `setSelectedPointScopeSql` rewrote `selected_point_indices` on semantically identical input | Completed in `51388ee` by tracking persisted selection state in-session and no-oping repeated writes | `features/graph/duckdb/__tests__/session.test.ts`; `npm test -- --runInBand features/graph/duckdb/__tests__`; `npm run typecheck`; `npm run build` |
| DDB-004 | completed | P1 | Alias view churn | `registerActiveCanvasAliasViews` recreated stable query-side aliases every overlay revision even when targets were unchanged | Completed in `68a7f96` by caching alias targets per connection and only rewriting views whose target relation changed | `features/graph/duckdb/__tests__/canvas.test.ts`; `npm test -- --runInBand features/graph/duckdb/__tests__`; `npm run typecheck`; `npm run build` |
| DDB-005 | completed | P1 | Canvas refresh contract cleanup | The re-scan confirmed every live `refreshCanvas` caller already supplies `overlayCount`, so the fallback query path was redundant churn | Completed in `51388ee`; the session contract now requires `overlayCount` and the fallback overlay-count query is gone | `rg -n "overlayCount\\?: number|SELECT count\\(\\*\\)::INTEGER AS count FROM overlay_points_web" features/graph/duckdb`; `npm test -- --runInBand features/graph/duckdb/__tests__` |
| DDB-006 | completed | P1 | Session modularization | `features/graph/duckdb/session.ts` was 1,354 lines and owned overlay control, info-query caching, and orchestration in one file, violating the size and responsibility boundary rules | Completed by moving the file to `session/index.ts` and extracting `session/overlay-controller.ts`, `session/info-queries.ts`, and `session/info-query-helpers.ts` while preserving the public `createGraphBundleSession` API | `wc -l features/graph/duckdb/session/index.ts features/graph/duckdb/session/info-queries.ts features/graph/duckdb/session/info-query-helpers.ts features/graph/duckdb/session/overlay-controller.ts`; `npm test -- --runInBand features/graph/duckdb/__tests__`; `npm run typecheck`; `npm run lint`; `npm run build` |

## Batch Notes

- Official DuckDB guidance reinforced the local findings: reuse the same connection, prefer fewer larger operations, and use prepared statements for repeated small parameterized queries.
- Code batches:
  - `51388ee` `Optimize DuckDB session query churn`
  - `68a7f96` `Reduce duckdb canvas alias churn`
  - `7770ad9` `Optimize DuckDB session query churn` (ledger entry only)
  - pending modularization batch for the `session/` directory split
- Post-modularization re-scan should focus on whether any remaining churn is concentrated in query helpers rather than session orchestration.
