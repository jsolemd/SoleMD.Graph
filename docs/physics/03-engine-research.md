# Engine Research

This document evaluates whether the connectome should adopt an external physics
engine or build a semantic force layer on top of the current Three/R3F field
runtime.

## Recommendation

Use external libraries for layout research, preprocessing, and small prototypes.
Do not adopt a general rigid-body physics engine as the core runtime.

The core product needs graph-aware semantic physics:

- Weighted entity-paper-citation relationships.
- Search and RAG attention pulses.
- Logical scope and resident set management.
- Baked global layout plus local runtime refinement.
- Smooth streaming of neighborhoods and aggregate tiles.
- Browser-safe draw and compute budgets.

Rigid-body engines are built around colliders, joints, impulses, contact
resolution, friction, restitution, and mechanical simulation. Those concepts are
not the primary constraints of a biomedical graph. They can help with isolated
game-like interactions, but they should not own the connectome runtime.

## Current Stack Fit

| Technology | Already Present | Fit |
| --- | --- | --- |
| Three.js | Yes | Core rendering substrate for custom point clouds, shaders, WebGL, and future WebGPU |
| React Three Fiber | Yes | React integration, shared frame loop, scene lifecycle |
| drei | Yes | Useful utilities, camera/control helpers |
| d3-force | Yes | Useful force vocabulary and prototyping model |
| Cosmograph / `@cosmos.gl/graph` | Yes | Existing GPU graph reference and 2D graph lens |
| DuckDB-WASM | Yes | Browser active views, filtering, local joins, lazy bundle attachment |

The clean path is to keep the existing field substrate and add semantic physics
as a bounded runtime layer, not replace the canvas with a black-box graph engine.

## Library Evaluation

| Candidate | Strengths | Weaknesses for This Product | Recommendation |
| --- | --- | --- | --- |
| `d3-force` | Clear force model, alpha/temperature semantics, many-body/link/collision forces, already installed | 2D, CPU/main-thread by default, not suitable for large resident runtime | Use vocabulary and small prototypes; do not use for high-count live orb |
| `d3-force-3d` | Extends d3-force to 1D/2D/3D; simple path to local 3D prototypes | CPU/main-thread, not designed for 50K-100K resident points with browser UI | Good for focused neighborhoods and algorithm sketches |
| Graphology ForceAtlas2 | Mature graph layout library, Barnes-Hut options, useful quality settings | Layout algorithm, not interactive galaxy engine; browser runtime cost can still be high | Use in worker/offline benchmarking or small client slices |
| ForceAtlas2 / Gephi-style methods | Strong published model for continuous graph spatialization | Needs adaptation and preprocessing for our data contracts | Good publish-time layout family |
| Stress majorization | Optimizes graph-theoretic target distances; strong epistemic fit for "near means related" | Heavier full-pair distance model; needs approximation/pivots for large graphs | Add to publish-time bake-off against FA2/UMAP |
| tsNET / t-SNE graph layouts | Scalable graph-layout family using t-SNE-style optimization and preprocessing | Research/bake-time candidate, not browser runtime | Evaluate as a large-graph layout benchmark |
| Three WebGPU / TSL | Future path for GPU compute and storage buffers inside existing renderer | Browser/device support and fallback complexity | Target for long-term kernel after WebGL2 baseline works |
| Three GPUComputationRenderer | Practical WebGL2 GPGPU technique for texture-based simulation | More manual shader work; texture packing constraints | Good fallback path for resident physics textures |
| `@cosmos.gl/graph` / Cosmograph | Existing GPU graph reference: float FBO position state, velocity FBOs, many-body/quadtree forces, WebGL constraints | 2D graph engine with its own lifecycle and force semantics | Treat as the named WebGL2 reference implementation; adapt patterns, not product runtime |
| deck.gl | Strong WebGL point rendering, documented chunking advice, color-picking FBO pattern | Owns layer/render lifecycle; WebGPU picking path is not mature; not semantic graph physics | Do not adopt as runtime now; use picking and chunking patterns |
| react-force-graph-3d | Fast prototype of Three + d3-force-3d graph scenes | Owns rendering lifecycle and interaction model; conflicts with persistent field runtime | Prototype only, not core |
| ngraph.forcelayout | Fast graph force layout ecosystem and Barnes-Hut-style ideas | Separate renderer/data model; adoption risk without clear product fit | Research/reference only |
| PBD / XPBD-style constraints | GPU-friendly position constraints for link length, separation, and soft bounds | Needs custom semantic mapping and solver design; not a drop-in library | Candidate kernel family, distinct from rigid-body engines |
| Rapier | Strong WASM rigid-body engine | Rigid bodies/colliders do not express semantic graph physics | Do not use for core connectome |
| cannon-es | Simple JavaScript rigid-body engine for Three scenes | Same mismatch: mechanical world, not semantic graph | Avoid for core; possible toy interactions only |
| matter-js | Mature 2D rigid-body engine | 2D mechanical simulation; wrong abstraction | Avoid |
| Potree / point-cloud LOD ideas | Proven octree/LOD patterns for huge point clouds | Built for spatial point clouds, not semantic graph physics | Borrow LOD concepts, not runtime |

## d3-force and d3-force-3d

d3-force is useful because its concepts map well to graph language:

- Simulation temperature.
- Velocity decay.
- Centering.
- Link springs.
- Many-body charge.
- Collision/separation.

The d3-force documentation describes a velocity-Verlet style simulation with
forces mutating node velocity, then velocity updating node position. That mental
model is exactly the right vocabulary for our docs and small experiments.

d3-force-3d is a straightforward way to test 3D forces around one selected
entity or wiki system. It should not be the main runtime for the full orb unless
measurement proves a narrow, bounded use case. The browser still has to handle
React, labels, picking, DuckDB work, and panels at the same time.

Recommended use:

- Prototype an entity system with 500-5,000 bodies.
- Compare force constants and settling behavior.
- Export tuned constants and equations into the custom kernel.
- Keep it out of the main large resident particle loop.

## ForceAtlas2

ForceAtlas2-style layout is a strong fit for publish-time spatialization. The
important product question is not whether ForceAtlas2 can animate the browser
scene. The question is whether it can produce stable seed layouts that preserve
semantic neighborhoods before runtime forces take over.

Recommended use:

- Run offline or in worker build jobs.
- Compare against 3D UMAP and other embedding-to-graph refinements.
- Store stable coordinates, cluster centroids, and local neighborhoods in graph
  bundles.
- Use browser physics for local refinement and attention, not global layout
  computation.

Graphology's ForceAtlas2 implementation is useful for JavaScript-side research,
settings vocabulary, and benchmark comparisons. Python/Rust/graph-tool-style
pipelines may be more appropriate for large corpus publish jobs.

## Stress And tsNET Layouts

ForceAtlas2 should not be the only publish-time layout family. Biomedical graph
space has an epistemic burden: when two objects are close, the product implies
some kind of relation. Stress majorization is worth evaluating because it
optimizes layout against graph-theoretic target distances rather than only
producing visually separated clusters.

Recommendation:

- Add a publish-time bake-off between ForceAtlas2, stress-majorization variants,
  3D UMAP/embedding projections, and tsNET-style methods.
- Score each layout by neighborhood preservation, cluster separability,
  coordinate stability across runs, runtime/build cost, and clinical
  interpretability.
- Prefer stable seed coordinates over animated browser layout quality. The
  browser can refine local systems, but the worker owns global spatial memory.

Stress methods may be too expensive for the full corpus without approximation,
pivots, sparsification, or multilevel techniques. That is acceptable: this is a
worker benchmark candidate, not a browser runtime commitment.

## Three WebGPU and WebGL2 GPGPU

The likely long-term runtime is custom GPU physics inside the current Three
stack.

Short-term WebGL2 path:

- Store dynamic state in textures.
- Integrate position and velocity in fragment shader passes.
- Keep new per-particle lanes out of vertex attributes.
- Use CPU/DuckDB only to update active scopes, event buffers, and resident
  planner outputs.

Long-term WebGPU path:

- Use storage buffers for positions, velocities, masses, and compact edge data.
- Run compute passes for forces and integration.
- Keep WebGL2 as the baseline product path. WebGPU is a feature-detected upgrade
  backend, and no user-facing galaxy feature should ship WebGPU-only.

Three's WebGPU renderer and node/TSL work are relevant because they keep the
future inside the existing Three ecosystem rather than forcing a separate engine.

## Cosmograph

Cosmograph should not be treated as a sidebar. The open `@cosmos.gl/graph`
engine is the closest existing WebGL reference for the runtime we are
describing.

Patterns to keep:

- Float-texture position state.
- Current/previous position framebuffers with explicit FBO swapping.
- Velocity framebuffer accumulation.
- Many-body force implemented on the GPU.
- Quadtree/Barnes-Hut-style approximation encoded through framebuffer levels.
- Alpha/cooling style simulation controls.
- GPU-backed hover/selection paths where practical.

Patterns to change:

- Extend from 2D graph positions to 3D semantic systems.
- Add wiki/entity/paper object grammar instead of generic point/link semantics.
- Add resident streaming, prompt provisional matter, and DuckDB active scopes.
- Keep the persistent `FieldCanvas` lifecycle rather than giving the scene to a
  separate renderer.
- Preserve the existing Cosmograph surface as the 2D high-density map lens.

Important caveat: cosmos.gl's WebGL path depends on float-texture capabilities.
Its own docs call out Android devices without `OES_texture_float` as
unsupported. Our baseline must have capability tiers and graceful fallback
behavior.

## deck.gl

deck.gl is not the recommended runtime, but it is a serious reference for large
point rendering and picking.

What to borrow:

- Color-picking through an offscreen framebuffer.
- Encoded object IDs decoded from the pixel under the pointer.
- Chunked layer/data patterns for incremental loading.
- The habit of disabling picking for layers that do not need it.

What not to borrow yet:

- A separate layer lifecycle that competes with `FieldCanvas`.
- Map-centric coordinate assumptions.
- WebGPU as a picking solution; deck.gl's own docs currently skip picking on
  WebGPU paths.

For the clinical galaxy, the picking contract should be implemented in our
Three/WebGL/WebGPU backend, but deck.gl is the clearest public reference for the
pattern.

## Rigid-Body Engines

Rapier and cannon-es are strong tools for physical game worlds. They are not
strong semantic graph engines.

They solve:

- Collisions.
- Rigid body dynamics.
- Constraints and joints.
- Contact manifolds.
- Friction/restitution.
- Ray casting and character controllers.

The connectome needs:

- Weighted graph layout.
- Search/RAG event fields.
- Evidence strength.
- Uncertainty and stability.
- Scope masks.
- Resident set streaming.
- Aggregate-to-identity transitions.

Those needs are far closer to graph force simulation and GPU particle systems
than rigid-body simulation. Adding Rapier for the core graph would create an
adapter layer that fights the data model.

Acceptable niche use:

- A small, isolated interaction where bodies bounce or collide for a deliberate
  educational effect.
- A benchmark proving that a collision solver helps label/body avoidance in a
  constrained local system.

Default decision: no rigid-body engine in the core connectome.

## Position-Based Constraints

Rejecting rigid-body engines does not mean rejecting constraints.

PBD/XPBD-style integration is a candidate kernel family because it can express
graph-friendly position constraints:

- Link length constraints.
- Separation constraints.
- Soft scope boundaries.
- Orbit shell constraints.
- Cluster cohesion constraints.
- Camera/local-system containment.

This is different from adopting Rapier or cannon-es. We do not need a mechanical
world with rigid colliders and contact manifolds. We may want constrained
position integration over resident graph particles, especially if the GPU kernel
needs predictable, stable local corrections.

Open questions before adopting PBD/XPBD:

- Do constraints converge fast enough for 25K-100K resident particles?
- Do we use Jacobi-style updates, graph coloring, or multiple passes?
- Can constraints remain explainable as semantic forces?
- Does the method preserve stable identity across streaming and slot reuse?

Treat PBD/XPBD as a backend candidate for `SemanticPhysicsKernel`, not as a
third-party engine decision.

## Point-Cloud LOD

Point-cloud systems like Potree are conceptually useful because they show how a
viewer can feel connected to a huge dataset without drawing every point at once.
The transferable ideas are:

- Hierarchical tiles.
- Screen-space error or importance scores.
- Progressive loading.
- Aggregate-to-detail transitions.
- Frustum-aware residency.

The direct runtime is not a perfect fit because biomedical graph space is
semantic, not physical scan space. Still, the LOD mindset is exactly right: the
orb can represent a million-point corpus through tiles, clusters, and local
identity expansion.

## Physics Engine Contract

If the project adds an engine-like layer, it should be our contract, not a
third-party abstraction.

Minimum interface:

```ts
type PhysicsEvent =
  | { type: 'focus'; id: string; strength: number }
  | { type: 'scope'; scopeId: string; strength: number }
  | { type: 'searchPulse'; ids: string[]; scores: Float32Array }
  | { type: 'evidencePulse'; ids: string[]; scores: Float32Array }
  | { type: 'promptMatter'; candidates: PromptCandidate[] };

interface SemanticPhysicsKernel {
  setResidentSet(residents: ResidentParticle[]): void;
  setEdges(edges: CompactEdgeBuffer): void;
  dispatch(event: PhysicsEvent): void;
  step(dt: number): void;
  readState(): PhysicsStateView;
  dispose(): void;
}
```

Backends can then vary:

- CPU prototype.
- d3-force local prototype.
- WebGL2 texture kernel.
- WebGL2 PBD/XPBD-style constraint kernel.
- WebGPU compute kernel.

The product code should depend on `SemanticPhysicsKernel`, not directly on a
specific external simulation library.

## Benchmark Questions

Before adopting any runtime engine, measure:

- How many resident identities can it simulate at 60 FPS and 30 FPS?
- How does it behave while DuckDB queries run?
- How expensive is picking?
- How expensive are labels?
- Can it pause, reduce motion, and resume deterministically?
- Can it stream points in and out without popping?
- Can it preserve stable identity across reference-frame changes?
- Can force causes be inspected in a debug overlay?
- Does it support mobile/touch budgets?

An engine that looks good in isolation but cannot satisfy these questions should
stay out of the core runtime.

## Practical Roadmap

1. Keep current Three/R3F `FieldCanvas`.
2. Add explicit residency state and resident reason.
3. Convert the 16K pool to identity-only and move dust to a separate
   non-pickable shader/aggregate path.
4. Prototype local entity-system physics with d3-force-3d or a small CPU kernel.
5. Promote the tuned vocabulary into a project-owned `SemanticPhysicsKernel`.
6. Add WebGL2 texture-based position/velocity integration for resident sets.
7. Implement GPU color-picking FBO before GPU positions become authoritative.
8. Use worker-built ForceAtlas2/stress/UMAP bake-offs for stable seed
   coordinates.
9. Explore PBD/XPBD constraints for link length, separation, and orbit shells.
10. Explore WebGPU/TSL once the WebGL2 contract and fallback semantics are clear.

That keeps the project open to OSS help without giving away the central product
grammar.

## Sources Consulted

- d3-force simulation: https://d3js.org/d3-force/simulation
- d3-force many-body/link force family: https://d3js.org/d3-force/many-body
- d3-force-3d: https://github.com/vasturiano/d3-force-3d
- cosmos.gl / `@cosmos.gl/graph`: https://github.com/cosmosgl/graph
- cosmos.gl OpenJS overview: https://openjsf.org/blog/introducing-cosmos-gl
- deck.gl picking: https://deck.gl/docs/developer-guide/custom-layers/picking
- deck.gl performance: https://deck.gl/docs/developer-guide/performance
- deck.gl WebGPU status: https://deck.gl/docs/developer-guide/webgpu
- Graphology ForceAtlas2: https://graphology.github.io/standard-library/layout-forceatlas2.html
- ForceAtlas2 paper: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679
- Graph Drawing by Stress Majorization: https://doi.org/10.1007/978-3-540-31843-9_25
- Graph Layouts by t-SNE / tsNET: https://www2.cs.arizona.edu/~kobourov/tsne-eurovis17.pdf
- Three.js WebGPU renderer: https://threejs.org/docs/pages/WebGPURenderer.html
- Three.js GPUComputationRenderer: https://threejs.org/docs/pages/GPUComputationRenderer.html
- React Three Fiber hooks and `useFrame`: https://r3f.docs.pmnd.rs/api/hooks
- Chrome WebGPU overview and support notes: https://developer.chrome.com/docs/web-platform/webgpu/overview
- OES half-float linear filtering: https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_half_float_linear
- OES float linear filtering: https://registry.khronos.org/webgl/extensions/OES_texture_float_linear/
- XPBD paper: https://mmacklin.com/xpbd.pdf
- Rapier JavaScript guide: https://rapier.rs/docs/user_guides/javascript/getting_started_js
- Cannon-es docs: https://pmndrs.github.io/cannon-es/
- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN WebGL `getParameter`: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter
