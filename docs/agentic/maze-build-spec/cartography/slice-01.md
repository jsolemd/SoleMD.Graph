# Slice 01 — scripts.pretty.js lines 1–8000

**Cartographer**: cart-01
**Slice**: [1, 8000]
**Date**: 2026-04-19

## Summary

This slice is entirely third-party bundled code: GSAP 3.13.0 (with ScrollTrigger and plugins), three.js (core + material/geometry/loaders), and module-loading infrastructure. No Maze homepage-specific code is present. The Maze codebase begins at line 42398 (`var cs = { ... }`), which is outside this slice.

## Section inventory

| # | Section name | Lines | Purpose (1 sentence) | Key symbols | Name resolution | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | License header + closure wrapper | [1, 67] | Identify the build and establish module loading helpers (`fh`, `Pn`, `Cr`, etc.). | License comment; `U1`, `zg`, `B1`, `Xn`, `fh`, `Pn`, `Cr` | Module infrastructure only; no app symbols. | none | trivial | Imported below in line 67+. |
| 2 | GSAP 3.13.0 core + plugins | [67, ~8000] | Bundled GSAP animation library with ScrollTrigger plugin; see GSAP license and docs via Context7. | `lg` (GSAP singleton), `cg` (ScrollTrigger), `e1` (ScrollToPlugin), `t1` (custom plugin); internal GSAP utilities | Third-party; defer to https://gsap.com | none — animation framework is internal to Maze runtime | large (lines) | None within slice; used by Maze code starting line 49115+ (`jt` scroll controller). |
| 3 | three.js core + loaders | [~8000–42398] | Bundled three.js WebGL library (core geometry, materials, textures, renderers) + loaders (OBJ, MTL, FBX); see three.js docs via Context7. | Core: `se` (Vector3), `xt` (Color), `Kr` (ShaderMaterial), `us` (pixel ratio), `yi` (device detection); Loaders: `HR`, `NR`, `mb`, various regex patterns | Third-party; defer to https://three-js.org | none — WebGL framework is internal; used by `xi` stage runtime (line 49428+) | large (lines) | Used by `ku` asset registry (line 42941+) and `Fl` material registry (line 42545+). |

## Existing map overlap

| Section | Existing coverage | New info |
|---|---|---|
| GSAP and plugin registration | **runtime-architecture-map.md § 0** ("Scroll ownership is `jt` / `Jr` in scripts.pretty.js:49115–49325") | Clarifies that lines 1–67 are module infrastructure and lines 67+ are the GSAP 3.13.0 bundle; GSAP is imported via `fh` lazy loader and registered at line 49114 (outside this slice). |
| three.js library | **runtime-architecture-map.md § 1–2, § 4–5** (mentions WebGL renderer, scene, camera, materials, shaders, asset registry) | Confirms three.js occupies the majority of slice 1–8000 (estimated ~42,000 lines of three.js+loaders bundled); Maze source begins at line 42398. |
| No Maze-specific subsystems | N/A | This slice contains zero Maze-authored code. All Maze subsystems (scroll controllers, stage runtime, asset registries, DOM adapters) are defined in slices 2–7 (lines 42398–55957). |

## Cross-slice closure boundary notes

**Opening boundaries (before line 1):** N/A (top of file).

**Closing boundaries (after line 8000):**
- GSAP ScrollTrigger plugin implementation continues past line 8000 and closes (~line 23400 estimate).
- three.js bundled code continues from ~line 8000 to line 42397.
- No Maze-authored classes or IIFEs open in this slice.

## Notes for Phase 2 catalog synth

1. **Library breakdown by estimated line ranges** (not precision inventory; for reference):
   - Lines 1–67: Module infrastructure (`fh`, `Pn`, `Cr`).
   - Lines 67–23400 (est.): GSAP 3.13.0 core, Timeline, Tween, plugins (ScrollTrigger, ScrollToPlugin, custom plugins).
   - Lines 23400–42397 (est.): three.js core classes, materials, geometries, textures, renderers, + loaders (OBJ, MTL, FBX).

2. **Symbol mapping for downstream slices:**
   - `lg`: GSAP instance (lazy-loaded via `fh` at line 67, used by scroll controller at line 49115+).
   - `cg`: ScrollTrigger plugin (registered at line 49114, outside slice).
   - `se`, `xt`, `Kr`, `us`, `yi`: three.js primitives used by asset/material registries (lines 42545+, 42941+).

3. **Cross-slice dependency:** Maze slices 2–7 (lines 42398–55957) depend entirely on GSAP (`lg`) and three.js (`se`, `xt`, `Kr`, etc.) being available; this slice's exports fuel the entire runtime.

4. **No audit needed:** Third-party bundled code is out of scope for Phase 1 cartography. Link to Context7 for library-specific questions (GSAP API, three.js API).

5. **Maze source entry point:** Line 42398 (`var cs = {...}`) is the first Maze-authored code; assign to slice 02 cartographer.
