# M3b — RAG excitation (the headliner, part 2)

## Scope

`evidencePulse` (Layer 2 spatial-mode) + `evidenceMark` (Layer 3
overlay) ship. RAG-result arrival composes with `focus` from M3a.

## Acceptance

- `evidencePulse(set, kind)` force effect:
  - Joins Layer 2 exclusivity with `focus / clusterFocus / entityFocus`.
  - Staged inward impulse for `answer_evidence` / `answer_support`:
    confirmations form core first; weaker evidence forms wider bands.
  - Per-particle intensity + decayStart in `excitationTex`
    (RG16F).
  - Per-particle stage/kind/score written through `effectStageTex`.
  - Decays via `exp(-(now - decayStart) / τ)`, τ = 4 s (uniform).
- `evidenceMark(set, kind)` overlay effect:
  - Layer 3 — color/halo/badge, no position change.
  - Used for `answer_refute` always.
  - Used for `answer_evidence` / `answer_support` when a different
    spatial mode is owning position.
- Subscribes to `rag-slice` for RAG-result arrival.
- Camera lerps to combined centroid via drei `<Bounds>`.
  Intermediate camera moves are suppressed if a newer generation lands
  before the 600 ms formation window finishes.
- Composes with `focus` per the three-layer rule
  ([11-three-layer-composition.md](../11-three-layer-composition.md)).

## Files

- `apps/web/features/graph/orb/sim/force-effects.ts` (extend) —
  `evidencePulse`.
- `apps/web/features/graph/orb/sim/overlay-effects.ts` (new) —
  `evidenceMark`.
- `apps/web/features/graph/orb/sim/effect-bindings.ts` (extend) —
  RAG subscription + dispatch.
- `apps/web/features/graph/orb/sim/overlay-state.ts` (new) —
  per-effect state tables.
- `apps/web/features/graph/orb/render/shaders.ts` (extend) — read
  `excitationTex` for glow + size pulse.

## Verify

- RAG answer with mixed kinds:
  - Confirmation set → particles pulse inward into the core.
  - Lower-score evidence → wider belt / haze.
  - Refute set → color/halo/badge appears (color preserves
    answer-refute styling); positions unchanged.
- RAG arrival while `focus` active:
  - `evidencePulse` retargets via generation counter.
  - Refuters within `focus` 1-hop stay at focus position with
    refute mark.
- Reduced-motion: no positional motion; `evidenceMark` still
  decorates; `evidencePulse` no-ops to ZERO motion + visual fade
  glow only.
- Sim settles after τ + α decay; tick counter halts.
- Composition: focus(A) + RAG(refute={A}) → A stays at focus
  position, marked refute; doesn't move.

## Blocking-on / blocks

- Blocking on: M3a.
- Blocks: M3c (extended vocabulary builds on the same overlay /
  spatial-mode dispatch infrastructure).
