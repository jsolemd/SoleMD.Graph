---
name: three.js canonical sources
description: Upstream authorities the references draw from. threejsresources.com is a curation index — the substantive content lives at the linked sources.
---

# Canonical sources

## Primary authorities

| Topic | URL |
|---|---|
| Tips and tricks (canonical) | https://discoverthreejs.com/tips-and-tricks/ |
| Three.js manual | https://threejs.org/manual/ |
| Three.js docs | https://threejs.org/docs/ |
| Three.js examples (read source for canonical patterns) | https://threejs.org/examples/ |
| TSL wiki | https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language |
| WebGPURenderer API | https://threejs.org/docs/#api/en/renderers/WebGPURenderer |
| WebGPU RenderPipeline (renamed from PostProcessing in r183) | https://threejs.org/docs/#api/en/renderers/webgpu/RenderPipeline |
| R3F docs | https://r3f.docs.pmnd.rs/ |
| Drei | https://github.com/pmndrs/drei |
| pmndrs/postprocessing | https://github.com/pmndrs/postprocessing |
| three.ez InstancedMesh2 | https://github.com/agargaro/instanced-mesh |
| pmndrs pointer-events / xr | https://github.com/pmndrs/xr |
| three-mesh-bvh | https://github.com/gkjohnson/three-mesh-bvh |

## TSL learning path

Nik Lever's series — concrete senior-level TSL material:
- Part 1: https://niklever.com/getting-to-grips-with-threejs-shading-language-tsl/
- Part 2: https://niklever.com/tutorials/getting-to-grips-with-threejs-shading-language-tsl-2/
- Part 3 (vertex displacement): …-3/
- Part 4 (`mx_noise_float`, varying): …-4/
- Part 5 (`fragmentNode`, `toVar` for CSE): …-5/
- Part 6 (custom flock geometry, `instanceID`): …-6/
- Part 7 (`Fn().compute()`, dispatches): …-7/
- Part 8 (`Loop`, `If`, neighbor queries): …-8/
- Part 9 (vertex animation baking): …-9/
- Part 10 (full integration): …-10/

## Tooling

| Tool | URL |
|---|---|
| **Needle Inspector** (current best three.js debugger; auto-detects scenes; ships Claude/Cursor MCP integration — directly relevant to this codebase) | https://needle.tools |
| Three.js DevTools (Chrome extension; requires explicit registration) | https://github.com/mrdoob/threejs-devtools |
| Spector.js (WebGL only) | https://spector.babylonjs.com/ |
| Stats.js | https://github.com/mrdoob/stats.js/ |
| stats-gl (per-pass GPU timing) | https://github.com/RenaudRohlinger/stats-gl |
| GLTF/GLB Viewer for VS Code | OHZI extension on Marketplace |
| gltf-transform CLI | https://gltf-transform.dev/ |
| SimonDev gltf-optimizer | https://gltf-optimizer.simondev.io/ |
| KTX-Software (Basis Universal) | https://github.com/KhronosGroup/KTX-Software |
| Theatre.js | https://theatrejs.com |
| Threlte | https://threlte.xyz |

## ThreeJS resources directory

threejsresources.com is a curation index. Treat it as a routing map, not a knowledge base — its substantive content lives at the upstream URLs above.
- Homepage: https://threejsresources.com/
- Tools: https://threejsresources.com/tools
- Tips and Tricks tool entry → https://discoverthreejs.com/tips-and-tricks/
- React Three Fiber tool entry → https://r3f.docs.pmnd.rs/
- three.ez/instanced-mesh tool entry → https://github.com/agargaro/instanced-mesh
- pmndrs/postprocessing tool entry → https://github.com/pmndrs/postprocessing
