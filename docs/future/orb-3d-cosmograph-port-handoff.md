# Orb 3D — Cosmograph port + physics handoff

> **What this is.** A self-contained framing document for a fresh agent
> to pick up the design conversation around porting the full
> `/map` Cosmograph experience into the `/graph` 3D orb, with live
> physics. Conceptualization, not implementation. Read top-to-bottom
> before opening any files.
>
> **What this is not.** A plan to start coding. The user's explicit
> ask: "I don't necessarily need all of it to be fully figured out
> now but I want to conceptualize this." Most of this doc poses
> design questions; the answers are TBD across multiple sessions.

## North star

The user's vision, near-quoted:

> The 3D orb on `/graph` will eventually subsume `/map`'s 2D
> Cosmograph entirely — wiki, info panel, filter, timeline, search
> excitation, all of it. Not just visual replacement; full
> interactive parity. The 3D environment + physics should make it
> *feel like an interactive game whose purpose is education*.
>
> Physics means something. When the user issues a search (or RAG
> retrieval lands hits), the answer particles **coalesce and form**
> — like a galaxy where gravity binds semantically related papers.
> Highly cited papers have more mass; papers that share entities
> cluster; papers that share semantic embeddings cling. The user can
> zoom in, zoom out, slow the spin, speed it up, pause it. Selection
> and filtering work the way Cosmograph's do — when you press
> "info", whatever is currently filtered is what shows.
>
> The bundle already carries data that supports this. The backend
> FastAPI service (`apps/api/`, currently a clean-room rebuild
> target) will provide more on click. The principles to leverage are
> already implicit in the data: citation count → mass; entity
> overlap → semantic affinity; cluster membership → group identity.

## What's already done (foundation — do not redo)

This session landed three coupled fixes that make `/graph` viable as
the substrate for everything below. **Read these before designing
on top of them.**

| Concern | Fix | Files |
|---|---|---|
| Monorepo `.env.local` never reached SSR runtime | `instrumentation.ts` calls `loadEnvConfig(... forceReload: true)` once on Node boot | `apps/web/instrumentation.ts` |
| `@duckdb/duckdb-wasm` browser entry crashed SSR (`Worker is not defined`) | `connection.ts` defers the runtime import to a memoized lazy load; types stay static | `apps/web/features/graph/duckdb/connection.ts` |
| Baker hit `Binder Error: paper_id not found` against the camelCase view | Aligned baker SQL + interface to the `base_points_web` view contract everyone else uses | `apps/web/features/orb/bake/use-paper-attributes-baker.ts` |
| Per-chunk maxima made paper "mass" a function of arbitrary batch membership; linear-over-max pinned 90% of corpus to the size floor | Pre-flight `quantile_cont(LN(1+x), [0.05, 0.98])` query before streaming; log-percentile-pow shape; widened range `[0.8, 2.6]` size and `[1.75, 0.55]` speed (FAST→SLOW); `ORDER BY id` for stable particle indices; `PaperCorpusStats` carried on every chunk | `apps/web/features/orb/bake/{use-paper-attributes-baker.ts, apply-paper-overrides.ts}`, `apps/web/features/orb/stores/geometry-mutation-store.ts` |

The mass-normalization plan that frames this is the must-read prior:
**`docs/future/orb-mass-normalization-port.md`**.

## The architectural rule everything below honors

**Render lanes ≠ physics lanes.**

- **Render lanes** (today): `aSpeed` (shader noise multiplier),
  `aClickPack.w` (sprite size factor), `aBucket`, `aFunnel*`,
  `aColor` (planned). Written by surface code (the paper baker, the
  lands-mode field baker, future search-excitation overlays). Cheap
  to rewrite via `addUpdateRange` + `gl.bufferSubData`. Visual
  output only.
- **Physics lanes** (future): intrinsic mass, velocity, force
  accumulators, excitation timers, semantic-affinity neighborhoods.
  Written by the simulation pass. Sidecar textures or a dedicated
  transform-feedback / WebGPU compute buffer; **never** conflated
  with render attributes even when the visual happens to be derived
  from them.

This rule is documented in code at the top of
`apps/web/features/orb/bake/apply-paper-overrides.ts` and in
`docs/future/orb-mass-normalization-port.md`. Every later port
piece must respect it.

## Cosmograph parity — the migration target

Today's `/map` Cosmograph has these capabilities the 3D orb must
absorb. Treat this as the parity checklist; gaps below it are the
work.

### Inventoried from `apps/web/features/graph/cosmograph/`

- **Renderer** — `GraphRenderer.tsx`. Drives the Cosmograph instance.
- **Widgets**:
  - `FilterBarWidget.tsx` — column-based filter UI (categorical + range).
  - `FilterHistogramWidget.tsx` — distribution-aware filter sliders.
  - `SelectionToolbar.tsx` — multi-select operations (clear, invert, save).
  - `TimelineWidget.tsx` — year-range filter with brushable timeline.
- **Crossfilter integration** — `init-crossfilter-client.ts`,
  `native-bars-adapter.ts`, `native-histogram-adapter.ts`. Filter
  state pushed through Crossfilter; renderer reads filtered indices.
- **Wiki** — `apps/web/features/wiki/` — entity profiles, evidence
  overlays, modules, ChatThread/DemoStage/StepThrough/ToggleCompare
  interactions. Currently rendered alongside `/map`; needs a story
  for how it surfaces alongside (or inside) the 3D orb.

### Cosmograph's built-in primitives (off-the-shelf today)

- `pointSizeStrategy: 'auto'` → symlog over q05/q95, range [1.5, 5].
  Driven by `paperReferenceCount` in this repo. (`config-slice.ts:120`).
- Force-directed layout: link force, repulsion, gravity, friction.
  GPU-side simulation.
- Zoom-to-fit, zoom-to-selection.
- Click → select, shift-click → multi-select, drag → pan, lasso
  (polygon selection in 2D).
- Color by attribute, size by attribute.
- Pause / play simulation, force adjustments.

### Already in the orb (`/graph`) substrate

- Persistent 16,384-particle field canvas hoisted at the dashboard
  layout level, lives across navigations.
- GPU-based picker (`useOrbPickerStore.handle.pickSync`) returning
  a particle index from a click. Wired through
  `OrbClickCaptureLayer` → `useOrbClick` → graph store.
- `OrbDetailPanel` showing the selected paper's title/year/journal.
- Streaming paper bake (now stable per the mass-normalization fix).
- Cluster-color awareness via the bundle's hex_color projection.

### Gaps that the port must close

1. **Camera control** — orbital camera (pitch/yaw/distance), zoom
   to particle, zoom to selection, zoom to cluster centroid, kinetic
   pan equivalents. Currently the orb camera is fixed.
2. **Multi-select + lasso** — single-particle pickSync exists; bulk
   selection (shift-click extend, polygon/lasso, attribute-driven)
   does not.
3. **Filter UI + crossfilter wiring in 3D** — the filter widgets
   exist but read Cosmograph's filtered-index list. The orb needs an
   equivalent: filtered-out particles either dim, hide, or have
   their physics mass zeroed (design Q below).
4. **Timeline filter** — same. Year is in `base_points_web`; the
   widget exists; the orb needs to consume the resulting filter
   state.
5. **Search bar + RAG excitation** — the user's headliner. When
   results land, those particles light up, get excess mass, and
   (per the vision) gravitate toward each other. No equivalent
   today.
6. **Simulation controls** — pause / slow / fast / play for the
   physics. Today `aSpeed` only modulates shader noise, not real
   physics.
7. **Spin control (orb-level rotation)** — separate from particle
   physics. The user wants to slow / speed / pause the overall spin
   independently.
8. **Wiki integration** — info-panel content currently behind `/map`'s
   wiki surface; needs to surface in or beside the orb without
   stealing the entire viewport.
9. **"Info shows the filtered set"** — when a filter is applied, the
   info panel reflects the filtered subset (list, evidence,
   timeline), not just the single selected particle.
10. **Color-by-attribute UI** — Cosmograph supports it; orb today
    inherits one fixed coloring per bundle.

## The conceptual buckets (design framing — pose questions, don't answer)

### A. Camera & zoom

- **2D Cosmograph**: pan/zoom is plane-aligned. Two degrees of
  freedom, monotonic.
- **3D orb**: pitch/yaw/roll/distance — four DoF. Two interaction
  metaphors compete: *orbital* (rotate around centroid, like
  Sketchfab) and *first-person* (fly through, like a game). The orb
  is conceptually a celestial object; orbital is the natural fit
  for the "galaxy" metaphor.
- **Open Q1**: Orbital camera with locked-up vector vs free
  rotation? Locked-up preserves the "looking at a galaxy" feel;
  free rotation enables tilted POVs.
- **Open Q2**: Zoom semantics. Is "zoom" camera-distance, FOV, or
  both? Cosmograph's zoom-to-cluster has no analog when clusters
  are spheres in 3D — closest equivalent is "frame this set of
  particles in the viewport," which becomes a camera-target +
  distance solve.
- **Open Q3**: Inertia / kinetic pan. R3F + drei's `OrbitControls`
  has `enableDamping` + `dampingFactor` — likely sufficient as a
  starting substrate.

### B. Selection

- **Existing**: `useOrbPickerStore.handle.pickSync(x, y)` returns a
  particle index from a click; selection state lives in the graph
  store.
- **Need**: shift-click extend, lasso (polygon), attribute filter
  → selection ("select all papers in this cluster"), select-by-
  search-result.
- **Lasso in 3D is hard**: polygon-selection doesn't trivially
  generalize to 3D. Two viable patterns:
  1. *Screen-space lasso*: 2D polygon on the viewport, project to
     world space, select all particles whose screen position falls
     inside.
  2. *Sphere/box brush*: 3D primitive that the user positions and
     scales; select all particles inside.
- **Open Q4**: Which lasso metaphor wins? Screen-space is more
  Cosmograph-like; sphere brush is more game-like.
- **Open Q5**: Selection visual emphasis. The render lane for
  selection-glow is currently shared with `aBucket` / `aClickPack`.
  The lane-separation rule says we should add a dedicated
  selection-state lane (uint8 texture indexed by particle index)
  before the visual gets complicated.

### C. Filter + timeline

- **Existing**: Cosmograph's filter widgets push filtered-index
  lists through Crossfilter. The DuckDB views layer
  (`base_points_web` etc.) is the same data substrate the orb uses,
  so filter SQL or filter membership is portable.
- **Open Q6**: Where does filter membership live as the orb reads
  it? Three options:
  1. *Render-only*: dim/hide filtered-out particles via an alpha
     channel; physics still treats them as live mass.
  2. *Physics-aware*: filtered-out particles get their physics mass
     zeroed and stop participating in the simulation. The galaxy
     literally re-shapes around the active filter.
  3. *Hybrid*: dim visually, *and* reduce mass coupling but don't
     fully zero it (so re-enabling the filter is a smooth visual
     transition).
- The user's "physics means something" framing strongly suggests
  option 2 or 3. Option 1 is Cosmograph's behavior today and
  doesn't deliver the galaxy-coalescence feel.
- **Open Q7**: Timeline-based filter as a continuous parameter.
  Could the year slider drive *gradual* mass changes (papers older
  than the lower bound fade in mass over a transition window) so
  the orb visibly re-coalesces as the timeline scrubs?

### D. Search → coalesce (the headliner)

This is the user's most distinctive ambition. Decompose:

1. User issues a search or RAG retrieval returns N papers (paper
   IDs, similarity scores).
2. Those particles light up — needs an **excitation lane** (extra
   render channel: glow color + intensity, with a decay timer).
3. Those particles **gravitate toward each other**. This is a
   physics intervention: temporarily increase the gravitational
   coupling among the result set, *or* spawn a transient attractor
   at the centroid that pulls them in.
4. Optionally, the camera glides to the centroid.
5. Excitation decays over time (seconds to tens of seconds, user-
   controllable) so the orb returns to its rest layout.

- **Open Q8**: Should excitation pull only the result set, or also
  push neighbors out (negative pressure)? Pull-only feels less
  destructive; push-also creates a more dramatic "ripple" effect.
- **Open Q9**: How is the search result *delivered* to the
  simulation? A list of particle indices + intensities pushed into
  a uint8/float texture indexed by particle index, sampled in the
  physics shader — this fits the lane-separation rule.
- **Open Q10**: RAG hit count is typically small (5–30). Does the
  excitation set them as *high-mass attractors* the rest of the
  galaxy responds to, or as *targets* of an attractor at their
  centroid? Both produce coalescence; the second is cheaper to
  reason about.

### E. Physics simulation (the heart)

- **Today's `aSpeed`** is shader noise, not real physics. Particle
  positions are functions of `(particle.basePos, time, noise(aSpeed,
  aRandomness))`. Stateless. Pretty, but no inter-particle forces.
- **Real physics** needs per-particle state (position, velocity)
  that evolves under integration. Choices:
  - **CPU JS, per-frame**: easiest to reason about, slowest. 16k
    particles × O(N) self-forces is borderline. With a Barnes-Hut
    tree or grid, ~5–10 ms/frame is plausible.
  - **GPU transform feedback (WebGL2)**: simulation runs in a
    fragment/vertex shader pass writing into a position texture.
    Read-back-free. ~16k particles trivially.
  - **GPU compute (WebGPU)**: not yet broadly available on
    Safari/Firefox (improving). Cleanest API but compatibility risk.
  - **GPGPU via R3F-postprocessing or `three/examples/jsm/.../GPUComputationRenderer`**:
    middle ground; works on WebGL2.
- **Open Q11**: WebGPU vs WebGL2 transform feedback as the target?
  WebGPU buys cleaner code; WebGL2 buys universal browser support.
  Probably WebGL2 short-term, with the abstraction designed to swap
  in a WebGPU backend later.
- **Open Q12**: Force model. Pure N-body (every pair interacts) is
  O(N²). With 16k particles that's 256M pair evaluations per
  frame — too many. Options:
  - *Barnes-Hut octree*: O(N log N), 60 fps achievable on modern
    GPUs.
  - *Spatial hashing / uniform grid*: short-range forces only;
    O(N) for local neighborhoods.
  - *Sparse semantic adjacency* (precomputed): force only along a
    fixed set of edges per particle (e.g. top-20 most similar);
    O(N × k) where k is the per-particle edge count.
  - The user's vision suggests "papers that share entities cling"
    — sparse semantic adjacency seems closest. Combine with global
    weak repulsion to keep things spaced.
- **Open Q13**: How much of the force model lives in precomputed
  data vs runtime? See section G.

### F. Spin / motion controls

- **Spin** = rotation of the entire orb around its center.
  Independent of particle physics.
- **Particle motion** = the per-particle physics state.
- The user wants four states: pause, slow, normal, fast. These are
  separate concerns:
  - **Spin control** is just a global rotation rate uniform fed to
    the shader (or a transform applied to the orb root). Trivial.
  - **Physics control** is a `dt` scalar fed to the simulation
    integrator (`pause = dt * 0`, `slow = dt * 0.25`, `fast =
    dt * 2.5`). Needs the simulation to exist first.
- **Open Q14**: Does the user want both controls separately or
  unified (one "speed" knob)? Probably separately — pausing the
  spin while letting the physics settle is a useful state.

### G. Pre-computation vs runtime

The bundle (`@solemd/graph` package, served from `/mnt/solemd-graph/bundles/by-checksum/<hash>/`)
already carries:

- `base_points` / `base_points_web` — particle attributes
  (paper_id, citation/entity counts, cluster id, hex_color, …).
- `paper_documents`, `paper_catalog` — additional paper metadata.
- Edges (citation graph) — present in the schema; need to verify
  what's actually shipped.

What likely needs to be added (pre-computed in the engine) for
physics:

- **Per-particle k-nearest semantic neighbors** (e.g. top-20 by
  cosine similarity over paper embeddings). Sparse adjacency the
  force model can read at runtime without computing similarity in
  the browser.
- **Cluster centroid positions and "mass"** — for hierarchical
  clustering forces.
- **Optional: precomputed equilibrium positions** — let the orb
  start in a non-degenerate layout instead of waiting for the
  simulation to converge from the bundle's flat positions.

What can stay runtime (DuckDB-WASM + browser):

- Filter membership.
- Selection state.
- Excitation excitation (the user's RAG-result coalescence) — small
  per-event uint8 texture writes.
- Camera / spin / dt controls.

**Open Q15**: Can paper embeddings ship in the bundle? They're
typically 384/768/1536 floats per paper × 16k papers = 24–96 MB
uncompressed. With quantization (int8) it's 6–24 MB. Plausible if
shipped in a Parquet column with the existing per-checksum bundle.

The **backend FastAPI service** (`apps/api/`, currently a clean-room
rebuild target per `CLAUDE.md`) is the right home for anything
on-demand: deeper paper detail when the user clicks, fresh RAG
results, refresh-driven embeddings.

### H. Info panel + wiki integration

- **Today**: `OrbDetailPanel` shows the selected paper's
  title/year/journal. `apps/web/features/wiki/` has the full
  paper-document surface, evidence overlays, entity profiles,
  module-runtime interactions. Currently surfaced through `/map`.
- **Need**: when a filter is active, the info panel reflects the
  filtered subset — list of papers, aggregate timeline, evidence
  overlays for the group. Cosmograph parity.
- **Open Q16**: Does the wiki content render *inside* the orb
  (panel overlay) or *beside* it (split layout)? Inside preserves
  visual context (the orb stays visible behind a translucent
  panel); beside gives more reading space. The 2D Cosmograph is
  beside; the 3D orb might justify inside (the orb is the
  context).

## Open design questions (consolidated)

| # | Question | Section |
|---|---|---|
| Q1 | Orbital camera with locked-up vector vs free rotation? | A |
| Q2 | Zoom = camera-distance, FOV, or both? | A |
| Q3 | Camera inertia substrate (drei `OrbitControls` damping)? | A |
| Q4 | Lasso = screen-space polygon vs 3D sphere brush? | B |
| Q5 | Dedicated selection-state texture lane vs overload `aBucket`? | B |
| Q6 | Filter membership: render-only dim, physics-zero, or hybrid? | C |
| Q7 | Timeline as continuous mass parameter? | C |
| Q8 | Search excitation: pull-only, or push neighbors out too? | D |
| Q9 | Excitation delivery: per-particle texture lane indexed by ID? | D |
| Q10 | RAG hits as high-mass attractors vs centroid-attractor target? | D |
| Q11 | WebGL2 transform feedback vs WebGPU compute for physics? | E |
| Q12 | Force model: Barnes-Hut, spatial hash, or sparse semantic adjacency? | E |
| Q13 | Force precomputation in bundle vs runtime in DuckDB? | E + G |
| Q14 | Spin and physics-dt as separate knobs vs unified? | F |
| Q15 | Can paper embeddings ship in the bundle (size budget)? | G |
| Q16 | Wiki/info-panel: inside the orb (overlay) or beside (split)? | H |

## What this handoff deliberately does NOT touch

- **No code changes proposed.** This is conceptualization. The next
  session should converge on Q1–Q16 (or a useful subset) before
  any implementation begins. Codex review (`codex:codex-rescue`) on
  any picked design before committing to it.
- **No timeline / sequencing.** Sequencing falls out naturally
  once decisions land: physics can't ship before the simulation
  primitive choice (Q11/Q12); filter UI can't ship before the
  filter→physics interaction model (Q6).
- **No replacement-vs-port verdict.** The user said: "we may end up
  rebuilding [Cosmograph] around our 3D entirely... this works as
  an initial port of concepts and architecture." Treat that as
  permission to consider both — but neither verdict is forced
  here. Cosmograph's force-simulation source is GPL-bound in some
  forms; a clean rebuild around shared concepts (degree-driven
  symlog mass, link-force, repulsion, gravity, friction) may be
  cleaner long-term than a literal port.

## What to read first (in this order)

1. **`docs/future/orb-mass-normalization-port.md`** — the immediate
   prior. Establishes the render-vs-physics-lane architectural
   rule everything below honors.
2. **`apps/web/features/orb/bake/apply-paper-overrides.ts`** — the
   doc comment now has the lane-semantics statement codified.
3. **`apps/web/features/orb/surface/OrbSurface.tsx`** — the orb
   page entry point. Note the current minimal interaction
   surface (click → picker → detail panel).
4. **`apps/web/features/graph/cosmograph/`** — the parity target.
   Especially `GraphRenderer.tsx`, `widgets/FilterBarWidget.tsx`,
   `widgets/TimelineWidget.tsx`, `widgets/init-crossfilter-client.ts`.
5. **`apps/web/features/wiki/`** — the content surface that
   eventually surfaces alongside (or inside) the orb.
6. **`@cosmograph/cosmograph` source/typings** — under
   `node_modules/@cosmograph/cosmograph/`. Especially
   `point-size.d.ts`, `sizes.js`, and any force-simulation
   modules. Cosmograph itself is the design reference.
7. **`docs/map/graph-runtime.md`** — the current browser+DuckDB+
   bundle architecture; the same substrate the orb runs on.
8. **The user's framing prompt** — re-read the section quoted at
   the top of this doc. The phrasing matters: "physics means
   something," "interactive game," "answer particles coalesce and
   form" are the design constraints, not flavor text.

## How to spend the first hour of the next session

1. **Re-read the north star quote** at the top of this doc. Don't
   skip the framing.
2. **Open `/graph` and `/map` side-by-side** in the visible-mode
   chrome-devtools session. Spend 5 minutes interacting with
   Cosmograph's filter, timeline, selection, wiki — feel exactly
   what's being ported.
3. **Pick a single bucket** from sections A–H. Don't try to design
   all of them at once. Camera and selection are the right place
   to start because they're a precondition for any other surface
   to be usable.
4. **Pose Q1–Q3 (camera) to the user explicitly.** They have
   strong opinions on the "feel" — those answers shape everything
   else.
5. **Defer physics (E, G) until camera and selection are
   settled.** Physics is the deepest commitment; getting it right
   needs the surrounding interaction model decided first.

## Memory hooks

This doc relates to existing memory entries:

- `feedback_landing_native_physics.md` — landing-page particles
  use WebGL native physics, not SVG/visx. Same principle applies
  here: 3D physics belongs in the WebGL pipeline, not in DOM
  overlays.
- `feedback_eliminate_before_bridge.md` — before recommending
  persistent infrastructure to bridge the 2D/3D boundary, ask
  whether the boundary needs to exist at all. The user's framing
  ("we may not ever need the 2D in the end") is exactly that
  question.
- `feedback_split_runtime_from_asset_overlays.md` — split core
  runtime parity from asset-authored DOM overlay parity early.
  This is the runtime-parity layer; the wiki/info-panel migration
  is the asset-overlay layer.
- `feedback_foundational_plans_need_deep_recon.md` — foundational
  plans need 10+ parallel research agents and Codex review.
  When the design questions converge, fan out before committing.
