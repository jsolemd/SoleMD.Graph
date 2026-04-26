# M6 — Landing morph

## Scope

The landing hero's blob morphs into the live orb at the end of
scroll. Same canvas, same scene, same camera, same rotation phase,
same running physics simulation. No route boundary. Per canonical
M6 + companion plan
`docs/future/graph-landing-stealth-handoff.md`.

## Status: gated

Depends on:
- Companion plan's M2 (extract `<GraphShell>`) shipped.
- This docset's M5b shipped (orb is the default; landing morph
  ends in the default mode without a toggle).
- Field shader extension (`uGlobeMorph`, `aGlobePosition`,
  `aColor`).

## Acceptance

- Last text chapter of landing scrolls into `uGlobeMorph: 0 → 1`
  over ~2s with `scrub: 1`.
- Color lerps from rainbow stops to `aColor = hex_color`.
- Rotation continues throughout.
- At `uGlobeMorph ≈ 0.95`, `<GraphOrb>` becomes interactive
  underneath; ambient field opacity 1 → 0; UI chrome fades in.
- If bundle hasn't loaded by scroll-end, morph stalls at 0.95
  with idle rotation; no spinner; no pop.
- "End" of landing = live, explorable orb. User can drag /
  click / hover immediately. 2D toggle is one click away.

## Files

- `apps/web/features/field/renderer/field-shaders.ts` (extend
  with `uGlobeMorph`, `aGlobePosition`).
- `apps/web/features/field/asset/field-attribute-baker.ts:144` —
  bake real-paper positions.
- `apps/web/features/field/controller/BlobController.ts:480-627`
  — extend timeline with morph chapter.
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx`
  — start bundle preload on mount; mount `<GraphOrb>` at handoff
  moment; orchestrate crossfade.

## Verify

- Desktop + mobile full scroll with and without network throttling.
- Confirm morph stalls cleanly when bundle is slow.
- UI chrome appears without layout thrash.
- Live performance trace: sustained 60 fps desktop; no jank at
  crossfade.
- Bundle warmed via `useGraphWarmup` at landing mount, never
  blocks.

## Blocking-on / blocks

- Blocking on: M5b, companion plan M2, intentionally-interactive
  landing-stage redesign (canonical correction 8).
- Blocks: nothing in the orb track; this is a polish/marketing
  milestone.
