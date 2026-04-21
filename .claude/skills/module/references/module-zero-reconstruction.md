# Module Zero Reconstruction

Use this file when the goal is to recreate the current landing page from
scratch in the same architectural manner, not merely to copy its copy or visual
tone.

This is the compact cold-start recipe. The full authored content contract still
lives in `docs/map/modules/landing.md`.

## Canonical truth

The current canonical truth is:

- the live landing implementation under
  `apps/web/features/field/surfaces/FieldLandingPage/`
- the checked-in chapter contract in `docs/map/modules/landing.md`
- the shared stage/runtime files under `apps/web/features/field/`
- the panel/token system and shell standards demonstrated in `/surface-lab`

Do not treat old Maze parity notes or older landing audits as a higher
authority than the current code and `docs/map/modules/landing.md`.

## The pieces

### 1. Authored chapter and stage contract

These files declare the landing’s structure and stage ownership:

- `docs/map/modules/landing.md`
- `apps/web/features/field/surfaces/FieldLandingPage/field-landing-content.ts`

Important facts:

- current sections are:
  - `section-hero`
  - `section-surface-rail`
  - `section-story-1`
  - `section-story-2`
  - `section-story-3`
  - `section-sequence`
  - `section-mobile-carry`
  - `section-cta`
- `blob` persists through the full landing
- `stream` overlaps the middle run:
  - `section-story-2`
  - `section-story-3`
  - `section-sequence`
- `section-mobile-carry`
- landing CTA resolves back to `blob`
- `objectFormation` is not an active landing owner

### 2. Route and surface shell

- `apps/web/app/page.tsx`
- `apps/web/app/field-lab/page.tsx`
- `apps/web/features/field/routes/FieldLandingRoute.tsx`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`

Important facts:

- both `/` and `/field-lab` mount the same landing route
- `FieldLandingRoute` dynamically imports the landing page with
  `ssr: false`
- the page shell renders the authored DOM sections and mounts one fixed stage

### 3. Fixed stage runtime

- `apps/web/features/field/renderer/FieldCanvas.tsx`
- `apps/web/features/field/renderer/FieldScene.tsx`
- `apps/web/features/field/stage/FixedStageManager.tsx`
- `apps/web/features/field/controller/FieldController.ts`
- `apps/web/features/field/controller/BlobController.ts`
- `apps/web/features/field/controller/StreamController.ts`
- `apps/web/features/field/controller/ObjectFormationController.ts`
- `apps/web/lib/motion3d.ts`

Important facts:

- one fixed stage, one canvas, one mounted runtime per visible landing surface
- R3F/Three own renderer/camera/scene lifecycle
- controllers own scene-local mutation during `tick()`
- `motion3d.ts` owns frame-rate-independent lerp/decay constants
- readiness is gated through `FixedStageManager` plus `FieldController.whenReady()`

### 4. Shared scroll intake and chapter state

- `apps/web/features/field/scroll/field-scroll-state.ts`
- `apps/web/features/field/scroll/field-scroll-driver.ts`
- `apps/web/features/field/scroll/field-chapter-timeline.ts`
- `apps/web/features/field/scroll/chapters/landing-blob-chapter.ts`
- `apps/web/features/field/scroll/chapters/landing-stream-chapter.ts`

Important facts:

- landing scroll progress is centralized once into shared scene state
- chapter evaluators convert progress into semantic targets
- controllers read those targets in `tick()`
- do not reintroduce controller-local landing ScrollTriggers as the source of
  truth

### 5. DOM-only chapter choreography

- `apps/web/features/field/scroll/chapter-adapters/registry.ts`
- `apps/web/features/field/scroll/chapter-adapters/useChapterAdapter.ts`
- `apps/web/features/field/scroll/chapter-adapters/*.ts`

Important facts:

- chapter adapters are the DOM/SVG choreography layer only
- GSAP/ScrollTrigger is valid here
- reduced-motion handling belongs here for DOM-only reveals
- chapter adapters do not own stage/controller truth

### 6. DOM overlays and shell affordances

- `apps/web/features/field/surfaces/FieldLandingPage/FieldConnectionOverlay.tsx`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldHotspotPool.tsx`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldScrollCue.tsx`
- `apps/web/features/field/surfaces/FieldLandingPage/FieldGraphWarmupAction.tsx`
- `apps/web/features/animations/text-reveal/TextReveal.tsx`

Important facts:

- overlays should consume the same chapter progress as the stage
- Framer Motion is for DOM-only affordances:
  - `TextReveal`
  - hero/CTA copy reveals
  - button reveals
  - scroll cue
  - warmup chrome
- Framer Motion does not drive the Three.js field state

### 7. Styling and shell system

- `apps/web/app/styles/tokens.css`
- `apps/web/app/styles/base.css`
- `apps/web/app/styles/graph-ui.css`
- `apps/web/features/graph/components/panels/PanelShell/`
- `apps/web/app/surface-lab/page.tsx`
- `apps/web/features/graph/components/panels/PanelShell/surface-lab/`

Important facts:

- `/surface-lab` is the canonical self-check page for tokens, panel surfaces,
  prompt tones, density, and shell primitives
- it is not the stage runtime or motion authority
- use it to validate that shell styling matches the live token system

## Non-negotiable rules

1. Use one fixed stage and one canvas for the landing surface.
2. Keep chapter ownership manifest-driven.
3. Centralize landing scroll progress in shared scene state.
4. Let controllers read chapter targets in `tick()`; do not split field truth
   across Framer and GSAP callbacks.
5. Use GSAP for:
   - shared scroll intake
   - chapter-local DOM adapters
6. Use Framer Motion for:
   - DOM text/button reveals
   - small shell affordances
   - components like `TextReveal`
7. Keep `blob` as the persistent substrate on landing.
8. Treat object formation or biologically specific end-state convergence as a
   future module pattern, not as a landing default.
9. Use `/surface-lab` to validate shell/style/tokens, not field choreography.

## Rebuild sequence

1. Recover the chapter brief through the module discovery interview.
2. Mirror the answers into `docs/map/modules/<module>.md`.
3. Author the section/manifest contract in surface data.
4. Mount one fixed landing surface and one `FieldCanvas`.
5. Centralize scroll progress in shared scene state.
6. Implement chapter evaluators for the active controllers.
7. Bind any DOM-only chapter adapters through `useChapterAdapter`.
8. Add overlays that read the same chapter progress.
9. Validate shell styling against `/surface-lab`.

If a proposed rebuild skips any of those steps, it is probably rebuilding the
look while missing the architecture.
