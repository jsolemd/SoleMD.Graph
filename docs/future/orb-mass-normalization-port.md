# Orb mass normalization — initial Cosmograph→3D port

> **Status.** Plan, not yet implemented. Foundational for the larger
> Cosmograph→3D port (wiki, info panels, filter, timeline, search
> excitation, eventual N-body physics) — sets the lane-separation rules
> that downstream work must honor.

## Why this exists

After the env / SSR / SQL-casing fixes earlier this session, `/graph`
runs end-to-end. The user observed the visible behavior the paper-
attribute baker actually produces and reported:

> "small particles are too small and the big aren't big enough — it
> makes the orb look like it has fewer particles than it really does."

Codex review (`agentId a17762ae93faec715`) confirmed this is **the
shape, not the tuning**: the current normalization is linear over a
heavy-tailed distribution, with a per-chunk denominator and a narrow
`[0.5, 2.0]` clamp. The middle 90% of the corpus collapses to the 0.5
floor; a handful of outliers hit the 2.0 ceiling; nothing renders in
between.

Beyond the immediate visual regression, the user's strategic frame is
that the orb will subsume `/map`'s 2D Cosmograph entirely — wiki, info
panel, filter, timeline, search excitation, and eventually a real
physics layer where particle "mass" has gravity, hover triggers local
zoom, search hits light up, drag perturbs the layout. Mass values
written today get reinterpreted as gravitational mass tomorrow. The
choice of normalization function is therefore not cosmetic — it's the
substrate for everything that follows.

## Scope

**In:**
- Replace per-chunk-max-driven linear normalization with a stable,
  global, log-percentile-pow shape. Wider visual range.
- Pre-flight one DuckDB aggregate query before streaming, so every
  chunk lands at its final scale on first paint.
- Add stable particle indexing so paper↔particle identity survives
  reloads.
- Document the lane semantics so the larger Cosmograph→3D port doesn't
  conflate visual render lanes with future physics state.

**Deliberately out (deferred to the actual port work):**
- An intrinsic-mass attribute lane separate from sprite size.
- Velocity/force buffers.
- Search-excitation channels (extra mass/glow on RAG hits).
- Filter/timeline-driven mass modulation.
- N-body force simulation.
- Wiki/info-panel surface migration.
- Hover-driven local zoom physics.

The fix below sets up the rule those will follow (visual lanes ≠ physics
state lanes), but does not pre-build them. We design each when its
requirements are concrete.

## Root cause (recapped, citations)

| File | Line | Problem |
|---|---|---|
| `apps/web/features/orb/bake/use-paper-attributes-baker.ts` | 179-220 | Per-chunk `chunkMaxRef`/`chunkMaxEntity` computed inside the streaming loop; pushed to each chunk as its normalization denominator. Mass becomes a function of which Arrow batch a paper happened to land in — a hard physics blocker. |
| `apps/web/features/orb/bake/apply-paper-overrides.ts` | 128-160 | Linear `entityCount / maxEntity * 2` clamped to `[0.5, 2.0]`. Pareto-distributed entity counts → 90% floored, ~1% ceiled, no expressive middle. Speed pipeline uses `(1 - log(...)/log(...)) * 3` — symmetric problem; almost everything maxes out at 3.0. |
| `use-paper-attributes-baker.ts` | 144 | `ROW_NUMBER() OVER ()` has no `ORDER BY`. `REPEATABLE` makes the reservoir *sample* deterministic; row *order within the sample* is implementation-defined. Particle-identity stability across reloads is fragile. |
| `apps/web/features/field/renderer/field-picking-material.ts` | 17 | Hit-radius scaling assumes size factor in `[0.5, 2.0]`. Widening the visual range without updating this drops picker accuracy on large particles. |

## Cosmograph parity reference

The 2D Cosmograph in this repo (`apps/web/features/cosmograph/.../config-slice.ts:120`)
uses:

- `pointSizeStrategy: 'auto'` → internally `scaleSymlog().domain([q05, q95]).range([1.5, 5]).clamp(true)`
- `pointSizeColumn: 'paperReferenceCount'` (citation count)

The 3D orb currently uses linear-over-chunk-local-max into `[0.5, 2.0]`,
driven by `paperEntityCount`. Strictly worse on all four axes (shape,
stability, range, signal). Migrating users from `/map` to `/graph`
without fixing this would feel like a regression.

## The fix

### Step 1 — Pre-flight global stats query

Before the temp-table CREATE in `use-paper-attributes-baker.ts`, run a
single DuckDB aggregate over `base_points_web`:

```sql
SELECT
  quantile_cont(LN(1 + paperReferenceCount), [0.05, 0.98]) AS refQuantiles,
  quantile_cont(LN(1 + paperEntityCount),    [0.05, 0.98]) AS entityQuantiles
FROM base_points_web
WHERE paperId IS NOT NULL
```

Returns one row, two `LIST<DOUBLE>` columns. Destructure into
`{refLo, refHi, entityLo, entityHi}` (log-space anchors). Cost on the
fixture corpus: ~5–15 ms. This runs once per baker invocation, before
the streaming reader opens, so it adds at most ~15 ms to first-chunk
paint in exchange for stable scale across the entire stream.

### Step 2 — Carry stats on every chunk; drop per-chunk maxima

Refactor `PaperChunk` (`apps/web/features/orb/stores/geometry-mutation-store.ts`):

```ts
export interface PaperChunkStats {
  refLo: number;     // log1p(refCount) at q05
  refHi: number;     // log1p(refCount) at q98
  entityLo: number;  // log1p(entityCount) at q05
  entityHi: number;  // log1p(entityCount) at q98
}

export interface PaperChunk {
  attributes: PaperAttributesMap;
  stats: PaperChunkStats;
}
```

In the baker (`use-paper-attributes-baker.ts:179-220`):
- Delete the `chunkMaxRef`, `chunkMaxEntity` accumulators.
- Pass the same global `stats` (computed once in step 1) on every
  `addChunk` call.
- Keep the running global `maxRef`, `maxEntity`, `maxRelation` only if
  some HUD consumer still reads them; otherwise drop. They're not used
  for normalization anymore.

The `PaperAttributesState.maxima` field that the HUD reads (`use-paper-attributes-baker.ts:64`)
becomes meaningless under this change — replace it with a `stats`
pass-through if the HUD wants to display anything, or delete the field
if no surface consumes it.

### Step 3 — Rewrite the normalization math

Replace `apps/web/features/orb/bake/apply-paper-overrides.ts:128-160`
with the log-percentile-pow shape:

```ts
// Size: log1p, percentile-anchored, pow-eased.
const eDenom = Math.max(stats.entityHi - stats.entityLo, 1e-6);
const nE = Math.max(0, Math.min(1,
  (Math.log1p(attrs.entityCount) - stats.entityLo) / eDenom
));
const sizeFactor = 0.8 + (2.6 - 0.8) * Math.pow(nE, 0.65);

// Speed: same shape, inverted (high citations → slow).
const rDenom = Math.max(stats.refHi - stats.refLo, 1e-6);
const nR = Math.max(0, Math.min(1,
  (Math.log1p(attrs.refCount) - stats.refLo) / rDenom
));
const speedFactor = 1.75 + (0.55 - 1.75) * Math.pow(nR, 0.8);
```

Properties this delivers:
- `log1p` handles the heavy tail.
- Quantile anchors `[q05, q98]` ignore pathological outliers.
- `pow(_, 0.65)` for size lifts the lower-mid corpus off the floor.
- `pow(_, 0.8)` for speed gives a slightly faster falloff so highly-
  cited papers visibly anchor without freezing.
- Range `[0.8, 2.6]` for size: small particles aren't *too* small (no
  drop below visibility threshold), large particles get more room to
  breathe (vs current 2.0 ceiling).
- Range `[1.75, 0.55]` for speed: never zero, never the hyperactive 3.0.
- All particles end up with stable values that don't shift mid-stream.

`ApplyPaperOverridesOptions.maxima` (the param contract — `apply-paper-overrides.ts:75`)
becomes `stats: PaperChunkStats`. Update the JSDoc.

### Step 4 — Stable particle indexing

`use-paper-attributes-baker.ts:144` currently:

```sql
SELECT (ROW_NUMBER() OVER ()) - 1 AS particleIdx, * FROM sampled
```

Add an `ORDER BY` inside the OVER clause so row-number assignment is
deterministic across reloads:

```sql
SELECT (ROW_NUMBER() OVER (ORDER BY id)) - 1 AS particleIdx, * FROM sampled
```

Use `id` (the bundle's primary id, present on every row of
`base_points_web`). This means particle `#523` always corresponds to
the same paper across reloads of the same bundle — a precondition for
spatial memory, search-result excitation lookups, and any future
physics-state persistence.

### Step 5 — Update picker hit-radius bound

`apps/web/features/field/renderer/field-picking-material.ts:17` (and
the matching shader at `field-shaders.ts:103`) assumes size factor in
`[0.5, 2.0]`. Update the upper bound from `2.0` to `2.6` so the picker
correctly sized hit-radius for large particles, and verify:
- Hardware point-size cap (`gl.ALIASED_POINT_SIZE_RANGE`) on common
  desktop GPUs accommodates the new max.
- Fill-rate at 16k particles × 2.6× size doesn't regress paint cost.
- Selection-boost interaction at `field-shaders.ts:103` still
  composes correctly (selection should still feel additive, not get
  swallowed by an already-large particle).

### Step 6 — Document lane semantics

Update the JSDoc at the top of `apply-paper-overrides.ts` to make the
boundary explicit. Approximately:

> The attributes this writes (`aSpeed`, `aClickPack.w`, `aBucket`,
> `aFunnel*`) are **render lanes**, not physics state. `aSpeed`
> multiplies shader noise displacement (`field-vertex-motion.glsl.ts:232`);
> `aClickPack.w` is a sprite-size multiplier (`field-vertex-motion.glsl.ts:266`).
>
> When the physics layer lands (N-body, search excitation, drag,
> hover-zoom), it gets its **own** state — likely a sidecar texture or
> a separate attribute pass, designed at that point. Sprite size MAY
> derive from intrinsic mass via a render mapping, but the two are
> never the same field. This separation is the rule the larger
> Cosmograph→3D port follows: visual mappings live here; intrinsic
> properties live next to the simulation.

This is the durable architectural contract the rest of the port
inherits.

## Verification

| Step | What | Pass criterion |
|---|---|---|
| V1 | `npm run typecheck` | Clean. The `PaperChunk.stats` rename ripples through the store, baker, subscriber, and applier — typecheck catches any miss. |
| V2 | `npm test -- --runInBand --testPathPattern=apply-paper-overrides` | Existing applier test passes. Update the test fixture if it currently feeds `maxima` to use `stats` instead. |
| V3 | Reload `/graph` via chrome-devtools (visible mode) | HUD shows `bundle: ready / baker: ready / chunks: 8 · 100% / picker: ready` with **no `err:` line and no mid-stream visual jitter**. |
| V4 | Visual diff vs current main | Orb shows expressive mid-range particle sizes — visible gradient from small to large rather than the binary floor+ceiling effect. Take a screenshot after `t = 5s` for the record. |
| V5 | Click any particle | `last pick: #N` flips, `OrbDetailPanel` shows the paper. Confirms picker hit-radius update didn't break selection. |
| V6 | Open `/map` in a second tab, eyeball-compare to `/graph` | The orb's size dynamic range should *not* feel obviously narrower than Cosmograph's symlog [1.5, 5]. (Different geometry, different signal — exact parity isn't the bar; "doesn't feel like a regression" is.) |
| V7 | `npm run lint` | Only the two pre-existing warnings (page.tsx unused-disable, OrbDevSurfaceClient `sessionReady`) remain. |

## What this plan deliberately does NOT touch

The user's explicit framing: this is an **initial port of concepts and
architecture**. The fix above is the foundation; the scope wall below
is what we don't preempt:

- **Cosmograph's force simulation port.** Cosmograph drives layout via
  GPU-side N-body forces. Porting that to 3D is a separate workstream.
  This plan only fixes the *visual* mapping; the physics layer that
  reads it gets designed later.
- **Search/RAG excitation lane.** Lighting up specific particles when
  the user searches (or RAG retrieval results land) needs its own
  attribute or texture lane — likely a single-channel uint8 texture
  indexed by particle index. Codex flagged that the existing
  `aClickPack.xyzw` is already saturated. Not built here.
- **Wiki / info-panel migration.** `OrbDetailPanel` is a placeholder.
  Real port of the 2D wiki content surface, with its info panel,
  citations, and cross-references, is a separate plan.
- **Filter / timeline.** `/map` has filter and timeline UIs; the orb
  doesn't. They'll need to drive both selection state AND mass
  modulation when they migrate. Not in scope here.
- **Drag, hover-zoom, gravitational mass.** All deferred to the
  physics-layer plan.

## Architecture note for the larger Cosmograph→3D port

This change establishes one durable rule: **visual render lanes ≠
intrinsic physics lanes**. Every later port follows it.

- **Render lanes** (today): `aSpeed`, `aClickPack`, `aBucket`,
  `aFunnel*`, `aColor` (planned). Written by surface code (this baker,
  the lands-mode baker, future search-excitation overlays). Cheap to
  rewrite, GPU `bufferSubData`-friendly.
- **Physics lanes** (future): intrinsic mass, velocity, force
  accumulators, excitation timers. Written by the simulation pass.
  Sidecar textures or a dedicated transform-feedback buffer; never
  conflated with render attributes even when the visual happens to be
  derived from them.

When the physics layer lands, sprite size *may* render from intrinsic
mass via a small mapping function, but the two values live in
different buffers. Same rule for any other "this attribute kind of
means a physical thing" temptation.

## Rollback

Single-commit revert. The pre-flight query is additive. The
normalization math is local to `apply-paper-overrides.ts`. The
`PaperChunk` rename ripples to four files (store, baker, subscriber,
applier) but each diff is small. The picker bound update and the SQL
`ORDER BY` are one-line each.

If the visual lands wrong (e.g. user wants more compression in the
mid-range), the tunable constants are all in `apply-paper-overrides.ts`:
the `pow` exponents `0.65`/`0.8` and the range tuples `[0.8, 2.6]`/
`[1.75, 0.55]`. Re-tune in place; no architectural change required.

## Tasks

Tracked in TaskCreate (this session):
1. Pre-flight global percentile stats query (#1)
2. Replace per-chunk maxima with stable global stats on PaperChunk (#7)
3. Rewrite size and speed normalization math in apply-paper-overrides (#2)
4. Update picker hit-radius bound for widened size factor (#3)
5. Add stable ORDER BY for ROW_NUMBER particle indexing (#4)
6. Document lane semantics in apply-paper-overrides JSDoc (#5)
7. End-to-end verification (typecheck, test, chrome-devtools, /map parity) (#6)
