# Maze Shader Material Contract

Use this reference when a task touches point attributes, uniforms, shaders,
point sprite treatment, or scene preset values.

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

Do not assume “premium glow” means additive blending by default.

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

Geometry also carries:

- `color`

Important quirk:

- `color` is injected on the geometry, but the live particle shaders do not
  read it

For parity work, treat `color` as present-but-inactive unless the shader family
is intentionally rewritten.

## Uniform Family

Shared uniforms:

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
vColor from uR/G/Bcolor + uR/G/Bnoise
  ->
displaced = position
  ->
displaced *= (1.0 + uAmplitude * vNoise)
  ->
displaced += uScale * uDepth * aMove * aSpeed * snoise_1_2(...)
  ->
if stream:
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
distance-based alpha and selection cut
```

The amplitude multiply is global, not blob-only. Blob scenes just reveal it
more clearly because their source geometry is spherical.

## Point Size And Alpha

Perspective importance is a core part of the look:

- `gl_PointSize = uSize * 100.0 / vDistance * uPixelRatio`
- `vAlpha = uAlpha * aAlpha * (300.0 / vDistance)`
- points with `aSelection > uSelection` are hidden by zeroing alpha

Important quirk:

- the shader calls `clamp(gl_PointSize, 1.0, 100.0);` but discards the return
  value

If SoleMD fixes that, document it as an intentional divergence.

## Fragment Shader Contract

The fragment path is minimal:

```glsl
gl_FragColor = vec4(vColor, vAlpha);
gl_FragColor *= texture2D(pointTexture, gl_PointCoord);
```

There is no extra lighting model in the fragment shader. The look comes from:

- source coordinates
- noise/deformation
- point sprite texture
- distance-scaled size/alpha

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
- runtime increments `uTime += 0.002`
- default `uSize = 10`
- blob preset:
  - `uDepth = 0.3`
  - `uAmplitude = 0.05`
  - `uFrequency = 0.5`
- pcb preset:
  - `uDepth = 0.3`
  - `uAmplitude = 0.05`
  - `uFrequency = 0.1`
  - `uSize = 6`

## Parity-Sensitive Quirks

These are strange enough that agents may “fix” them by accident:

- blue channel mixes with `uBnoise - uGcolor`, not `uBnoise - uBcolor`
- `uScreen` exists but is inactive
- geometry `color` exists but is inactive
- point-size `clamp(...)` is a no-op

If SoleMD changes any of these, do it deliberately and record the divergence.

## Implementation Rules For SoleMD

- keep one shared particle material family across scene slugs
- change source coordinates first, uniforms second, and material branching last
- keep stream as a source-plus-uniform specialization, not a separate renderer
- do not reintroduce mesh rendering for scenes that should stay point-based
- do not replace point sprites with flat circles unless the visual target also
  changes
