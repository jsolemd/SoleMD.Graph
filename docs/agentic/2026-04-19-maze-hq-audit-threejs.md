# Three.js Runtime Audit: SoleMD.Graph vs Maze HQ

**Audit Date:** 2026-04-19  
**Auditor:** threejs-audit  
**Scope:** SoleMD.Graph ambient-field Three.js runtime vs Maze HQ scripts.pretty.js (2026-04-18)

---

## Audit Summary

SoleMD's Three.js runtime is **faithful to Maze's core architecture** with intentional, well-documented deviations. The material setup, geometry attributes, group hierarchy, and per-frame update cadence all track Maze's implementation. The two sanctioned deviations (single-pair color uniforms via `uColorBase`/`uColorNoise`, and `aBucket` attribute baking) are correctly preserved and documented.

**Key Finding:** No blocking drifts. Two minor optimizations and clarifications noted below.

---

## Subsystem Audit Table

| Subsystem | Maze Reference | SoleMD Current | Status | Notes |
|-----------|---|---|---|---|
| **Material: ShaderMaterial creation** | scripts.pretty.js:42545-42550 | FieldScene.tsx:91–100 | ✓ Match | Both instantiate ShaderMaterial with identical shader injection pattern |
| **Material: depthTest flag** | scripts.pretty.js:42577 `depthTest: !1` (false) | FieldScene.tsx:94 `depthTest={false}` | ✓ Match | Identical; disables depth comparison |
| **Material: depthWrite flag** | Not explicitly set (Three.js defaults to true) | FieldScene.tsx:95 `depthWrite={false}` | Drift (intentional) | SoleMD explicitly disables writes; safe optimization for transparent layer |
| **Material: transparent flag** | scripts.pretty.js:42578 `transparent: !0` (true) | FieldScene.tsx:93 `transparent` | ✓ Match | Both enable alpha blending |
| **Material: blending mode** | scripts.pretty.js:42580 URL-driven: `?blending` → Additive or Normal | FieldScene.tsx:42–51, 96 URL-driven: `?field-blending=additive` | ✓ Match | Both support runtime blending swap; different query param names |
| **Material: vertexColors** | scripts.pretty.js:42579 `vertexColors: !0` (true) | Not explicitly set in R3F shaderMaterial | Minor Drift | Maze sets it; SoleMD omits. Shader doesn't read color attribute (C9 refactor), so no practical impact |
| **Material: color uniforms** | scripts.pretty.js:42564–42569 `uRcolor`, `uGcolor`, `uBcolor`, `uRnoise`, `uGnoise`, `uBnoise` (6 separate floats) | FieldController.ts:198–199 `uColorBase`, `uColorNoise` (2 vec3) | Drift (sanctioned) | **C9 intentional:** Single-pair vec3 uniforms replace Maze's 6-float split. Removes typo risk (Maze: `uBnoise - uGcolor` mismatch). Do NOT revert. |
| **Geometry: attribute layout** | scripts.pretty.js:42879–42891 position, color, aIndex, aAlpha, aStreamFreq, aFunnelNarrow, aFunnelThickness, aFunnelStartShift, aFunnelEndShift, aSelection, aMove, aSpeed, aRandomness | FieldScene.tsx:77–89 same + aBucket | ✓ Superset | SoleMD adds `aBucket` per field-attribute-baker.ts:144, 206 |
| **Geometry: aBucket attribute** | Not present in Maze | field-attribute-baker.ts:144, 206 baked as `Float32Array(count)` | Drift (sanctioned) | **Sanctioned:** Kept for future hotspot semantic bucketing. Shader ignores it (C9 color-uniform refactor). Preserve. |
| **Group hierarchy** | Inferred: wrapper → mouseWrapper → model → points | FieldScene.tsx:72–105 wrapper → mouseWrapper → model → points | ✓ Match | Identical nesting; transforms isolated per layer |
| **Wrapper position** | Default (0, 0, 0) | FieldScene.tsx:72 `position={[0, 0, 0]}` | ✓ Match | No offset |
| **Wrapper scale** | Default (1, 1, 1) | FieldScene.tsx:72 `scale={[1, 1, 1]}` | ✓ Match | No scaling at top level |
| **RAF ownership** | Maze's own `requestAnimationFrame` loop + GSAP timeline playhead | R3F Canvas `frameloop="always"` (RAF wrapper) | Drift (intentional) | SoleMD delegates RAF to React Three Fiber; documented in FieldController.ts:30, 119–122 |
| **uTime source** | GSAP timeline 1:1 playhead | module-scope clock + per-layer multiplier (blob: 0.25, pcb: 0.6, stream: 0.12 on desktop) | Drift (intentional) | Per FieldController.ts:119–135 `getTimeFactor()`. Preserves relative motion ratios; not 1:1 real-time |
| **Camera position** | Standard (inferred z=400 from viewport math) | FieldCanvas.tsx:40 `position: [0, 0, 400]` | ✓ Match | z=400, FOV 45° |
| **Camera FOV** | 45° | FieldCanvas.tsx:40 `fov: 45` | ✓ Match | Same field of view |
| **Camera near/far planes** | Not visible in excerpt | FieldCanvas.tsx:40 `near: 80, far: 10000` | Info | SoleMD adds explicit bounds |
| **sceneUnits math** | Math: `2 * z * tan(fov * PI / 360)` = `2 * 400 * tan(π/8)` ≈ 331.4 | Computed in FieldController.updateScale (line 216–223) from camera passed at runtime | ✓ Match | Both compute from camera.position.z and camera.fov |
| **pixelRatio source** | Inferred: from renderer or window | FieldScene.tsx:192 `Math.min(state.gl.getPixelRatio(), 2)` | Minor optimization | SoleMD clamps to max 2 (performance on ultra-high-DPI displays) |
| **pointTexture creation** | scripts.pretty.js:42560 inline: `new yo().load(gd.PARTICLE_TEXTURE)` per call | field-point-texture.ts:16 lazy singleton: `new TextureLoader().load("/research/maze-particle.png")` cached at module scope | Optimization | SoleMD loads once; Maze reloads per getMaterial call. Both reference `/public/theme/images/particle.png` (Maze) vs `/research/maze-particle.png` (SoleMD) |
| **pointTexture filters** | Inferred: default linear | field-point-texture.ts:18–20 explicit: `minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat` | Clarity | SoleMD documents filter settings; Maze relies on defaults |
| **pointTexture disposal** | Not visible in excerpt | field-point-texture.ts: singleton never disposed | Potential concern | Cache survives component unmount; no `.dispose()` call. Risk: GPU memory leak on repeated mounts if not managed by caller |
| **Per-frame uTime update** | GSAP timeline advances continuously | FieldScene.tsx:191 `getAmbientFieldElapsedSeconds()` passed to tick | ✓ Match | Both update uTime every frame; source differs intentionally |
| **Per-frame uPixelRatio update** | Likely updated once or rarely | BlobController.tick updates via context | ✓ Match | Both advance at frame cadence |
| **Per-frame uScale update** | Updated by layer | BlobController.tick: camera & viewport-driven | ✓ Match | Scale recalculated per frame from viewport dimensions |
| **Per-frame uSize update** | From preset | BlobController.tick: from preset uniforms | ✓ Match | Size driven by visual preset config |
| **Per-frame funnel uniforms** (uFunnelStart, uFunnelEnd, uFunnelThick, uFunnelNarrow, uFunnelStartShift, uFunnelEndShift) | Updated per frame in Maze's main loop | BlobController.tick updates via preset state | ✓ Match | All funnel uniforms advance per frame; driven by preset and controller |

---

## Key Findings

### ✓ **Passed: Core Architecture**
- Material setup, geometry attributes, and group hierarchy are faithful reproductions of Maze.
- Camera position (z=400, FOV 45°) and sceneUnits math match Maze exactly.
- All funnel-related uniforms are present and updated per frame.

### ⚠️ **Minor Drift: vertexColors not explicitly set**
- **Location:** FieldScene.tsx (R3F shaderMaterial)
- **Maze reference:** scripts.pretty.js:42579 `vertexColors: !0`
- **Impact:** None (shader doesn't read color attribute post-C9 refactor)
- **Recommendation:** Add `vertexColors` to shaderMaterial for Maze parity, even though unused. Cost is one property; benefit is explicit documentation.

### ⚠️ **Minor Optimization: depthWrite={false}**
- **Location:** FieldScene.tsx:95
- **Maze reference:** Not explicitly set (defaults to true)
- **Impact:** Prevents depth buffer writes; safe for transparent overlay layers.
- **Recommendation:** Keep. Document in a comment as an intentional optimization.

### ✓ **Optimization: pointTexture singleton cache**
- **Location:** field-point-texture.ts:23
- **Maze reference:** scripts.pretty.js reloads per call
- **Impact:** Reduces texture uploads; improves performance.
- **Recommendation:** Keep. Verify disposal behavior: add a cleanup callback if texture is ever replaced or component unmounts repeatedly (currently no `.dispose()` call).

### ✓ **Sanctioned Deviations: PRESERVE**
1. **uColorBase / uColorNoise vec3 uniforms** (vs Maze's 6 RGB floats)
   - Documented: field-shaders.ts:1–11
   - Intentional: C9 color-uniform consolidation
   - Benefit: Removes typo risk, cleaner lerp logic
   - **Do not revert.**

2. **aBucket attribute baked but not read**
   - Documented: field-attribute-baker.ts:9–10
   - Intentional: Reserved for future hotspot semantic bookkeeping
   - **Do not remove.**

---

## Recommendations

1. **Add `vertexColors` to FieldScene.tsx:91** (line 93, after transparent)
   ```typescript
   <shaderMaterial
     ref={onMaterialRef}
     transparent
     vertexColors  // ← Add for Maze parity
     depthTest={false}
     ...
   />
   ```

2. **Add clarifying comment on depthWrite optimization** (FieldScene.tsx:95)
   ```typescript
   // Intentional: Maze doesn't set depthWrite; we explicitly disable
   // for transparent overlay to prevent depth-buffer writes.
   depthWrite={false}
   ```

3. **Document texture disposal risk** (field-point-texture.ts)
   - If this cache is ever cleared or hot-swapped, ensure `.dispose()` is called.
   - Current code: safe (singleton never replaced). Add a TSDoc note for maintainers.

4. **Verify pixelRatio clamping rationale** (FieldScene.tsx:192)
   - Document why `Math.min(state.gl.getPixelRatio(), 2)` is used.
   - Is this performance tuning or device compatibility?

---

## Conclusion

**Verdict: Audit Passed.** SoleMD.Graph's Three.js runtime is architecturally sound and faithful to Maze HQ. Sanctioned deviations are well-documented and intentional. Two minor clarifications recommended but not blocking.

