# 18 — Verification and rollout

## Per-milestone verification (cross-references)

Each milestone in [`milestones/`](milestones/) has its own
verification section. This file aggregates the cross-cutting
verification themes:

- **Visual regression**: 3D workspace first, with side-by-side 2D lens
  parity after each milestone. Same scope produces the same filter /
  selection / search results.
- **State parity**: `selected_point_indices` is identical when
  selection is made on either surface. Filter SQL produces the
  same row count on either.
- **Performance**: 60 fps sustained on desktop at 16K resident
  particles for the relevant milestone's interactions. Mobile
  baseline 30 fps at 8K. Profile traces saved alongside.
- **Accessibility**: `prefers-reduced-motion`, Pause-motion,
  low-power all correctly suppress motion (per
  [15-accessibility-and-low-power.md](15-accessibility-and-low-power.md)).
- **Correctness**: paper-particle identity stable across reloads
  (per the lane rule + ORDER BY id stability fix in
  `apps/web/features/orb/bake/use-paper-attributes-baker.ts`).

## Tuning gates

### M0 tuning gate (per canonical, preserved)

Before locking the parquet contract:

- Three publish fixtures at ~5K, ~8K, ~10K (and one full-corpus).
- Render sheets at 3 camera angles per fixture.
- Visual criteria all-required:
  - Clusters visibly separated.
  - No exploded islands.
  - Mean intra-cluster distance < 0.6 × mean random-pair distance.
  - Mean linked-pair distance < 0.7 × mean random-pair distance.
  - 20-paper exemplar audit passes.
- Structural stability: 90th-percentile NN-set overlap ≥ 0.8 on
  Procrustes-aligned reruns.
- Sign-off: product owner + graph-runtime owner.

Locks: `cluster_bonus_multiplier`, `umap_anchor_strength`,
`force_iters`, `linLogMode`, entity-edge thresholds.

### M5b 3D-primary gate

Before making `/graph` default to the 3D workspace:

- Telemetry from M5a hardening period for ≥ 2 weeks, unless product
  owner explicitly accepts earlier 3D-primary rollout.
- Core flows pass in 3D: prompt/search → result → focus → info/wiki →
  filter/timeline → 2D lens toggle.
- No regression in shared state parity.
- Mobile usage data acceptable.
- A11y review passes.

## Rollout phases

| Phase | Duration | Default mode | Surfaces shipping |
|---|---|---|---|
| F1 | M2 → M3a | 2D temporary | orb behind feature flag for internal testing |
| F2 | M3b → M4 | 2D temporary | 3D workspace hardening; opt-in toggle in chrome |
| F3 | M5a | configurable temporary | 3D workspace visible to all users; telemetry collecting |
| F4 | M5b | **3D** | product-target flip; 2D still toggleable as analytic lens |
| F5 | M8 checkpoint | 3D | native 2D lens boundary hardened; no vendor work without measured gap |
| F6 | M7 done | 3D | WebGPU hardened; WebGL2 fallback retained or retired by telemetry |
| F6+ | post | 3D | revisit `/map` permanent retention based on usage |

## Telemetry signals

Collected from M5a onward:

- Mode toggle frequency (3D ↔ 2D lens).
- Session-length per mode.
- Search → result-click rate per mode.
- Prompt/RAG → evidence focus → wiki/info open rate in 3D.
- Filter / timeline scrub frequency per mode.
- Force-effect dispatch rate (focus, clusterFocus, etc.).
- Reduced-motion / low-power profile usage rate.
- Per-device-class performance (fps p50, p95).
- Mobile crash / WebGL-context-loss rate.

## Regression sweep checklist (M5a, M8)

After every milestone that touches the renderer or state pipeline:

- [ ] Filter widget produces same `filteredIndices` set.
- [ ] Selection from either surface persists across mode toggle.
- [ ] Camera persistence works for both 2D + 3D keys.
- [ ] Detail panel opens identically on click in either mode.
- [ ] Search bar lands results in panel; orb dispatches
      `evidencePulse`/`evidenceMark` correctly.
- [ ] Hover tooltip appears for both modes.
- [ ] Lasso/rect/brush match between modes (where applicable).
- [ ] Reduced-motion suppresses motion as documented.
- [ ] Low-power profile activates correctly.

## Owns / doesn't own

Owns: cross-cutting verification themes, tuning-gate signoff,
rollout phases, telemetry signals, regression checklist.

Doesn't own:
- Per-milestone-specific verification → in each milestone file.
- Production deploy mechanics → CI / Vercel pipelines existing.

## Prerequisites

All other docs.

## Consumers

All milestone files reference back to this for cross-cutting
verification themes.

## Invalidation

- Telemetry pipeline changes → signal list updates.
- Performance baselines shift (e.g. WebGPU primary changes p95
  budget) → tuning gates re-tune.
