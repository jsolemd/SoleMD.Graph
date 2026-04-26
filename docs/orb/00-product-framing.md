# 00 — Product framing

## North star

`/graph` becomes the primary biomedical knowledge workspace. The user
can prompt/search, inspect ranked results, open paper info, read wiki
content, filter the corpus, and move between RAG evidence and graph
context without leaving the 3D orb surface.

- **3D orb workspace** — the default product surface. Every
  interaction reshapes the force field to make a *semantic*
  relationship visible through motion. The galaxy reads the data.
- **2D map lens** — an optional analytic view over the same active
  scope, selection, filters, prompt results, and panel state. It is
  available when a flat map is the right tool, but it is not a
  parallel product.

The user should feel that the prompts, info panel, wiki, and physics
belong to one native 3D environment; 2D is a view switch, not a mode
that owns state.

## What "physics means something" buys

Quoted from the original handoff (`docs/future/orb-3d-cosmograph-port-handoff.md`):

> When the user issues a search (or RAG retrieval lands hits), the
> answer particles **coalesce and form** — like a galaxy where
> gravity binds semantically related papers. Highly cited papers
> have more mass; papers that share entities cluster; papers that
> share semantic embeddings cling.

Implementation: every interaction dispatches through one of seven
named force effects (see [10-force-vocabulary.md](10-force-vocabulary.md)).
Each effect's strength reads from canonical edge weights computed
from a versioned spec (`packages/graph/spec/entity-edge-spec.json`).
The user feels the relational topology.

## Anti-hairball constraints (preserved from canonical)

Three critiques the design absorbs head-on:

1. **"Avoid 3D" (Wilke).** Position carries no IDF, no citation
   count, no year — anything quantitative lives in the panel and
   ranked list. The 3D axis is *navigable context*, not encoding.
2. **"Almost nothing should be drawn as a graph" (Gephi 2011).**
   Tiered edges: cluster chords default; 1-hop on hover; full edges
   only when scope < 5K; edge bundling deferred.
3. **"Market retreat from graph views" (ResearchRabbit 2025).**
	   Search-first ingress. Cold `/graph` shows prompt/search + ranked
	   list + info/wiki panel as native workspace chrome, with the orb
	   visible as the spatial substrate. Ranked results remain the
	   authoritative textual surface, but they are not separate from the
	   galaxy; list hover/click and graph focus are the same interaction.

## Resident LOD (the scale-collapse answer)

The user's framing — "same data, two methods" — collapses the
canonical plan's "different scopes" split. But full-corpus *live*
particles is the hairball failure (16K render budget vs. 100K–500K
base + lazy universe). Resolution: **orb renders the active scope
intersected with a render budget**.

- Scope ≤ render budget: everything live.
- Scope > render budget: deterministic sub-sampling after the
  focus-neighborhood reserve is filled; UI surfaces *"showing 16K of
  87K — focus, narrow, or zoom for full"*.
- Selection / filter SQL is over the whole scope (renderer-agnostic).
- Physics simulates the resident set only.

See [01-architecture.md](01-architecture.md) § Resident LOD for the
mechanism; [decisions/2026-04-24-scope-collapse.md](decisions/2026-04-24-scope-collapse.md)
for why this overrode the canonical's split.

## Surface switch ≠ renderer swap

The 3D workspace and 2D lens are **simultaneously mounted** under the
shared-shell architecture (`docs/future/graph-landing-stealth-handoff.md`).
Toggle is a `visibility` flip, instant. State persists. Camera state
for each is per-key (`solemd:camera-2d`, `solemd:camera-3d`).

The 3D workspace owns the product composition: prompt/search, ranked
list, info panel, pinned wiki, filters, timeline, and RAG evidence.
The 2D lens reads and writes the same state for parity, but should not
grow its own prompts, panels, or interaction vocabulary.

## What the orb does **not** do

- Make the user decode everything from particle position alone.
- Encode quantitative information through 3D position (UMAP-seeded
  ForceAtlas2 baked layout = navigable, not measurable).
- Run continuous expensive force simulation at rest. Ambient =
  shader noise + group rotation; force engine wakes on perturbation.
- Delete the 2D lens. `/map` remains available when a flat analytic
  view is useful, but it does not own durable product state.

## Owners

This file owns the *product* framing. Implementation tracks live in
the milestone files. Engineering principles live in
[01-architecture.md](01-architecture.md).

## Prerequisites

None. This is the entry-point doc.

## Consumers

Every other file in this docset assumes the framing here. If this
framing is overridden by a later product decision, every downstream
file needs revision.

## Invalidation

This framing falls if either:

- The user revokes the "same data, two methods" goal and reverts to
  the canonical's "different scopes" split. Then `decisions/2026-04-24-scope-collapse.md`
  is reverted and `/map` becomes a different data product.
- The full-corpus 3D physics path becomes feasible at user scale
  (e.g. WebGPU compute lifts the budget past 100K live particles).
  Then Resident LOD relaxes; product framing remains valid.
