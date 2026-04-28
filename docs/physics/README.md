# Physics Charter

The clinical connectome should become a living, traversable galaxy where motion
is not decoration. Position, orbit, pulse, drift, and disappearance should all
communicate something about the corpus, the current task, and the user's
attention.

This folder collects the dedicated physics pass for that product direction. It
supersedes the scattered physics notes in `docs/orb/` only where it is more
specific. The older orb documents remain useful for implementation history,
render lanes, and the current `OrbSurface`/`FieldCanvas` migration.

## Reading Order

1. [Physics Grammar](./01-physics-grammar.md)
   defines the galaxy metaphor, object taxonomy, physics variables, and the
   semantic meaning each variable is allowed to carry.
2. [Runtime Model](./02-runtime-model.md)
   maps the grammar onto the current browser runtime, DuckDB session, field
   state lanes, bundle/API responsibilities, and resident particle strategy.
3. [Engine Research](./03-engine-research.md)
   evaluates d3-force, d3-force-3d, ForceAtlas2, Three/WebGPU, Cosmograph,
   rigid-body engines, and point-cloud LOD systems.

## North Star

The experience should feel like a scientific instrument, not a screensaver.

- A wiki page can be a star system.
- Entities can be planets.
- Papers can be moons, rings, belts, or satellites.
- Evidence trails can appear as comets, pulses, wakes, or dust.
- Prompt/RAG entities that are not already resident can enter as provisional
  matter, then stabilize if they resolve to corpus-backed identity.

The important constraint: a user should be able to ask "why did that move?" and
get a data-grounded answer.

## Current Reality

The current orb surface already has useful primitives:

- A fixed 16,384-particle field texture budget from
  `apps/web/features/field/asset/point-source-registry.ts`.
- A 128 x 128 state texture in
  `apps/web/features/field/renderer/field-particle-state-texture.ts`.
- Scope, focus/hover, and evidence/search pulse lanes resolved from DuckDB and
  RAG state.
- Ambient motion controls for pause, reduced motion, speed, rotation, and
  entropy.
- A persistent `FieldCanvas` with `OrbSurface` as the current 3D graph surface.

Those pieces are enough for the first semantic physics layer, but they do not
yet provide true load shedding. In the current single draw path, fading a point
to alpha zero hides it visually but still pays most vertex processing cost. A
larger galaxy needs resident sets, chunked draw paths, lazy graph bundles, and
explicit fade-in/fade-out residency states.

## Working Decision

Do not pick a rigid-body physics engine for the core connectome. Rigid-body
engines solve collisions, restitution, joints, and mechanical worlds. The
connectome needs semantic graph physics: weighted relationships, evidence
strength, scope, uncertainty, activity, and query attention.

The likely architecture is:

- Publish-time layout and graph preprocessing in `apps/worker`.
- Request-time neighborhood and evidence expansion in `apps/api`.
- Browser-side DuckDB for active views and residency decisions.
- Three/R3F rendering on the existing field substrate.
- A custom semantic force kernel, initially WebGL2-compatible and later
  WebGPU/TSL where browser support allows it.
- OSS layout algorithms, especially ForceAtlas2-style methods, used at build
  time or as references rather than as the product runtime.
- WebGPU is a feature-detected upgrade path, not a product gate; WebGL2 remains
  the baseline until the support contract is intentionally changed.
- The current 16K particle pool should become identity-only; ambient dust should
  move to a separate non-pickable shader/aggregate path.

## Source Anchors

Internal anchors:

- `docs/orb/03-physics-model.md`
- `docs/orb/10-force-vocabulary.md`
- `docs/orb/11-three-layer-composition.md`
- `docs/orb/14-bundle-build-pipeline.md`
- `docs/future/orb-3d-physics-taxonomy.md`
- `docs/map/graph-runtime.md`
- `docs/rag/15-repo-structure.md`

External anchors:

- d3-force simulation: https://d3js.org/d3-force/simulation
- d3-force-3d: https://github.com/vasturiano/d3-force-3d
- cosmos.gl / `@cosmos.gl/graph`: https://github.com/cosmosgl/graph
- deck.gl picking: https://deck.gl/docs/developer-guide/custom-layers/picking
- deck.gl performance: https://deck.gl/docs/developer-guide/performance
- Stress majorization: https://doi.org/10.1007/978-3-540-31843-9_25
- tsNET graph layouts: https://www2.cs.arizona.edu/~kobourov/tsne-eurovis17.pdf
- Three.js WebGPU renderer: https://threejs.org/docs/pages/WebGPURenderer.html
- Three.js GPUComputationRenderer: https://threejs.org/docs/pages/GPUComputationRenderer.html
- React Three Fiber hooks: https://r3f.docs.pmnd.rs/api/hooks
- Graphology ForceAtlas2: https://graphology.github.io/standard-library/layout-forceatlas2.html
- ForceAtlas2 paper: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679
- XPBD paper: https://mmacklin.com/xpbd.pdf
- Rapier JavaScript guide: https://rapier.rs/docs/user_guides/javascript/getting_started_js
- Cannon-es docs: https://pmndrs.github.io/cannon-es/
- WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- WebGL `getParameter`: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter
