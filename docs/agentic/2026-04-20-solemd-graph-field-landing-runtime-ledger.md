# Field Landing Runtime Ledger

## Scope

- Align the landing field runtime with the module architecture review:
  real readiness gate, shared stage scroll state, blob-as-substrate through the
  landing, stream overlap in the middle chapters, and CTA bookend back to blob.
- Update the module-facing contract docs so future module pages can still use
  authored object-formation endings without confusing that with the landing.
- Verify the landed behavior in Chrome DevTools MCP.

## Current State / Runtime Contract

- `FixedStageManager` is now a real stage gate. It waits for point-source
  prewarm plus `FieldController.whenReady()`, and `whenReady()` now blocks on
  actual R3F attachment instead of resolving immediately.
- Landing stage timing is centralized in
  `apps/web/features/field/scroll/field-scroll-state.ts`.
  ScrollTrigger now writes shared chapter progress and aggregated controller
  visibility into `FieldSceneState`; landing controllers no longer own
  their own scroll timelines.
- Declarative target maps live in:
  - `scroll/chapters/landing-blob-chapter.ts`
  - `scroll/chapters/landing-stream-chapter.ts`
- `BlobController` and `StreamController` now consume chapter targets during
  `tick()` and smooth toward them with the existing motion decay helpers.
- Landing no longer mounts `pcb` as an active stage owner. `FieldScene` is now
  manifest-driven via `activeIds`, so landing only pays for `blob` and
  `stream`.
- CTA is now blob-owned and visually bookends the opening hero instead of
  switching to a separate terminal `pcb` surface.
- `pcb` remains a valid future module/controller family and remains documented
  as the template for non-landing convergence or object-formation surfaces.

## Ranked Themes And Findings

1. The highest-value architectural fix was removing controller-local scroll
   ownership from landing. The prior model mixed a shared shell ScrollTrigger
   layer with three controller-local timelines and a separate overlay
   `useScroll`; that made timing composition brittle and prevented controller
   overlap from scaling cleanly.
2. Readiness was previously nominal. `FieldScene` registered controllers before
   wrapper/model/material attachment and `FieldController.whenReady()` was a
   noop. The new gate closes that race.
3. Landing needed one substrate, not three disconnected stage owners. The blob
   is now continuous; stream overlaps during the explanatory corridor; CTA
   returns to blob.
4. Future shape-formation work belongs in module pages, not in the landing
   close. The docs now treat landing bookend and module convergence as separate
   contracts.

## Completed Batches

### 1. Shared scroll-state architecture

- Added `scroll/field-scroll-state.ts`.
- Added `scroll/field-chapter-timeline.ts`.
- Moved landing controller timing into declarative chapter files.
- Reworked `scroll/field-scroll-driver.ts` into a thin bridge from
  ScrollTrigger to shared scene state.

### 2. Stage/runtime cleanup

- Added attachment-backed readiness in `FieldController`.
- Updated `FieldScene` to register controllers only after live attachment.
- Added manifest-driven `activeIds` support so landing can stop mounting `pcb`.
- Reduced `BlobController.ts` from 881 lines to 557 lines by splitting hotspot
  runtime helpers into `controller/blob-hotspot-runtime.ts`.

### 3. Landing behavioral contract

- Re-authored `FIELD_SECTION_MANIFEST` so blob carries through the full landing
  and stream overlaps only in the graph/story-2/events/move-new corridor.
- Changed CTA content contract and stage ownership to blob.
- Switched `FieldConnectionOverlay` from its own Framer `useScroll`
  observer to shared Story 2 chapter progress.

### 4. Docs / skill updates

- Updated:
  - `.claude/skills/module/SKILL.md`
  - `.claude/skills/module/references/maze-build-spec.md`
  - `.claude/skills/module/references/object-formation-surface.md`
  - `.claude/skills/module/references/round-12-module-authoring.md`
  - `.claude/skills/module/references/stream-chapter-hybrid.md`
  - `docs/map/modules/landing.md`

## Commands / Verification

### Code verification

- `npm run typecheck --workspace @solemd/web`
  - passed
- `npm run test --workspace @solemd/web -- --runInBand apps/web/features/field/stage/__tests__/FixedStageManager.test.tsx apps/web/features/field/scroll/chapters/__tests__/landing-chapter-state.test.ts`
  - passed
- `npm run lint --workspace @solemd/web`
  - blocked by pre-existing unrelated repo issues:
    - `apps/web/features/field/asset/image-point-source.ts`
    - `apps/web/features/field/asset/model-point-source.ts`
    - warning in `apps/web/features/field/overlay/field-hotspot-lifecycle.ts`

### Browser verification

Environment:

- visible Chrome DevTools MCP session
- app served on `http://127.0.0.1:3000`

Checks performed:

- no console errors on landing load
- one `<canvas>` on the landing surface
- top-of-page screenshot confirms opening globe/blob hero
- Story 2 snapshot confirms the shared fixed stage remains active through the
  synthesis chapter
- CTA screenshot confirms the landing ends on a globe-like blob bookend with
  CTA text centered inside the same stage

## Research / Sources

Official references used for implementation direction:

- React `useEffectEvent`
  - https://react.dev/reference/react/useEffectEvent
- React Three Fiber loading/performance guidance
  - https://r3f.docs.pmnd.rs/tutorials/loading-textures
  - https://r3f.docs.pmnd.rs/advanced/scaling-performance
- GSAP ScrollTrigger / `gsap.matchMedia()`
  - https://gsap.com/docs/v3/Plugins/ScrollTrigger/
  - https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/

Inference from those sources:

- keep ScrollTrigger as the stage progress intake, but centralize ownership in
  one shared runtime instead of letting multiple controllers install their own
  timelines
- keep R3F mounted continuously and gate controller writes rather than tearing
  canvas state up and down
- prefer manifest-driven responsive ownership over DOM-scan or duplicated
  mobile/desktop stage code paths

## Blockers

- Full repo lint is not currently green due unrelated pre-existing errors in
  `image-point-source.ts` and `model-point-source.ts`. This pass did not widen
  scope into those files because the landing runtime does not depend on them
  yet.

## Newly Discovered Follow-On Work

- If landing connection rails need to become visually load-bearing again, the
  next pass should decide whether Story 2 should reactivate blob hotspots or
  whether the connection overlay should sample a different controller-owned
  frame surface. This was not treated as a blocker because the user explicitly
  deprioritized DOM overlay specifics.
- Async point-source loading still needs a true Suspense/resource path before
  URL-backed module silhouettes become active stage owners.
- If a future module adds a real stream shell, it should read the same chapter
  ids from shared scene state rather than reintroducing independent stage
  timing.

## Next Recommended Passes

1. Land the first non-landing object-formation module using the updated
   `object-formation-surface.md` contract.
2. Formalize async point-source manifest/loading before activating image/model
   backed stage owners.
3. Clean the unrelated field lint debt so full workspace lint can serve
   as a reliable gate again.
