# DuckDB Agentic Ledger

Target: `features/graph/duckdb`

| id | status | priority | theme | evidence | next action | verification |
| --- | --- | --- | --- | --- | --- | --- |
| DDB-001 | completed | P0 | Prepared statement churn | `views/overlay.ts` and `views/selection.ts` were hand-preparing and closing hot parameterized statements even though `queries/core.ts` is the shared query boundary | Route parameterized reads and writes through the shared statement cache and close cached statements on connection shutdown | `features/graph/duckdb/__tests__/core-helpers.test.ts`; `npm run typecheck`; `npm run build` |
| DDB-002 | completed | P0 | Overlay refresh query churn | `session.ts` re-queried overlay counts and canvas counts during overlay refresh even though `basePointCount` and materialized overlay counts were already available | Derive `pointCounts` from `basePointCount + overlayCount` and clear persisted selection state through one path | `features/graph/duckdb/__tests__/session.test.ts`; `npm run typecheck`; `npm run build` |
| DDB-003 | completed | P0 | No-op selection writes | `setSelectedPointIndices` and `setSelectedPointScopeSql` rewrote `selected_point_indices` on semantically identical input | Track persisted selection state in-session and no-op repeated writes | `features/graph/duckdb/__tests__/session.test.ts`; `npm run typecheck`; `npm run build` |
| DDB-004 | completed | P1 | Alias view churn | `registerActiveCanvasAliasViews` recreated stable query-side aliases every overlay revision even when targets were unchanged | Cache alias targets per connection and only rewrite views whose target relation changed | `features/graph/duckdb/__tests__/canvas.test.ts`; `npm run typecheck`; `npm run build` |
| DDB-005 | pending | P1 | Canvas refresh contract cleanup | `refreshCanvas` still accepts an optional `overlayCount` and keeps a fallback overlay count query path even though every live call site now supplies the count | Remove the unused fallback query path if the re-scan confirms no external caller needs it | pending |
| DDB-006 | pending | P1 | Session modularization | `session.ts` remains a large central hotspot with overlay, selection, caching, and query orchestration mixed together | Re-slice the session around overlay state and selection state if the next pass shows high churn remains there | pending |

## Batch Notes

- Official DuckDB guidance reinforced the local findings: reuse the same connection, prefer fewer larger operations, and use prepared statements for repeated small parameterized queries.
- First verified batch is ready for a narrow DuckDB commit after the current validation pass.

