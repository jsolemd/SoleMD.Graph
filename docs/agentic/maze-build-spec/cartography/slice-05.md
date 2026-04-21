# Slice 05 — scripts.pretty.js lines 32001–40000

**Cartographer**: cart-05
**Slice**: [32001, 40000]
**Date**: 2026-04-19

## Summary

This slice is **99% bundled third-party library code** (Three.js WebGL renderer internals and lil-gui debug UI framework). The only Maze-relevant symbol is **`Ei`** (line 35593), the base controller class that inherits from the event-emitter `Ll`. No Maze-specific application code exists in this range; the actual Maze implementation begins at line 42467 (scene parameter registry `cs.*`). This slice is a pure dependency boundary with no Maze choreography, no popup/stream motion-path code, and no cross-slice Maze dependencies within its range.

## Section inventory

| # | Section name | Lines | Purpose | Key Maze symbols | Name resolution | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | Three.js WebGL Renderer internals | [32000, 35562] | Low-level WebGL texture binding, material setup, render target management, and state machine for compiled shader programs. | none — pure Three.js library code | Three.js r165+ (bundled) | none | large (1500+ lines) | None within Maze; uses WebGL API only. |
| 2 | Event emitter base class (`Ll`) | [35565, 35590] | Simple observer pattern: on/off/trigger for event subscriptions. Parent class for all controllers. | `Ll` | defined at lines 35565–35590 | none — event pattern only | trivial | Inherited by `Ei` at line 35593. |
| 3 | Controller base class (`Ei`) | [35593, 35617] | Abstract base controller that inherits from `Ll`; owns a DOM view, UUID, and stub lifecycle methods (onState, animateIn, animateOut, init, destroy). | `Ei`, `Ll`, `Iy` (UUID gen) | defined at lines 35593–35617 | `apps/web/features/field/controller/FieldController.ts` (intent/contract) | small (25 lines) | Extends `Ll` (line 35565, same slice). Subclassed by `ug` (stream controller) at line 49326 (outside slice). |
| 4 | lil-gui debug UI framework | [35619, 40000] | Complete debug inspector library: controllers, folders, colors, number sliders, dropdowns, and layout. Bundled to support `Gs` (debug GUI singleton, line 36931). | `Dl` (base controller), `uv` (color picker), `rm` (GUI root), `Gs` (GUI singleton), `sm`, `am` (loaders) | lil-gui v0.20.0 (https://lil-gui.georgealways.com, @license MIT) | none — debug UI is Maze-only | large (4400+ lines) | `Gs` instantiates `rm()` at line 36931; uses for material/scene parameter inspection (optional, `?gui` query param gated). |

**Name resolution**: 
- `Ll`, `Ei`: defined within slice at listed lines.
- `Dl`, `uv`, `rm`, `Gs`, `sm`, `am`: Three.js and lil-gui internals; see bundled source comments.
- `Iy`: UUID generator, imported/defined outside slice.

## Existing map overlap

| Section | Existing coverage | New info |
|---|---|---|
| `Ei` (base controller) | **runtime-architecture-map.md § 6** ("The base controller is `yr` in scripts.pretty.js:43013–43254") | `Ei` is a different base class (lines 35593–35617) that appears earlier; **`Ei` is NOT the Maze `yr` base controller**. `Ei` is the generic DOM controller base from which all anchors inherit. The Maze `yr` controller (mentioned at line 43013) is a subclass of `Ei`. |
| lil-gui framework | **runtime-architecture-map.md § 2** mentions `Gs` (debug GUI) uses `new rm()` constructor but does not map the framework source | Pinpoints lil-gui v0.20.0 bundled at lines 35619–40000; clarifies that `Gs` is the Maze singleton wrapper around the lil-gui `rm` (root GUI object). |

## Cross-slice closure boundary notes

**Opening boundaries (before line 32001):**
- Lines 32000–35562 are purely Three.js; all symbols are imported from Three.js library scope, not from other Maze slices.
- `Ll` (event emitter, line 35565) is defined in-slice and has no external dependencies.
- `Ei` depends on `Ll` (same slice, line 35565) and `Iy` (UUID generator, defined outside slice, imported earlier).

**Closing boundaries (after line 40000):**
- lil-gui (lines 35619–40000) is self-contained; next section is `Gs` (GUI singleton, line 36931) which wraps `rm()` but the instantiation logic is at line 36931.
- Line 40001 onwards continues with Three.js FBX loader and glTF animation parsing (third-party code continues).
- First Maze application code appears at line 42467 (`cs.*` scene parameter registry).
- No Maze controller classes (`mm`, `ug`, `_m`, `gm`, `xm`, `ym`, `bm`, `Sm`) are defined in this slice; they appear later (outside slice).

## Popups / stream DOM motion-path discoveries

None in this slice. This range contains no stream-related code, no DOM popup motion handlers, and no SVG rail choreography. The `KS` stream adapter (lines 48911–49035, per pilot) is outside this slice. Stream DOM motion-path is a known gap in Maze mapping; it is not resolved by slice 05.

## Notes for Phase 2 catalog synth

1. **Slice 05 is a pure-boundary slice**: 99% third-party library (Three.js + lil-gui), with exactly one Maze symbol (`Ei` base controller). It contains no choreography, no scene-specific code, and no Maze-internal cross-slice dependencies.

2. **`Ei` vs. `yr` confusion**: `Ei` (line 35593) is the generic DOM controller base inherited by **all controllers**. The Maze `yr` (mentioned in runtime-architecture-map.md § 6 at line 43013) is a **subclass of `Ei`** specialized for the Maze homepage scenes. Cartographers should clarify this hierarchy in Phase 2 synthesis.

3. **lil-gui bundling**: The debug GUI framework (lil-gui v0.20.0) is bundled inline (lines 35619–40000). The Maze wrapper is `Gs` (line 36931), which is instantiated on `?gui` query parameter. This is optional homepage infrastructure, not part of the core choreography.

4. **Three.js version**: The bundled Three.js appears to be r165+ based on error messages in the renderer code ("THREE.WebGLRenderer: WebGL 1 is not supported since r163"); confirm via the original build log or package.json snapshot if available.

5. **No stream popups in this slice**: The user flagged "points that pop up" (DOM popups on SVG motion-paths, `stream` adapter) as a known gap. This slice does not resolve it. The stream adapter `KS` is outside this range (pilot notes it at lines 48911–49035). Cart-02/03 should remain the primary hunters.

