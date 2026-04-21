# B4 audit — Material + geometry shader pipeline (`gd` / `Fl` / `jo`) vs `field-shaders.ts` + `asset/*`

**Auditor**: agent-6
**Subsystem**: Bucket B4 — Material + geometry shader pipeline (catalog § B4, slice-06 §§ 5, 6, 7)
**Maze lines audited**: [42545, 42632] (`gd`), [42633, 42633] (`Fl = gd`), [42666, 42940] (`jo`), plus inline shaders at `index.html:2119-2393`
**SoleMD files audited**:
- `apps/web/features/field/renderer/field-shaders.ts`
- `apps/web/features/field/renderer/FieldScene.tsx` (material instantiation seam)
- `apps/web/features/field/controller/FieldController.ts` (`createLayerUniforms`)
- `apps/web/features/field/scene/visual-presets.ts` (stream/pcb defaults)
- `apps/web/features/field/asset/field-geometry.ts` (`sphere`, `stream`, `fromTexture`, `fromVertices`)
- `apps/web/features/field/asset/field-attribute-baker.ts` (`bakeFieldAttributes`)
- `apps/web/features/field/asset/point-source-registry.ts` (`createBlobSource`, `createStreamSource`, `createPcbSource`, `deriveColorBuffer`)
- `apps/web/features/field/asset/image-point-source.ts`
- `apps/web/features/field/asset/model-point-source.ts`
**Date**: 2026-04-19

## Summary

SoleMD's shader parity is high on the vertex transform pipeline and close-to-verbatim on GLSL. The shader source tracks Maze line-for-line — the same `fbm(vec4(x, uTime))` noise, the same `(1 + uAmplitude * vNoise)` amplitude multiply, the same `aMove * aSpeed * snoise_1_2(...)` drift, the same stream conveyor/funnel block, the same mobile 90-degree XY rotation, the same distance-based `gl_PointSize` and `vAlpha`, and the same fragment sprite multiply. Two deliberate divergences — collapsing Maze's six scalar color uniforms into a single pair of `vec3` uniforms (`uColorBase` / `uColorNoise`), and discarding sub-threshold fragments — are covered by `maze-shader-material-contract.md` and are SoleMD-favorable (the vec3 collapse eliminates Maze's `uBnoise - uGcolor` blue-channel typo by construction). The geometry side is where the interesting drift lives: `fromTexture` differs materially from Maze on depth-layer math (Maze uses `(random + 1) * thickness * layerIndex` which *forces the first layer to zero depth*, SoleMD uses `random * thickness * (layer + 1)` which does not), `fromVertices` uses centered jitter where Maze uses positive-only jitter, `fromTexture` drops Maze's sentinel bounding-box points, and the `fillWithPoints` volumetric primitive is absent in SoleMD. There is **no material factory**; `FieldScene.tsx` inlines material creation through R3F's `<shaderMaterial>` tag and `FieldController.createLayerUniforms`, which is a sanctioned architectural divergence (native R3F) but drops Maze's `vertexColors: true` flag and relocates the stream-branch logic from a material-time switch to preset data.

**Important outdated reference**: `maze-shader-material-contract.md` still documents a `uBaseColor: vec3` + `uBucketAccents: vec3[4]` + `aBucket`-indexed burst-overlay color model, and a five-uniform `uBurstType`/`uBurstStrength`/`uBurstColor`/`uBurstRegionScale`/`uBurstSoftness` overlay block. That lineage has been retired — the shipped shader is the single-pair `uColorBase` + `uColorNoise` model described by comments in `field-shaders.ts:1-11` (still driven by the rainbow-palette tween on the blob's `uColorNoise`). This audit treats the single-pair form as current truth and flags the SKILL doc as needing a refresh (D-DOC1) rather than flagging the code as drift.

## Parity overview

### Shader attribute family (buffer geometry)

| Attribute | Maze (`jo.addParams` + shader) | SoleMD (`bakeFieldAttributes` + shader) | Ownership | State |
| --- | --- | --- | --- | --- |
| `aAlpha` | float, `0.2 + random*0.8` | float, `0.2 + random*0.8` | shared bake | parity |
| `aIndex` | float, per-point index | float, per-point index | shared bake | parity |
| `aSelection` | float, `random()` uniform | float, `random()` uniform | shared bake | parity |
| `aStreamFreq` | float, bucket-keyed `{0.1 / -0.2 / -1.4 / 0.5}` | float, bucket-keyed same values | shared bake | parity |
| `aFunnelNarrow` | float, `{0.03/0.04/0.05/0.18}` | float, same values | shared bake | parity |
| `aFunnelThickness` | float, `{0.1/0.14/0.18/0.55}` | float, same values | shared bake | parity |
| `aFunnelStartShift` | float, `{0.42/0.28/0.1/-0.25}` | float, same values | shared bake | parity |
| `aFunnelEndShift` | float, `{0.29/-0.06/-0.29/-0.4}` | float, same values | shared bake | parity |
| `aMove` | vec3, `random * (±1) * 30` | vec3, `(random*2 - 1) * 30` | shared bake | drift (distribution) |
| `aSpeed` | vec3, `random()` | vec3, `random()` | shared bake | parity |
| `aRandomness` | vec3, `(random - 0.5) * 2 * {0, 1, 0.5}` | vec3, `(random - 0.5) * 2 * {0, 1, 0.5}` | shared bake | parity |
| `color` | vec3, HSL-sampled from 5-color palette (EFF0F0/02E8FF/42A4FE/8958FF/D409FE @ 5/30/30/10/10) | vec3, hex sampled from `SOLEMD_BURST_COLORS[bucket.id]`, constant-per-bucket | shared bake, live shader does not read | sanctioned |
| `aBucket` | not emitted | float, bucket index (0..N-1) | SoleMD-only | sanctioned |

### Vertex shader uniforms

| Uniform | Maze (`gd.getMaterial("Shader")`) | SoleMD (`createLayerUniforms` + shader) | State |
| --- | --- | --- | --- |
| `uPixelRatio` | float, `us` (devicePixelRatio clamp) | float, `min(getPixelRatio, 2)` per frame | parity (SoleMD clamp in FieldScene) |
| `uIsMobile` | bool, `!yi.desktop` | bool, from `FIELD_NON_DESKTOP_BREAKPOINT` (< 1024 px) | parity |
| `uScreen` | float, `innerHeight / (1512 * us)` | not emitted | sanctioned (contract: "provisioned but unused") |
| `uAlpha` | float, initial 0 | float, from preset (blob 0 until animateIn) | parity |
| `uTime` | float, initial 0 | float, driven by `field-loop-clock` singleton | parity |
| `uScale` | float, initial 0 | float, `1 / preset.sceneScale` initial | parity |
| `uSize` | float, 10 | float, `shader.size` (10 for blob/stream) | parity |
| `uSpeed` | float, 1 | float, `shader.speed` (1) | parity |
| `pointTexture` | `yo().load(gd.PARTICLE_TEXTURE)` (`/public/theme/images/particle.png`) | `getFieldPointTexture()` (procedural radial sprite) | drift (asset source) |
| `uDepth` | float, `cs.default.uDepth` | float, `shader.depth` per preset | parity (equivalent path) |
| `uAmplitude` | float, `cs.default.uAmplitude` | float, `shader.amplitude` per preset | parity |
| `uFrequency` | float, `cs.default.uFrequency` | float, `shader.frequency` per preset | parity |
| `uRcolor` / `uGcolor` / `uBcolor` | floats, `40 / 197 / 234` (cyan) | **collapsed into `uColorBase: vec3`** | sanctioned |
| `uRnoise` / `uGnoise` / `uBnoise` | floats, `202 / 50 / 223` (magenta) | **collapsed into `uColorNoise: vec3`** | sanctioned (removes Maze blue typo) |
| `uStream` | float, 0 (non-stream) / 1 (stream) | float, from preset | parity |
| `uSelection` | float, 1 | float, `shader.selection` (1) | parity |
| `uWidth` | float, stream only (2) | float, always present, 0 for non-stream / 2 for stream | drift (defensive) |
| `uHeight` | float, stream only (0.4) | float, always present, 0 / 0.4 | drift (defensive) |
| `uFunnelStart` | float, stream only (−0.18) | float, always present, 0 / −0.18 | drift (defensive) |
| `uFunnelEnd` | float, stream only (0.3) | float, always present, 0 / 0.3 | drift (defensive) |
| `uFunnelThick` | float, stream only (0) | float, always present | drift (defensive) |
| `uFunnelNarrow` | float, stream only (0) | float, always present | drift (defensive) |
| `uFunnelStartShift` | float, stream only (0) | float, always present | drift (defensive) |
| `uFunnelEndShift` | float, stream only (0) | float, always present | drift (defensive) |
| `uFunnelDistortion` | float, stream only (1) | float, always present (0 non-stream / 1 stream) | drift (defensive) |

### Vertex shader logic

| Stage | Maze `index.html:2334-2391` | SoleMD `field-shaders.ts:217-264` | State |
| --- | --- | --- | --- |
| `vNoise = fbm(position * (uFrequency + aStreamFreq * uStream))` | yes | yes | parity |
| color lerp `r = uRcolor/255 + clamp(vNoise,0,1)*4*(uRnoise-uRcolor)/255` (g analogous; **b uses `uBnoise - uGcolor`**) | yes (with blue typo) | `vColor = uColorBase + clamp(vNoise,0,1)*4*(uColorNoise - uColorBase)` (vec3 form, no typo) | sanctioned |
| `displaced *= (1 + uAmplitude * vNoise)` | yes | yes | parity |
| `displaced += vec3(uScale * uDepth * aMove * aSpeed * snoise_1_2(vec2(aIndex, uTime * uSpeed)))` | yes | yes | parity |
| Stream branch: x conveyor `displaced.x += uTime * uSpeed * uStream * 0.3` | yes | yes | parity |
| Stream branch: x wrap `displaced.x = mod(displaced.x - uWidth*0.5, uWidth) - uWidth*0.5` | yes | yes | parity |
| Stream branch: funnel thickness `mix(uFunnelThick + aFunnelThickness, uFunnelNarrow + aFunnelNarrow, t)` | yes | yes | parity |
| Stream branch: y shifts + z cosine warp | yes | yes | parity |
| Stream branch: mobile XY rotation `mat2(0, -1, 1, 0)` | yes | yes | parity |
| `vDistance = -mvPosition.z; gl_PointSize = uSize * 100 / vDistance * uPixelRatio` | yes | yes | parity |
| `clamp(gl_PointSize, 1.0, 100.0);` dead statement | yes (return discarded) | **omitted** | sanctioned (contract: "SoleMD omits the dead statement") |
| `vAlpha = uAlpha * aAlpha * (300.0 / vDistance); if (aSelection > uSelection) vAlpha = 0` | yes | yes | parity |

### Fragment shader

| Stage | Maze `index.html:2120-2130` | SoleMD `field-shaders.ts:268-288` | State |
| --- | --- | --- | --- |
| `vec4(vColor, vAlpha) * texture2D(pointTexture, gl_PointCoord)` | yes | yes | parity |
| `if (color.a <= 0.01) discard;` | no | yes | sanctioned (contract § "Fragment Shader Contract") |

### Material factory / stream funnel uniform set

| Concern | Maze `gd.getMaterial` | SoleMD | State |
| --- | --- | --- | --- |
| Factory shape | static class `gd` with `getMaterial(type, slug)` + `gd.PARTICLE_TEXTURE` | no factory; R3F `<shaderMaterial>` in `FieldScene.tsx` with uniforms built per controller via `createLayerUniforms`, `getFieldPointTexture()` for sprite | drift (sanctioned — native R3F) |
| Slug-time branch for `stream` | material-time conditional adds 9 stream-only uniforms | preset-time: stream-only uniforms always present; values driven by preset flags (`stream: 1`, `width: 2`, funnel defaults match Maze) | drift (sanctioned but contract-worthy) |
| `transparent: true` | yes | yes | parity |
| `depthTest: false` | yes | yes | parity |
| `depthWrite` | not set (THREE default: true) | **`depthWrite: false`** | drift |
| `vertexColors: true` | yes | **not set** | drift (live shader does not read `color`; visually inactive) |
| `blending` | `NormalBlending`, `?blending` → `AdditiveBlending` | `NormalBlending`, `?field-blending=additive` → `AdditiveBlending` | parity |
| `PARTICLE_TEXTURE` | `/public/theme/images/particle.png` | procedural canvas radial gradient (`getFieldPointTexture`) | drift (sprite substitution) |
| `Points` material (scene fallback) | provided | not provided; not used on homepage | N/A |
| `BgShader` (stars) | provided | not provided (outside B4 scope — stars controller isn't shipped) | out of scope |

### Geometry generator (`jo`)

| Method | Maze | SoleMD | State |
| --- | --- | --- | --- |
| `jo.generate("sphere"/"blob"/"blobProduct"/"error")` | 16384-point unit sphere via `getSphere` + `getPoint` rejection sampling | `FieldGeometry.sphere({ count: 16384 })` with same rejection sampling | parity |
| `jo.generate("stream")` | 15000 desktop / 10000 mobile, x in `[-2, 2]`, y = z = 0 | `FieldGeometry.stream` desktop 15000 / mobile 10000, spread 4, `(random - 0.5) * spread`, plus density-scale floor of 3600 | parity (density-scaling is additive) |
| `jo.fromModel(e)` | traverses scene graph, captures the last `Mesh.geometry` found | `collectVertexPositions` walks all meshes and **concatenates** positions | drift (functional improvement) |
| `jo.fromVertices(e, t, n)` | per-vertex jitter `+Math.random() * positionRandomness` (**positive-only**); `countFactor` loop with `Math.random() < countFactor % 1` partial emission | `FieldGeometry.fromVertices` uses `(random - 0.5) * positionRandomness` (**centered jitter**); partial-loop emission uses `random() >= remainder` skip | drift (jitter centering + partial-loop predicate) |
| `jo.fromTexture(e, t)` | reads **red channel only**, per-pixel jitter `+ Math.random() * gridRandomness` (positive-only); per-layer emits two Z points with `(Math.random() + 1) * thickness * layerIndex` and `-layerIndex * thickness * (1 + Math.random())` — **first layer collapses to z=0**; appends sentinel bounding-box points `(0,0,0)` and `(width, height, 0)` | `FieldGeometry.fromTexture` supports `channel: 'r'|'g'|'b'|'a'|'luma'`, jitter `(random - 0.5) * gridRandomness` (centered); per-layer emits two Z points with `depth = random * thickness * (layer + 1)` and `-depth`; **no sentinel points** | drift (depth model different, sentinel missing, channel choice) |
| `jo.fillWithPoints(e, t)` | ray-triangle intersection volumetric fill | **not implemented** | missing |
| `jo.getSphere(count, radius, center)` | `Float32Array`, rejection-sampled | `rejectionSampleSpherePoint` loop per-point | parity |
| `jo.getPoint(e, t)` | rejection sample + normalize + multiplyScalar | same | parity |
| `jo.addParams(e)` — attribute bake | 12 attrs + `color` from 5-color HSL palette; buckets keyed on `urgentFix / patchInSLA / ignore / notExploitable` with 15/40/100 cumulative within non-default 30%; random color drawn from `Tc.getPallette()` HSL | 12 attrs + `color` (bucket-constant from `SOLEMD_BURST_COLORS`) + `aBucket`; buckets keyed on `paper / entity / relation / evidence` with weighted draw (10/12/8/70) | drift (sanctioned — SoleMD relabels buckets; color sampling shape differs but shader ignores) |
| `Tc.getPallette` / `Tc.getColor` / `Tc.getHotspotColor` | yes | no (no palette object; color is a single bucket→hex map) | drift (feature-gap; unused by live shader but referenced by hotspot color) |

## Drift items

### D1. `fromTexture` first-layer depth collapses in Maze but not in SoleMD

- **Maze reference**: `scripts.pretty.js:42700-42711` —
  `f[u+2] = (Math.random() + 1) * n.thickness * _` and `f[u+2] = -1 * _ * n.thickness * (1 + Math.random())` where `_` is the 0-indexed layer. For the first layer (`_ = 0`), both expressions evaluate to `0`, so layer 0 produces two points at identical z=0, and the Z spread is driven entirely by layers ≥ 1.
- **SoleMD location**: `asset/field-geometry.ts:167-172` — `depth = random() * thickness * (layer + 1)`, emitted as `(+depth, -depth)`. For `layer = 0`, depth ∈ `[0, thickness]` (non-zero).
- **Drift**: With default `layers = 1`, Maze's output flattens the entire PCB point cloud to z = 0 (two coincident points per pixel), and the thickness knob does nothing. SoleMD's output spreads the single layer across `[-thickness, +thickness]`. This is likely a Maze bug — the `thickness` prop appears meaningless when `layers = 1`, which is the default — but it changes the PCB silhouette from 2D to 3D.
- **Severity**: Should-fix (decision, not code) — confirm with product whether the flat PCB plane is intended parity or whether SoleMD's depth spread is the preferred behavior. The `maze-shader-material-contract.md` does not sanction this divergence.
- **Verification**: Log unique z-values from the PCB source; compare to Maze live runtime via the same probe. If Maze actually presents a z-flat PCB plane, SoleMD should gate `thickness * (layer + 1)` behind a `spreadFirstLayer: false` flag that defaults to Maze behavior.

### D2. `fromTexture` drops Maze's sentinel bounding-box points

- **Maze reference**: `scripts.pretty.js:42714-42719` — after the per-pixel loop, Maze appends six floats: `(0, 0, 0)` and `(width, height, 0)` (two sentinel "corner" points in image-pixel coordinates).
- **SoleMD location**: `asset/field-geometry.ts:156-180` — emits only sampled pixels; no sentinels.
- **Drift**: Maze's sentinel points force the resulting geometry's bounding box to span the full raster footprint even when the lit region is interior. Without sentinels, SoleMD's bounds (computed in `computeBounds`) contract to the lit region's convex hull. This affects downstream `updateScale` math (which divides by `sourceHeight`).
- **Severity**: Should-fix (parity-critical for any image-backed scene that relies on `updateScale`-derived scene-units; currently no live surface uses `fromTexture` except the procedural PCB bitmap which computes a symmetric range)
- **Verification**: Call `FieldGeometry.fromTexture(logoImage)` and compare bounding box to Maze's in a side-by-side test. If the lit-region hull and raster hull differ, add the sentinels (guarded by an `appendExtents: true` default to preserve Maze parity).

### D3. `fromVertices` uses centered jitter where Maze uses positive-only

- **Maze reference**: `scripts.pretty.js:42737-42739` — `c.getX(h) + Math.random() * i.positionRandomness` (jitter is `[0, positionRandomness]`, always adds).
- **SoleMD location**: `asset/field-geometry.ts:211-213` — `vx + (random() - 0.5) * positionRandomness` (jitter is `[-0.5*pR, +0.5*pR]`, zero-mean).
- **Drift**: Maze's bias shifts every jittered point toward the positive octant by `positionRandomness/2`; the overall point cloud translates by a small vector from the source mesh centroid. With default `positionRandomness = 0.01`, the bias is 0.005 — negligible visually but numerically measurable. SoleMD's centered jitter is likely the correct choice, but it is a silent divergence.
- **Severity**: Nice-to-have
- **Proposed fix**: Document in `image-particle-conformation.md` that SoleMD's `fromVertices` uses centered jitter as an intentional improvement over Maze. If a future model-backed scene ever needs Maze-exact jitter for parity, add a `jitterMode: 'positive' | 'centered'` option.

### D4. `fromVertices` partial-loop predicate differs from Maze

- **Maze reference**: `scripts.pretty.js:42732-42736` — emits when `(Math.random() < i.countFactor % 1 || u < a - 1 || i.countFactor === 1)`, where `a = ceil(countFactor)`. Partial emission probability only applies to the trailing loop *and* Maze short-circuits on `countFactor === 1`.
- **SoleMD location**: `asset/field-geometry.ts:208-209` — marks trailing-partial loop via `isTrailingPartial = loop === wholeLoops - 1 && remainder > 0`, then skips on `random() >= remainder`.
- **Drift**: Functionally equivalent for integer `countFactor` (Maze's `countFactor === 1` short-circuit, SoleMD's `remainder > 0` guard both mean "always emit"). For non-integer `countFactor`, both paths skip the trailing loop with probability `1 - remainder`. Equivalent in distribution, but implementation shape differs.
- **Severity**: Doc-only
- **Proposed fix**: Add an assertion-style test covering non-integer `countFactor` with a deterministic RNG and confirm the emitted-vs-dropped count is within 1 of the ceil/floor envelope.

### D5. `jo.fromModel` captures only last mesh; SoleMD concatenates all

- **Maze reference**: `scripts.pretty.js:42666-42675` — traverses model, assigns `t = n.geometry` on every `Mesh` hit. Final value of `t` is **only the last mesh visited** (iteration order in `Object3D.traverse`).
- **SoleMD location**: `asset/model-point-source.ts:21-53` — `collectVertexPositions` walks every node and concatenates *all* mesh positions into a single Float32Array.
- **Drift**: Maze silently drops every mesh except the last. If a GLB has multiple child meshes (common for `Shield.glb`, `World.glb`), Maze would only sample the final child. SoleMD samples all.
- **Severity**: Doc-only — this is clearly a Maze quirk, not an intentional design. SoleMD's behavior is correct for multi-mesh sources.
- **Proposed fix**: Document the divergence in `image-particle-conformation.md` § "Wiring checklist". No behavior change needed.

### D6. No `jo.fillWithPoints` volumetric primitive

- **Maze reference**: `scripts.pretty.js:42746-42782` — `fillWithPoints(e, t)` uses ray-triangle intersection (`Ray.intersectTriangle`) to place `t` points uniformly inside a closed mesh's volume.
- **SoleMD location**: not implemented
- **Drift**: SoleMD has surface-sampling (`fromVertices`) and raster sampling (`fromTexture`), but no volumetric sampling. No current surface uses `fillWithPoints` — Maze itself uses it for none of the homepage scenes — but the primitive is listed alongside `fromVertices` / `fromTexture` / `fromModel` in the `jo` API surface.
- **Severity**: Nice-to-have (future storyboard chapters that need inside-of-volume point clouds, e.g. organ cross-sections, would need this)
- **Proposed fix**: Add `FieldGeometry.fillVolume(model, count, options)` when a surface actually needs it. Do not build speculatively.

### D7. `jo.addParams` palette object `Tc` is absent; no per-point HSL color sampling

- **Maze reference**: `scripts.pretty.js:42634-42664` — `Tc.getPallette()` returns a 5-color HSL palette (`#EFF0F0 5%`, `#02E8FF 30%`, `#42A4FE 30%`, `#8958FF 10%`, `#D409FE 10%`). `addParams` draws `H = random * totalAmount`, finds the matching palette slot by cumulative range, then jitters lightness by `±T` (T = 0.01).
- **SoleMD location**: `asset/point-source-registry.ts:153-163` (`deriveColorBuffer`) — maps each point's `aBucket` index to a constant `SOLEMD_BURST_COLORS[bucket.id]` hex; no HSL jitter, no cumulative-range palette draw.
- **Drift**: Maze's per-point color distribution has four distinct hues plus a white highlight with lightness jitter. SoleMD has four distinct hues, no jitter, deterministic from bucket id. Live shader ignores the `color` attribute (confirmed by `maze-shader-material-contract.md` § "Shader-Active Attribute Family"), so the visible result is unchanged. The legacy `getPointColorCss` hotspot sampler *does* read this buffer.
- **Severity**: Doc-only — sanctioned per contract. Flagged here so the Phase 4 synthesis doesn't reintroduce `Tc.getPallette` during a refactor.
- **Proposed fix**: Reconfirm in `maze-shader-material-contract.md` that SoleMD's bucket-constant color fallback is the sanctioned form. Keep the `Tc.getHotspotColor` → `2281695` (#22CCDF) constant color pinned for the hotspot DOM ring if Phase 4 adds a hotspot-color uniform pipeline.

### D8. `aMove` distribution differs from Maze

- **Maze reference**: `scripts.pretty.js:42869-42871` — `Math.random() * (Math.random() < 0.5 ? 1 : -1) * 30`. This is a triangular distribution around zero with a hard zero-density at zero (because `random * ±1` never sits exactly at zero with equal mass as at ±15).
- **SoleMD location**: `asset/field-attribute-baker.ts:153-155` — `(random * 2 - 1) * 30`, uniform `[-30, 30]`.
- **Drift**: The two distributions have the same mean (0) and support (`[-30, 30]`) but different variance. Maze's distribution concentrates mass away from zero (each axis' magnitude is `random()` which has mean 0.5 and max 1, multiplied by 30, with a fair coin flip on sign — expected `|aMove|` = 15). SoleMD's uniform distribution has expected `|aMove|` = 15 as well, but the PDF is flat, not triangular. In practice this biases which points drift the least (points with near-zero `aMove` are rarer under Maze).
- **Severity**: Nice-to-have — shader visible difference is minor; the drift manifests as a slight reduction in the number of "stationary" points under Maze.
- **Proposed fix**: If strict parity matters, swap SoleMD's `aMove` generator for `random() * (random() < 0.5 ? 1 : -1) * moveRange` and regenerate fixtures. Document the change in `field-attribute-baker.ts`.

### D9. No material factory; stream-branch logic relocated from material-time to preset-time

- **Maze reference**: `scripts.pretty.js:42545-42595` — `gd.getMaterial("Shader", slug)` returns a `ShaderMaterial`; if `slug === "stream"`, the factory attaches nine stream-only uniforms (`uWidth`, `uHeight`, `uFunnelStart`, `uFunnelEnd`, `uFunnelThick`, `uFunnelNarrow`, `uFunnelStartShift`, `uFunnelEndShift`, `uFunnelDistortion`) after construction.
- **SoleMD location**: `renderer/FieldScene.tsx:91-100` inlines `<shaderMaterial>` via R3F JSX; `controller/FieldController.ts:170-201` (`createLayerUniforms`) builds the uniform bag, always emitting all nine funnel uniforms with preset values (zero for non-stream, Maze defaults for stream).
- **Drift**: No runtime-visible difference — the GPU sees the same uniform set. The architectural shape differs: Maze has a central `gd.getMaterial` with a `switch` on slug; SoleMD has no `getMaterial` function and wires the slug-specific values through preset data (`visual-presets.ts:160-200`).
- **Severity**: Delegated — sanctioned by `maze-particle-runtime-architecture.md` § "Controller Hierarchy And R3F Boundary" ("React / R3F owns ... scene graph declaration ... Controllers own ... `createLayerUniforms`").
- **Proposed fix**: None. Document in `maze-shader-material-contract.md` that SoleMD replaces Maze's `gd.getMaterial("Shader", slug)` with `new Controller({ id, preset }).createLayerUniforms(isMobile, pointTexture)`, where the slug→stream-uniform branch has been moved to `visualPresets[slug].shader`.

### D10. `vertexColors: true` dropped from material; `depthWrite: false` added

- **Maze reference**: `scripts.pretty.js:42579` — `vertexColors: !0`.
- **SoleMD location**: `renderer/FieldScene.tsx:93-96` — sets `transparent`, `depthTest={false}`, `depthWrite={false}`, `blending`. No `vertexColors`.
- **Drift**:
  - `vertexColors: true` — Maze sets it, but the live shader does not `attribute vec3 color` and does not use Three's built-in vertex-color plumbing. The flag is decorative. Dropping it in SoleMD is silent.
  - `depthWrite: false` — Maze relies on `depthTest: false` alone (which with the default `depthWrite: true` would still write depth, but every other layer uses `depthTest: false` too so ordering is by draw order). SoleMD adds `depthWrite: false` as defense-in-depth. This is a minor semantic tightening, not a visible drift.
- **Severity**: Doc-only (flag semantics only)
- **Proposed fix**: Note both flag differences in `maze-shader-material-contract.md` § "Shared Material Family". No code change.

### D11. `pointTexture` swapped from PNG asset to procedural canvas sprite

- **Maze reference**: `scripts.pretty.js:42560, 42632` — `new yo().load(gd.PARTICLE_TEXTURE)` with `PARTICLE_TEXTURE = "/public/theme/images/particle.png"`. The PNG is a soft radial gradient sprite at a fixed resolution.
- **SoleMD location**: `renderer/field-point-texture.ts` via `getFieldPointTexture()` (module cache) — procedural canvas-drawn radial gradient.
- **Drift**: Not visible in the parity overview above because the audit treats `pointTexture` as one uniform, but the asset behind it differs. Maze's PNG is authored; SoleMD's is code-generated. Visual parity depends on whether the procedural gradient falloff matches Maze's PNG falloff.
- **Severity**: Should-fix (sprite shape affects every point's visual weight; mismatch would propagate to hotspot readability and depth hierarchy)
- **Verification**: Render both sprites at the same `gl_PointSize` and compare alpha profiles along a diameter. If they diverge by more than ~5% at any radius, either (a) ship Maze's PNG as the sprite asset, or (b) tune the procedural gradient's inner/outer-radius falloff to match.

### D-DOC1. `maze-shader-material-contract.md` documents a retired color/burst pipeline

- **Reference**: `.claude/skills/module/references/maze-shader-material-contract.md` § "Uniform Family" and § "SoleMD burst overlay uniforms".
- **Current doc claim**: SoleMD replaces the six scalar color uniforms with `uBaseColor: vec3` + `uBucketAccents: vec3[4]` indexed by `aBucket`, and adds five burst-overlay uniforms (`uBurstType`, `uBurstStrength`, `uBurstColor`, `uBurstRegionScale`, `uBurstSoftness`) that modulate a bucket-gated noise field.
- **Actual shipped state**: `field-shaders.ts` declares `uniform vec3 uColorBase` and `uniform vec3 uColorNoise` (single Maze-shape pair collapsed to vec3). No bucket-accent array. No burst-overlay uniforms. No `aBucket` read in the shader (it's still baked on the geometry but only consumed by `deriveColorBuffer` CPU-side). The blob's rainbow cycle comes from `BlobController` tweening `uColorNoise` through `LANDING_RAINBOW_RGB`, per the comment at `field-shaders.ts:1-11`.
- **Severity**: Doc-only — this is a documentation regression, not a code regression. The shipped shader is *closer* to Maze than the SKILL doc describes.
- **Proposed fix**: Update `maze-shader-material-contract.md` § "Uniform Family" to describe the current single-pair `uColorBase` + `uColorNoise` model; delete or move the "SoleMD burst overlay uniforms" section to a "Retired (Round 14)" appendix; keep the vec3-collapse rationale (blue-channel typo removal by construction).

## Sanctioned deviations encountered

1. **Color-uniform vec3 collapse** — Maze ships six scalar uniforms (`uRcolor`, `uGcolor`, `uBcolor`, `uRnoise`, `uGnoise`, `uBnoise`); SoleMD ships two vec3 uniforms (`uColorBase`, `uColorNoise`). The collapse naturally removes Maze's blue-channel typo (`uBnoise - uGcolor` should be `uBnoise - uBcolor`). Sanctioned via `maze-shader-material-contract.md` § "Parity-Sensitive Quirks" first bullet (historically) and via the shader-file comment at `field-shaders.ts:1-11` (currently).

2. **Fragment `discard` on sub-threshold alpha** — Maze always writes, SoleMD discards when `color.a <= 0.01`. Sanctioned via contract § "Fragment Shader Contract": "this is a pure performance win and does not change the visual result under normal or additive blending."

3. **`clamp(gl_PointSize, 1.0, 100.0)` dead-statement omitted** — Maze emits but discards the return; SoleMD omits. Sanctioned via contract § "Point Size And Alpha": "Maze's shader calls `clamp(...)` but discards the return value. SoleMD does not emit that dead statement."

4. **`uScreen` omitted** — Maze provisions but does not read; SoleMD omits. Sanctioned via contract § "Parity-Sensitive Quirks": "`uScreen` exists but is inactive."

5. **`aBucket` attribute and bucket relabelling** — SoleMD-only attribute indexed in `SOLEMD_DEFAULT_BUCKETS`; Maze uses string-keyed buckets `urgentFix / patchInSLA / ignore / notExploitable` with identical motion values. Sanctioned via contract § "Shader-Active Attribute Family" and `field-attribute-baker.ts:1-9`.

6. **Per-point `color` bake from bucket-constant map** — Maze draws from a 5-color HSL palette; SoleMD uses a bucket-keyed constant. Live shader ignores; sanctioned via contract § "Shader-Active Attribute Family" (for the inactive-but-present treatment) and § "Parity-Sensitive Quirks".

7. **No material factory; R3F `<shaderMaterial>` + `createLayerUniforms` replaces `gd.getMaterial`** — Sanctioned via `maze-particle-runtime-architecture.md` § "Controller Hierarchy And R3F Boundary".

8. **`?blending` URL param renamed to `?field-blending=additive`** — Sanctioned via contract § "Shared Material Family" and `FieldScene.tsx:40-52` (`resolveFieldBlending`).

## Open questions for build-spec synthesis

1. **`fromTexture` first-layer depth behavior**: Phase 4 must pick one of: (a) ship Maze-exact behavior (first layer z=0 when `layers=1`, default), (b) ship SoleMD's current depth-spread as intentional parity improvement, or (c) expose `spreadFirstLayer` flag. Current live surfaces (PCB) don't hit the code path, so the decision is for future image-backed layers.

2. **`fromTexture` sentinel bounding-box points**: Does the build spec expect `updateScale` to divide by the *raster height* (Maze's sentinel behavior) or by the *lit-region height* (SoleMD's current behavior)? Recommend the raster height to match Maze, and restore the sentinels behind an `appendExtents: true` default.

3. **Point sprite asset source**: Is procedural canvas parity sufficient, or should SoleMD ship Maze's `particle.png`? The sprite drives the foreground/midground/background read (contract § "Foreground, Midground, Background"). Recommend auditing the alpha-profile match with a side-by-side tonemap before Phase 4 closes.

4. **Burst-overlay revival**: `maze-shader-material-contract.md` still documents a burst-overlay uniform family that is not in the code. Phase 4 must decide: delete from the contract doc, or reintroduce on a controller (most plausibly `BlobController`) for a future chapter. Currently the feature is vestigial.

5. **`Tc.getHotspotColor`**: The hotspot ring color `#22CCDF` (Maze `2281695`) is hard-coded in CSS/DOM but has no TS constant. Recommend adding `MAZE_HOTSPOT_COLOR = 0x22CCDF` to `accent-palette.ts` so future hotspot work on wiki/module surfaces has one source of truth.

## Scope discoveries (Phase 1 re-slicing signal)

Bucket scope is correct. B4 cleanly spans the shader material factory (`gd` at 42545), its alias (`Fl` at 42633), the geometry generator (`jo` at 42666), and the funnel-uniform set (42583–42593). Adjacent `Tc` palette class (42634–42664) and `vd` asset registry (42941+) sit outside B4 and belong in B5. The inline HTML shaders (`index.html:2119-2393`) are intrinsic to B4 and were audited as required source even though they live outside `scripts.pretty.js`.

One cross-bucket edge worth flagging for synthesis: the stream funnel uniform set is authored in `gd.getMaterial` (B4) but consumed by `ug`/`StreamController` (B6) and by `cs.stream` scene params (B3). All three must agree on default values. Currently they do (B3 matches Maze; `FieldController.createLayerUniforms` reads from B3). Phase 4 should lock `cs.stream.*` as the single source of truth and delete the hard-coded defaults from the material factory equivalent.

## Format feedback for Phase 3

**Strengths for this bucket**: The catalog's explicit split of attributes / uniforms / vertex logic / fragment logic / geometry generator into four sub-tables was the right structure; the parity matrix above fits cleanly because the shader is small enough to table-compare line-by-line. Severity labels `Delegated` and `Sanctioned` from the pilot's feedback were useful here — B4 has heavy sanctioned-deviation weight and a `Delegated` label separate from `Must-fix/Should-fix` kept the drift-item list honest.

**Recommendations for Phase 4**:

1. **Sanction-doc synchronization gate**: Before Phase 4 writes the build spec, run a pass that diffs every "sanctioned" claim in the SKILL reference docs against the shipped code. D-DOC1 in this audit would have been caught earlier. Recommend a `.claude/skills/module/references/CONTRACT-LINT.md` checklist agents run after any material/shader edit.

2. **Shader-file one-liner provenance**: The comment at `field-shaders.ts:1-11` cites Maze lines. Every such provenance block should also cite the SKILL doc section that sanctions the deviation. Currently there's a one-way pointer (code → Maze) and the reverse (SKILL doc → code file) is implicit.

3. **Geometry-generator audit template**: B4 benefitted from a method-by-method table (`fromVertices` / `fromTexture` / `fromModel` / `fillWithPoints` / `generate` / `addParams`). Future buckets with a similar "N static methods on one class" shape (B5's bitmap/FBX source classes, B7's controller registry) should adopt the same per-method parity table format.

4. **Distribution-shape drift is a real category**: D8 (`aMove` triangular-vs-uniform) and D3 (`fromVertices` centered-vs-positive jitter) are distribution drifts, not logic drifts. They pass unit tests that assert "mean is zero" but fail tests that assert "matches Maze PDF." Recommend Phase 4 add a statistical-parity section to the build spec with specific PDF-matching criteria for `aMove`, `aSpeed`, `aRandomness`, and `fromVertices` jitter.
