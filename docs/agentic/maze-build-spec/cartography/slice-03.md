# Slice 03 — scripts.pretty.js lines 16001–24000

**Cartographer**: cart-03
**Slice**: [16001, 24000]
**Date**: 2026-04-19

## Summary

Slice 03 is pure bundled **Three.js r150+** library code. Zero Maze-authored logic. Zero "points that pop up" evidence. Per peer cartographers, Maze-authored code does not begin until ~line 42467. Catalog should collapse this slice to a single Context7 deferral row in Phase 2.

## Section inventory

| # | Section name | Lines | Purpose | Key Maze symbols | Name resolution | SoleMD counterpart | Difficulty (axis) | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | BufferGeometry extended methods | [16000, 16431] | Attribute setters, tangent/normal computation, indexing, JSON serialization. | `ci` | BufferGeometry base class (Three.js core) | `apps/web/features/field/renderer/field-shaders.ts` (material + geometry pipeline only — consumed via asset registry `ku`) | small (library) | Extends `Wa` (EventDispatcher, outside slice) |
| 2 | Mesh class (`ui`) | [16443, 16599] | Core WebGL mesh container: material, geometry, morph targets, vertex position retrieval. | `ui` | Three.js Mesh | `apps/web/features/field/renderer/FieldScene.tsx` (stage renderer instantiates meshes) | small (library) | Extends `pi` (Object3D); uses `ci` |
| 3 | InterleavedBuffer / InterleavedBufferAttribute | [17468, 17703] | Interleaved buffer attributes for memory-efficient vertex data layout. | `bu` | Three.js internal | none — SoleMD uses direct BufferGeometry | trivial (library) | Pure data structure |
| 4 | SkinnedMesh (`lc`) | [17713, 17823] | Skeletal animation support: bone transforms, skin weights, bind matrix. | `lc` | Three.js SkinnedMesh | none — skeletal animation not used on Maze homepage | small (library) | Extends `ui` |
| 5 | Skeleton (`cc`) | [17841, 17961] | Bone hierarchy + matrix texture for skinned meshes. | `cc` | Three.js Skeleton | none | small (library) | Pure utility |
| 6 | InstancedMesh (`Fh`) | [17991, 18200] | Instance-based rendering for repeated geometry. | `Fh` | Three.js InstancedMesh | possibly `apps/web/features/field/controller/*` (particle instancing) | small (library) | Extends `ui` |
| 7 | Earcut triangulation + ShapeUtils | [18901, 19330] | 2D polygon triangulation for shape geometry. | `S0`, `Vh` | Earcut algorithm | none — not used on homepage | small (library) | Pure algorithm |
| 8 | PlaneGeometry / SphereGeometry | [19331, 19467] | Procedural geometry generators. | `Gh`, `Wh` | Three.js primitive geometries | `apps/web/features/field/asset/*` (consumed via geometry generator `jo`) | trivial (library) | Extends `ci` |
| 9 | MeshStandardMaterial (`hc`) | [19469, 19500] | Physically-based material setup (color, roughness, metalness, maps). | `hc` | Three.js MeshStandardMaterial | `apps/web/features/field/renderer/field-shaders.ts` (material registry applies shader uniforms) | small (library) | Extends `Rr` (Material base) |
| 10 | Animation + KeyframeTrack + AnimationClip | [20400, 20571] | Animation tracks, keyframe interpolation, clip management. | `Ct`, `Ka`, `Zf`, `Jf` | Three.js animation system | none — Maze drives animation via scroll, not keyframes | small (library) | Pure data structure |
| 11 | FileLoader / ImageLoader / TextureLoader | [20587, 20925] | Resource loaders with fetch, abort, progress, MIME handling. | `ha`, `Qf`, `yo`, `Jf`, `gb`, `M0` | Three.js loaders | `apps/web/features/field/asset/*` (asset registry uses loaders for GLB/PNG) | small (library) | Extends `as` (Loader base); uses `la` (cache) |
| 12 | Light + Shadow classes | [20926, 21000] | Light definitions + shadow map setup. | `fc`, `Yh` | Three.js lighting | none — fixed stage has no lights or shadows on homepage | small (library) | Extends `pi` |
| 13 | GLSL Shader Chunks (~200 definitions) | [22029, 23990] | Modular GLSL fragments: alpha hash, AO map, batching, morphing, normals, roughness, shadows, dithering, iridescence. | (string constants) | Three.js ShaderChunk library | `apps/web/features/field/renderer/field-shaders.ts` (Maze's stream particle shader selectively applies these chunks) | trivial (library) | Pure shader code strings |

## Existing map overlap

| Section | Existing coverage | New info added |
|---|---|---|
| BufferGeometry + geometry primitives | **runtime-architecture-map.md § 4** (geometry generation: bitmap-to-points, model-vertices-to-points) | Confirms library boundary at lines 16000–24000; Maze's `jo` geometry generator consumes these classes but is defined downstream |
| Loaders | **asset-pipeline-map.md § 5** (point-source asset registry uses loaders for GLB/PNG) | Full fetch loop with progress, abort, MIME handling, cache — Three.js standard, not Maze-specific |
| Shader chunks | **runtime-architecture-map.md § 4** (base particle material + stream scene funnel uniforms) | Chunk library is generic Three.js; Maze's custom shader chunk selection happens downstream at lines 42583–42593 (cart-06) |

## Cross-slice closure boundary notes

**Opening (before 16001)**: Class bases `Wa`, `pi`, `Rr`, `xr`, `as`, `$a` defined earlier in Three.js core (slice 02). Singletons `ku`, `Fl`, `jo` initialized in stage runtime (~line 49000, cart-07).

**Closing (after 24000)**: Three.js continues through slice 04 until ~line 42466. Shader chunks are complete string constants within slice but additional chunks appear in later slices. No Maze class or IIFE straddles line 24000.

## Popups / stream DOM motion-path discoveries

**None in this slice.** No `getPointAtLength`, no motion-path logic, no popup DOM templates, no `data-scroll` adapter names, no SVG flow-diagram references. User-flagged stream popups gap is in cart-07 territory (adapter `KS` at lines 48911–49035).

## Notes for Phase 2 catalog synth

1. **Collapse recommendation**: Slices 01–04 are 100% third-party bundled code. Catalog should have a single "Vendored libraries" bucket with one row per library (GSAP, three.js, Earcut, lil-gui, SplitText, GSAP paths) and Context7 deferral. No per-class Phase 3 audit value.
2. **Library:Maze ratio**: Maze-authored code is ~13,500 lines inside a 55,957-line bundled file (~24% Maze / 76% libs). This shapes Phase 3 — most auditor effort should concentrate on cart-06 + cart-07 territory.
3. **Shader chunk relevance**: Maze's custom stream particle shader selectively applies these chunks via uniforms at lines 42583–42593 (cart-06 region). That audit is downstream, not here.
