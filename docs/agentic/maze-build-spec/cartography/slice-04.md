# Slice 04 — scripts.pretty.js lines 24001–32000

**Cartographer**: cart-04
**Slice**: [24001, 32000]
**Date**: 2026-04-19

## Summary

This 8,000-line slice is the Three.js WebGL low-level renderer backend for Maze's point-cloud scenes. It contains shader constant definitions (GLSL template strings for 15+ material types, shadow mapping, tone mapping, and transmission), WebGL state machine implementations, uniform/attribute registry classes, shader compilation and preprocessing pipeline, and texture upload handlers. The slice defines no Maze-specific logic—it is pure Three.js abstraction layer between the scene controllers and the WebGL API. No stream DOM motion-path or popup orchestration is present.

## Section inventory

| # | Section name | Lines | Purpose | Key Maze symbols | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|
| 1 | Shader constant library (GLSL templates) | [24001, 26296] | Bundle of 60+ GLSL fragment/vertex shader snippets for shadows, tone mapping, transmission, UV sampling, environment mapping, and 15+ material types (Lambert, Phong, Standard, Toon, Matcap, Normal, BasicDepth, Depth, DistanceRGBA, Equirect, Cube, Combine, plus deferred and light helpers). Defined as string constants assigned to minified names (`XE`, `qE`, `YE`, `jE`, `$E`, `tA`, `nA`, `iA`, `rA`, etc.). | `XE`, `qE`, `YE`, `jE`, `$E`, `KE`, `ZE`, `JE`, `QE`, `eA`, `tA`, `nA`, `iA`, `rA`, `sA`, `oA`, `aA`, `lA`, `cA`, `uA`, `hA`, `dA`, `fA`, `pA`, `mA`, `gA`, `vA`, `xA`, `yA`, `_A`, `bA`, `wA`, `SA`, `MA`, `TA`, `EA`, `AA`, `CA`, `PA`, `RA`, `IA`, `LA`, `DA`, `OA`, `FA`, `NA`, `kA`, `UA`, `BA`, `zA`, `HA`, `VA`, `GA`, `WA`, `XA`, `qA`, `YA`, `$A`, `JA`, `KA`, `ZA` (60+ shader IDs) | defer to Context7 (Three.js WebGL Materials) | large (2,300 lines) | Imported/referenced by downstream shader compilation; no internal dependencies |
| 2 | Background & environment rendering | [26297, 26447] | `GA()` function sets up background clearing, environment blending (additive vs. alpha-blend for WebXR), and cube map/2D background texture rendering with proper color space conversion and intensity/blurriness uniforms. Instantiates cube background mesh on first use. | `GA`, `bc` (rotation matrix), `VA` (temp matrix), `g()`, `b()`, `_()`, `x()` | `apps/web/features/field/renderer/FieldScene.tsx` § constructor + render setup | medium (150 lines) | Depends on `new xt(0)` color class, `cg.Color` (external); used by stage render loop |
| 3 | WebGL material & geometry handlers | [26448, 27511] | 40+ low-level functions (`WA`, `XA`, `qA`, `YA`, `$A`, `ZA`, `yb`, `Iu`, `JA`, `QA`, `_b`, `bb`, `nm`, `eC`, `tC`, `nC`, `iC`, `rC`, `sC`, `oC`, `Du`, `Ir`, `Lr`, `im`, etc.) implement buffer attribute binding, vertex weight/morph blending, skinning matrix lookup, normal transforms, tangent space setup, displacement maps, and state machine manipulation. Handles both indexed and non-indexed geometry. | `WA`, `XA`, `qA`, `YA`, `$A`, `ZA`, `yb`, `Iu`, `JA`, `QA`, `_b`, `bb`, `nm`, `eC`, `tC`, `nC`, `iC`, `rC`, `sC`, `oC`, `Du`, `Ir`, `Lr`, `im`, `aC`, `lC`, `cC`, `uC`, `hC`, `dC`, `fC`, `pC`, `mC`, `gC`, `vC`, `xC`, `yC`, `_C`, `bC`, `wC`, `SC`, `MC`, `TC`, `EC` | none — internal Three.js WebGL plumbing with no SoleMD equivalent | large (1,050 lines; inheritance) | Used by render loop for per-frame attribute updates; depends on WebGL state symbols (`r`, `t`) |
| 4 | Uniform & attribute registry classes | [28385, 28480] | Three classes (`ev`, `tv`, `nv`, `Lu`) implement shader uniform value caching, array uniform handling, and active uniform reflection. `Lu` queries WebGL program for active uniforms, partitions shadow samplers first, and provides `setValue()` and `seqWithValue()` static methods for efficient batch uniform updates. Regex pattern `Z0` parses uniform names for nested struct/array paths. | `ev`, `tv`, `nv`, `Z0` (regex), `Lu`, `Ab`, `YC` | none — internal uniform registry abstraction | medium (100 lines; classes + regex) | Used by shader program execution; depends on `getActiveUniform`, `getUniformLocation` WebGL APIs |
| 5 | Shader compilation & diagnostics | [28481, 28615] | `Cb()` compiles GLSL source to shader objects; `KC()` formats error context (±6 lines around error); `ZC()` generates color space transformation matrix strings; `Rb()` extracts and formats compilation error logs with line numbers; `eP()` maps tone mapping enum to GLSL function name; `tP()` generates luminance coefficient function. | `Cb`, `KC`, `ZC`, `Rb`, `eP`, `tP`, `Qp` (luminance vector), `QC` (tone mapping map) | none — Three.js shader compilation abstraction | medium (135 lines) | Used by shader program linking; no output deps |
| 6 | Shader preprocessing pipeline | [28615, 28741] | `nP()` emits WebGL extension directives; `iP()` converts define object to `#define` lines; `rP()` reflects active shader attributes with location mapping; `Ib()` substitutes light count placeholders (NUM_DIR_LIGHTS, NUM_SPOT_LIGHTS, etc.); `Lb()` substitutes clipping plane counts; `iv()` / `aP()` resolve `#include <chunkName>` by recursive lookup in `_n` shader chunk map; `Db()` / `cP()` unroll `#pragma unroll_loop` directives with loop variable substitution; `Ob()` generates precision declarations for all sampler types; `hP()`, `fP()`, `mP()`, `vP()`, `xP()` map Three.js enum values to GLSL #define names. | `nP`, `iP`, `rP`, `Ib`, `Lb`, `iv`, `aP`, `Db`, `cP`, `Ob`, `hP`, `fP`, `mP`, `vP`, `xP`, `sP` (include regex), `lP` (unroll regex), `oP` (deprecation map), `uP`, `dP`, `pP`, `gP` | none — Three.js GLSL preprocessing | medium (130 lines; regex + substitution) | Consumes `_n` shader chunk registry; outputs shader source to linker |
| 7 | Texture upload & format conversion | [31716, 32000+] | `le()` and `ue()` are the main texture binding/upload entry points. `le()` handles 2D textures with full format/type/mipmap/compression support, colorspace conversion, and layer updates. `ue()` handles cubemap binding. Both functions check source version against cache, call `Qe()` for image processing, `b()` for resizing, `Fe()` for forced-update detection, and use `texStorage2D` (immutable) or `texImage2D` (mutable) paths. Handles depth textures, data textures, compressed textures, 3D array textures, and framebuffer textures with proper pixel storage flags. | `le`, `ue`, `Fe`, `Qe`, `b`, `ut`, `C`, `S`, `w`, `s`, `gd`, `hn` (color space mgr), `_e`, `ot`, `Be`, `Ne`, `Tt` | `apps/web/features/field/renderer/field-shaders.ts` § texture loading | large (750+ lines; nested conditionals) | Depends on texture cache `n.get()`, pixel format registry `s`, internal WebGL state `r`, `t` |

## Existing map overlap

| Section | Existing coverage | New info added |
|---------|---|---|
| Shader constants | None — **new discovery** | Full inventory of 60+ GLSL shader snippets bundled in Maze; classified by material type (Lambert, Phong, Standard, Toon, etc.) and feature (shadows, transmission, normal maps, etc.). These are Three.js defaults, not Maze-authored custom shaders. |
| Background rendering | None — **new discovery** | `GA()` function handles WebXR color blending modes and lazy-initializes cube background mesh. Maps to FieldScene startup but is orthogonal to the stage render loop proper. |
| Material & geometry handlers | None — **new discovery** | 40+ low-level attribute/morph/skinning handlers implement the per-frame buffer binding path. Collectively define the geometry pipeline abstraction layer between controllers and raw WebGL. |
| Uniform registry | None — **new discovery** | `Lu` class and `ev`/`tv`/`nv` nested classes implement efficient uniform caching and structured uniform path parsing (e.g., `light[0].color.x`). Critical for shader state sync but invisible in higher-level architecture maps. |
| Shader compilation | None — **new discovery** | Full compilation pipeline including error reporting, color space matrix generation, and tone mapping enum mapping. `KC()` error context is valuable for debugging shader compilation failures. |
| Shader preprocessing | None — **new discovery** | Recursive `#include` resolver (`iv`/`aP`), `#pragma unroll_loop` expander (`Db`/`cP`), and dynamic light/clipping count substitutor (`Ib`/`Lb`) are the runtime shader metaprogramming backbone. Without these, Maze would need static shader variants for every light count. |
| Texture upload | None — **new discovery** | `le()` and `ue()` are the final WebGL bottleneck for all texture updates. Format conversion via `s.convert()`, colorspace handling via `hn`, and layer-by-layer updates for compressed/array textures show deep WebGL optimization. |

## Cross-slice closure boundary notes

**Opening boundaries (before line 24001):**
- Lines 23970–24000 are the closing `#endif` of a prior shader constant (`VE`) — this shader library forms one continuous variable assignment block with no break points.
- `_n` (shader chunk registry) — imported/defined outside slice; used by `aP()` at line 28652.
- `gd`, `Fl`, `pa`, `_c` (material, shader, uniform registries) — defined outside slice; imported by `GA()` and background mesh setup.
- `Qa`, `hn` (color space manager) — used by `ZC()` and texture handlers; defined outside slice.
- WebGL context `r`, texture target `t`, state manager `n` — passed as function parameters, defined in enclosing WebGL renderer context.

**Closing boundaries (after line 32000):**
- `le()` function continues with additional texture type branches (`isData3DTexture`, `isFramebufferTexture`, mipmaps) past line 32000.
- `ue()` cubemap function body continues into line 32100+.
- No class or IIFE boundaries are cut; all function definitions within the slice are complete.

## Popups / stream DOM motion-path discoveries

**None in this slice.** This is a pure WebGL / Three.js shader infrastructure layer. No DOM popup mount functions, no SVG path sampling, no `data-scroll` adapters like `stream`/`moveNew`/`graphRibbon`/`events`, and no references to `flow-diagram-main.svg`. The stream controller and popup choreography are implemented in earlier slices (likely cart-02/03 scope per user flag).

## Notes for Phase 2 catalog synth

1. **Three.js shader bundling**: Slice 01 contains all Three.js GLSL snippets for material types not customized by Maze. These are reference implementations; no Maze-specific shader innovation here. Defer to Three.js version/material docs for changes.

2. **Uniform/attribute registry**: The `Lu` / `ev` / `tv` / `nv` class hierarchy is the runtime schema for shader program reflection. Understanding this is critical for debugging uniform update bugs (e.g., if a light property doesn't sync to the GPU, trace through `Lu.setValue()` and `EC(type)` uniform setter).

3. **Shader preprocessing as meta-language**: The `#include` resolver and `#pragma unroll_loop` expander make Maze's shaders stateless with respect to light counts. This is a key architectural decision: instead of shipping 100 compiled shader variants (one per light count), Maze dynamically substitutes counts and unrolls loops at compile time. SoleMD has no equivalent feature; consider adding it if custom shaders are authored.

4. **Texture format abstraction**: The `s.convert()` format registry and `hn` colorspace manager hide WebGL enum complexity. Trace texture failures through these layers before diving into raw WebGL specs.

5. **Cross-slice dependency**: The material/geometry handlers (section 3) are **heavily used** by the stage render loop (expected in earlier/later slices). If render performance is poor, profile this section.

6. **No Maze feature gap here**: Unlike the user-flagged stream popup gap (chapters 02/03), this slice shows no missing patterns. Three.js defaults are complete; the pipeline is clean.
