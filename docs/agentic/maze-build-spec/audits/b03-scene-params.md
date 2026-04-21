# Audit B3 — Scene parameter registry (`cs.*`)

**Auditor**: agent-5 (Phase 3)
**Priority**: P1
**Date**: 2026-04-19
**Maze lines audited**: scripts.pretty.js [42399, 42544]
**SoleMD file audited**: `apps/web/features/field/scene/visual-presets.ts`
**References consulted**:
- `.claude/skills/module/references/maze-asset-pipeline.md`
- `.claude/skills/module/references/maze-particle-runtime-architecture.md`
- `.claude/skills/module/references/maze-rebuild-checklist.md`
- `.claude/skills/module/references/round-12-module-authoring.md`

## Summary

Maze's `cs` registry is a single object literal of 12 scene configs (`default`,
`blob`, `blobProduct`, `sphere`, `pcb`, `stream`, `hex`, `shield`, `cubes`,
`users`, `globe`, `error`) with a **prototype-merge contract**: each scene
inherits from `cs.default` and the runtime does
`yr.params = { ...cs.default, ...cs[slug] }` in the base controller
constructor at 43041. There are **roughly 22 distinct keys** across the
registry, split into three functional bands:

1. **Transform + visibility band** (`rotation`, `position`, `positionMobile`,
   `scaleFactor`, `scaleFactorMobile`, `rotate`, `rotateAnimation`,
   `mousemove`, `entryFactor`, `exitFactor`).
2. **Asset-pipeline band** (`countFactor`, `vertexRandomness`, `textureScale`,
   `thickness`, `layers`, `gridRandomness`) — these are consumed by `jo` /
   asset registry, not by the shader. Maze bundles them into `cs` for one-stop
   tuning; SoleMD has **intentionally** factored them out.
3. **Shader uniform band** (`uSize`, `uDepth`, `uAmplitude`, `uFrequency`,
   `uDepthOut`, `uAmplitudeOut`) — direct ShaderMaterial uniforms.

SoleMD's `visual-presets.ts` implements **only the three homepage-active
scenes** (`blob`, `stream`, `pcb`) with a **flatter, explicitly-typed** shape:
no inheritance from a `default` entry, funnel uniforms broken out per-scene,
color pairs added (not in Maze `cs`), and two SoleMD-invented scalars
(`alphaDiagramFloor`, `selectionHotspotFloor`) that encode chapter-timeline
"floor" values used by the BlobController scroll script. The asset-pipeline
band is **relocated** into per-generator options (`FieldGeometry.fromTexture`
/ `fromVertices`) rather than into the preset registry — a **sanctioned
architectural drift**.

Value-level parity against the three active scenes is **near-complete**. Only
three potentially tunable leaks were found: stream's `uSize` (10 in Maze vs.
9 in SoleMD — unreviewed), pcb's `uSize` mobile fallback (6 in Maze via the
cs.default fallback vs. 4 in SoleMD — sanctioned-looking but undocumented),
and pcb's `scrollRotation` (not in Maze cs — a SoleMD-invented scroll-driven
rotation). All three belong in the drift-items list below; none is
architectural.

## Ownership table

| Band                | Maze owner             | SoleMD owner                                               | State                 |
| ------------------- | ---------------------- | ---------------------------------------------------------- | --------------------- |
| Transform + vis     | `cs[slug]` (data)      | `visual-presets.ts` per-preset (data)                      | parity (shape drifts) |
| Asset-pipeline band | `cs[slug]` (data)      | `FieldGeometry.*` option args (imperative, per-call)       | sanctioned drift      |
| Shader uniform band | `cs[slug]` (data)      | `visual-presets.ts` `shader: {…}` sub-object               | parity                |
| Funnel uniforms     | `gd.getMaterial` hard-coded for stream slug | `visual-presets.ts` per-preset `funnel*` keys | parity (moved up) |
| Color pair          | `gd.getMaterial` hard-coded (cyan/magenta)  | `visual-presets.ts` `colorBase` + `colorNoise` | parity (moved up) |
| `default` base      | `cs.default` prototype merge at yr constructor | **Missing** — each preset is self-complete | sanctioned drift |
| Inactive scenes     | 9 registered (sphere, hex, shield, cubes, users, globe, blobProduct, error, stream-stub `gm`) | Not ported | sanctioned omission |

## Parity matrix

For each scene present in both Maze `cs` and SoleMD `visual-presets.ts`, all
keys are diffed against the effective Maze value **after `cs.default` merge**.

### Scene: `blob`

| Maze key             | Maze value                                  | SoleMD preset field                          | SoleMD value                         | State              |
| -------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------ | ------------------ |
| `rotation`           | {x:0,y:0,z:0} (via default)                 | `sceneRotation`                              | [0,0,0]                              | parity             |
| `position`           | {x:0,y:-0.02,z:0}                           | `sceneOffset`                                | [0,-0.02,0]                          | parity             |
| `positionMobile`     | {x:0,y:0,z:0} (via default)                 | — (no mobile offset)                         | —                                    | **Missing key**    |
| `scaleFactor`        | 0.75                                        | `sceneScale`                                 | 0.75                                 | parity             |
| `scaleFactorMobile`  | 0.55                                        | `sceneScaleMobile`                           | 0.55                                 | parity             |
| `rotate`             | !0 (true)                                   | `rotate`                                     | true                                 | parity             |
| `mousemove`          | !1 (false, via default)                     | — (no field)                                 | —                                    | **Missing key**    |
| `rotateAnimation`    | !1 (false — overrides default !0)           | `rotateAnimation`                            | false                                | parity             |
| `entryFactor`        | 0.5 (via default)                           | `entryFactor`                                | 0.5                                  | parity             |
| `exitFactor`         | 0.5 (via default)                           | `exitFactor`                                 | 0.5                                  | parity             |
| `countFactor`        | 1 (via default)                             | (asset-pipeline band — outside registry)     | n/a                                  | sanctioned drift (band moved) |
| `vertexRandomness`   | 0.1 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `textureScale`       | 1.5 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `thickness`          | 0.5 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `layers`             | 1 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `gridRandomness`     | 0 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `uSize`              | 8 (via default)                             | `shader.size`                                | 10                                   | **Unreviewed drift** (Maze default 8; SoleMD preset 10 — see D1) |
| `uDepth`             | 0.3                                         | `shader.depth`                               | 0.3                                  | parity             |
| `uAmplitude`         | 0.05                                        | `shader.amplitude`                           | 0.05                                 | parity             |
| `uFrequency`         | 0.5                                         | `shader.frequency`                           | 0.5                                  | parity             |
| `uDepthOut`          | 10 (via default)                            | `depthOut`                                   | 1.0                                  | **Unreviewed drift** (D2) |
| `uAmplitudeOut`      | 4 (via default)                             | `amplitudeOut`                               | 0.8                                  | **Unreviewed drift** (D3) |
| —                    | —                                           | `rotationVelocity`                           | [0, 0.06, 0]                         | SoleMD-specific (sanctioned — explicit commit comment; see ownership) |
| —                    | —                                           | `scrollRotation`                             | [0, π, 0]                            | SoleMD-specific (encodes Maze blob `bindScroll` 0→π tween) |
| —                    | —                                           | `alphaOut`                                   | 0                                    | SoleMD-specific (exit-alpha floor) |
| —                    | —                                           | `shader.colorBase/colorNoise`                | (LANDING_BASE_BLUE / rainbow[0])     | sanctioned (moved from material factory; LANDING palette is product) |
| —                    | —                                           | `shader.alphaDiagramFloor`                   | 0.22                                 | SoleMD-invented (chapter-timeline floor) |
| —                    | —                                           | `shader.selection`, `selectionHotspotFloor`  | 1 / 0.85                             | SoleMD-invented (chapter-timeline floor) |
| —                    | —                                           | `shader.sizeMobile`                          | 6                                    | SoleMD-specific mobile override (no Maze parallel in cs) |

### Scene: `stream`

| Maze key             | Maze value                                  | SoleMD preset field                          | SoleMD value                         | State              |
| -------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------ | ------------------ |
| `rotation`           | {x:0,y:0,z:0} (via default)                 | `sceneRotation`                              | [0,0,0]                              | parity             |
| `position`           | {x:0.12,y:-0.02,z:0}                        | `sceneOffset`                                | [0.12,-0.02,0]                       | parity             |
| `positionMobile`     | {x:0,y:0,z:0}                               | — (no mobile offset)                         | —                                    | **Missing key**    |
| `scaleFactor`        | 0.85                                        | `sceneScale`                                 | 0.85                                 | parity             |
| `scaleFactorMobile`  | 1                                           | `sceneScaleMobile`                           | 1                                    | parity             |
| `rotate`             | !1 (false)                                  | `rotate`                                     | false                                | parity             |
| `mousemove`          | !1 (default)                                | —                                            | —                                    | **Missing key**    |
| `rotateAnimation`    | !1 (false)                                  | `rotateAnimation`                            | false                                | parity             |
| `entryFactor`        | 0.7                                         | `entryFactor`                                | 0.7                                  | parity             |
| `exitFactor`         | 0.3                                         | `exitFactor`                                 | 0.3                                  | parity             |
| `countFactor`        | 1 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `vertexRandomness`   | 0.1 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `textureScale`       | 1.5 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `thickness`          | 0.5 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `layers`             | 1 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `gridRandomness`     | 0 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `uSize`              | **10**                                      | `shader.size`                                | **9**                                | **Unreviewed drift** (D4 — stream point size) |
| `uDepth`             | 0.69                                        | `shader.depth`                               | 0.69                                 | parity             |
| `uAmplitude`         | 0.05                                        | `shader.amplitude`                           | 0.05                                 | parity             |
| `uFrequency`         | 1.7                                         | `shader.frequency`                           | 1.7                                  | parity             |
| `uDepthOut`          | **1** (overrides default 10)                | `depthOut`                                   | 1.0                                  | parity             |
| `uAmplitudeOut`      | **0.1** (overrides default 4)               | `amplitudeOut`                               | 0.1                                  | parity             |
| —                    | —                                           | `rotationVelocity`                           | [0,0,0]                              | parity (Maze rotate:false so no spin) |
| —                    | —                                           | `scrollRotation`                             | [0,0,0]                              | parity             |
| —                    | —                                           | `alphaOut`                                   | 0                                    | SoleMD-specific (exit-alpha floor) |
| —                    | —                                           | `shader.colorBase/colorNoise`                | MAZE_CYAN / MAZE_MAGENTA             | parity (moved from gd.getMaterial hard-coded pair; comment cites 42564–42569) |
| —                    | —                                           | `shader.funnelStart/End/Distortion/Thick/Narrow/Height/Width` | -0.18 / 0.3 / 1 / 0 / 0 / 0.4 / 2 | parity against `gd.getMaterial` stream block at 42583-42593 (funnel uniforms were material-factory hard-coded in Maze; moved into preset in SoleMD) |
| —                    | —                                           | `shader.stream`                              | 1                                    | parity (`uStream` flag) |
| —                    | —                                           | `shader.sizeMobile`                          | 6                                    | SoleMD-specific mobile override |

### Scene: `pcb`

| Maze key             | Maze value                                  | SoleMD preset field                          | SoleMD value                         | State              |
| -------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------------------ | ------------------ |
| `rotation`           | {x:-80, y:0, z:0} degrees                   | `sceneRotation`                              | [-80·π/180, 0, 0]                    | parity             |
| `position`           | {x:0,y:0,z:0.3}                             | `sceneOffset`                                | [0, 0, 0.3]                          | parity             |
| `positionMobile`     | {x:0,y:0,z:0} (default)                     | — (no mobile offset)                         | —                                    | **Missing key**    |
| `scaleFactor`        | 0.5                                         | `sceneScale`                                 | 0.5                                  | parity             |
| `scaleFactorMobile`  | 0.5 (via default)                           | `sceneScaleMobile`                           | 0.5                                  | parity             |
| `rotate`             | !1 (false)                                  | `rotate`                                     | false                                | parity             |
| `mousemove`          | !1 (default)                                | —                                            | —                                    | **Missing key**    |
| `rotateAnimation`    | !1 (false)                                  | `rotateAnimation`                            | false                                | parity             |
| `entryFactor`        | 0.5 (via default)                           | `entryFactor`                                | 0.5                                  | parity             |
| `exitFactor`         | 0.5 (via default)                           | `exitFactor`                                 | 0.5                                  | parity             |
| `countFactor`        | 1 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `vertexRandomness`   | 0.1 (via default)                           | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `textureScale`       | **0.5** (overrides default 1.5)             | (asset-pipeline band)                        | n/a                                  | sanctioned drift (value lives in per-asset call) |
| `thickness`          | **0** (overrides default 0.5)               | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `layers`             | 1 (via default)                             | (asset-pipeline band)                        | n/a                                  | sanctioned drift   |
| `gridRandomness`     | **0** (overrides default 0)                 | (asset-pipeline band)                        | n/a                                  | parity (value is same as default) |
| `uSize`              | 6                                           | `shader.size`                                | 6                                    | parity             |
| `uDepth`             | 0.3                                         | `shader.depth`                               | 0.3                                  | parity             |
| `uAmplitude`         | 0.05                                        | `shader.amplitude`                           | 0.05                                 | parity             |
| `uFrequency`         | 0.1                                         | `shader.frequency`                           | 0.1                                  | parity             |
| `uDepthOut`          | 10 (via default)                            | `depthOut`                                   | 0.3                                  | **Unreviewed drift** (D5) |
| `uAmplitudeOut`      | 4 (via default)                             | `amplitudeOut`                               | 0.05                                 | **Unreviewed drift** (D6) |
| —                    | —                                           | `rotationVelocity`                           | [0,0,0]                              | parity             |
| —                    | —                                           | `scrollRotation`                             | **[0, 0.12, 0]**                     | **Unreviewed drift** (D7 — no y-axis scroll tween on pcb in Maze; source of this value unclear) |
| —                    | —                                           | `alphaOut`                                   | 0                                    | SoleMD-specific |
| —                    | —                                           | `shader.colorBase/colorNoise`                | MAZE_CYAN / MAZE_MAGENTA             | parity |
| —                    | —                                           | `shader.sizeMobile`                          | 4                                    | **Unreviewed drift** (D8 — Maze pcb mobile `uSize` inherits default 8; reduced to 4 here without comment) |
| —                    | —                                           | `shader.stream`                              | 0                                    | parity (flag off) |
| —                    | —                                           | all `funnel*` keys                           | 0                                    | parity (not a funnel scene) |

### Scenes in Maze only (sanctioned omissions)

| Scene key     | Maze line | SoleMD state | Rationale                                    |
| ------------- | --------- | ------------ | -------------------------------------------- |
| `default`     | 42400     | Omitted as entry; each SoleMD preset is self-complete | architectural drift (see D9) |
| `blobProduct` | 42434     | Not ported   | not homepage-active (Maze uses on product pages); sanctioned omission per catalog.md § Phase 4 open-Q 3 (non-homepage scenes) |
| `sphere`      | 42442     | Not ported   | not homepage-active |
| `hex`         | 42483     | Not ported   | not homepage-active (B7 registry lists slug but no homepage anchor) |
| `shield`      | 42493     | Not ported   | not homepage-active |
| `cubes`       | 42503     | Not ported   | not homepage-active |
| `users`       | 42515     | Not ported   | not homepage-active |
| `globe`       | 42526     | Not ported   | not homepage-active |
| `error`       | 42535     | Not ported   | error-page scene — not homepage-active |

**Total**: 9 Maze scenes have no SoleMD counterpart. All are sanctioned
omissions per the catalog's known-gaps rationale (SoleMD is homepage-first;
non-homepage scenes are future-scope).

### Scenes in SoleMD only

None. SoleMD defines exactly three presets and all three map to Maze scenes.

## Drift items (C9 template)

### D1. blob `uSize` — preset override vs. Maze default inheritance

- **Maze reference**: `cs.default.uSize = 8` (42417); `cs.blob` does **not**
  override `uSize`, so effective value is 8.
- **SoleMD location**: `visual-presets.ts:153` — `shader.size: 10`.
- **Drift**: SoleMD blob uses `uSize: 10`, which is the Maze **stream** value
  (42477). Maze blob inherits the default 8. The comment block at
  `visual-presets.ts:113–116` cites only uFrequency/uAmplitude/uDepth and
  notes "uSize 10" as if that were the blob Maze value — it is not; 10 is
  the stream default override.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix (likely a copy/paste carry from stream tuning).
- **Proposed fix**: Verify visually whether the blob reads intentionally
  larger than Maze. If parity is the target, set `shader.size: 8` for blob.
  If 10 is the product-chosen value, add a one-line comment recording the
  rationale (e.g., "sized up from Maze 8 → 10 for landing punch at Round N").
- **Verification**: Side-by-side comparison of blob particle size with Maze
  at default viewport. Confirm `blob.shader.size` comment matches the
  chosen value.

### D2. blob `depthOut` drift (1.0 vs. Maze 10)

- **Maze reference**: `cs.default.uDepthOut = 10` (42421); blob doesn't override.
- **SoleMD location**: `visual-presets.ts:129` — `depthOut: 1.0`.
- **Drift**: 10× difference on the `uDepthOut` exit uniform. If the SoleMD
  shader multiplies this against distance, a 10× difference produces a
  markedly different exit depth. However, if `depthOut` is used as a
  scalar multiplier the Maze baseline may be extreme for a smaller viewport
  shell; unclear without reading BlobController.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix (visible on blob exit).
- **Proposed fix**: Confirm SoleMD's `depthOut` semantic — if it's a scalar
  multiplier on the exit-depth tween, ensure the intended visual matches
  Maze. Otherwise document why 1.0 was chosen.
- **Verification**: Scroll past blob exit trigger and compare the depth
  dissolve against Maze homepage reference capture.

### D3. blob `amplitudeOut` drift (0.8 vs. Maze 4)

- **Maze reference**: `cs.default.uAmplitudeOut = 4` (42422); blob doesn't override.
- **SoleMD location**: `visual-presets.ts:128` — `amplitudeOut: 0.8`.
- **Drift**: 5× difference on the `uAmplitudeOut` exit uniform. Same
  caveat as D2: unclear whether SoleMD uses this as a raw uniform or a
  scaled multiplier.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix.
- **Proposed fix**: Verify with BlobController timeline code (out of this
  audit's scope — flag to B6 auditor) whether 0.8 is a visual target or a
  scale mismatch.
- **Verification**: Same capture as D2.

### D4. stream `uSize` drift (9 vs. Maze 10)

- **Maze reference**: `cs.stream.uSize = 10` (42477).
- **SoleMD location**: `visual-presets.ts:196` — `shader.size: 9`.
- **Drift**: 10% reduction on stream particle size. No comment in
  visual-presets.ts explains this. Could be an intentional tuning for the
  denser SoleMD stream geometry or an inadvertent off-by-one.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix.
- **Proposed fix**: Decide whether 9 is a product-chosen tuning (document
  the rationale inline) or a copy error (restore to 10).
- **Verification**: Visual comparison of stream-point dot size against Maze.

### D5. pcb `depthOut` drift (0.3 vs. Maze 10)

- **Maze reference**: `cs.default.uDepthOut = 10`; pcb doesn't override.
- **SoleMD location**: `visual-presets.ts:214` — `depthOut: 0.3`.
- **Drift**: 33× reduction. Value 0.3 matches pcb's `uDepth` (0.3),
  suggesting the author intentionally set `depthOut` to the same depth
  value (i.e., no exit growth). This may be deliberate for the flat pcb
  scene but is not reviewed in any comment.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix (doc).
- **Proposed fix**: Add a one-line comment: "pcb is flat; exit depth matches
  scene depth to avoid z-growth on exit."
- **Verification**: Confirm the pcb exit doesn't balloon in z-space.

### D6. pcb `amplitudeOut` drift (0.05 vs. Maze 4)

- **Maze reference**: `cs.default.uAmplitudeOut = 4`; pcb doesn't override.
- **SoleMD location**: `visual-presets.ts:215` — `amplitudeOut: 0.05`.
- **Drift**: 80× reduction. Value 0.05 equals `amplitude`, matching the
  D5 pattern — exit amplitude = scene amplitude = no exit-time ripple
  growth.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix (doc).
- **Proposed fix**: Co-doc with D5.
- **Verification**: Confirm pcb exit doesn't amplify ripple.

### D7. pcb `scrollRotation` — SoleMD-invented Y-axis tween

- **Maze reference**: Not present in `cs.pcb`. Maze's `_m` controller (43615)
  is summarized in cartography as "simple z-position scroll timeline, no
  complex choreography" with no rotation tween.
- **SoleMD location**: `visual-presets.ts:212` — `scrollRotation: [0, 0.12, 0]`.
- **Drift**: SoleMD introduces a 0.12-radian Y-axis scroll rotation tween
  that has no Maze source. Value 0.12 matches the stream `sceneOffset.x`
  (0.12) — possibly a copy-paste, possibly intentional.
- **Ownership**: data (preset-level).
- **Severity**: Should-fix (investigate origin).
- **Proposed fix**: Trace the commit that introduced `pcb.scrollRotation =
  [0, 0.12, 0]`. If there's a product rationale (subtle tilt on scroll),
  record it; if it's a copy-paste, zero the tween for parity.
- **Verification**: Scroll through pcb chapter and check for Y-axis rotation.
  If none is desired, set to `[0,0,0]`.

### D8. pcb `sizeMobile` drift (4 vs. Maze default 8)

- **Maze reference**: `cs.default.uSize = 8`; pcb doesn't override uSize and
  has no separate mobile uSize (Maze applies `scaleFactorMobile` instead of
  per-uniform mobile variants for size).
- **SoleMD location**: `visual-presets.ts:240` — `shader.sizeMobile: 4`.
- **Drift**: SoleMD introduces a separate mobile `uSize` (4) for pcb,
  halving the desktop value (6). This is an architectural divergence —
  Maze scales mobile via `scaleFactorMobile` (0.5 for pcb), not via a
  per-uniform mobile variant. The net visual may still be close, but the
  mechanism differs.
- **Ownership**: data (preset-level, but indicates a shader-mobile
  architectural decision in SoleMD).
- **Severity**: Should-fix (doc).
- **Proposed fix**: Document the `sizeMobile` architectural choice in the
  `FieldShaderPreset` type docstring (SoleMD uses per-uniform mobile
  override in addition to `scaleFactorMobile`). Audit BlobController/
  StreamController/PcbController to confirm `sizeMobile` actually replaces
  `size` on mobile paths.
- **Verification**: On a mobile viewport, measure rendered pcb particle size
  and compare against Maze mobile pcb.

### D9. Missing `default` prototype-merge entry

- **Maze reference**: `cs.default` at 42400–42423 — 16 keys that every
  scene inherits from by prototype merge at the `yr` constructor.
- **SoleMD location**: Not present. Each preset in `visual-presets.ts` is
  fully self-contained.
- **Drift**: Architectural. Maze's model is a small per-scene diff off a
  shared default; SoleMD's model is explicit per-scene fields. Pros:
  SoleMD is type-safe and IDE-navigable. Cons: tuning the default is
  impossible in one place — a change to (e.g.) `entryFactor` must be
  repeated across all presets.
- **Ownership**: architecture.
- **Severity**: Nice-to-have (delegated).
- **Proposed fix**: Keep SoleMD's flat, explicit shape. Add a one-line
  comment at the top of `visual-presets` listing the Maze defaults so a
  future auditor can verify each preset's inherited values without
  cross-referencing this audit.
- **Verification**: See added comment block.

### D10. Missing `mousemove` feature across all presets

- **Maze reference**: `cs.default.mousemove = !1` (42407); overridden to
  `!0` for hex, shield, cubes, users, globe at 42488, 42498, 42508, 42520,
  42531.
- **SoleMD location**: Not present in the preset shape; a
  `mouse-parallax-wrapper.ts` exists in `renderer/` but is not controlled
  by the preset.
- **Drift**: Sanctioned — none of the three homepage-active scenes (blob,
  stream, pcb) uses `mousemove: true` in Maze (all inherit the default
  `false`). The feature is only relevant for non-homepage scenes.
- **Ownership**: architecture (delegated to renderer wrapper).
- **Severity**: Delegated.
- **Proposed fix**: None for B3. If future homepage scenes need mouse
  parallax, surface a `mousemove: boolean` flag on
  `FieldVisualPresetConfig` and wire it to the parallax wrapper.
- **Verification**: No action for B3.

### D11. Missing `positionMobile` across all presets

- **Maze reference**: `cs.default.positionMobile = {x:0,y:0,z:0}`;
  overridden by `stream` at 42476 (`{x:0,y:0,z:0}` — same as default, so
  explicit mobile zeroing) and `sphere` at 42447.
- **SoleMD location**: No `sceneOffsetMobile` field on the preset shape.
- **Drift**: All three active scenes inherit Maze's default (zero offset),
  so the net effective value matches — but the contract for mobile offset
  overrides doesn't exist in SoleMD. A future scene that needs a mobile
  position offset cannot express it in the preset.
- **Ownership**: data + architecture.
- **Severity**: Nice-to-have.
- **Proposed fix**: Add optional `sceneOffsetMobile?: Vec3` to
  `FieldVisualPresetConfig`. Populate only when an override is
  needed (do not require it for existing presets; defaults to
  `sceneOffset`).
- **Verification**: Type-only change. Confirm existing presets are
  unaffected.

## Sanctioned deviations

1. **Asset-pipeline band relocation** (`countFactor`, `vertexRandomness`,
   `textureScale`, `thickness`, `layers`, `gridRandomness`). Maze bundles
   these inside each `cs[slug]` entry so the `yr` constructor can pass them
   to `jo.fromVertices()` / `jo.fromTexture()` via `this.params`. SoleMD
   factors them out into per-call options on
   `FieldGeometry.fromTexture(imageLike, options)` and `fromVertices(…)`.
   **Canonical reference**:
   `.claude/skills/module/references/maze-asset-pipeline.md`
   § "Maze defaults" (lines ~108–122) and
   `round-12-module-authoring.md` § "PCB and other bitmap configs"
   (lines ~325–330). **Rationale**: asset generation is a per-surface
   imperative concern in SoleMD (a module loads its own source), whereas
   Maze's model is a one-shot static config. Keeping these out of the
   preset registry is correct per the module-authoring contract.

2. **Inactive-scene omissions** (9 scenes: default, blobProduct, sphere,
   hex, shield, cubes, users, globe, error). **Canonical reference**:
   `docs/agentic/maze-build-spec/catalog.md` § "Open questions for Phase 4"
   Q3 + Q5 and SKILL.md § "Homepage Section Inventory" (only
   section-welcome / section-graph / section-cta declare `data-gfx`).
   **Rationale**: SoleMD is homepage-first; non-homepage scenes are
   future-scope and sanctioned omissions.

3. **Funnel uniforms + color pair moved from `gd.getMaterial` factory to
   the preset**. Maze hard-codes stream funnel uniforms (funnelStart,
   funnelEnd, funnelDistortion, funnelNarrow, funnelThick, funnelWidth,
   funnelHeight) inside the material factory at 42583–42593, and hard-codes
   the cyan/magenta color pair at 42564–42569. SoleMD promotes both to
   `visual-presets.ts` so one file tunes both scalar uniforms and stream
   geometry. **Canonical reference**:
   `.claude/skills/module/references/maze-shader-material-contract.md`.
   **Rationale**: centralizing all per-scene tuning inside a single preset
   registry eliminates a factory-vs-data split that Maze only did for
   historical reasons.

4. **SoleMD-invented chapter-timeline floor values**
   (`alphaDiagramFloor`, `selectionHotspotFloor`). These encode a
   Round-9-era product decision (keep the blob silhouette readable through
   the diagram chapter; dim only the top 15% of particles at the hotspots
   beat). **Canonical reference**: inline comments at
   `visual-presets.ts:22–28` and `43–47`. **Rationale**: product-specified
   improvement over Maze's full-fade; recorded as sanctioned drift in the
   commit history.

5. **`rotationVelocity` scalar vs. Maze's hard-coded `+= 0.001`.** Maze
   spins every `rotate: true` scene at exactly `wrapper.rotation.y += 0.001`
   per frame (43048). SoleMD exposes the spin rate per-preset as
   `rotationVelocity: Vec3`, set to `[0, 0.06, 0]` for blob (60fps ×
   0.001 = 0.06 rad/sec — confirmed by the comment at 121–125).
   **Rationale**: surfacing the spin rate lets future presets tune it
   without monkey-patching the controller.

## Open questions

1. **`uSize` canonical source for blob**: D1 asks whether the blob's 10 is
   Maze-parity-breaking (should be 8) or product-chosen (stays 10). The
   comment block at `visual-presets.ts:113–116` is ambiguous — it lists
   "uSize 10" as if it were Maze's blob value when it's actually Maze's
   default (8) or stream (10). Recommend user or Phase 4 synth resolves.

2. **`*Out` uniform semantics across D2/D3/D5/D6**: SoleMD's
   `depthOut` / `amplitudeOut` values (0.3, 0.05, 0.8, 1.0) are
   dramatically smaller than Maze's (10, 4). Without reading the shader
   (B4) and BlobController timeline (B6), this audit cannot determine
   whether the SoleMD values are raw uniforms or scalar multipliers. Flag
   to B4 and B6 auditors: verify that the SoleMD shader applies these the
   same way Maze does — otherwise the visual exit transition is not
   parity.

3. **pcb `scrollRotation` origin**: D7 — was `[0, 0.12, 0]` intentional?
   If so, record; if copy-paste from stream's `sceneOffset.x`, zero it.

4. **`sizeMobile` architectural decision**: D8 — SoleMD introduces a
   per-uniform mobile override alongside `scaleFactorMobile`. Is this the
   intended contract, or should mobile particle size always flow through
   the scale factor? The `FieldShaderPreset` type should document
   the decision.

5. **Maze `mousemove` scenes**: D10 — even though homepage scenes don't
   use mouse parallax, the registry contract should either expose
   `mousemove: boolean` for future-scope completeness or document that
   mouse parallax is delegated to the renderer wrapper and not preset-
   driven.

6. **Maze `cs.default` elimination**: D9 — SoleMD has intentionally
   flattened the defaults into each preset. Phase 4 build spec should
   record that: (a) Maze's prototype-merge pattern at `yr` constructor
   (43041) does **not** port to SoleMD, and (b) the canonical per-scene
   shape is the explicit `FieldVisualPresetConfig` type. This
   prevents a future contributor from "adding back" a `default` entry.

7. **Naming rename**: Maze uses `u*` uniform prefixes
   (`uFrequency`/`uAmplitude`/…) to signal shader-uniform ownership.
   SoleMD drops the `u` prefix under `shader.*` (`frequency`/`amplitude`/…).
   This is a bike-shed but worth noting: the shader-side uniform names
   still carry the `u` prefix (see `field-shaders.ts`), so there's a
   naming mismatch at the preset-to-shader boundary. Confirm with B4
   auditor that the mapping is explicit (not relying on string prefix
   magic).

8. **Non-homepage scene ports**: Are `hex`, `shield`, `cubes`, `users`,
   `sphere`, `globe`, `blobProduct`, `error` **sanctioned future-scope**
   or **sanctioned omissions forever**? Phase 4 decision needed so the
   preset registry can either (a) stay closed to the current three or
   (b) gain a documented "to-be-ported" list.
