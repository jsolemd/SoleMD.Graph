# Decision — Per-scope SPECTER2 shards (not first-paint)

**Date:** 2026-04-24
**Owner:** SoleMD engineering
**Status:** Adopted (with constraint per Codex round 2 R2-8)

## Problem

Bundling SPECTER2 embeddings to enable browser-side similarity
ranking and "feels-instant" search. Tradeoffs:

- Full corpus int8 768-d at 500K papers ≈ 384 MB. Way too big.
- Resident set (16K) int8 ≈ 12 MB raw. Borderline; ≥ 5 MB at
  ~7K papers raw.
- Live-search via shards = first-query lazy load latency that
  defeats "instant."
- Repo docs scope SPECTER2 to graph-build / relatedness, not
  runtime retrieval (`docs/rag/02-warehouse-schema.md:1206`).

## Decision

**Per-scope SPECTER2 shards as enhancement, NOT live-search
path.**

- Headliner search uses existing retrieval/RAG endpoints
  (already fast; backend round-trip + result rendering ≤ 500 ms).
- SPECTER2 shards prefetch in background when:
  - Scope has narrowed below threshold (≤ ~5K papers).
  - Scope has been stable for ≥ 2 seconds (post-filter,
    post-timeline scrub).
  - Resident set fits within shard budget (≤ ~5 MiB).
- Once prefetched, used for:
  - Hover-preview "more like this" (within-scope only).
  - `entityFocus` magnetism (where IDF weights need similarity
    backing).
  - Post-search "more like these results" expansions.
- Default OFF; opt-in per scope-narrow-plus-idle heuristic.
- Never blocks search results; never causes first-query latency.

## Rationale

- "Feels instant" is preserved by NOT depending on SPECTER2 for
  the headliner result.
- Within-scope similarity ≠ retrieval; it's a UX enhancement that
  the existing RAG endpoints don't deliver out of the box.
- Bandwidth is paid asynchronously when scope is small and
  stable — not during a typing session.
- 384 MB full-corpus shipping is genuinely impractical; per-
  cluster shards (also bandwidth-bounded) are the alternative
  to per-scope.

## Cascading

Per [`14-bundle-build-pipeline.md`](../14-bundle-build-pipeline.md)
§ kNN sharding: kNN itself is shipped per-cluster + per-resident.
Embeddings follow the same sharding pattern but are gated on
opt-in.

## Invalidation

- Backend retrieval becomes slow → SPECTER2 shards may have to
  live-feed search. Trigger product redesign.
- WebGPU enables on-the-fly dense-vector compute at scale →
  shipping shards becomes unnecessary; compute on demand.
- Embeddings model bumps (SPECTER2 → SPECTER3) → shipping
  decision revisits with new size budget.
