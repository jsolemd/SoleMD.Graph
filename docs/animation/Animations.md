# Animation & Visualization Toolkit Manual
*LLM-oriented reference for visual tooling installed in this repo.*

## Selection Guide
| Build goal | Primary libraries | When to choose | Integration cues |
|------------|-------------------|----------------|------------------|
| Real-time 3D scenes, anatomy, instruments | `three`, `@react-three/fiber`, `@react-three/drei` | Need full scene graph control, custom shaders, asset streaming | Pair with Suspense + GLTF loaders; run inside `<Canvas>` (dynamic import in Next.js) |
| Physics-driven interaction or simulations | Base 3D stack + `@react-three/rapier` | Collisions, ragdolls, fluid proxies, soft-body approximations | Keep physics in `updateLoop="independent"` and render `frameloop="demand"` to avoid idle GPU usage |
| Screen-space effects & volumetric post FX | Base 3D stack + `@react-three/postprocessing`, Drei volumetric helpers | Bloom, DOF, outlines, volumetric MRI slices | Wrap meshes with `Selection`/`EffectComposer`; consider resolution scaling on mobile |
| Procedural mesh modeling | Base 3D stack + `@react-three/csg` | Boolean operations, surgical cuts, morphable visualization tooling | Use `Geometry` chains; call `useCSG().update()` when cutters move |
| Component-level UI motion | `framer-motion` | Layout-aware transitions, gestures, accessibility hooks | Use CSS variables for theme-aware motion; disable Mantine transforms (`transform: "none !important"`) |
| Timeline/scroll choreography | `gsap`, `@gsap/react` | Multi-target orchestration, scrubbing, ScrollTrigger-style flows | Register plugins once, scope via `useGSAP({ scope })`, review [`docs/animation/GSAP.md`](./GSAP.md) for context-safe patterns, and run alongside Framer Motion when layout aware |
| Data-heavy custom charts | `@visx/*` modules | Need low-level SVG/canvas charts with React state | Compose scales + shapes + responsive hooks; manage tooltips manually |
| Turnkey dashboards | `recharts` | Rapid chart prototyping with controlled props | Use built-in axes/grid APIs; customize via render props and hooks |
| Vector & generative 2D art | `two.js` | Lightweight 2D sketches, animated diagrams | Mount via `appendTo`, manage your own render loop |
| Design-to-dev motion assets | `lottie-react` (+ `@lottiefiles/lottie-interactivity`) | Play AE/bodymovin exports with programmatic control | Wrap in hooks, expose playback controls for timeline sync |

> **GSAP field guide?** Review [`docs/animation/GSAP.md`](./GSAP.md) before orchestrating ScrollTrigger or `useGSAP` prompts. When you fetch official docs, append `use context7` so MCP pulls the latest API surface.

> **Need a visx deep dive?** Keep this file as the high-level chooser, then switch to [`docs/animation/visx.md`](./visx.md) when planning data-heavy SVG work. The companion guide packages best practices for every `@visx/*` module and is optimized for prompt injection. When you need the latest API surface, append `use context7` to your request and pull fresh snippets from the official docs before scaffolding prompts.

## 3D Ecosystem

### three
- Provides the core WebGL/WebGPU renderer, materials, cameras, and scene graph; use it for low-level primitives even when working inside React.
- Reuse geometries/materials to minimize GPU compilation (`useMemo` or module scope instances) per three.js manual guidance.
- Organize sub-scenes with `THREE.Group` so transforms cascade predictably when linking multimodal assets.
- Configure module resolution with import maps (or bundler aliases) so `/examples/jsm` addons resolve consistently in Next.js edge builds.

```ts
// Example: share resources instead of creating them per frame
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: '#6ba7ff' });
const cube = new THREE.Mesh(geometry, material);
group.add(cube);
```
- Field-tested debug path: if the canvas renders black, set `scene.background` to a bright color, temporarily override materials via `scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 'lime' })`, and widen `camera.far` before tightening frustum bounds once the issue is identified.
- Keep everything in SI units (1 scene unit = 1 meter), enable `renderer.physicallyCorrectLights`, and pair it with `renderer.outputEncoding = THREE.sRGBEncoding`; convert swatches with `color.convertSRGBToLinear()` so lighting and color grading stay predictable across exports.
- Cache throwaway math helpers at module scope and mark static meshes `matrixAutoUpdate = false` with manual `object.updateMatrix()` calls to avoid per-frame allocations; prefer `BufferGeometry` variants and reuse textures/materials wherever possible (dispose only when assets are permanently removed).
- Guard render loops on change events: for static scenes wired to `OrbitControls`, render on the `'change'` event (or call `invalidate()` in R3F) so laptops and mobile devices avoid unnecessary GPU work.

### @react-three/fiber
- Declarative renderer that maps React components to three.js objects; prefer React state/props for slow-changing data, mutate refs for per-frame work.
- Enable on-demand rendering for mostly static scenes to conserve battery: `<Canvas frameloop="demand">` and call `invalidate()` when external controls change.
- Never allocate new vectors/quaternions inside `useFrame`; memoize helpers and reuse them each tick to spare the garbage collector.
- Share geometries/materials with `useMemo` and use selectors in `useThree()` to avoid unnecessary re-renders.
- Avoid `setState` inside `useFrame`; mutate refs and let React render on slower cadence.
- Pair on-demand canvases with control events: subscribe to `controls.addEventListener('change', invalidate)` (or Drei's helpers) so static scenes only render when something actually moves.
- For static props, toggle `matrixAutoUpdate={false}` and call `ref.current.updateMatrix()` after imperatively mutating transforms; this mirrors three.js guidance and keeps Matrix4 math off the hot path.

```tsx
const tempVec = useMemo(() => new THREE.Vector3(), []);
useFrame(() => {
  ref.current.position.lerp(tempVec.set(targetX, targetY, targetZ), 0.1);
});
```

### @react-three/drei
- Batteries-included helpers: `useGLTF`, `useTexture`, `Environment`, instancing, camera controls, text, etc.
- Preload assets with `useGLTF.preload()` / `useEnvironment.preload()` to hide latency during route transitions.
- Use `<Instances>` + `<Instance>` for massive repeated meshes (neurons, voxels) to keep draw calls <1000.
- `Environment` presets are CDN-backed—self-host HDRIs via dynamic `import('@pmndrs/assets/...')` for production.
- `useVideoTexture` supports HLS configuration for live feeds; pass custom `hls` options when streaming EEG videos.

### @react-three/rapier
- WASM physics tightly integrated with R3F; wrap content in `<Physics>` and keep a ref to bodies when you need imperative control.
- Use instanced rigid bodies for particle systems or repeated anatomy parts; the hook returns an array of APIs you can mutate.
- Access the world inside `useEffect` via `const { world } = useRapier()` to adjust gravity or solver parameters once.
- Combine with on-demand rendering: `<Canvas frameloop="demand"><Physics updateLoop="independent">...</Physics></Canvas>` so physics ticks without forcing every frame render.
- Joints (`useSphericalJoint`, etc.) let you model limb chains; always define pivot positions in local coordinates.

### @react-three/postprocessing
- Declarative wrapper around `postprocessing`—mount `EffectComposer` once per canvas, then add passes (Bloom, DOF, SSAO).
- Use `Selection` + `Select` components when you want to apply effects conditionally (outlines, highlights).
- Tune effect resolution/quality for mobile by passing `resolutionScale` or customizing the composer size.
- Combine screen-space effects with Drei’s `PerformanceMonitor` to dial quality when FPS dips.

```tsx
<Selection>
  <EffectComposer autoClear={false}>
    <DepthOfField focusDistance={0.02} focalLength={0.015} />
    <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} />
  </EffectComposer>
  <Select enabled>
    <mesh ref={highlightRef} />
  </Select>
</Selection>
```

### @react-three/csg
- Boolean modeling for surgical cuts, implant planning, etc.—structure operations within `<Geometry>` and `<Base>`.
- Set `useGroups` when you need multiple materials across boolean results; each op can supply its own material.
- Call `useCSG().update()` (usually from control widgets) whenever cutter meshes move so the boolean result rebuilds.
- Combine with Drei `PivotControls` for interactive subtraction/union tooling.

```tsx
<Geometry useGroups>
  <Base geometry={subject} />
  <Subtraction position={[0.1, 0.3, 0]}>
    <sphereGeometry args={[0.2, 32, 32]} />
  </Subtraction>
</Geometry>
```

## 2D, Motion, and Timeline Tooling

### gsap (core + plugins)
- Full animation suite is available (core plus bonus plugins); `import gsap from 'gsap'` and register whatever plugins you need up front via `gsap.registerPlugin(ScrollTrigger, Flip, MotionPathPlugin, Draggable, Observer, ScrollSmoother, SplitText, DrawSVGPlugin, MorphSVGPlugin, InertiaPlugin, GSDevTools, ... )`.
- Core API highlights: `gsap.to/from/fromTo`, `gsap.set` for zero-duration state pushes, `gsap.quickTo` / `quickSetter` for high-frequency control, `gsap.timeline` for orchestration, and `gsap.matchMedia()` for breakpoint-aware variants.
- Utility helpers such as `gsap.utils.distribute`, `snap`, `clamp`, `shuffle`, and `unitize` make data-driven motion prompts concise; reference them whenever emitting loops over chart nodes or particle clouds.
- Use `gsap.context()` (or `useGSAP` below) in React components so animations auto-clean; for vanilla modules cache a `context` and call `.revert()` on teardown.

```ts
import gsap from 'gsap';
import { ScrollTrigger, Flip, MotionPathPlugin } from 'gsap/all';

gsap.registerPlugin(ScrollTrigger, Flip, MotionPathPlugin);

const mm = gsap.matchMedia();
mm.add('(max-width: 768px)', () => {
  gsap.to('.cta-card', { y: 12, ease: 'power2.inOut', repeat: -1, yoyo: true });
});

gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.6 } })
  .from('.hero-title span', { yPercent: 100, stagger: 0.06 })
  .to('.cta-ring', {
    motionPath: {
      path: '#ring-path',
      align: '#ring-path',
      autoRotate: true,
    },
  }, '<');
```

#### Timeline & sequencing best practices
- Timelines remain the orchestration backbone—chain segments, reuse labels, and expose `.timeScale()`, `.progress()`, `.labels`, and `.recent()` for interactive scrubbers or designer tooling.
- Lean on the position parameter vocabulary (`'>', '<', '+=0.5', 'label+=0.25'`) instead of static `delay` values so retiming is frictionless.
- Set timeline-level `defaults` (ease, duration, stagger) to keep prompts terse and consistent; compose larger experiences by returning timelines from helper functions and adding them to a master sequence.
- When bridging to visx or three.js outputs, compute durations from domain values so motion stays synchronized with data-driven narratives.

#### ScrollTrigger & ScrollSmoother
- `ScrollTrigger` binds scroll position to timeline progress, enables pinning, snapping, parallax, and scrubbed storytelling—perfect for case-study walkthroughs or RAG evidence reveals.
- Create triggers either inline (`gsap.to(..., { scrollTrigger: {...} })`) or imperatively via `ScrollTrigger.create({ animation, trigger, start, end, scrub, pin, markers })`.
- Use `matchMedia` to collapse scroll effects on mobile; register named ScrollTriggers and call `ScrollTrigger.refresh()` after dynamic content loads (e.g., once R3F canvases mount).
- Pair with `ScrollSmoother` when you need easing on long-form reads—remember to disable when `prefers-reduced-motion` is set.

#### Flip & layout transitions
- `Flip` snapshots DOM states so you can animate between list reorders, facet filtering, or Mantine-driven layout mode changes; it shines for Obsidian-like relayouts and entity detail toggles.
- Capture state via `const state = Flip.getState(elements)` and run `Flip.from(state, { absolute: true, stagger: 0.04, duration: 0.5 })`; combine with `@gsap/react` contexts to ensure cleanup.

#### Motion paths, SVG, and drawing utilities
- `MotionPathPlugin` maps elements or canvas overlays to neural pathways, vascular traces, or chart bezier splines—useful for guiding the eye along circuitry diagrams or timeline arcs.
- `DrawSVGPlugin`, `MorphSVGPlugin`, and `SplitText` are now free—animate physiological traces drawing on, morph molecules or connectors, and sequence headline typography without extra deps.

#### Interaction helpers (Observer, Draggable, Inertia, GSDevTools)
- `Observer` captures wheel, touch, keyboard, and pointer gestures without extra listeners—convert to axis values and pipe into `gsap.to` or `ScrollTrigger` for gesture-enabled dashboards.
- `Draggable` + `InertiaPlugin` give you physics-feeling handles for ROI selection, brush ranges, or dense scatterplot exploration—bind drag values back into visx scales or R3F camera rigs.
- `GSDevTools` exposes a timeline scrubber in development; mount it when debugging multi-stage sequences, then remove for production prompts.

#### Performance & integration tips
- Prefer `filter: drop-shadow(...)` over `box-shadow` in GSAP-driven effects to stay on the GPU compositor.
- Batch DOM lookups with `gsap.utils.toArray()` and scope selectors using contexts to avoid leaking references in Next.js SSR.
- When coordinating with three.js or R3F, update material uniforms or camera props inside `gsap.ticker.add()` callbacks, or drive data into refs the render loop already consumes—keep GSAP on the orchestrating layer, not inside `useFrame`.

### @gsap/react
- Provides `useGSAP` hook that scopes selectors and auto-cleans animations; always call `gsap.registerPlugin(useGSAP)` during module init.
- Use the hook’s `contextSafe` helper for event handlers so animations clean up on route change.
- Remove listeners in the `useGSAP` cleanup callback to prevent leaks between renders.
- For SSR, wrap GSAP code in `useIsomorphicLayoutEffect` fallback if you need manual contexts.

### framer-motion (Motion 12)
- Ideal for layout-aware UI transitions, gestures, scroll-linked effects, and CSS-variable-driven themes.
- Wrap lists in `AnimatePresence` and provide stable keys to avoid orphaned exit states.
- Compose dynamic styles with `useMotionTemplate` + CSS custom properties for theme-aware effects (no stale state).
- Derive physics from interactions with `useVelocity` and map to scale/opacity via `useTransform`.
- Optimize expensive visual properties (`filter: drop-shadow(...)` vs `box-shadow`) and lean on tree-shaken imports like `import { animate } from 'motion'` when you only need imperative animations.

```tsx
const x = useMotionValue(0);
const xVelocity = useVelocity(x);
const shadow = useMotionTemplate`drop-shadow(${xVelocity}px 10px var(--shadow-color))`;

return (
  <motion.button drag="x" style={{ x, filter: shadow }}>
    Drag me
  </motion.button>
);
```
- Motion's hybrid engine runs transforms on the compositor thread—lean into declarative `animate` props tied to React state for buttery 60/120 fps without manual `requestAnimationFrame` plumbing.
- Combine `initial`/`animate`/`exit` props (wrapped in `AnimatePresence`) to manage enter/leave choreography; keep keys stable so shared element transitions resolve.
- Reach for `whileInView` or `useScroll` when you need scroll-triggered versus scroll-linked behaviors, and surface parameters as CSS custom properties for deterministic prompt outputs.
- `layout`/`layoutId` power auto layout transitions; only fall back to manual measurements when you need physics outside transforms.
- Reserve vanilla CSS transitions for single-property hover color swaps—route any gesture-rich, interruptible, or hero motion through Motion so prompts stay consistent.
- Always gate high-motion effects with `useReducedMotion()` and provide reduced-motion fallbacks in prompts to respect accessibility preferences.

- When mixing with Mantine components, override hover transforms in `styles` to "none !important" so Framer's transforms stay in control.

## Data Visualization

### @visx ecosystem
- Modular building blocks (scales, shapes, axis, zoom, brush) for SVG/canvas charts that scale with React state.
- Use `useParentSize` or `<ParentSize>` to make charts responsive within dynamic layouts.
- Tooltips are manual: wrap chart in a positioned container and wire `useTooltip()` to manage state.
- Add interaction layers (`@visx/zoom`, `@visx/brush`, `@visx/voronoi`) for pan/zoom or hit-testing dense datasets.
- Compose gradients/patterns (`@visx/gradient`, `@visx/pattern`) to match brand palettes; reuse color variables defined in Tailwind.
- Start small—import only the packages you need (`@visx/shape`, `@visx/axis`, etc.) to keep bundles lean; pull in the umbrella `@visx/visx` only for exploratory prompts.
- Treat the gallery components as recipes: combine primitives (e.g., `Shape.AreaClosed` + `Gradient.RadialGradient` + `Tooltip`) instead of searching for a monolithic “chart” component.
- Reach for `@visx/xychart` when you want a declarative chart shell with linked scales, then drop down to primitives to customize axes, tooltips, or gestures beyond defaults.
- Bake responsiveness in with `@visx/responsive` utilities (ParentSize, withParentSize) and share scale logic via `@visx/scale` so prompts surface clear domain/range expectations.
- Layer interaction helpers—`Zoom`, `Brush`, `delaunay/voronoi`—on top of the same data accessors so the LLM can emit hit-tested experiences without imperative DOM math.
- Use `@visx/mock-data` during ideation to keep prompts concrete about data shapes while the real DAL comes online.

### recharts
- Higher-level chart primitives (LineChart, ScatterChart, ComposedChart) with controlled props and render props for custom shapes.
- Domain hooks (`useXAxisDomain`, `useYAxisDomain`) surface computed ranges inside child components when you need synchronized UI.
- Leverage built-in grid/tooltip/legend components for default cases; drop down to custom `content` renderers when styling beyond defaults.
- Keep chart data serializable; memoize `data` arrays for large sets to avoid re-render storms.

## Vector & Procedural 2D

### two.js
- Renderer-agnostic 2D scene graph (Canvas2D, SVG, WebGL) useful for animated diagrams or schematic overlays.
- Mount via `two.appendTo(container)` and control the play loop with `two.play()`/`two.pause()`.
- Always call `shape.dispose()` / `Two.release` when removing complex shapes to free renderer resources.
- `two.fit()` snaps canvas to parent size—invoke on resize observers for responsive diagrams.
- Use groups to manage hierarchical transforms; combine with manual RAF when integrating alongside other animation loops.

```ts
const two = new Two({ fitted: true }).appendTo(container);
const waveform = two.makePath(points);
two.play();
return () => waveform.dispose();
```

## Motion Graphics Imports

### lottie-react
- `useLottie` hook wraps `lottie-web`: pass `animationData`, optional `loop`, `autoplay`, and `initialSegment`; it returns `View` plus imperative controls.
- Style the wrapper div via the second argument to `useLottie` to integrate with responsive layouts.
- `useLottieInteractivity` syncs playback with scroll or cursor—define `mode: 'scroll' | 'cursor'` and an ordered `actions` array.
- Always call `destroy()` on unmount (handled automatically when the hook’s component unmounts) if you instantiate Lottie manually.
- Combine with GSAP or Framer Motion by driving playback via the returned control methods instead of re-rendering JSON.

```tsx
const lottie = useLottie({ animationData, loop: false, autoplay: false });
useLottieInteractivity({
  lottieObj: lottie,
  mode: 'scroll',
  actions: [{ visibility: [0, 0.5], type: 'play' }],
});
```

## Cross-Cutting Patterns

- Favor CSS custom properties for colors and shadows so both Framer Motion (`useMotionTemplate`) and GSAP timelines stay theme-aware without re-renders.
- When mixing GSAP and Framer Motion, let GSAP handle long timelines/scroll scrubbing and reserve Framer for layout transitions; coordinate via shared refs or CSS variables.
- For scroll-based storytelling, pair GSAP ScrollTriggers (or manual observer logic) with visx charts by updating React state and invalidating the R3F canvas only when needed.
- Instrument heavy 3D scenes with Drei’s `<PerformanceMonitor>` and adjust post-processing or instancing counts inside callbacks.
- Keep asset loading deterministic: use Suspense boundaries, `useGLTF.preload`, and hashed cache keys so the database-first pipeline can index assets predictably.

## Reference Index

- three.js manual & examples: https://threejs.org/docs
- React Three Fiber docs (performance, hooks): https://docs.pmnd.rs/react-three-fiber
- pmndrs helpers (`drei`, `rapier`, `postprocessing`, `csg`): https://github.com/pmndrs
- GSAP core & plugins: https://gsap.com/docs
- Motion (Framer Motion 12) docs: https://motion.dev/docs
- visx component docs: https://github.com/airbnb/visx
- Recharts documentation: https://recharts.org/en-US/api
- Two.js API reference: https://two.js.org/
- Lottie React docs: https://github.com/gamote/lottie-react








