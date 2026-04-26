# 11 — Three-layer composition (canonical, preserved)

## The rule

Every force effect is in exactly one of three layers. Layers
interact deterministically.

### Layer 1 — Scope is the hard population gate

`focus`, `clusterFocus`, `entityFocus`, `evidencePulse` operate
**only** on particles inside the current scope. A click on a paper
never pulls in out-of-scope neighbors. An entity focus never
magnetizes out-of-scope entity-sharing papers. If the user wants
to see beyond scope, they must explicitly "Expand scope to
related" via a panel action — that's a `scope` change, not a
smuggled-in neighbor pull.

### Layer 2 — Spatial mode is exclusive

Exactly one of `{focus, clusterFocus, entityFocus, evidencePulse}`
is active at a time. Activating any dismisses the others (with a
~150 ms generation-based ramp; see
[10-force-vocabulary.md](10-force-vocabulary.md)).

That mode owns position changes inside the scope.

### Layer 3 — Overlay is styling-only inside the active spatial mode

`evidenceMark` never applies position impulses. If a paper is both a
`focus` neighbor (being pulled inward) AND an `evidenceMark('refute')`
target, it stays in the focus position dictated by Layer 2. Refute is
communicated by color/halo/badge, not by displacement.

When `focus` clears (paper deselected), `evidenceMark` is also
cleared — overlay marks are bound to their dispatching event,
not persistent.

## Why this works

- **Layer 1 closes the UX ambiguity** where `focus + scope` could
  silently redefine "related." Scope is always honored.
- **Layer 2 prevents incoherent layouts** — you never have two
  competing positional pulls.
- **Layer 3 lets refute marks coexist with bloom** — topology stays
  legible, polarity stays visible.

## How `evidencePulse` (Layer 2) and `evidenceMark` (Layer 3) compose

Per [09-search-and-rag-excitation.md](09-search-and-rag-excitation.md):

- Search returns mixed kinds → positional set drives
  `evidencePulse` (Layer 2); refuters get `evidenceMark` (Layer
  3).
- Search returns refuters only → no Layer 2 effect; refuters
  decorate via Layer 3 wherever they currently sit.
- Search arrives while `clusterFocus` is active → Layer 2 retarget
  (search wins; cluster dismisses); refuters Layer 3 over the new
  pulse.

## Per-effect layer assignment

```
anchor:               always-on background (not in any layer)
scope:                Layer 1 (population gate)
focus:                Layer 2 (spatial mode)
clusterFocus:         Layer 2
entityFocus:          Layer 2
evidencePulse:        Layer 2
evidenceMark:         Layer 3 (overlay)
tug:                  direct manipulation (overrides Layer 2 transiently)
pulseImpulse:         Layer 2 transient (one-shot)
```

`tug` is interactively overlaid on top of any Layer 2 mode — the user
is grabbing a node and the local force on that node is cursor-driven;
release returns control to Layer 2.

Staged effects do not violate Layer 2 exclusivity. A RAG narrative can
schedule support, neutral, and refute stages under one active
`evidencePulse` generation; only one spatial owner still controls
position at any moment. Layer 3 marks can persist through the staged
motion but never own position.

## Implementation sketch

```
function tickKernel() {
  // Layer 1
  applyScopeForce(filterMask);

  // Layer 2 (exactly one branch)
  switch (spatialMode) {
    case 'idle':       applyAnchorOnly();                                  break;
    case 'focus':      applyFocusForce(focusPaperId, focusGen);            break;
    case 'clusterFocus': applyClusterFocusForce(clusterId);                break;
    case 'entityFocus': applyEntityFocusForce(entityId);                   break;
    case 'evidencePulse': applyEvidencePulseForce(centroid, intensityTex); break;
  }

  // Layer 3 (composes additively, render-side only)
  // (no force application; render shader reads excitationTex marks)

  // Direct manipulation
  if (tugState.active) applyTug(tugState);
  if (pulseQueue.length) applyAndClearPulses(pulseQueue);
}
```

## Owns / doesn't own

Owns: the layer rule; layer-assignment table; how `evidencePulse`
and `evidenceMark` compose; tick-loop branching.

Doesn't own:
- Effect mechanics → [10-force-vocabulary.md](10-force-vocabulary.md).
- Search-specific dispatch → [09-search-and-rag-excitation.md](09-search-and-rag-excitation.md).

## Prerequisites

[10-force-vocabulary.md](10-force-vocabulary.md), [03-physics-model.md](03-physics-model.md).

## Consumers

[milestones/M3a-search-and-focus.md](milestones/M3a-search-and-focus.md),
[milestones/M3b-rag-excitation.md](milestones/M3b-rag-excitation.md),
[milestones/M3c-extended-vocabulary.md](milestones/M3c-extended-vocabulary.md).

## Invalidation

- New Layer 2 effect added → must dismiss the others on activation.
- New Layer 3 effect added → must verify it doesn't smuggle
  position changes into a Layer-2-occupied subset.
- A user explicitly wants two Layer-2 effects simultaneously
  (e.g. focus + clusterFocus blended) → invalidates Layer 2
  exclusivity → blends become a separate design problem.
