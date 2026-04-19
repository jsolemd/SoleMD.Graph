# Frontend Performance Contract

Agent-facing performance rules for SoleMD.Graph frontend and browser runtime.

Use this reference when touching `apps/web/features/graph/**`,
`packages/graph/src/cosmograph/**`, DuckDB bootstrap, selection/scope
resolution, panel orchestration, or graph-loading paths. Keep this contract
here instead of recreating it in human-facing docs.

## Core Rules

1. Native-first runtime
- Prefer built-in platform capabilities before JS-side orchestration.
- Keep the app-owned Cosmograph adapter behind `apps/web/features/graph/cosmograph/**`.
- Keep shared browser-runtime Cosmograph code behind `packages/graph/src/cosmograph/**`.
- Keep Tiptap behind `apps/web/features/graph/tiptap/**`.

2. One canonical query/state path
- Selection, scope, and graph projection intent resolve through shared layers.
- Do not rebuild selection/scope logic independently per panel or prompt surface.

3. Zero redundant DuckDB work
- Hot-path tables load once per active DuckDB session.
- Hidden panels do not trigger warmup queries.
- Do not reread parquet when a canonical local table already exists.

4. Reuse one live session
- Same checksum means same active session.
- Do not reopen DuckDB because of remounts, rerenders, or Fast Refresh.

5. Local-first hot data
- `base_points` and `base_clusters` are hot-path assets.
- Optional heavy relations stay lazy unless they are on the first-paint path.

6. No hidden hydration penalties
- Keep `use client` boundaries small.
- Lazy-load noncritical chrome and panels.
- Prompt/evidence stream callbacks must be idempotent for the same response.

7. Centralize performance-sensitive contracts
- Shared table names, scope semantics, and cache keys belong in shared modules.

8. Measure before and after
- Verify request counts, HEAD probes, and remote parquet reads were reduced.
- Prefer structural fixes over debounce-only masking.

9. Regressions require tests
- Startup, bootstrap, selection, and repeated-interaction changes need tests.

## Anti-Patterns

- Panel-local selection logic.
- Hidden-panel prefetch on mount.
- Reopening DuckDB to paper over invalidation.
- Bypassing graph, duckdb, or tiptap adapter boundaries.
- Second implementation paths instead of replacing the first.

## Review Questions

- Did this eliminate repeated work?
- Is the hot path local and shared?
- Did the change preserve one canonical implementation?
- Was the result verified with tests or runtime inspection?

## Ambient Field Runtime

Applies to anything under `apps/web/features/ambient-field/**`. The ambient
field is a persistent fixed-stage WebGL surface with its own performance
contract that complements the graph runtime's.

- **One continuous uTime.** `uTime` increments monotonically from
  `getAmbientFieldElapsedSeconds()` (a module-scope singleton in
  `renderer/field-loop-clock.ts`). Never reset it on StrictMode double-mount,
  warmup remount, or chapter boundaries. Resetting it reverts months of Maze
  parity work — the cyan→magenta FBM drift is time-coherent only if uTime
  never steps backwards.
- **Scroll-driven uniforms lerp, never snap.** Every uniform that responds
  to scroll progress goes through `createUniformScrubber<K>` (1 s half-life
  low-pass, `0.5 ** (dtMs / halfLifeMs)`). Fast scroll trails ~1 s and
  settles; slow scroll feels immediate. Snapping a uniform on a phase
  boundary is the regression shape to avoid.
- **Chapter choreography is declarative.** Use
  `createFieldChapterTimeline({events, scrubber, initialTargets})` with a
  list of `ChapterEvent<K>` records, never hand-written scroll math. The
  timeline's `setProgress(p)` + `applyTargets(dtMs)` is the per-frame hook.
- **Hotspots render via DOM + CSS keyframes.** `AmbientFieldHotspotRing` +
  `createHotspotLifecycleController` own the Maze hotspot pool. Per-hotspot
  `animationend` triggers reseed for that hotspot only — never a shared
  timer. CSS keyframes (`afr-hotspot-inner` / `afr-hotspot-outer`) live in
  `overlay/ambient-field-hotspot-ring.css`.
- **No per-frame React updates from ambient-field.** The useFrame hook
  mutates Three.js uniforms directly via refs. Do not call `setState` /
  dispatch / Zustand writes from inside useFrame — that triggers a React
  rerender for every frame of the WebGL loop.
- **DPR capped at 2.** `uPixelRatio` is `min(devicePixelRatio, 2)`. Never
  raise above 2 — high-DPR MacBooks already spend ~4x fill-rate per pixel
  at 2.
- **Burst strength scrubs.** When activating a new bucket, do not set
  `uBurstStrength` directly; route through `createBurstController` so the
  hue shift eases in over 1 s instead of snapping.
- **Mouse parallax ≤ ±5e-4 rad/px.** `attachMouseParallax` caps at Maze's
  values (±3e-4 x / ±5e-4 y). Exceeding them reads as a 3D orbit, not
  ambient parallax.

Canonical refs:

- `docs/map/ambient-field-maze-baseline-ledger-round-12.md` — Source Ground
  Truth + Foundation Primitives + Phase Log.
- `.claude/skills/ambient-field-modules/SKILL.md` — authoring contract for
  any module that uses the shared stage.

## References

- `../SKILL.md` for graph ownership and companion-skill routing
