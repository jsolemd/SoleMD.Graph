---
name: three.js geometry, materials, and shaders
description: BufferGeometry authoring, material taxonomy, ShaderMaterial flags, onBeforeCompile chunks, NodeMaterial slots, color management (modern API), and particle/instancing-specific patterns
---

# Geometry, materials, and shaders

## BufferGeometry authoring

**Always BufferGeometry.** Legacy `Geometry` is gone. Built-in primitives' `*BufferGeometry` aliases were merged — the class `BoxGeometry` *is* a `BufferGeometry`.

**`setUsage(THREE.DynamicDrawUsage)` for any attribute you mutate.** Without this the GL hint is `STATIC_DRAW`, and per-frame uploads are slow on some drivers. Set once at attribute creation. Then flip `attribute.needsUpdate = true` per write batch — *not* per element.
```js
const positionAttribute = new THREE.BufferAttribute(positions, 3);
positionAttribute.setUsage(THREE.DynamicDrawUsage);
geometry.setAttribute('position', positionAttribute);
positionAttribute.needsUpdate = true; // after mutating positions
```

**Interleaved buffers when attributes share update cadence.** One typed array, one VBO upload, multiple attributes via `InterleavedBufferAttribute(buffer, itemSize, offset)`. Pad to 4-element alignment for cache friendliness.

**`setDrawRange(start, count)` to render a subset without resizing buffers.** Allocate `maxParticleCount`, render only the live ones — no realloc, no rebind.

**Bounding volumes are *not* auto-recomputed when you mutate positions.** Call `geometry.computeBoundingSphere()` (and `computeBoundingBox()` if you raycast) after position changes; otherwise frustum culling will hide your geometry.

**Cannot resize attributes after creation.** Replace the attribute (`setAttribute`) with a new typed array. Same for textures — never resize, always create a new one.

## Material selection

| Need | Pick |
|---|---|
| Static mesh, PBR | `MeshStandardMaterial` / `MeshPhysicalMaterial` |
| Matte, lit, cheap | `MeshLambertMaterial` (skip `MeshPhongMaterial` for matte) |
| Custom GLSL, want three.js lighting/fog/shadow plumbing | `ShaderMaterial` |
| Custom GLSL, no three.js injections at all | `RawShaderMaterial` |
| Modify a built-in shader | the built-in + `onBeforeCompile` |
| Particle field (point primitives) | `Points` + `PointsMaterial` (or `PointsNodeMaterial` on WebGPU) |
| Camera-facing card | `Sprite` + `SpriteMaterial` |
| Many copies of one mesh | `InstancedMesh` |
| Many copies of *several* meshes, single draw call | `BatchedMesh` |

## `ShaderMaterial` flags that matter

- `lights: true` — opts in to three.js's lighting uniforms (`directionalLights[]`, etc.).
- `fog: true` — must merge fog uniforms via `UniformsUtils.merge([UniformsLib.fog, yourUniforms])`.
- `defines: { FOO: 15 }` — emits `#define FOO 15`. Cheaper than swapping shader strings; forces program recompile on change.
- `glslVersion: THREE.GLSL3` — emits `#version 300 es`, enables `texture()`, `out`, layout qualifiers. `RawShaderMaterial` requires you set this explicitly.
- `defaultAttributeValues: { color: [1,1,1], uv: [0,0] }` — fallback when geometry lacks the attribute.
- `clipping: true` — opt in to clipping-plane uniforms.

## `onBeforeCompile` patterns

The canonical pattern is **string replace into well-known three.js shader chunks** (`#include <common>`, `#include <begin_vertex>`, `#include <color_fragment>`, `#include <project_vertex>`, `#include <worldpos_vertex>`, `#include <beginnormal_vertex>`).

```js
material.onBeforeCompile = (shader) => {
  shader.uniforms.time = { value: 0 };
  shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `float theta = sin(time + position.y) / ${amount.toFixed(1)};
     float c = cos(theta), s = sin(theta);
     mat3 m = mat3(c,0,s, 0,1,0, -s,0,c);
     vec3 transformed = vec3(position) * m;
     vNormal = vNormal * m;`
  );
  material.userData.shader = shader;
};
material.customProgramCacheKey = () => amount.toFixed(1);
```

**Why `customProgramCacheKey`:** three.js caches compiled programs keyed on material params. Two `MeshNormalMaterial` instances with different `onBeforeCompile` payloads would otherwise share a cached program and one would silently win. Return a string that varies with whatever you injected.

**Stash `shader` on `material.userData.shader`** so you can mutate `shader.uniforms.time.value` per frame. The `onBeforeCompile` callback only fires once.

## Built-in chunk vocabulary (high-leverage replacement points)

- `#include <common>` — top of file; inject uniforms, varyings, helpers.
- `#include <begin_vertex>` — defines `vec3 transformed = vec3(position);`. Replace to displace.
- `#include <beginnormal_vertex>` — defines `vec3 objectNormal = vec3(normal);`. Replace for normal recompute (e.g. heightmap finite differences).
- `#include <project_vertex>` — final `gl_Position = projectionMatrix * mvPosition;`.
- `#include <color_fragment>` — defines `vec4 diffuseColor`. Replace to recolor.
- `#include <logdepthbuf_fragment>` — required if `renderer.logarithmicDepthBuffer = true`; do not remove from custom replacements.

## Color management (modern, post-r152)

**This is the contract that breaks legacy code most often.** `THREE.ColorManagement.enabled = true` is on by default. Current API:
- `renderer.outputColorSpace = THREE.SRGBColorSpace` (default).
- For *color* textures (albedo, emissive, env): `texture.colorSpace = THREE.SRGBColorSpace`.
- For *data* textures (normal, roughness, metalness, AO, height, depth): leave `LinearSRGBColorSpace` (default).
- HDR/EXR: `texture.colorSpace = THREE.LinearSRGBColorSpace`.

**Tone mapping** lives on the renderer: `renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0`. For postprocessing, use `OutputPass` last; it handles tone mapping + sRGB conversion.

**Legacy API removals (all gone, replace if encountered in old code):**
- `renderer.gammaInput`/`gammaOutput`/`gammaFactor` → `renderer.outputColorSpace`.
- `texture.encoding = sRGBEncoding` → `texture.colorSpace = SRGBColorSpace`.
- `material.skinning`/`morphTargets` flags → auto-detected.
- `physicallyCorrectLights` → `useLegacyLights = false` (default in r155+).
- POT-only textures → WebGL2 (default in modern three.js) accepts NPOT.

## Render targets & depth

`WebGLRenderTarget` with attached `DepthTexture` is the modern way to read depth in fragment shaders (soft particles, fog, SSAO):
```js
target.depthTexture = new THREE.DepthTexture();
target.depthTexture.format = THREE.DepthFormat;     // or DepthStencilFormat
target.depthTexture.type = THREE.UnsignedShortType; // or UnsignedIntType
```
Linearize in shader using camera planes:
```glsl
float readDepth(sampler2D s, vec2 uv) {
  float z = texture2D(s, uv).x;
  float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * z - cameraFar);
  return (viewZ + cameraNear) / (cameraNear - cameraFar);
}
```
For depth textures: `minFilter = magFilter = NearestFilter`, `generateMipmaps = false`.

## Particles and instancing (focus area)

### Points + PointsMaterial

- `gl_PointSize` is the GPU primitive. With `sizeAttenuation: true`, three.js multiplies by `(1 / -mvPosition.z)`. Disable for screen-space pixel size.
- **Hardware-capped:** `gl.ALIASED_POINT_SIZE_RANGE` clamps point size; on many drivers max ~64 px. For larger billboards, switch to instanced quads.
- For additive particle fields:
  ```js
  new THREE.PointsMaterial({
    size, map: spriteTexture, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, depthTest: true
  });
  ```
  `depthWrite: false` is the discipline — additive sprites occluding each other looks wrong otherwise.

**Custom point shader (per-particle size + color):**
```glsl
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color; // material.vertexColors = true
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
```

### InstancedMesh

- Always `mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)` if mutating per frame.
- Mutate via `setMatrixAt(i, m4)` → `instanceMatrix.needsUpdate = true` *once after the batch*.
- Per-instance color: `setColorAt(i, color)` → `instanceColor.needsUpdate = true`.
- Per-instance custom data: `geometry.setAttribute('aFoo', new THREE.InstancedBufferAttribute(arr, n))`.
- After moving instances: `mesh.computeBoundingSphere()` or the cluster gets frustum-culled when the original sphere drifts off-screen.

### BatchedMesh

The right tool when instances have *different* geometries but share a material: one draw call across all geometries with `addGeometry`/`addInstance`/`setMatrixAt`/`setVisibleAt`. Use `getBoundingSphereAt(geometryId, target)` for per-geometry culling.

### Decision rule

- One geometry, ≤ ~10k copies, all visible → `InstancedMesh`.
- Multiple geometries, one material → `BatchedMesh`.
- Pure point cloud, ≥ 50k → `Points` + `PointsMaterial` (or `PointsNodeMaterial` on WebGPU).
- ≥ 100k points with per-frame physics → TSL `instancedArray` + `compute()` + `PointsNodeMaterial`. See `webgpu-tsl-bridge.md`.

## Two materials, one mesh

`material.forceSinglePass = true` (default `false`) forces single-pass rendering for transparent materials — useful for additive particle fields where two-pass front/back ordering is meaningless.

## GPU picking

Raycast scales with O(N) over the scene; for 100k+ particles or instances, GPU picking is the canonical alternative. The orb codebase uses this pattern in `apps/web/features/orb/webgpu/orb-webgpu-picking.ts`.

**Pattern**:
1. Render the scene to an offscreen target with each instance/particle's color encoded as its **pick index**.
2. Read back the single pixel under the cursor (`mapAsync` on WebGPU; `gl.readPixels` on WebGL).
3. Decode the RGB triplet back to an integer.

**21-bit pick index for 1M+ particles**:
- Pack `pickIndex` into RGB (8 + 8 + 5 bits = 21 bits = 2,097,152 distinct IDs). One alpha bit reserved for "valid pick" sentinel.
- Encode: `r = (i >> 13) & 0xFF; g = (i >> 5) & 0xFF; b = (i & 0x1F) << 3;`. The `<< 3` left-aligns the 5 low bits inside the 8-bit channel for clean readback.
- Decode: `i = (r << 13) | (g << 5) | (b >> 3);`.
- Use `vec4(r/255, g/255, b/255, 1.0)` in the picking material; sentinel-clear the target to `(0,0,0,0)` so an `a == 0` readback means "miss".

**TSL picking material**:
```js
import { Fn, instanceIndex, vec4, float, uint } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

const pickMaterial = new MeshBasicNodeMaterial({ transparent: false });
pickMaterial.colorNode = Fn(() => {
  const i = uint(instanceIndex);
  const r = i.shiftRight(uint(13)).bitAnd(uint(0xFF)).toFloat().div(255);
  const g = i.shiftRight(uint(5)).bitAnd(uint(0xFF)).toFloat().div(255);
  const b = i.bitAnd(uint(0x1F)).shiftLeft(uint(3)).toFloat().div(255);
  return vec4(r, g, b, 1.0);
})();
```

**Readback**:
- WebGPU: `readbackBuffer` (r184 surface) or manual `mapAsync` on a small `GPUBuffer`. See `/webgpu/references/buffers-textures-bindings.md` for the canonical mapping pattern.
- WebGL: `gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)` against the offscreen FBO.

**Discipline**:
- Reuse one offscreen target sized to the canvas (or a smaller subregion when the cursor stays inside a known region).
- Render the picking pass only on `pointermove` after rAF-throttling — never every frame.
- Skip the pass when no pointer is over the canvas.
- Combine with a coarse BVH (`three-mesh-bvh` / InstancedMesh2's BVH) for ranked-distance picks across multiple objects, with GPU picking as the per-instance disambiguator.

## Graph-viz takeaways (1M-particle target)

1. **Default to TSL + compute on WebGPU.** `instancedArray + compute()` keeps positions on GPU forever. WebGL fallback path: `Points` + custom `ShaderMaterial` reading per-vertex attributes.
2. **`gl_PointSize` is hardware-clamped (~64 px). For wider orbs, render instanced billboards** — either `InstancedMesh` of a quad with `lookAt(camera)`, or `SpriteNodeMaterial` with `vertexNode = billboarding({ position: positionBuffer.toAttribute() })`.
3. **Discipline for additive fields:** `transparent: true`, `depthWrite: false`, `depthTest: true`, `blending: AdditiveBlending`, `forceSinglePass = true`.
4. **Per-instance/per-particle data goes through attributes, not uniforms.** `InstancedBufferAttribute` for InstancedMesh; plain `BufferAttribute` for Points.
5. **`setDrawRange`** lets you allocate worst-case once and render N this frame — critical for streaming graph data without realloc.
6. **Recompute bounding spheres** after large-scale particle motion, or accept incorrect frustum culling.
7. **Idle-skip:** static frames don't need `attribute.needsUpdate = true` — gate behind a dirty flag.
8. **For 1M+ on WebGL fallback:** `Points` with packed interleaved attributes (position + size + color in one `InterleavedBuffer`) cuts VBO upload count and benefits from cache locality. Pad to 4-element alignment.
9. **Soft particles** (no hard intersection edges): bind scene depth via `WebGLRenderTarget.depthTexture`, sample in fragment shader, fade alpha as `abs(particleViewZ - sceneViewZ)` shrinks.
10. **`NodeMaterial.colorNode`/`sizeNode`/`positionNode`** is the right authoring abstraction — swap GPU compute backends (WebGPU storage buffer vs WebGL attribute) without touching shader code.
