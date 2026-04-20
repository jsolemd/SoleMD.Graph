# Slice 02 — scripts.pretty.js lines 8001–16000

**Cartographer**: cart-02
**Slice**: [8001, 16000]
**Date**: 2026-04-19

## Summary

This 8,000-line slice contains the tail end of bundled GSAP 3.x event/utility code (lines 8001–8255) followed by three.js r150+ math and geometry primitives (lines 8256–16000). The GSAP section includes ScrollTrigger utility functions (viewport testing, batching, touch-action control) and ScrollTrigger API methods (saveStyles, revert, create, refresh, update, clearScrollMemory, maxScroll, getScrollFunc, batch). The three.js section implements mathematical classes (Vector2, Quaternion, Euler, BitMask, Object3D) and BufferGeometry operations. **No Maze homepage logic resides in this slice**—it is pure third-party bundled library code with no direct application to cartography.

## Section inventory

| # | Section name | Lines | Purpose | Key symbols | Name resolution | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | GSAP ScrollTrigger API & utility functions | [8001, 8255] | Static method attachments to ScrollTrigger singleton (`mn`): scroll helper methods (isInViewport, positionInViewport, killAll, clearScrollMemory, batch, maxScroll); style saving/reversion; and low-level event routing. | `mn`, `ue`, `ie`, `$i`, `Sa`, `Vr`, `ln`, `Qd`, `uh`, `ef` | Defined in lines 8001–8255 inside GSAP module IIFE; outside slice | none — third-party GSAP ScrollTrigger API | large (lines) | Depends on scroll globals defined before line 8001 (`ie`, `ye`, `Ce`, `gt`, `Ne`, `S`, `C`); no closure cuts within slice |
| 2 | three.js Vector2 class (`se`) | [9948, 10237] | 2D vector algebra: constructor, component accessors, vector ops (add/sub/multiply/divide), transformations (applyMatrix3, rotate), metrics (length, dot, cross, distance, lerp), and iteration. | `se`, `Sn`, `this.x`, `this.y` | Native three.js `Vector2`; defined in this slice; exported as `se` per bundling convention | none — imported into Maze via bundled three.js | small (lines) | Depends on `Sn()` clamp function (defined before line 8001) |
| 3 | three.js Quaternion class (`cr`) | [10240, 10336] (header; extends through 11000+) | 4D quaternion math: SLERP, quaternion multiplication, Euler angle conversion, normalization, composition. | `cr`, `_x`, `_y`, `_z`, `_w`, `slerpFlat`, `multiplyQuaternionsFlat` | Native three.js `Quaternion` | none — bundled three.js utility | medium (inheritance) | Methods extend past slice boundary; static methods defined within |
| 4 | three.js Euler class (`ur`) | [13900+, 14062] | Euler angle representation with order awareness (XYZ, XZY, YXZ, YZX, ZXY, ZYX): rotation matrix/quaternion conversion, reordering, iteration. | `ur`, `Vy`, `Gy`, `_onChangeCallback` | Native three.js `Euler` | none — bundled three.js | small (lines) | Depends on `Quaternion` (`cr`) and `setFromRotationMatrix()` patterns |
| 5 | three.js BitMask class (`Ph`) | [14064, 14092] | Layer/frustum culling mask: bit set/enable/disable/test/toggle operations. | `Ph`, `mask` | Native three.js internal `BitMask` | none — bundled three.js | trivial | Self-contained utility; no external deps |
| 6 | three.js Object3D class (`pi`) | [14108, 14300+] (header; extends past slice) | Scene graph node: position/rotation/quaternion/scale properties, matrix math, add/remove/attach children, hierarchy traversal, ray casting setup. Constructor at 14108–14154 creates position/rotation/quaternion/scale vectors with change callbacks. | `pi`, `Wa`, `this.isObject3D`, `this.parent`, `this.children`, `this.up`, `this.matrix`, `this.matrixWorld` | Native three.js `Object3D` base class | none — bundled three.js scene graph primitive | large (inheritance) | Extends `Wa` EventDispatcher (defined before slice); uses `Ph` (BitMask), `ur` (Euler), `cr` (Quaternion), `se` (Vector3 equivalent) |
| 7 | three.js BufferGeometry geometry operations | [15900+, 16225+] | Mesh geometry attribute management: setAttribute/getAttribute, group management (addGroup, clearGroups, setDrawRange), matrix application, bounding box/sphere computation, tangent calculation, vertex normal generation. | `BufferGeometry`, `getAttribute`, `setAttribute`, `applyMatrix4`, `computeBoundingBox`, `computeBoundingSphere`, `computeTangents`, `computeVertexNormals` | Native three.js `BufferGeometry` | none — bundled three.js | large (lines) | Uses `Vector3`, `Matrix4`, `Matrix3` math classes; spans into line 16225+ |

## Existing map overlap

| Section | Existing coverage | New info |
|---|---|---|
| GSAP ScrollTrigger API | **runtime-architecture-map.md § 0** ("Scroll ownership is `jt` / `Jr` in scripts.pretty.js:49115–49325") | Pinpoints utility methods that support scroll state (isInViewport, positionInViewport, batch, maxScroll) as static methods on `mn` at lines 8001–8255; these are used internally by scroll driver but not directly exposed to homepage choreography. |
| three.js math primitives (Vector2, Quaternion, Euler) | **Not previously mapped** | Three.js internal library implementation included as part of bundled payload; not part of Maze homepage logic or asset pipeline. |
| Object3D + BufferGeometry | **Not previously mapped** | Scene graph and mesh geometry primitives bundled within scripts.pretty.js; used internally by three.js renderer but topology/mutation logic not invoked from Maze homepage chapters. |

## Cross-slice closure boundary notes

**Opening boundaries (before line 8001):**
- `mn` (ScrollTrigger singleton) — instantiated and configured before line 8001; static methods added starting line 8001
- `ie` (GSAP core), `ye` (window), `Ce` (documentElement), `gt`, `Ne`, `S`, `C` (scroll state) — all referenced in 8001–8255 section; initialized outside slice
- `Wa` (EventDispatcher base class for three.js) — extended by `pi` (Object3D) at line 14108; defined before line 8001
- `Sn()` (clamp function) — used by Vector2, Quaternion, Euler; defined before slice

**Closing boundaries (after line 16000):**
- BufferGeometry methods (computeTangents, computeVertexNormals) extend past line 16000 into lines 16200+
- three.js class definitions continue with Material, Mesh, Scene, Renderer and other core objects in slices beyond 16000

## Popups / stream DOM motion-path discoveries

None in this slice. The entire 8001–16000 range is pure third-party library code (GSAP event utilities and three.js math/geometry). No `getPointAtLength`, `motionPath`, DOM popup templates, `data-scroll` adapters, or stream-specific markup are present.

## Notes for Phase 2 catalog synth

1. **Third-party bundle structure**: Lines 8001–16000 are deep inside the GSAP + three.js bundled payload. They contain no homepage-specific logic and are not suitable for individual cartography detail in Phase 1. Recommend treating the entire payload as one "defer to Context7" row in the catalog: "GSAP 3.13.0 + three.js r150 — scroll event API + math/geometry primitives."

2. **No cross-slice closure cuts**: All major class definitions (Vector2, Quaternion, Euler, BitMask, Object3D) have their constructors and methods complete within slice or are properly documented as extending past it. No partial closures straddle line 16000.

3. **Unused three.js classes in homepage context**: BufferGeometry methods (setFromPoints, computeBoundingBox, computeTangents, computeVertexNormals) are bundled but not visibly called on the homepage; the geometry supply chain is handled by asset registry (`jo` from runtime-architecture-map.md § 5) and loader (`ku`).

4. **Recommendation**: Skip detailed cartography of this slice. Assign to Context7 as "third-party bundled libraries with no Maze hostname logic." Phase 2 can collapse to: "Third-party: GSAP + three.js (8001–16000)—defer to vendor docs."
