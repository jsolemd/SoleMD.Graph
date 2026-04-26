# Decision — Search excitation promoted to M3a/M3b

**Date:** 2026-04-24
**Owner:** SoleMD product
**Status:** Adopted

## Problem

Canonical plan
(`docs/future/graph-orb-3d-renderer.md`) buries
`evidenceSignalOverlay` (RAG-result excitation) in M3c —
labeled "extended physics vocabulary."

Original user vision in
`docs/future/orb-3d-cosmograph-port-handoff.md`:

> When the user issues a search (or RAG retrieval lands hits),
> the answer particles **coalesce and form** — like a galaxy
> where gravity binds semantically related papers.

The user identifies search → coalesce as the **headliner** — the
distinctive visual signature of the orb. Burying it in M3c
contradicts that priority.

## Decision

**Promote search excitation to M3a + M3b.**

- M3a ships `focus(paperId)` + `focus(resultSet)` for search-bar
  commits + camera focus.
- M3b ships `evidencePulse` (Layer 2 spatial-mode) + 
  `evidenceMark` (Layer 3 overlay) — composes with `focus` per
  the three-layer rule.
- M3c is the *remaining* force vocabulary
  (`clusterFocus`, `entityFocus`, `pulseImpulse`, formal `tug`).

Per [`milestones/M3a-search-and-focus.md`](../milestones/M3a-search-and-focus.md)
and [`milestones/M3b-rag-excitation.md`](../milestones/M3b-rag-excitation.md).

## Rationale

Sequencing matches user priority. The headliner ships first, in
two phases (search + focus first, RAG + excitation second).
Three-layer composition still preserved verbatim — only milestone
ordering shifts. The canonical's M3a / M3b / M3c structure is
maintained as a phasing tool but rebalanced.

## Sub-decision: split `evidenceSignalOverlay` into two effects

Per Codex round 2 R2-7: the canonical `evidenceSignalOverlay`
is internally inconsistent — sometimes positional impulse, sometimes
overlay-only. Split:

- `evidencePulse(set, kind)` — Layer 2 (spatial-mode-class).
- `evidenceMark(set, kind)` — Layer 3 (overlay-class).

This preserves the three-layer composition cleanly. Refute
display always uses `evidenceMark` (color/halo/badge only); never
displaces.

## Invalidation

- User decides search-coalesce is *not* the headliner →
  re-sequence M3a/M3b.
- RAG endpoint contract changes (no `kind`) → `evidenceMark`
  falls back to undifferentiated highlight; M3b adapts.
- A different distinguishing feature emerges (e.g. "narrative
  expansion" via cluster-dive) → M3 ordering revisits.
