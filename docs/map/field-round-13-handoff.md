# Field — Round 13 Handoff

Date authored: 2026-04-19
Predecessor: Round 12 rebuild (commit `a086b24`,
`docs/map/field-maze-baseline-ledger-round-12.md`).

This is the handoff for the next agent picking up the field work.
It is self-contained: you should be able to read this file + the
references at the bottom and know exactly what to change.

## How to use this handoff

Before editing anything, run the reconnaissance pass the project's
engineering contract requires. The skills and MCP surface are already
wired:

1. Invoke `/codeatlas` first to orient. Target queries:
   - `search_code "attachMouseParallax"` — finds the parallax primitive
     and its callers (should be exactly one today: `FieldScene.tsx`).
   - `search_code "createBurstController"` — the burst-overlay driver.
   - `search_code "SOLEMD_BURST_COLORS"` — current 4-entry color map
     that this handoff expands.
   - `search_code "rotationVelocity"` — the idle spin rate lives in
     `visual-presets.ts`.
   - `search_code "LANDING_BLOB_CHAPTER"` — chapter event list that
     drives the current "flat → expand" scroll behavior.
   - `inspect_symbol FieldScene` — surface the React component that
     wires everything together.
2. Then `/module`. The skill's canonical-sources list
   now leads with the Round 12 ledger and
   `references/round-12-module-authoring.md`. Read both before editing.
3. Finish with `/clean` when you're done to verify the changes fit the
   engineering contract (native first, thin adapters, no duplicate work,
   600-line limit, centralized config).

## Work items

Four scoped asks, ordered so later items compose cleanly on earlier ones.

### 1. Parallax: keep as opt-in primitive; remove from background blob

**User ask, verbatim:** "parallax to be available so that as i build
modules we can have pointer parallax driven content but i dont want the
background globe to be influenced by pointer in this".

**Current state (file:line anchors):**

- `apps/web/features/field/renderer/mouse-parallax-wrapper.ts`
  exports `attachMouseParallax(group, options)`. Good primitive,
  keep it, it's the opt-in path for future modules.
- `apps/web/features/field/renderer/FieldScene.tsx` L575-581
  currently calls `attachMouseParallax(stageMouseWrapperRefs.current.blob)`
  inside a `useEffect`. **Remove this block.** The `mouseWrapper` Group
  inside each stage item can stay (it's cheap; Group with no rotation
  is a no-op) so future modules can still target those refs.
- Update `FieldHotspotRing` / overlay surfaces unaffected.

**Export surface to verify:**

- Keep `attachMouseParallax` as a public export in
  `apps/web/features/field/index.ts`. It already is (via
  `renderer/mouse-parallax-wrapper.ts` barrel re-export).
- In the `module` skill, document explicitly:
  "Mouse parallax is opt-in. The landing page does **not** apply
  parallax to its background field. Call `attachMouseParallax(group)`
  from any specific module surface that wants pointer-driven
  parallax on its own Three.js Group."

**Files to touch:**

1. `apps/web/features/field/renderer/FieldScene.tsx:575-581` —
   delete the useEffect.
2. `.claude/skills/module/references/maze-stage-overlay-contract.md` —
   correct the Mouse Parallax Wrapper section so it's clear it applies
   per-module on opt-in, not globally.
3. `.claude/skills/module/references/maze-mobile-performance-contract.md` —
   note that the landing blob no longer ships parallax (simplifies the
   mobile story).

**Verification:** after the change, moving the pointer across the
landing page must not rotate the blob at all. Stream + pcb layers
were never parallaxed, so no behavior change there.

### 2. Initial globe shape: formed at scroll 0, expands on scroll

**User ask, verbatim:** "starts off as more of a formed globe shape
like the mazehq does and then expands into what it is now when a bit
of scrolling".

**Current state:** the blob renders at scroll 0 with `uFrequency: 0.7`
and `uAmplitude: 0.4` (see
`apps/web/features/field/scene/visual-presets.ts:139-170`).
Those values produce visible FBM deformation on the sphere *immediately*,
so the hero never reads as a clean globe. Maze, by contrast, opens
with a tighter-to-sphere read (see the A/B screenshots at
`docs/map/field-maze-baseline-ledger-assets/round-12-phase-3/maze-scroll-0.png`
vs `solemd-scroll-0.png`).

**Target behavior:**

- At local progress 0, the blob reads as a crisp sphere shell:
  low `uAmplitude` (~0.05–0.1), low `uFrequency` (~0.3) so FBM
  barely pushes points off the surface.
- Around progress 0.05–0.15 (a small amount of scroll), ramp up to
  the current expanded values. This is the same envelope shape as
  Maze's `LANDING_BLOB_CHAPTER` "start-frequency" event but with the
  resting-state minimum pulled lower.
- Entry animateIn (1.4 s `tnEase`, already implemented in
  `FieldController.animateIn`) should sweep `uAmplitude` from
  `amplitudeOut` → the resting-low value, not all the way to 0.4.

**Primitives to use, not reinvent:**

- `scene/visual-presets.ts` — reduce blob's **resting** `shader.amplitude`
  from 0.4 → ~0.08 and resting `shader.frequency` from 0.7 → ~0.3.
  Keep `alphaOut: 0`, `amplitudeOut: 0.8` (entry still starts
  expanded so animateIn visibly settles inward — this gives the
  "forming" feel on page load).
- `scroll/chapters/landing-blob-chapter.ts` — extend the existing
  `start-frequency` event to interpolate *from* the low resting
  values *to* the Maze stats expansion
  (`uFrequency: 0.3 → 1.7`, `uAmplitude: 0.08 → 0.25 → 0.5`).
  The existing event list at L18-55 already has the right shape;
  swap the fromTo start points to the new lows.
- `renderer/FieldScene.tsx` — the useFrame path that writes
  `targetAmplitude` / `targetFrequency` currently computes from
  `shader.amplitude` / `shader.frequency`; those now resolve to the
  new lows automatically.

**Do not** hand-write a second smoothstep inside FieldScene. Use the
chapter timeline + scrubber (Phase 5 / Phase 8 of Round 12) — they
already give you the 1 s trail and declarative event shape.

**Verification:** capture A/B screenshots at progress 0 + 0.05 + 0.15
+ 0.3 under
`docs/map/field-maze-baseline-ledger-assets/round-13-phase-globe/`.
Paste into a new `docs/map/field-round-13-ledger.md` (create
it; mirror the structure of the Round 12 ledger).

### 3. Faster counterclockwise baseline rotation

**User ask, verbatim:** "rotates counterclockwise a bit faster at
baseline".

**Current state:** blob idle rotation velocity is
`[0, 0.06, 0]` (rad/sec, y-axis) in
`apps/web/features/field/scene/visual-presets.ts:115`. That's
0.06 rad/s ≈ 3.4°/s ≈ 104 s per full turn — roughly Maze's
`wrapper.rotation.y += 0.001` per frame at 60 fps.

**Target:** user wants "a bit faster". Suggested starting point:
bump to ~0.12 rad/s (double Maze; ~52 s per turn). Adjust to taste
after visual review. Keep counterclockwise — that's `+y`.

**Files to touch:**

1. `apps/web/features/field/scene/visual-presets.ts:115` —
   change `rotationVelocity: [0, 0.06, 0]` to
   `rotationVelocity: [0, 0.12, 0]` (or the chosen value).

**No new primitive needed.** `FieldController.loop(dtSec)` already
drives `wrapper.rotation.y += params.rotationVelocity[1] * dtSec`
(see `controller/FieldController.ts:100-103`).

**Verification:** video capture (5–10 s) comparing old vs new; ensure
rotation direction is still counterclockwise (when viewed from the
user's perspective, the y rotation should sweep left-to-right at the
top of the sphere — that's `+y` in Three.js right-handed with default
camera).

### 4. Burst colors: all semantic tokens, not just 4-entry palette

**User ask, verbatim:** "makes it so the color bursts that are happening
aren't just magenta but also include all the semantic colors (we have
color tokens -color-semantic-* that can be used. - the regular
particles can stay ther current color but the color bursts should
include all semantic colors as options".

**Current state:** `apps/web/features/field/scene/burst-config.ts`
maps 4 bucket ids to 4 Maze-palette colors:

```ts
export const SOLEMD_BURST_COLORS: Record<string, string> = {
  paper: "#42A4FE",
  entity: "#8958FF",
  relation: "#02E8FF",
  evidence: "#D409FE",
};
```

The shader reads the single active bucket's color via `uBurstColor`.
Only `evidence` (magenta #D409FE) is shown most of the time because
it's 70 % of the bucket distribution.

**Target:** the burst layer should be able to tint in any of SoleMD's
semantic colors, not just this 4-entry Maze-palette subset.

**Semantic tokens available** (from
`apps/web/app/styles/tokens.css`):

- `--color-semantic-disorder`: `#f6b39b`
- `--color-semantic-chemical`: `#aedc93`
- `--color-semantic-gene`: `#d79ece`
- `--color-semantic-anatomy`: `#e5c799`
- `--color-semantic-physiology`: `#9fcfe8`
- `--color-semantic-procedure`: `#d8bee9`
- `--color-semantic-section`: `#746fc0`
- `--color-semantic-paper`: `#d4c5a0`
- `--color-semantic-module`: `#7ecfb0`

Plus dark-mode variants. Use the shared resolver in
`apps/web/lib/pastel-tokens.ts` — do NOT hardcode hexes in
`burst-config.ts`. Read `semanticColorFallbackHexByKey` if it exports
the right keys (it already did before Round 12's registry refactor).

**Recommended approach:**

- Expand `SOLEMD_DEFAULT_BUCKETS` in
  `apps/web/features/field/asset/field-attribute-baker.ts`
  so the bucket list aligns with SoleMD semantic identities:
  paper, entity, relation, evidence are still the *ambient* buckets,
  but add the `disorder`, `chemical`, `gene`, `anatomy`, `physiology`,
  `procedure`, `section`, `module` semantic families. Each needs a
  bucket entry with plausible motion values (interpolate within the
  existing Maze numeric range; don't invent values wildly outside
  `scripts.pretty.js:42784-42893`).
- Expand `SOLEMD_BURST_COLORS` in
  `apps/web/features/field/scene/burst-config.ts` so every
  bucket id maps to its semantic token (or ambient color for the
  paper/entity/relation/evidence keys). Resolve through
  `pastel-tokens.ts`.
- Consider a new `setActiveBySemanticType(semanticType, strength)`
  convenience on `createBurstController` so a module can say "tint
  this like a gene burst" without knowing the bucket id. Small
  addition; don't force it if it complicates the signature.

**Important constraints (user said explicitly):**

- **Regular particles stay their current color** — do NOT touch the
  base `uRcolor/uGcolor/uBcolor/uRnoise/uGnoise/uBnoise` uniforms.
  The Maze cyan→magenta binary-lerp is the field; only the
  burst overlay swaps color per active bucket.
- The burst uniform shape is already per-material (single active
  bucket at a time, which is correct — Maze only ever has one
  semantic color sweeping at once). Do not make the shader read
  multiple bucket colors simultaneously; that's a much bigger scope
  and visually would read as the old "rainbow confetti" regression.

**Files to touch:**

1. `apps/web/features/field/scene/burst-config.ts` — expand
   `SOLEMD_BURST_COLORS` and `PHASE_TO_BUCKET` (or introduce a parallel
   `SEMANTIC_TO_BUCKET` map if phase routing and semantic routing
   diverge).
2. `apps/web/features/field/asset/field-attribute-baker.ts` —
   expand `SOLEMD_DEFAULT_BUCKETS`. Keep Maze-derived motion ranges.
3. `apps/web/features/field/asset/point-source-registry.ts` —
   update `BUCKET_COLOR_FALLBACKS` + `BUCKET_INDEX_TO_COLOR` so the
   legacy `color` attribute (still read by `getPointColorCss`) maps
   to the new bucket list.
4. `apps/web/features/field/asset/__tests__/field-attribute-baker.test.ts` —
   update the histogram ±2 % assertions for the new bucket count +
   weights.
5. `apps/web/features/field/renderer/burst-controller.ts` —
   no change required in signature; color resolution already runs
   through `semanticColorMap[bucketId]`.
6. `.claude/skills/module/references/maze-shader-material-contract.md`
   and `round-12-module-authoring.md` — extend the bucket table + the
   burst-color example to cover the new semantic options.

**Verification:** 
- Unit test covering every semantic bucket id resolves through
  `createBurstController.setActive(id, 1)` and applies the expected
  color to a synthetic material's `uBurstColor`.
- Visual pass: scrub through the landing page and confirm at least 3
  distinct hues sweep across the field during the scroll lifecycle,
  not just magenta. Screenshots under
  `docs/map/field-maze-baseline-ledger-assets/round-13-phase-bursts/`.

## Non-negotiables (do not regress Round 12)

These are invariants from Round 12 — a passing
`npx jest --testPathPatterns='features/field'` run + `npm run
typecheck` with no new errors are the gate.

1. **uTime never resets.** `getFieldElapsedSeconds()` is a
   singleton; do not introduce a component-ref epoch elsewhere.
2. **Scroll-driven uniforms route through `createUniformScrubber`.**
   Never set `uAlpha` / `uDepth` / `uAmplitude` / `uFrequency` /
   `uSelection` directly from a scroll handler. Always lerp.
3. **Maze blue-channel source typo stays.** The comment in
   `field-shaders.ts` around `uBnoise - uGcolor` is intentional. Do
   not "fix" it.
4. **Hotspot reseed stays per-hotspot.** Never reintroduce a shared
   timer.
5. **No `setState` in `useFrame`.** Mutate Three.js refs directly.
6. **DPR capped at 2.**
7. **600-line per-file convention** — split if you approach it.

## Reference files the next agent should open first

| File | Why |
|---|---|
| `docs/map/field-maze-baseline-ledger-round-12.md` | Source Ground Truth + Foundation Primitives table + Phase Log. |
| `.claude/skills/module/SKILL.md` | Skill contract for any module that uses the shared stage. |
| `.claude/skills/module/references/round-12-module-authoring.md` | Step-by-step authoring guide with 3 worked examples. |
| `.claude/skills/module/references/maze-shader-material-contract.md` | Canonical shader + uniform shape, Maze source citations. |
| `.claude/skills/module/references/maze-rebuild-checklist.md` | Quick DONE/OPEN audit by primitive. |
| `apps/web/features/field/index.ts` | Public barrel — every primitive exports through here. |
| `apps/web/features/field/scene/visual-presets.ts` | Blob/stream/pcb preset values (your scale/rotation/amplitude/frequency knobs). |
| `apps/web/features/field/scene/burst-config.ts` | Bucket id → color map. |
| `apps/web/features/field/asset/field-attribute-baker.ts` | `SOLEMD_DEFAULT_BUCKETS` (add new semantic entries here). |
| `apps/web/features/field/renderer/FieldScene.tsx:575-581` | Parallax useEffect to remove. |
| `apps/web/features/field/scroll/chapters/landing-blob-chapter.ts` | Event list that governs how the blob expands on scroll. |
| `apps/web/app/styles/tokens.css` (`--color-semantic-*`) | Semantic token source of truth. |
| `apps/web/lib/pastel-tokens.ts` | Token → hex resolver. |

## Scope boundary

Stay within `apps/web/features/field/`, the two skill
reference files called out above, and a new
`docs/map/field-round-13-*` ledger + asset dir. Do **not**
touch `apps/worker/`, `db/`, `packages/`, `docs/rag/`, or other
dirty-worktree files already present in the repo; those are
reserved for the backend rebuild that's running in parallel.

No commits until the user confirms the visual outcome. Mirror the
Round 12 convention: leave the working tree dirty and let the user
review screenshots before `git add` / `git push`.
