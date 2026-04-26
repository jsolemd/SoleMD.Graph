# 09 — Search and RAG excitation (the headliner)

## Workflow

The user-facing flow that makes the orb feel like a research
instrument:

1. User types in the search bar (lifted from `/map` and
   wiki shells; lives in the persistent left panel).
2. Search query → existing retrieval/RAG endpoints (already fast;
   not SPECTER2-shipped — see Codex round 2 R2-8).
3. Result = `[{paperId, score, kind?}]` where `kind` ∈
   `{answer_evidence, answer_support, answer_refute}` for RAG;
   undefined for plain search.
4. JS-side `paperId → particleIdx` translation via the resident
   `paperToParticle` map.
5. **Dispatch effects per result kind:**
   - Plain search or `answer_evidence` / `answer_support` →
     `evidencePulse(set, kind)` with score-stratified bands
     (spatial-mode-class effect; see
     [10-force-vocabulary.md](10-force-vocabulary.md)).
   - `answer_refute` → `evidenceMark(set, 'refute')` (overlay-class
     effect; color/halo/badge only, no position change).
6. Camera lerps target to the result formation via drei `<Bounds>`
   `useBounds().refresh(resultSetBox).fit()`.
7. Alpha reheats; resident set converges into core / belt / haze;
   excitation glow decays via `exp(-(now - decayStart) / τ)` with
   τ ≈ 3–5 s.

## Why this is the headliner

Per the user's framing in
`docs/future/orb-3d-cosmograph-port-handoff.md`:

> When the user issues a search (or RAG retrieval lands hits), the
> answer particles **coalesce and form** — like a galaxy where
> gravity binds semantically related papers.

Promoted to M3a/M3b instead of canonical's M3c per
[decisions/2026-04-24-search-as-headliner.md](decisions/2026-04-24-search-as-headliner.md).

## Effect dispatch

```
async function onSearchResults(results: SearchResult[]) {
  const positionalSet = results
    .filter(r => r.kind !== 'answer_refute')
    .map(r => r.paperId);
  const refuteSet = results
    .filter(r => r.kind === 'answer_refute')
    .map(r => r.paperId);

  // Spatial-mode effect (only one active at a time)
  if (positionalSet.length > 0) {
    forceKernel.dispatch('evidencePulse', {
      paperIds: positionalSet,
      scoreBands: makeScoreBands(results),
      intensity: 1.0,
      decayStart: now(),
      tau: 4.0,
    });
  }

  // Overlay effect (composes with active spatial mode)
  if (refuteSet.length > 0) {
    overlayDispatch('evidenceMark', {
      paperIds: refuteSet,
      kind: 'refute',
      decayStart: now(),
    });
  }

  // Camera centers on the union formation
  const centroidWorld = computeCentroid([...positionalSet, ...refuteSet]);
  bounds.refresh(centroidWorld, RESULT_SET_FIT_RADIUS).fit();

  // Reheat alpha so the swarm visibly reshapes
  forceKernel.reheat(0.3);
}
```

## Three-layer-rule compliance

`evidencePulse` is **spatial-mode-class** — joins the exclusivity
set `{focus, clusterFocus, entityFocus, evidencePulse}`. If the
user has `clusterFocus` active when search results arrive, the
search dispatch *replaces* clusterFocus per generation-based
retarget (canonical correction "Rapid retarget"). The 150 ms
ramp-in masks the snap. Internally, it can contain multiple scheduled
stages under one generation (top confirmations first, wider evidence
belt second, low-score haze last).

`evidenceMark` is **overlay-class** — composes with whichever
spatial mode is active. If the user has `focus(paperId)` and a
RAG answer comes in with refuters, the refuters get marked in
color/badge but stay in their `focus`-imposed positions until
`focus` clears. Topology stays legible; polarity stays visible.

This is the load-bearing reason `evidenceSignalOverlay` was split
into two effects (Codex round 2 R2-7).

## Excitation texture

`excitationTex` (RG16F) — per-particle channel:
- R: intensity (0..1)
- G: decayStart timestamp (seconds since session)

Render shader reads:
```glsl
vec2 ex = texture2D(excitationTex, uv).rg;
float age = uTime - ex.g;
float pulse = ex.r * exp(-age / uTau);
vColor = mix(vColor, glowColor, pulse);
vSize *= 1.0 + pulse * 0.6;
```

Force kernel reads:
```
spatial_mode_force(i, mode='evidencePulse', payload) =
  pull_to_score_band_target * smooth_intensity(excitationTex[i], age)
```

Decay is uniform (`uTau`) for simplicity; can become per-result if
needed.

## Camera ergonomics

drei `<Bounds>` lerp duration matches alpha reheat: ~600 ms total.
The user sees:
- t=0: prompt/search commit; result lands.
- t=0–150 ms: top confirming/supporting hits form the core.
- t=150–450 ms: secondary hits settle into a wider belt; lower-score
  hits remain a haze.
- t=150–600 ms: camera glides to the result formation unless a newer
  generation supersedes it.
- t=600–4000 ms: excitation glow decays; particles settle around
  their score-band equilibrium.
- t=4000+ ms: alpha drops to rest after the final scheduled stage.

## Refute display (per canonical correction 20)

Refute display is **always color/halo/badge**. No position drift
ever (avoids the bad UX of refuters being pushed away from their
relevant cluster). When no other spatial mode is active and *only*
a refute set is dispatched, the orb shows refuters via overlay
without summoning any spatial-mode force — the search just does
not coalesce. Plain search dispatched alongside refuters resolves
this: positional set drives `evidencePulse`, refuters get their
mark.

## Owns / doesn't own

Owns: search-result workflow, dispatch decision tree, camera lerp,
excitation texture shape, decay semantics, refute UX rule.

Doesn't own:
- The force-effect mechanics → [10-force-vocabulary.md](10-force-vocabulary.md).
- The composition rule → [11-three-layer-composition.md](11-three-layer-composition.md).
- The retrieval/RAG endpoint → existing
  `apps/web/features/graph/components/explore/info/use-search-results.ts`,
  `apps/web/features/graph/components/panels/prompt/rag-graph-sync.ts`.
- The search bar UI → existing wiki/graph search components, ported
  to the persistent panel.

## Prerequisites

[03-physics-model.md](03-physics-model.md), [04-renderer.md](04-renderer.md),
[10-force-vocabulary.md](10-force-vocabulary.md), [11-three-layer-composition.md](11-three-layer-composition.md).

## Consumers

[milestones/M3a-search-and-focus.md](milestones/M3a-search-and-focus.md),
[milestones/M3b-rag-excitation.md](milestones/M3b-rag-excitation.md).

## Invalidation

- RAG endpoint contract changes (returns no `kind`) →
  `evidenceMark` falls back to undifferentiated highlight.
- `evidencePulse` redefined as overlay-only → no coalescence; the
  headliner UX disappears.
- SPECTER2 shards become live-search → fuse with this workflow's
  retrieval step (currently scoped to backend retrieval).
