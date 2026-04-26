# Plan — Full 3D Cosmograph Feature Parity in OrbSurface (Amended)

> **Status:** Plan. Awaiting human review of amendments before slice A0
> implementation. Codex foundation review (verify-only) returned **REJECT**
> on the prior revision; this document is the corrected plan.
> **Branch context:** `feat/orb-as-field-particles` (2026-04-25 onward).
> Slices 1–10 complete.
> **Companion docs:**
> - `docs/future/orb-field-slice-5b-cosmograph-selection-audit.md`
>   (slice 5b prerequisite for D/E)
> - `docs/future/graph-orb-3d-renderer.md` (original 3D renderer plan)
> **Companion memory:**
> `feedback_codex_review_for_foundation_plans.md`,
> `feedback_foundational_plans_need_deep_recon.md`,
> `feedback_selection_model_phase1.md`,
> `feedback_eliminate_before_bridge.md`.

## Why this document exists

Foundation-level plan. Gates ~6+ weeks of slice work covering camera
controls, sidecar texture lanes G/B/A, multi-select with rectangle
readback, renderer-neutral chrome, and configuration parity.

The prior revision routed slice A0's interaction context through
`OrbSurface`. **Codex verify-only review rejected that topology** because
React context only flows downward, and `FieldScene` (where slice A1's
camera controls mount) is a **sibling** of `OrbSurface`, not a descendant.
Several other findings (panel extraction scope, adapter boundary
location, selection-commit consolidation) were tagged MEDIUM and are
addressed inline as blocking corrections, not footnotes.

This document supersedes the prior plan in chat / `ExitPlanMode` form.
Per `feedback_future_plans_location`, foundation plans live here, not
just in ephemeral plan-mode messages.

## Goal

Full 3D Cosmograph feature parity in `OrbSurface`:

- Zoom in/out, pan, fit-to-view, double-click zoom-to-particle
- Programmatic camera transitions
- Hover ring, single-click spotlight, multi-select, rectangle select
- Snapshot export
- Filter / legend / timeline chrome (renderer-neutral)
- Dynamic color and size remapping
- 3D physics / feel configuration: rotation speed, particle motion
  speed, ambient entropy/randomness, and formation presets such as
  natural cloud / globe / data-gravity. Every control must map to a
  documented rendering or data-physics signal; no decorative "physics"
  sliders.
- Link rendering (deferred — slice H)

The 2D toggle is a fallback escape, not the destination.

## Codex REJECT findings — incorporated as blocking corrections

### [HIGH] PROBE-3 — A0 ref topology was structurally impossible

**Finding.** `apps/web/app/(dashboard)/DashboardClientShell.tsx:166`
renders `<FieldCanvas />` before `{children}` (which contains
`OrbSurface`). `FieldCanvas` owns `FieldScene`. A context provider
created inside `OrbSurface` cannot flow upward or sideward into
`FieldScene`. `GraphSurfaceSwitch.tsx:32` conditionally unmounts the 3D
branch on renderer toggle, so element identity must also tolerate
replacement.

**Correction (blocking, applies to slice A0).**
The interaction-surface context provider lives in
**`DashboardClientShell`**, above both `FieldCanvas` and the children
subtree. The provider holds `surfaceElement` state plus a
`registerSurface(node)` callback (and any peer state slices A1 / C / E
need on the same surface). `OrbInteractionSurface`, rendered inside
`OrbSurface`, **registers** the live element through that callback.
`FieldScene` reads the current element via `useOrbInteraction()` from
the same shared root. Both branches are now downward-context consumers.

The provider must tolerate the surface DOM element being replaced (3D ↔
2D toggle, theme toggle, route swap). During 2D the registered element
is `null`; when 3D mounts it becomes the fresh surface element. This is
reactive state, not only a mutable ref, because `ref.current` changes do
not trigger React effects. Slice A1's `<CameraControls>` binds in an
effect keyed on `surfaceElement`, not `domElementRef.current`.

### [MEDIUM] PROBE-1 — A0.5 panel extraction scope is wider than prior plan implied

**Finding.** `PromptBox` is **not** mounted in `ShellPanels`. It lives
separately in `apps/web/features/graph/components/shell/DesktopShell.tsx:107`
and `MobileShell.tsx:138`. `ShellPanels.tsx` mixes renderer-clean panels
with Cosmograph-bound widgets (`CanvasControls`, `TimelineBar`,
`ColorLegends`, `SizeLegend`). `OrbSurface.tsx:22` already duplicates
SSR-disabled panel imports. Naive extraction will regress 2D mounts
mid-A0.5 before A1 lands.

**Correction (blocking, applies to slice A0.5).**
`<GraphPanelsLayer>` extraction must absorb mount paths from **three**
locations, not one:

1. `ShellPanels.tsx` (DetailPanel / WikiPanel / InfoPanel /
   RagResponsePanel and Cosmograph widgets — split clean from bound
   inside the layer)
2. `DesktopShell.tsx:107` `PromptBox` mount
3. `MobileShell.tsx:138` `PromptBox` mount

Every panel and chrome piece is classified explicitly in the
**Panel & Chrome Classification** table below. Renderer-clean panels
mount through `<GraphPanelsLayer>` in both 2D and 3D. Cosmograph-bound
widgets stay in the 2D-only mount path until their renderer-neutral
equivalents land in slice F or G. Orb-specific pieces stay
under `OrbSurface`.

### [MEDIUM] PROBE-6 — Adapter boundary cited at the wrong layer

**Finding.** `packages/graph/src/cosmograph/hooks/use-graph-camera.ts`,
`use-graph-export.ts`, `use-graph-instance.ts` are thin null-tolerant
wrappers around Cosmograph runtime calls. The **real** Cosmograph
coupling that needs an adapter boundary is in
`apps/web/features/graph/cosmograph/hooks/use-graph-selection.ts:19`,
which calls `selectPoint`, `pointsSelection`, and native source APIs.

**Correction (applies to slice E, F, and any backend-shape decision).**
The renderer-neutral interaction backend layer is anchored as follows:

- `packages/graph/src/interaction/types.ts` — **new**, neutral
  `CameraBackend` / `SelectionBackend` / `FocusBackend` / `ExportBackend`
  / `HoverBackend` interfaces. Pure types.
- Package-level Cosmograph hooks (`packages/graph/src/cosmograph/hooks/*`)
  stay as thin null-tolerant wrappers — **not** the adapter boundary.
- App-level Cosmograph implementation lives at
  `apps/web/features/graph/cosmograph/interaction-backends/` (new dir),
  wrapping `apps/web/features/graph/cosmograph/hooks/use-graph-selection.ts`
  and peers.
- App-level Orb implementation lives at
  `apps/web/features/orb/interaction-backends/` (new dir).
- Consumers (chrome, panels, snapshot export) read whichever backend the
  active renderer mode selects.

### [MEDIUM] OTHER-1 — Slice E commit helper would be a third commit shape

**Finding.** Two selection-commit paths already exist:

- `apps/web/features/graph/lib/graph-selection-state.ts:3`
  `commitSelectionState` — writes `setSelectedPointIndices`,
  `setSelectedPointCount`, `setActiveSelectionSourceId`.
- `apps/web/features/graph/cosmograph/hooks/use-points-filtered.ts:118-143`
  `persistSelectionIntent` — rAF-deferred, writes scope SQL, clears node
  state.

Adding a third helper at slice E without consolidating the existing two
produces three divergent commit shapes.

**Correction (blocking, applies to slice 5b/D/E).**
The new canonical helper **replaces or absorbs** both existing paths.
Single entry point: `commitExplicitSelection({source, pointIndices})`.
It owns:

- `selected_point_indices` writes (`setSelectedPointIndices`)
- `setSelectedPointCount`
- `setActiveSelectionSourceId`
- scope SQL writes (`setCurrentPointScopeSql`) using the existing
  selected-point baseline predicate, not by interpolating thousands of
  indices into SQL
- node-state clears
- rAF deferral

Both 2D's `use-points-filtered` path and 3D's rect-select path call this
single helper. `commitSelectionState` and `persistSelectionIntent` are
either deleted or become private internals re-exported only by the
canonical helper. The slice 5b refactor lands the consolidation; D and E
inherit it.

### [MEDIUM] PROBE-4 — Rect readback is a new path, not a cap on existing infrastructure

**Finding.** `field-picking.ts:151-158, 184-201` hardcodes a **1×1 pixel**
`readRenderTargetPixels` call. There is no rect readback path, no
scissor path, no refine UI. The 5,000-particle cap (vs the 16,384
texture / particle budget at `field-particle-state-texture.ts:47`) is
defensible at ~30%, but only after the bulk readback path is built.

**Correction (applies to slice E framing).**
Slice E builds the bulk readback path from scratch:

- New picker entry point `pickRectAsync(bbox)` — sibling to existing
  `pickSync` / `pickAsync`, NOT a modification of them.
- Uses `renderer.readRenderTargetPixelsAsync()` where available;
  WebGL2 sync `readRenderTargetPixels` fallback.
- Decode RGBA → indices → `Set` → cap at 5,000 with a "selection too
  large; refine your rectangle" UI past that threshold.
- The cap is a parameter of the new path, not of the existing 1×1
  picker.

### [LOW] PROBE-2 — Picker clamp parity is base-size only

**Finding.** `field-picking-material.ts:55` clamps picker `gl_PointSize`
to `[2, 64]`. `field-shaders.ts:115` display path has no explicit clamp.
Display **also** has selection/focus size boosts at `field-shaders.ts:170`
that the picker material does not have.

**Correction (applies to slice A1 wording).**
The plan says "make the picker shader match display point size
exactly." That is true only for the **base** point size. Display-only
selection / focus / spotlight boosts intentionally stay display-only —
the picker should pick the visible **base** sprite, not an inflated
spotlight halo. Drop the picker clamp; do not propagate display-only
boosts into the picker.

### [LOW] PROBE-5 — Slice C G-lane ordering is safe

**Finding confirmed by Codex.** `use-orb-click.ts:36` →
`use-resolve-and-select-node.ts:28` only commits `selectNode(node)`.
`use-orb-scope-resolver.ts:86` writes only the R lane from
`currentPointScopeSql`, with no `selected_point_indices` read. G lane
is reserved in `field-particle-state-texture.ts:24` and unused. Slice C
spotlight writing to `selectedNode` before slice 5b is safe.

**Constraint kept.** Slice C's G-lane resolver must NOT reach into the
scope resolver's R-lane inputs or read `selected_point_indices`. G lane
reads from `useGraphStore.selectedNode` only. This is a hard wall in
the slice C implementation contract.

### [LOW] OTHER-2 — A0 pointer/wheel/touch semantics must be explicit

**Finding.** `OrbClickCaptureLayer.tsx:34` only sets `userSelect`
styling and pointer-up/down handlers. `FieldCanvas.tsx:76` sets
`touchAction: "pan-y"` on a `pointer-events-none` container — that
does not transfer to the new surface.

**Correction (applies to slice A0).**
The new `OrbInteractionSurface` explicitly sets:

- `touchAction: "none"` — drei `<CameraControls>` library expects to
  own touch gestures (pinch / pan / two-finger). `pan-y` would let the
  browser steal vertical pinches.
- `userSelect: "none"`, `WebkitUserSelect: "none"` — preserve current
  no-select behavior.
- A native listener registration slot for future wheel ownership. A0
  does **not** install a wheel handler yet; A1's camera-control binding
  owns wheel with explicit non-passive listener semantics if the library
  binding does not already do so. Do not use React synthetic wheel events
  for camera ownership.
- `onContextMenu={(e) => e.preventDefault()}` — right-drag is camera-
  controls' truck/pan; we don't want the context menu.

These are documented in the slice A0 acceptance criteria, not left for
the camera library to discover.

## A0 ref topology — explicit shape

```
DashboardClientShell
├── OrbInteractionContext.Provider value={{ surfaceElement, registerSurface, ... }}
│   ├── FieldCanvas
│   │   └── FieldScene
│   │       └── (slice A1) <CameraControls
│   │             domElement={useOrbInteraction().surfaceElement}
│   │           />  ← consumes reactive element state
│   │
│   └── {children}
│       └── (orb mode)
│           OrbSurface
│           └── OrbInteractionSurface (registers element via callback ref)
│               └── (slice C/D/E) hover / chord / rect handlers
│                   attach to the same DOM element
```

**Provider responsibilities:**

- Owns `surfaceElement: HTMLDivElement | null`
- Exposes `registerSurface(node: HTMLDivElement | null)` for
  `OrbInteractionSurface` callback refs
- Tolerates element replacement: when 3D unmounts, ref goes null;
  consumers (camera-controls binding, hover hook, rect handler) treat
  null as "no surface, suspend bindings."
- Exposes `useOrbInteraction()` hook with a clear contract: returns
  the bridge or throws if no provider is mounted (mirrors
  `useFieldRuntime` from `field-runtime-context.tsx`).

**Slice A0 deliverables:**

- `apps/web/features/orb/interaction/orb-interaction-context.tsx`
  — new
- `apps/web/features/orb/interaction/OrbInteractionSurface.tsx`
  — new (replaces `OrbClickCaptureLayer.tsx` semantically)
- `apps/web/app/(dashboard)/DashboardClientShell.tsx` — wraps tree
  with provider
- `apps/web/features/orb/surface/OrbSurface.tsx` — replaces
  `OrbClickCaptureLayer` mount with `OrbInteractionSurface`
- `apps/web/features/orb/interaction/OrbClickCaptureLayer.tsx` —
  deleted, or reduced to a re-export shim if other consumers still
  reference it (audit during A0)

**Slice A0 explicitly does NOT yet:**

- Mount `<CameraControls>` (slice A1)
- Add wheel/drag/hover/rect handlers (those slices wire active
  behavior through the same surface). A0 may define the native listener
  registration shape, but it must not consume wheel or drag before A1.

A0 is the empty surface plus the context plus the explicit
touch/select/contextmenu CSS and listener-registration contract —
nothing else.

## A0.5 panel & chrome classification

Every panel / chrome piece classified before A0.5 work begins. This
table is the single source of truth for the extraction.

### Renderer-clean (mount in BOTH 2D and 3D via `<GraphPanelsLayer>`)

| Component | Current mount path | Notes |
|-----------|--------------------|-------|
| `DetailPanel` | `ShellPanels.tsx` | Already SSR-disabled in `OrbSurface.tsx:22`; deduplicate during extraction. |
| `WikiPanel` | `ShellPanels.tsx` | Same. |
| `InfoPanel` | `ShellPanels.tsx` | Same. |
| `RagResponsePanel` | `ShellPanels.tsx` | Same. |
| `PromptBox` | `DesktopShell.tsx:107` + `MobileShell.tsx:138` | **Critical:** not in `ShellPanels` today. Layer must absorb both desktop and mobile mount points. |
| `DataTable` | `ShellPanels.tsx` (gated by `tableOpen`) | Included in 3D parity only after the A0.5 audit confirms it reads DuckDB/query state, not live Cosmograph internals. If the audit finds a Cosmograph dependency, split that dependency behind the neutral backend before mounting in 3D. |
| `AboutPanel` | `ShellPanels.tsx` | Treat as renderer-clean unless the A0.5 audit proves otherwise. |
| `QueryPanel` | `ShellPanels.tsx` | Treat as renderer-clean because it receives `runReadOnlyQuery`; if the audit finds product no longer wants it exposed, hide it by store/config, not by renderer mode. |

### Cosmograph-bound (stay in 2D-only mount path until renderer-neutral replacement lands)

| Component | Replacement slice | Notes |
|-----------|-------------------|-------|
| `CanvasControls` | A1 (drei `<CameraControls>` is the 3D equivalent) | 3D button to fit/zoom is a separate chrome icon in OrbChromeBar, not a fake `CanvasControls`. |
| `ColorLegends` | F (orb-stats-backed `<ColorLegend>`) | Same legend visual; reads from orb paper bake stats instead of `cosmograph.points`. |
| `SizeLegend` | F | Same. |
| `TimelineBar` | G (renderer-neutral chrome writing to `timeline-slice`) | The brush widget itself stays Cosmograph-bound until G replaces it. |
| Native filter widgets | G | Filter chips / histogram / search bar replaced by renderer-neutral chrome that writes to dashboard/query state. |

### Orb-specific (mount only inside `OrbSurface` / `OrbChromeBar`)

| Component | Slice | Notes |
|-----------|-------|-------|
| `OrbInteractionSurface` | A0 | This plan's deliverable. |
| `OrbChromeBar` | A0.5 | Reuses `graphControlBtnStyles`, `chromePillSurfaceStyle`, `graph-icon-btn` from existing ChromeBar styling. Does NOT clone Cosmograph data bindings. |
| `MotionControlPanel` | B | Pause/play + rotation / particle-speed controls. |
| `OrbPhysicsConfigPanel` | B0/B | 3D-only physics feel controls: rotation speed, particle speed, entropy/randomness, formation preset. Lives in 3D chrome, not Cosmograph widgets. |
| Hover ring / spotlight visual | C | Shader uniforms + sidecar G lane. |
| Rectangle select overlay | E | Drag rect drawn over `OrbInteractionSurface`. |

### A0.5 implementation rule

**Never break 2D mounts mid-extraction.** Steps in order:

1. Create `<GraphPanelsLayer>` as a parallel structure that mirrors the
   current 2D mounts.
2. Switch 2D shell components to delegate to `<GraphPanelsLayer>` for
   the renderer-clean subset; keep Cosmograph-bound widgets unchanged.
3. Mount `<GraphPanelsLayer>` inside `OrbSurface` for the 3D path.
4. Verify both 2D and 3D before merge.

Each numbered step is a separate commit if it makes sense; if a step
breaks 2D, halt and revert before the next step.

## Slice E selection commit consolidation

Single canonical entry point:
`apps/web/features/graph/lib/commit-explicit-selection.ts` (new).

```ts
export interface ExplicitSelectionCommit {
  source: SelectionSourceId;     // 2D-cosmograph, orb-rect, orb-multi, ...
  pointIndices: number[];        // canonical, deduped, ordered
}

export function commitExplicitSelection(
  args: ExplicitSelectionCommit,
): Promise<void>;
```

**Owns:**

- `setSelectedPointIndices(args.pointIndices)`
- `setSelectedPointCount(args.pointIndices.length)`
- `setActiveSelectionSourceId(args.source)`
- `setCurrentPointScopeSql(...)` using the existing selected-point
  baseline predicate for non-empty explicit selections; clear it for
  empty explicit selections. Do not generate long `index IN (...)`
  literal SQL from the selected indices.
- node-state clears (clear `selectedNode` if previous source was
  inspection-side and this is an explicit-set commit, per slice 5b's
  classification rules)
- rAF deferral / batching

**Replaces:**

- `apps/web/features/graph/lib/graph-selection-state.ts` `commitSelectionState`
- `apps/web/features/graph/cosmograph/hooks/use-points-filtered.ts:118-143`
  `persistSelectionIntent`

**Migration order:**

1. **Slice 5b** — write the new helper, migrate the 2D `use-points-filtered`
   call site to it, delete `persistSelectionIntent`. Migrate
   `commitSelectionState` callers to the new helper, delete the old
   helper. 2D regression tests verify identical behavior.
2. **Slice D** — add the chord-aware multi-select dispatch through
   the helper.
3. **Slice E** — add the rect-select dispatch through the helper.
   Verify 2D and 3D both call only `commitExplicitSelection`.

## Slice sequence (after corrections)

The slice list preserves the prior foundation gates and adds B0 so
"physics feel" configuration is designed before implementation. This
keeps the controls data-meaningful instead of cosmetic.

1. **A0** — Single interaction-surface DOM owner. Provider in
   `DashboardClientShell`. New `OrbInteractionSurface` with explicit
   `touchAction: none`, `userSelect: none`, contextmenu prevention,
   and a native listener registration contract for later wheel/drag
   owners. **No CameraControls mount or active wheel/drag behavior yet.**
2. **A0.5** — `<GraphPanelsLayer>` extraction (3 mount paths) +
   `OrbChromeBar`. Panel/chrome classification table is the
   contract. Hard rule: dead buttons hidden or visibly disabled,
   never no-op.
3. **A1** — drei `<CameraControls>` mounted in `FieldScene`, gated on
   `fieldMode === "orb"`, `domElement` from
   `useOrbInteraction().surfaceElement`. Picker shader matches
   display **base** point size only (selection/focus boosts stay
   display-only). Camera persistence via `toJSON`/`fromJSON` in new
   `field-camera-store`.
4. **A2** — Particle-state texture lane API. `LANE_DEFAULTS = {R:255,
   G:0, B:0, A:0}`. Coalesce `use-orb-scope-resolver` DuckDB queries
   via rAF + 50ms trailing debounce; no in-flight dispatch.
5. **B0** — 3D physics configuration exploration. Produce the control
   taxonomy and implementation map for rotation speed, particle speed,
   entropy/randomness, and formation presets. Hard rule: every control
   must change a specific existing controller/shader value or a named
   future force term. "Gravity" mode is not a vibe toggle; it must be
   tied to focus/citation/cluster data or stay deferred.
6. **B** — MVP motion / physics controls. `motionSpeedMultiplier`,
   `rotationSpeedMultiplier`, particle-motion speed, and the first
   substrate-safe entropy/randomness control. `<MotionControlPanel>` /
   `<OrbPhysicsConfigPanel>` mount through 3D chrome; GSAP
   `timeline.timeScale` stays in step. Globe / gravity presets ship
   only if B0 proves their data + shader/controller mapping is clean.
7. **5b** — 2D click conflation fix + selection commit consolidation
   (writes `commitExplicitSelection` and migrates 2D path).
   **Hard prerequisite of D and E.**
8. **C** — Hover ring + single-click spotlight (G lane MVP). G-lane
   resolver reads `selectedNode` only; never `selected_point_indices`.
   Neighbor highlight k=8 behind feature flag, off by default.
9. **D** — Multi-select + keyboard chords. Dispatches through
   `commitExplicitSelection`.
10. **E** — Persistent multi-select + rectangle select. New
   `pickRectAsync` bulk readback path; cap at 5,000 with refine UI;
   dispatches through `commitExplicitSelection`.
11. **F** — B lane (search pulse) + neighbor highlight on by default
    + `<ColorLegend>` / `<SizeLegend>` from orb stats + snapshot
    export + label-on-hover billboard.
12. **G0** — Renderer-neutral configuration parity. Config panel
    writes to dashboard/shell store; both renderers read same state.
    Size remap via `aClickPack.w` overrides; color remap via NEW
    `uParticleColorTex` sidecar (RGBA8, mirrors particle-state lane
    pattern). No new vertex attribute. 3D-only physics controls remain
    under B/B0 unless a specific setting has a true 2D equivalent.
13. **G** — Renderer-neutral filter / timeline chrome. Writes
    filter/timeline state and `setCurrentPointScopeSql`. It does **not**
    write `selected_point_indices` unless the user explicitly commits a
    filter result as a selection set through `commitExplicitSelection`.
    R-lane sidecar consumes scope changes with no extra wiring.
14. **H** (deferred) — 3D link rendering, own design slice.

### B0 physics configuration taxonomy

B0 is a short design/recon slice before B implementation. It decides
which controls ship now, which are deferred, and exactly what code each
control touches.

Candidate controls:

- `rotationSpeedMultiplier` — scales orb wrapper auto-rotation only.
  User camera movement still pauses rotation through the A1 wake/rest
  gate.
- `particleMotionSpeed` — scales shader time / point drift speed
  without changing query state, selection state, or point identity.
- `ambientEntropy` / `randomness` — controls amplitude/frequency/noise
  strength, not random re-seeding. High entropy reads as exploratory
  cloud; low entropy reads as calm atlas.
- `formationPreset` — named presets such as `natural`, `globe`,
  `clusterWells`, `focusGravity`. A preset is allowed only if it maps
  to a concrete position initializer, shader uniform set, or force-term
  plan. `globe` must define whether papers are projected to a sphere
  by stable hash, cluster band, or semantic coordinate. `gravity` must
  define the attracting body and data signal (focused paper, citation
  neighbors, cluster centroid, entity focus).

Rules:

- Do not call a mode "gravity" unless data changes the motion. A
  center-pull with no citation/semantic/selection signal is just
  cohesion and should be named that.
- Reduced-motion collapses dynamic physics controls to static or
  color/opacity equivalents; low-power disables high-frequency drift.
- Controls must be serializable in the graph store/shell store that
  already owns the relevant behavior. No parallel config store.
- If the setting has no 2D equivalent, it belongs to 3D chrome and is
  not forced into renderer-neutral configuration parity.

**Labels** are explicitly NOT part of 3D parity. Hover ring +
spotlight + panels + camera focus replace persistent labels.
"Labels" button hidden in 3D chrome.

## Process contract (unchanged from prior plan, restated for clarity)

1. Slice 5b lands before D and E (multi-select needs the
   consolidated commit helper and clean 2D click semantics).
2. `codex:rescue` verify-only after every slice. MEDIUM/HIGH findings
   are blocking per `feedback_codex_review_for_foundation_plans`.
3. Real-device smoke for slices A1, C, D, E (interaction-touching).
4. `/clean` discipline every slice — native primitives, extend
   existing adapters, no parallel runtimes, no premature abstraction.
5. No fake `CosmographProvider` (established rule from slices 5–7).
6. Memory hygiene — only update `feedback_*` files when a slice
   surfaces a genuinely new judgment-call rule.

## Open research items (carried forward)

These are research/spike items, NOT slice work. Each runs before the
slice it unblocks.

1. **Pointer-events ownership smoke** (during A0). Verify the new
   surface receives every event class drei `<CameraControls>` expects
   (wheel, pointerdown/move/up, touchstart/move/end, pointercancel,
   contextmenu suppression). Confirm panels (z>5) still receive their
   own pointer events.
2. **Mobile profile bench** (before A1 merges). `phone` skill workflow
   — iPhone XS / iPad / mid-tier Android. 60fps with sampler reads
   + drei CameraControls.
3. **Picker shader parity** (during A1). Drop the 64px clamp; bench
   picker accuracy at 1×, 5×, 10× zoom.
4. **Bulk pick readback** (before E commits). Confirm
   `renderer.readRenderTargetPixelsAsync` exposure; bench 5k vs 20k
   bbox reads.
5. **Scope query coalescing model** (during A2). Bench timeline-scrub
   workload (10–30 scope changes/sec); confirm DuckDB
   `runReadOnlyQuery` is safely cancellable.
6. **3D physics configuration taxonomy** (before B). Probe the
   existing controller/shader knobs (`rotationVelocity`,
   `uTimeFactor`, `uSpeed`, `uAmplitude`, `uFrequency`, `uDepth`,
   point-source initializers, sidecar lanes) and map each proposed
   control to a real implementation surface. Decide which presets are
   MVP (`natural`, speed/entropy) and which require later data physics
   (`globe`, `clusterWells`, `focusGravity`, citation gravity). Output
   must include reduced-motion / low-power behavior for each control.
7. **2D ↔ 3D camera-state preservation across renderer toggle**
   (during A1). Cosmograph zoom (D3 transform) ≠ perspective dolly
   distance. Decide: best-effort centroid+zoom mapping, or remember
   per-renderer separately.
8. **`texSubImage2D` wrapper for sidecar** (during F when B/A lanes
   go live). Three.js DataTexture realloc is wasteful at ~10
   updates/sec.
9. **WebGPU/TSL parallel codepath spike** (post-G). Behind a feature
   flag.

## Verification per slice

```bash
npm run lint
npm run typecheck
npm test -- --runInBand
cd packages/graph && npm test -- --runInBand
npm run build
```

Plus slice-specific manual smoke (Chrome DevTools MCP, real-device
where required).

## Codex re-review trigger

Before slice A0 implementation begins, this amended plan is handed
back to `codex:rescue` for a second verify-only pass. Approval gate is
**no remaining HIGH findings**; MEDIUM findings are course-corrected
during their respective slices.

After slice A0 lands, the post-slice `codex:rescue` verify-only pass
re-checks the topology in code (provider position, ref tolerance to
element replacement, touch/select/contextmenu CSS, and native listener
registration contract).
