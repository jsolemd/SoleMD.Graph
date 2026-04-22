# Graph Landing Stealth Handoff

> Status: future / exploratory plan. Not yet scheduled.
> Captures the target shape for a single client shell serving both `/`
> (scroll-driven intro) and `/graph` (direct graph entry), with the 3D
> orb as the always-live fixture and the 2D Cosmograph map warming
> silently in the background as an opt-in analysis scope. Closes the
> "landing → `/graph` renders a loading screen even though data is
> warm" gap for the current 2D ship and stages the architecture the
> orb plan (`docs/future/graph-orb-3d-renderer.md`) builds on top of.
>
> **Date**: 2026-04-21 (first draft), 2026-04-21 (hybrid route plan
> locked after design-partner review)
>
> **Scope**: the landing-page → `/graph` handoff and the 2D/3D renderer
> coexistence on that handoff. Data-layer warmup via the existing
> `GraphBundle` / `GraphCanvasSource` / DuckDB-WASM session is already
> in place and stays as-is; the work is all in the React tree and
> renderer mount lifecycle.

## The user-journey contract

- **The 3D orb is the product.** It is the identity surface, the
  default view of `/graph`, and the always-live fixture on landing.
  Landing scroll chapters overlay text on it; scrolling past the last
  chapter fades text, fades chrome in, unlocks pointer-events, and the
  user is in the graph. No navigation event, no remount.
- **The 2D Cosmograph map is a scope-change toggle**, not a separate
  destination. It is the full-corpus analytical surface. It warms
  invisibly in the background while the user explores the orb; toggling
  to it is instant.
- **Direct-URL entry at `/graph`** (bookmarks, wiki deep links,
  external shares) mounts the same shell at scroll-end with chrome
  already live. It accepts a cold-mount loading frame — this is the
  inherent cost of cold entry, no worse than any other heavy client
  app.
- **Repeat users who want to skip the pre-roll** use the top-right
  warmup action on landing: it transitions from pulse to play when the
  orb is render-ready, and clicking it scrolls the current route to
  end (no navigation, no loading state).

## Current state (investigated 2026-04-21)

Subagent recon, key findings with file:line refs:

- **Warmup is data-only, not render.** `useGraphWarmup(bundle)` on
  landing (`FieldLandingPage.tsx:409`) calls `useGraphBundle(bundle)`
  (`apps/web/features/graph/hooks/use-graph-bundle.ts:35-198`) which
  calls `loadGraphBundle(bundle)`
  (`apps/web/features/graph/duckdb/progress.ts:65-78`). That path
  downloads parquets into DuckDB-WASM and registers SQL views. The
  resulting `GraphCanvasSource` is a data handle —
  `{duckDBConnection, pointCounts, overlayRevision}`
  (`apps/web/features/graph/duckdb/types.ts:25-33`). No renderer is
  instantiated.
- **No Cosmograph canvas on `/` today.** Grep of
  `apps/web/features/field/` for `<Cosmograph` returns zero hits.
  The canvas is mounted inside `DashboardShell` on `/graph` via
  `GraphCanvas.tsx:31-37` → `GraphRenderer.tsx:442` →
  `<Cosmograph>`.
- **Session cache dedupes the data fetch across routes.**
  `sessionCache` (`apps/web/features/graph/duckdb/progress.ts:6`)
  is a module-level `Map<checksum, Promise<session>>`. `/` → `/graph`
  navigation hits the cache; parquets are not re-fetched.
- **Loading overlay has two gates.**
  `use-dashboard-shell-controller.ts:116-117` computes
  `isReady = !loading && canvas != null && queries != null` and
  `showLoading = !isReady || !graphPaintReady`. The first gate closes
  when the session is warm (instant on the cached path). The second
  gate closes only on Cosmograph's `onGraphRebuilt` first paint
  (`use-dashboard-shell-controller.ts:88-89`, `GraphCanvas.tsx:75`,
  `GraphRenderer.tsx:238-241`). That is the visible loading frame the
  user sees today.
- **No persistent canvas above routes.** `apps/web/app/layout.tsx`
  is a thin wrapper with no graph mount. Every `/graph` navigation
  mounts a fresh Cosmograph and runs a fresh first paint.

Current shape:

```
/           useGraphWarmup      data warm
                                    │ sessionCache
                                    ▼
/graph      DashboardShell      <Cosmograph> cold each mount
                                    │
                                    ▼
                                first paint
                                    │
                                    ▼
                              overlay dismissed
```

The data half of the handoff is stealth. The render half is not.

## Target architecture — hybrid route, one client shell

### Routing

Two Next App Router entry points, one component underneath:

- `apps/web/app/page.tsx` → renders `<GraphShell mode="landing">`.
  Scroll starts at top. Pre-roll plays. Chrome hidden until last
  chapter scrolls past. Pointer-events off on the canvas until then.
- `apps/web/app/graph/page.tsx` → renders `<GraphShell mode="graph">`.
  Scroll starts at end (programmatic jump on mount). Chrome live.
  Pointer-events on. No pre-roll.

Internal navigation from `/` to "enter graph" is **scroll**, not
`router.push`. The warmup-ready icon and any other "go to graph"
affordance on landing scroll the current page to end, they do not
navigate. The route boundary is only crossed on external entry
(bookmarks, wiki links, typed URL).

This is the key move: the landing → graph *flow* lives entirely on
`/`, so there is no route boundary to cross during that flow and no
need for a persistent-canvas-above-routes architecture. External
cold entry at `/graph` pays the normal cold-mount cost, which is
acceptable for that scenario.

### Shell internals

`<GraphShell mode="landing" | "graph">` owns:

- The data layer (DuckDB session via `useGraphBundle(bundle)`).
- The orb canvas (R3F Three.js — mounted from component entry, live
  throughout scroll and in `/graph` mode).
- The Cosmograph canvas (mounted hidden / off-screen as soon as
  session is ready; first-paints under the cover; stays mounted,
  toggles visibility when scope is "map").
- Scroll state, chrome visibility, pointer-events, warmup-action
  state.
- Current scope: `"orb" | "map"`, user-togglable once pointer-events
  are unlocked.

Shell subcomponents:

- `<LandingScrollChapters>` — only rendered in `mode="landing"`.
  Overlays text on the orb. Fades chapter by chapter.
- `<GraphOrbCanvas>` — always rendered. In `mode="landing"` at the
  scroll positions where the field surface is still primary, the
  orb sits behind the field; as scroll advances, the field fades out
  and the orb becomes primary. In `mode="graph"` the orb is primary
  from first frame.
- `<MapCanvas>` — mounted as soon as DuckDB session is ready.
  `visibility: hidden` + `pointer-events: none` while scope is "orb".
  Becomes visible on scope toggle. Never unmounts during the session.
- `<GraphChrome>` — timeline, filter panels, prompt panel, etc.
  Visibility gated on scroll position in landing mode, always-on in
  graph mode.

### Render-readiness

`useGraphWarmup` today reports session-ready. It should be extended
(or replaced by a new hook) to expose:

- `sessionReady`: data warm (today's behavior).
- `orbReady`: orb canvas first-paint complete.
- `mapReady`: Cosmograph first-paint complete.

The landing warmup icon transitions to "play" on `orbReady`, not
`sessionReady`. Clicking while `orbReady` is true scrolls to end and
unlocks pointer-events in place.

`mapReady` is invisible to the user under normal conditions — by the
time they toggle scope to "map," it is already true and the swap is
instant.

## Implementation plan

### Milestone 1 — confirm the gap and spike the shared shell

- Instrument the current `/graph` cold-mount path. Time from
  navigation start to `graphPaintReady` on a warm DuckDB session on a
  mid-range laptop. If it is imperceptible, some of the architectural
  work below is premature.
- Spike a single `<GraphShell>` component in a branch. Mount it from
  both `app/page.tsx` (in landing mode) and `app/graph/page.tsx`
  (in graph mode). Verify Cosmograph tolerates being mounted with
  `visibility: hidden`; verify it first-paints correctly while
  invisible; verify the visibility swap does not re-trigger first
  paint.

### Milestone 2 — shell extraction for the current 2D ship

- Extract the current `DashboardShell` body into `<GraphShell>` that
  accepts `mode`. Move the landing page's scroll chapters into the
  same tree under `mode="landing"`.
- Retire the cross-route flow: the warmup-ready action scrolls in
  place, does not navigate.
- Keep `/graph` as a direct-entry URL that mounts the shell in
  `mode="graph"` with scroll already at end.
- Keep Cosmograph as the only renderer at this milestone. The orb
  slot is empty; `scope` is always `"map"`.
- Net: `/` → end-scroll is a zero-loading flow (same mount); `/graph`
  direct entry is a cold mount with the existing loading overlay
  (acceptable for direct entry).

### Milestone 3 — introduce orb and scope toggle

- Mount `<GraphOrbCanvas>` per the orb plan
  (`docs/future/graph-orb-3d-renderer.md`).
- Change default scope to `"orb"`. `<MapCanvas>` stays mounted
  invisibly from the moment session is ready.
- Add scope toggle to the chrome.
- Update warmup-ready signal to gate on `orbReady` rather than
  `sessionReady`.

### Milestone 4 — landing choreography on the shared shell

- Move the blob-to-orb morph from a conceptual future chapter into
  the implemented scroll chapter sequence in `<LandingScrollChapters>`.
- Text-layer fade, chrome fade-in, pointer-events unlock all orchestrate
  against the same orb canvas the user is about to interact with.

## Why not the alternatives

### Persistent canvas above routes (`layout.tsx`-level mount)

Initial draft of this plan led with this option. It is **not
needed** under the hybrid route plan above, because the scroll flow
never crosses a route boundary. The only scenario it would help is
direct-URL entry to `/graph`, which is the cold-entry case where a
loading frame is acceptable by definition. Persistent-canvas-above-
routes is architecturally expensive (layout composition, Cosmograph
lifecycle assumptions, hidden-canvas browser-render quirks) and the
hybrid plan buys the same user-visible outcome without it.

### Collapse to a single `/` route

Tempting — simplest possible URL scheme, one surface, scroll is the
only navigation. Rejected because:

- Deep links to specific graph states need a "skip the pre-roll"
  flag in the URL (`/?view=graph&entity=foo`), which is a poor man's
  route parameter and loses the cleanness of `/graph?entity=foo`.
- Removes a natural bookmark URL for returning users who want to
  skip the intro.
- The architectural benefit (no route boundary to cross during the
  scroll flow) is already achieved by the hybrid plan.

### Crossfade polish on the current loading overlay

A tactical mitigation, not a solution. Addresses the symptom without
fixing the cause (fresh canvas per route). Keep it on the shelf as
a fallback if Milestone 2 slips and the cold-entry loading UX needs
interim polish.

## Cross-links

- `docs/future/graph-orb-3d-renderer.md` — the 3D orb plan. Its
  line 595 ("we do not commit to hoisting above the route tree") is
  compatible with this plan because this plan removes the need to
  hoist: the scroll flow never crosses a route boundary. When this
  plan lands, line 595 should be clarified to note that no hoisting
  is needed *because* landing and `/graph` share a component and the
  scroll flow is single-route, rather than implying a loading-tax
  acceptance.
- `docs/rag/05b-graph-bundles.md §11.7` — the bundle-side dev fixture
  cross-links here as the known handoff gap. The fixture is
  orthogonal; it delivers a warm session to whatever shell mounts.
- `docs/rag/14-implementation-handoff.md §9` — through-line note
  ties this plan, the fixture, and the env loader together under the
  bundle lane.
- `docs/map/modules/landing.md` — update when Milestone 4 lands.

## Open questions

- Does Cosmograph tolerate `visibility: hidden` first-paint cleanly,
  or does it require visible render to complete first paint? Milestone
  1 spike answers this.
- Do we need two WebGL contexts (orb + map) running simultaneously,
  or does the hidden-map keep its context suspended? Mid-range GPU
  behavior spike in Milestone 1.
- When scope toggles map → orb → map within a session, does
  Cosmograph need any re-warmup, or does the hidden mount stay
  warm? Probably warm, but verify.

## Cleanup ledger

- When Milestone 2 ships, this document moves from `docs/future/`
  to a "completed plans" archive or is deleted, and the
  cross-links in `05b §11.7` / `14 §9` are either removed or
  updated to point at the landed architecture.
- `graph-orb-3d-renderer.md` line 595 is updated as noted above.
