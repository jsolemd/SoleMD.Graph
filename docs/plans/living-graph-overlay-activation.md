# Living Graph Overlay Activation Plan

Status: implemented

This plan tracked the runtime slice needed to make `base / universe / overlay / active / evidence`
fully operational in the browser without falling back to JS point hydration.

## Goals

- Keep Cosmograph bound to DuckDB table names, not `Record<string, unknown>[]`.
- Make overlay activation update the active canvas in place.
- Keep overlay triggers modular so future entity, relation, citation, and RAG flows
  can reuse the same plumbing.
- Refresh info/table surfaces when active overlay membership changes.

## Checklist

- [x] Add a canonical overlay activation contract to query/session types.
- [x] Make the session publish canvas overlay state updates.
- [x] Bind Cosmograph to runtime-provided active table names from the session canvas contract.
- [x] Implement the first modular overlay trigger: cluster-neighborhood expansion.
- [x] Wire a user-facing activation control and clear-overlay control.
- [x] Refresh query-driven info/table surfaces on overlay revision changes.
- [x] Recheck remaining point include columns and helper paths touched by the new flow.
- [x] Run targeted verification and update forward-looking docs.

## Notes

- `base_points` remains the first-paint scaffold.
- `universe_points` remains the premapped activation universe.
- `overlay_point_ids -> overlay_points_web -> active_points_web` remains the canonical
  local activation pipeline.
- The runtime now publishes versioned active alias views so Cosmograph receives a
  real table-name update on overlay changes while preserving point positions by id.
- The first live trigger is explicit cluster-neighborhood expansion from the info panel.
- Evidence retrieval stays backend/API-driven and is not part of this browser-side slice.
