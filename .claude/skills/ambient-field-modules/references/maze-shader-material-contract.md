# Maze Shader Material Contract

Use this reference when a task touches point attributes, uniforms, shaders,
point sprite treatment, or scene preset values.

Source ground truth:

- shader code: `index.html:2119-2393`
- material factory: `scripts.pretty.js:42545-42595`
- default color pair: `scripts.pretty.js:42564-42569`
- stream material branch: `scripts.pretty.js:42577-42581`
- `?blending` URL param: `scripts.pretty.js:42580`

Round-12 SoleMD implementation lives in
`apps/web/features/ambient-field/renderer/field-shaders.ts` and
`apps/web/features/ambient-field/scene/visual-presets.ts`. The old pulse-era
uniform family (`uPulseRate`, `uPulseStrength`, `uPulseThreshold`,
`uPulseSoftness`, vec3 `uColorBase` / `uColorNoise`, per-point `color` read)
has been fully retired; do not reintroduce it.

## Shared Material Family

Maze uses one shared particle material factory:

```text
geometry source
  ->
jo.addParams(...)
  ->
Fl.getMaterial("Shader", slug)
  ->
new THREE.Points(...)
```

Important implications:

- procedural, bitmap, and model-backed scenes all converge on the same shader
  family
- `stream` is the only slug with a material-time branch
- scene identity comes primarily from source coordinates plus preset values, not
  from bespoke per-scene materials

Default material behavior:

- `transparent = true`
- `depthTest = false`
- default blending is normal blending
- additive blending only appears behind the `?blending` debug switch

Do not assume "premium glow" means additive blending by default. SoleMD exposes
the same toggle via `?field-blending=additive` in `resolveFieldBlending()`.

## Shader-Active Attribute Family

The live particle shaders consume:

- `aAlpha`
- `aIndex`
- `aSelection`
- `aStreamFreq`
- `aFunnelNarrow`
- `aFunnelThickness`
- `aFunnelStartShift`
- `aFunnelEndShift`
- `aMove`
- `aSpeed`
- `aRandomness`
- `aBucket` (SoleMD-only, round-12 addition)

Geometry also carries:

- `color`

Important quirks:

- `color` is injected on the geometry, but the live particle shaders do not
  read it. Maze's 5-color palette bake
  (`scripts.pretty.js:42641-42664`: `#EFF0F0 5%`, `#02E8FF 30%`, `#42A4FE 30%`,
  `#8958FF 10%`, `#D409FE 10%`) is decorative.
- SoleMD keeps a small `color` buffer filled from a bucket-color fallback map
  (`paper=#42A4FE`, `entity=#8958FF`, `relation=#02E8FF`, `evidence=#D409FE`)
  only to keep the legacy `getPointColorCss` hotspot sampler working until
  Phase 7 retires it.
- `aBucket` is a float holding the bucket index (0..N-1) in
  `SOLEMD_DEFAULT_BUCKETS` order. The Phase-4 burst overlay uses it as a gate.

For parity work, treat `color` as present-but-inactive unless the shader family
is intentionally rewritten.

## Uniform Family

Shared uniforms (Maze):

- `uPixelRatio`
- `uIsMobile`
- `uScreen`
- `uAlpha`
- `uTime`
- `uScale`
- `uSize`
- `uSpeed`
- `pointTexture`
- `uDepth`
- `uAmplitude`
- `uFrequency`
- `uRcolor`
- `uGcolor`
- `uBcolor`
- `uRnoise`
- `uGnoise`
- `uBnoise`
- `uStream`
- `uSelection`

Color uniforms are six scalars, not two vec3s. Do not collapse them back into
`uColorBase` / `uColorNoise` vec3 pairs; that was the round-≤11 pulse-era
shape and has been removed. The scalar form matches Maze
(`scripts.pretty.js:42564-42569`: `uRcolor=40, uGcolor=197, uBcolor=234`
cyan base; `uRnoise=202, uGnoise=50, uBnoise=223` magenta noise).

Stream-only uniforms:

- `uWidth`
- `uHeight`
- `uFunnelStart`
- `uFunnelEnd`
- `uFunnelThick`
- `uFunnelNarrow`
- `uFunnelStartShift`
- `uFunnelEndShift`
- `uFunnelDistortion`

SoleMD burst overlay uniforms (added round 12, no Maze counterpart):

- `uBurstType` — float bucket id to activate; `< 0` disables the overlay
- `uBurstStrength` — overlay amount in `[0, 1]`
- `uBurstColor` — vec3 tint color
- `uBurstRegionScale` — noise frequency controlling the tint patch size
- `uBurstSoftness` — smoothstep width for the bucket-region envelope

Important quirk:

- `uScreen` is provisioned on the material but unused by the inline particle
  shaders

## Exact Transform Order

The shared vertex path is:

```text
position
  ->
vNoise = fbm(position * (uFrequency + aStreamFreq * uStream))
  ->
vColor from uR/G/Bcolor + uR/G/Bnoise (binary lerp, x4)
  ->
burst overlay (SoleMD):
  bucketGate = (uBurstType >= 0) ? step(0.5, 1 - |aBucket - uBurstType|) : 0
  burstField = 0.5 + 0.5 * snoise(position * uBurstRegionScale + uTime * 0.4)
  burstEnv   = smoothstep(0.5 - uBurstSoftness, 0.5 + uBurstSoftness, burstField) * uBurstStrength
  burstBoost = clamp(bucketGate * burstEnv, 0, 1)
  vColor     = mix(vColor, uBurstColor * (1 + 0.22 * vNoise), burstBoost)
  ->
displaced = position
  ->
displaced *= (1.0 + uAmplitude * vNoise)
  ->
displaced += uScale * uDepth * aMove * aSpeed * snoise_1_2(aIndex, uTime * uSpeed)
  ->
if uStream > 0:
  conveyor motion
  wrap x into stream width
  funnel thickness and y shift
  z cosine warp
  90 degree non-desktop rotation
  ->
modelView / projection
  ->
distance-based point size
  ->
distance-based alpha and selection cut, then vAlpha *= 1 + 0.35 * burstBoost
```

The amplitude multiply is global, not blob-only. Blob scenes just reveal it
more clearly because their source geometry is spherical.

The burst overlay block replaces the old "rainbow confetti" path (triple
`snoise` accent pyramid reading the per-point `color` attribute at
`field-shaders.ts:222-286` before round 12). It is bucket-coherent,
monochromatic, and time-continuous.

## Point Size And Alpha

Perspective importance is a core part of the look:

- `gl_PointSize = uSize * 100.0 / vDistance * uPixelRatio`
- `vAlpha = uAlpha * aAlpha * (300.0 / vDistance)`
- points with `aSelection > uSelection` are hidden by zeroing alpha
- SoleMD additionally multiplies `vAlpha *= 1.0 + 0.35 * burstBoost` so burst
  regions read as luminous sweeps, not flat color overlays

Important quirk:

- Maze's shader calls `clamp(gl_PointSize, 1.0, 100.0);` but discards the
  return value. SoleMD does not emit that dead statement; the behavior is
  unchanged.

If SoleMD fixes that in a parity rebuild, document it as an intentional
divergence.

## Fragment Shader Contract

The fragment path is minimal:

```glsl
gl_FragColor = vec4(vColor, vAlpha);
gl_FragColor *= texture2D(pointTexture, gl_PointCoord);
```

SoleMD divergence: after multiplying in the sprite, the fragment shader
discards samples with `color.a <= 0.01` to cut fill-rate on feathered sprite
edges. This is a pure performance win and does not change the visual result
under normal or additive blending.

There is no extra lighting model in the fragment shader. The look comes from:

- source coordinates
- noise/deformation
- point sprite texture
- distance-scaled size/alpha
- burst overlay tint (SoleMD)

## Stream Branch Constants

Material defaults for `stream`:

- `uStream = 1`
- `uWidth = 2`
- `uHeight = 0.4`
- `uFunnelStart = -0.18`
- `uFunnelEnd = 0.3`
- `uFunnelThick = 0`
- `uFunnelNarrow = 0`
- `uFunnelStartShift = 0`
- `uFunnelEndShift = 0`
- `uFunnelDistortion = 1`

Preset-level stream values:

- `uDepth = 0.69`
- `uAmplitude = 0.05`
- `uFrequency = 1.7`
- `uSize = 10`

The mobile rotation branch is:

- 90 degree XY rotation whenever `uIsMobile` is true
- `uIsMobile` means every non-desktop width below `1024px`

## Shared Preset Constants Worth Preserving

- `NUM_OCTAVES = 5`
- runtime increments `uTime += 0.002` (foreground) via `FieldLoopClock`
  singleton at `renderer/field-loop-clock.ts`
- default `uSize = 10`
- blob preset:
  - `uDepth = 0.5`
  - `uAmplitude = 0.4`
  - `uFrequency = 0.7`
- pcb preset:
  - `uDepth = 0.3`
  - `uAmplitude = 0.05`
  - `uFrequency = 0.1`
  - `uSize = 6`

## Parity-Sensitive Quirks

These are strange enough that agents may "fix" them by accident:

- blue channel mixes with `uBnoise - uGcolor`, not `uBnoise - uBcolor`. The
  typo is preserved verbatim in SoleMD with an inline comment; swapping it
  alters the purple bias of the field. See `field-shaders.ts` around the
  `vColor` assignment.
- `uScreen` exists but is inactive
- geometry `color` exists but is inactive for the live shader (SoleMD still
  writes it for the legacy hotspot color sampler; see Attribute Family note
  above)
- point-size `clamp(...)` is a no-op in Maze; SoleMD omits the dead statement

If SoleMD changes any of these, do it deliberately and record the divergence.

## Implementation Rules For SoleMD

- keep one shared particle material family across scene slugs
- change source coordinates first, uniforms second, and material branching last
- keep stream as a source-plus-uniform specialization, not a separate renderer
- do not reintroduce mesh rendering for scenes that should stay point-based
- do not replace point sprites with flat circles unless the visual target also
  changes
- do not reintroduce the pulse-era vec3 color uniforms or the per-point
  rainbow-confetti accent path; burst-overlay uniforms are the replacement
