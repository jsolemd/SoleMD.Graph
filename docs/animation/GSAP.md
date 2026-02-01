# GSAP

Compact field guide for GreenSock Animation Platform (GSAP) with React-first patterns. Treat this as the prompt-ready summary; when you need authoritative wording or brand-new API surface, append `use context7` and pull fresh excerpts from the official docs before proceeding.

## Quick Index
- [Core Takeaways](#core-takeaways)
- [Implementation Principles](#implementation-principles)
- [React Playbooks](#react-playbooks)
- [Sample Patterns](#sample-patterns)
- [API Reference](#api-reference)
- [Utilities & Helpers](#utilities--helpers)
- [Plugin Catalogue](#plugin-catalogue)
- [Diagnostics & Tooling](#diagnostics--tooling)
- [Resources](#resources)

## Core Takeaways
- Register everything up front: `gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin, ...)` prevents tree shaking, and `gsap.defaults`/`gsap.config` give you predictable ease, overwrite, and units across the app.
- Scope React work with `useGSAP({ scope, dependencies, revertOnUpdate })` or `gsap.context`. Use `contextSafe()` for handlers so late-triggered tweens are still reverted on navigation or hot reload.
- Compose timelines (`gsap.timeline({ defaults, repeat, yoyo, smoothChildTiming })`) instead of stacking orphan tweens. Share them via refs or context so sibling components append sequences deterministically.
- Treat responsiveness and accessibility as first-class concerns: wrap scroll/gesture setups in `gsap.matchMedia().add()`, respect `prefers-reduced-motion`, and call `ScrollTrigger.refresh()` or `matchMedia.refresh()` after layout changes.
- Reach for performance primitives whenever frame loops run hot: `gsap.quickSetter`, `gsap.quickTo`, `gsap.ticker`, `Observer`, `ScrollTrigger.batch`, and function-based values beat re-rendering React state.
- Keep data-driven: use labels, the position parameter syntax (`"<", "-=0.25"`), utility helpers (`gsap.utils.interpolate`, `gsap.utils.distribute`), and timeline `data` objects to bridge orchestration with clinical UI state.

## Implementation Principles

### Lifecycle & Cleanup Discipline
- Always register the React hook: `gsap.registerPlugin(useGSAP);` once per bundle.
- Prefer the config object signature: `useGSAP(callback, { scope, dependencies, revertOnUpdate, priority });` – it mirrors `useEffect` behavior while auto-scoping selectors and re-running safely.
- Use `contextSafe` for event handlers and async callbacks so any tweens created later still join the context and get reverted automatically.
- When you need manual control (class components, SSR fallbacks), reach for `const ctx = gsap.context(() => {...}, scopeRef); return () => ctx.revert();`.
- For isomorphic builds, define `const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;` before invoking GSAP code.
- Defer third-party listeners (e.g., `window.addEventListener`) to the cleanup function returned from `useGSAP` so rerenders and route changes do not leak handlers.


### Compose Reusable Motion Primitives
- Centralize defaults with `const timeline = gsap.timeline({ defaults: { ease: "power2.out", duration: 0.6 } });` and reuse across feature modules.
- Register effects so prompts emit single-line orchestration: `gsap.registerEffect({ name: "fadeUp", effect: (targets, config) => gsap.fromTo(targets, { autoAlpha: 0, y: config.y }, { autoAlpha: 1, y: 0, stagger: config.stagger }), defaults: { y: 24, stagger: 0.12 } });` then `gsap.effects.fadeUp(".card")`.
- Use `timeline.add(action, position)` to line up sequences with labels (`timeline.addLabel("cta", "<0.2"); timeline.to(".cta", { scale: 1.1 }, "cta");`).
- When bridging React state and GSAP, surface controls as timeline methods: `timeline.pause()`, `timeline.timeScale(2)`, or `timeline.seek("cta")` inside click handlers.
- Wrap third-party or legacy tweens via `gsap.timeline().add(existingTween)` to gain consolidated control.

### Responsive & Accessible Animation
- Use `const mm = gsap.matchMedia(); mm.add("(min-width: 768px)", ({ conditions }) => { ...; return () => mm.revert(); });` so breakpoints auto-clean when media queries no longer match.
- Respect reduced motion: `if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;` or use `ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: "visibilitychange,DOMContentLoaded,load" });` alongside `ScrollTrigger.matchMedia`.
- When using `ScrollTrigger`, always call `ScrollTrigger.refresh()` after dynamic content or route-level transitions, and `ScrollTrigger.clearMatchMedia()` during teardown when conditions change.
- Provide non-animated fallbacks for critical UI interactions—e.g., instantly toggle classes when `prefers-reduced-motion` is set.

### Performance & High-Frequency Updates
- Replace repeated `gsap.to` calls in pointer handlers with `const xQuick = gsap.quickSetter(node, "x", "px"); xQuick(value);` to avoid timeline creation per tick.
- `gsap.quickTo(target, property, { duration, ease })` returns a function you can memoize and call with new values (`const setProgress = gsap.quickTo(node, "progress", { duration: 0.2 });`).
- Use `gsap.ticker.add(callback, false, priority)` to sync GSAP with other render loops (three.js, canvas). Retrieve delta time via `gsap.ticker.deltaRatio()`.
- Throttle scroll/gesture work with `Observer` (`Observer.create({ target, type: "wheel,touch", onChange: ({ deltaX, deltaY }) => { ... } });`).
- Tune `gsap.config({ autoSleep: 60, force3D: true, nullTargetWarn: false });` and `gsap.ticker.lagSmoothing(500, 33);` when large documents cause jank.
- Avoid forcing layout thrash: mutate transforms, opacity, clip paths, and CSS custom properties instead of top/left whenever possible.

### Data-Driven & Declarative Hooks
- Lean on function-based values (`gsap.to(cards, { y: i => i * 12, stagger: (index, target, list) => index * 0.08 });`) to keep prompts data-dependent.
- Use labels and the position parameter vocabulary to make orchestration declarative (`"<"` same start, `">"` queue, relative offsets like `"-=0.2"`).
- Annotate timelines with `timeline.data({ feature: "study-card" })` so analytics/logging layers can inspect state.
- Combine GSAP utilities with app data: `const step = gsap.utils.distribute({ amount: 0.4, ease: "power2.inOut" }); timeline.to(nodes, { yPercent: step });`.
- When bridging to CSS variables, mutate `target: { '--accent-x': 12 }` and let Tailwind/Mantine handle final styles.
```tsx
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function DashboardBanner({ endX }: { endX: number }) {
  const container = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP(
    ({ scope }) => {
      gsap.from(".badge", { opacity: 0, y: 24, stagger: 0.12, ease: "power3.out" });
      const animateCTA = contextSafe(() => gsap.to(".cta", { scale: 1.08, yoyo: true, repeat: 1 }));
      scope?.querySelector(".cta")?.addEventListener("mouseenter", animateCTA);
      return () => scope?.querySelector(".cta")?.removeEventListener("mouseenter", animateCTA);
    },
    { scope: container, dependencies: [endX], revertOnUpdate: true }
  );
  return (
    <div ref={container} className="banner">
      {/* ... */}
    </div>
  );
}


### Compose Reusable Motion Primitives
- Centralize defaults with `const timeline = gsap.timeline({ defaults: { ease: "power2.out", duration: 0.6 } });` and reuse across feature modules.
- Register effects so prompts emit single-line orchestration: `gsap.registerEffect({ name: "fadeUp", effect: (targets, config) => gsap.fromTo(targets, { autoAlpha: 0, y: config.y }, { autoAlpha: 1, y: 0, stagger: config.stagger }), defaults: { y: 24, stagger: 0.12 } });` then `gsap.effects.fadeUp(".card")`.
- Use `timeline.add(action, position)` to line up sequences with labels (`timeline.addLabel("cta", "<0.2"); timeline.to(".cta", { scale: 1.1 }, "cta");`).
- When bridging React state and GSAP, surface controls as timeline methods: `timeline.pause()`, `timeline.timeScale(2)`, or `timeline.seek("cta")` inside click handlers.
- Wrap third-party or legacy tweens via `gsap.timeline().add(existingTween)` to gain consolidated control.

### Responsive & Accessible Animation
- Use `const mm = gsap.matchMedia(); mm.add("(min-width: 768px)", ({ conditions }) => { ...; return () => mm.revert(); });` so breakpoints auto-clean when media queries no longer match.
- Respect reduced motion: `if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;` or use `ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: "visibilitychange,DOMContentLoaded,load" });` alongside `ScrollTrigger.matchMedia`.
- When using `ScrollTrigger`, always call `ScrollTrigger.refresh()` after dynamic content or route-level transitions, and `ScrollTrigger.clearMatchMedia()` during teardown when conditions change.
- Provide non-animated fallbacks for critical UI interactions—e.g., instantly toggle classes when `prefers-reduced-motion` is set.

### Performance & High-Frequency Updates
- Replace repeated `gsap.to` calls in pointer handlers with `const xQuick = gsap.quickSetter(node, "x", "px"); xQuick(value);` to avoid timeline creation per tick.
- `gsap.quickTo(target, property, { duration, ease })` returns a function you can memoize and call with new values (`const setProgress = gsap.quickTo(node, "progress", { duration: 0.2 });`).
- Use `gsap.ticker.add(callback, false, priority)` to sync GSAP with other render loops (three.js, canvas). Retrieve delta time via `gsap.ticker.deltaRatio()`.
- Throttle scroll/gesture work with `Observer` (`Observer.create({ target, type: "wheel,touch", onChange: ({ deltaX, deltaY }) => { ... } });`).
- Tune `gsap.config({ autoSleep: 60, force3D: true, nullTargetWarn: false });` and `gsap.ticker.lagSmoothing(500, 33);` when large documents cause jank.
- Avoid forcing layout thrash: mutate transforms, opacity, clip paths, and CSS custom properties instead of top/left whenever possible.

### Data-Driven & Declarative Hooks
- Lean on function-based values (`gsap.to(cards, { y: i => i * 12, stagger: (index, target, list) => index * 0.08 });`) to keep prompts data-dependent.
- Use labels and the position parameter vocabulary to make orchestration declarative (`"<"` same start, `">"` queue, relative offsets like `"-=0.2"`).
- Annotate timelines with `timeline.data({ feature: "study-card" })` so analytics/logging layers can inspect state.
- Combine GSAP utilities with app data: `const step = gsap.utils.distribute({ amount: 0.4, ease: "power2.inOut" }); timeline.to(nodes, { yPercent: step });`.
- When bridging to CSS variables, mutate `target: { '--accent-x': 12 }` and let Tailwind/Mantine handle final styles.
## React Playbooks

### Hook Setup & Scoping
- Minimal pattern:

```tsx
const container = useRef<HTMLDivElement>(null);
useGSAP(() => gsap.from(".chip", { opacity: 0, y: 16, stagger: 0.1 }), { scope: container });


- Add dependencies safely: `useGSAP(() => { ... }, { scope: container, dependencies: [studyCount], revertOnUpdate: true });`.
- Access the raw context: `const { context } = useGSAP({ scope: container }); context.add(() => timeline);` to expose timeline handles.
- Keep selectors scoped (`".chip"` only resolves within the supplied `scope`), preventing cross-component leakage.

### Sharing Timelines Across Components
- Hoist a timeline ref and append segments from children:

```tsx
const timelineRef = useRef<gsap.core.Timeline>();
useGSAP(() => {
  timelineRef.current = gsap.timeline({ defaults: { ease: "power1.out" } });
}, []);

const registerSection = useCallback(
  (factory: (tl: gsap.core.Timeline) => void) => {
    if (!timelineRef.current) return;
    factory(timelineRef.current);
  },
  []
);


- Children call `registerSection(tl => tl.from(node, {...}, position));` or receive the timeline through context.
- Use labels when orchestrating across routes (`timelineRef.current?.addLabel("studyIntro");`).

### Exit Animations & FLIP
- Delay unmounts via state wrappers: `setIsVisible(false)` triggers `AnimatePresence`; inside `useGSAP`, run `const ctx = gsap.context(() => Flip.from(state, { absolute: true, duration: 0.5 }));`.
- Use `Flip.getState(targets, { props: "color,backgroundColor", simple: true });` before DOM mutations, then `Flip.from(state, { ease: "power1.inOut" });`.
- For React lists, capture state in `useLayoutEffect` just before data updates to ensure positions reflect the pre-update DOM.

### Scroll Orchestration in React
- Register once: `gsap.registerPlugin(ScrollTrigger);`.
- Inside `useGSAP`, create triggers: `ScrollTrigger.create({ trigger: scope.current, start: "top center", end: "+=400", scrub: true, animation: timeline });`.
- When hydrating on the client, guard SSR: `if (!scope.current) return;` and optionally gate on `typeof window !== 'undefined'`.
- Use `ScrollTrigger.matchMedia({ "(prefers-reduced-motion: reduce)": () => ScrollTrigger.disable(), "(min-width: 1024px)": setupLargeScreen });`.
- Always `return () => ScrollTrigger.getAll().forEach(trigger => trigger.kill());` or call `context.revert()` to avoid duplicates on route changes.

### Event Handlers & `contextSafe`

```tsx
const { contextSafe } = useGSAP({ scope: container });
const handleClick = contextSafe(() => {
  gsap.to(".detail-panel", { autoAlpha: 1, y: 0 });
});
return <button onClick={handleClick}>Open details</button>;


- `contextSafe` ensures tweens respect scope selectors, join the context for cleanup, and avoid `nullTargetWarn` errors.
- Use it for delayed actions (`setTimeout(contextSafe(() => ...), 150);`) and promise callbacks.

### SSR & Route Transitions
- Wrap GSAP code in `useIsomorphicLayoutEffect` or `useEffect` depending on environment to avoid window references during SSR.
- When using Next.js `app` router, reinitialize contexts inside `useEffect` of layout segments to ensure animations recreate on page transitions.
- For ScrollTrigger + server data, run `ScrollTrigger.refresh()` once the page is hydrated to correct measurements.

## Sample Patterns

### Responsive Hero Reveal
```tsx
const Hero = () => {
  const container = useRef<HTMLDivElement>(null);
  useGSAP(({ context }) => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.7 } });
    tl.from(".hero-heading", { y: 48, autoAlpha: 0 })
      .from(".hero-subtitle", { y: 24, autoAlpha: 0 }, "<0.1")
      .from(".hero-cta", { scale: 0.9, autoAlpha: 0 }, "<");
    context.add(() => tl);
  }, {
    scope: container,
    dependencies: [],
  });
  return (
    <section ref={container} className="hero">
      <h1 className="hero-heading">Neuropsychiatric Atlas</h1>
      <p className="hero-subtitle">Curation pipeline, canonical terminology, evidence-first.</p>
      <button className="hero-cta">Explore the pipeline</button>
    </section>
  );
};


### Pointer-Driven Telemetry
```tsx
const TelemetryKnob = () => {
  const knob = useRef<HTMLDivElement>(null);
  const setRotation = useMemo(() => (knob.current ? gsap.quickTo(knob.current, "rotation", { duration: 0.2, ease: "power2.out" }) : () => {}), []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const ratio = event.clientX / window.innerWidth;
      setRotation(gsap.utils.mapRange(0, 1, -90, 90, ratio));
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, [setRotation]);

  return <div ref={knob} className="telemetry-knob" />;
};


### Registered Effect for Reuse
```ts
// bootstrap
import { gsap } from "gsap";

gsap.registerEffect({
  name: "cascade",
  defaults: { y: 32, duration: 0.6, ease: "power2.out", stagger: 0.08 },
  effect: (targets: gsap.DOMTarget, config: { y: number; duration: number; ease: string; stagger: number }) =>
    gsap.fromTo(targets, { autoAlpha: 0, y: config.y }, { autoAlpha: 1, y: 0, duration: config.duration, ease: config.ease, stagger: config.stagger }),
});

// usage inside component
useGSAP(() => {
  gsap.effects.cascade(".study-card");
}, { scope: container });

## API Reference

### gsap Namespace (Core Methods)
- `gsap.to(targets, vars)` – Animate to specified values. Accepts arrays, NodeLists, selector text, or objects.
- `gsap.from(targets, vars)` – Animate from values back to current state.
- `gsap.fromTo(targets, fromVars, toVars)` – Explicit start/end.
- `gsap.set(targets, vars)` – Zero-duration setter; ideal for initial state.
- `gsap.timeline(config?)` – Create a timeline (`defaults`, `paused`, `repeat`, `yoyo`, `autoRemoveChildren`, `smoothChildTiming`).
- `gsap.delayedCall(delay, callback, params?, scope?)` – Schedule a callback using the ticker.
- `gsap.killTweensOf(targets, props?, onlyActive?)` – Kill tweens matching the targets/properties.
- `gsap.getTweensOf(targets, onlyActive?)` – Retrieve active tweens.
- `gsap.getProperty(target, property, unit?)` – Query the current tweened value; omit property to get a getter function.
- `gsap.context(func, scope?, targets?)` – Build a scoped context for cleanup (`ctx.add`, `ctx.revert`, `ctx.ignore`).
- `gsap.matchMedia()` – Returns an object with `.add(query, setup)`, `.revert()`, `.kill()`, `.add({ query: setup })`, `.conditions` inside callbacks.
- `gsap.matchMediaRefresh()` – Force refresh of all matchMedia contexts (use after layout changes).
- `gsap.registerPlugin(...plugins)` – Register core React hook, ScrollTrigger, etc.
- `gsap.registerEffect({ name, defaults, extendTimeline, effect })` – Create reusable effects (`gsap.effects[name]()`).
- `gsap.defaults(defaultVars)` – Set default tween vars (duration, ease, overwrite, stagger config) for future tweens.
- `gsap.config(configVars)` – Engine-level config (`autoSleep`, `nullTargetWarn`, `units`, `force3D`, `trialWarn`, `autoKillThreshold`).
- `gsap.globalTimeline` – Root timeline; methods mirror timeline API (`add`, `timeScale`, `pause`, `resume`).
- `gsap.ticker` – RAF-driven ticker; see [Ticker](#ticker) below.
- `gsap.utils` – Utility namespace; see [Utilities & Helpers](#utilities--helpers).
- `gsap.version` – Semver string (useful for logging / support).

### Tween Vars (Common Properties)
- `duration` (seconds, default `0.5`) – Excludes repeats.
- `delay` – Initial delay before play.
- `ease` – Ease string or custom function (`"power3.out"`, `CustomEase.create(...)`).
- `stagger` – Object or number (`{ amount, each, from, grid, axis, ease }`).
- `repeat` – Number of repeats (`-1` infinite).
- `repeatDelay` – Delay between repeats.
- `repeatRefresh` – Recompute start/end values each repeat (great for `random()` calls).
- `yoyo` – Alternate direction each loop.
- `yoyoEase` – Override ease for the yoyo direction.
- `paused` – Start paused.
- `immediateRender` – Render start values immediately (default `true` for `from` tweens).
- `overwrite` – Conflict resolution strategy (`auto`, `true`, `false`, `"auto"`, `"preexisting"`).
- `id` – Optional identifier retrieved via `gsap.getById(id)`.
- `data` – Developer metadata attached to the tween (`tween.data()` returns/sets).
- `onStart`, `onUpdate`, `onComplete`, `onInterrupt`, `onRepeat`, `onReverseComplete` – Lifecycle callbacks.
- `onStartParams`, `...Params` – Parameter arrays for callbacks.
- `callbackScope` – `this` context inside callbacks.
- `inherit` – Controls property inheritance for nested tweens (`true` by default).
- `persist` – Keep timeline children alive after completion (for timeline-level tweens).

### Timeline Methods
- `add(child, position?)` – Insert tween/timeline/function.
- `addLabel(label, position?)` / `removeLabel(label)` – Manage labels.
- `addPause(position?, callback?, params?)` – Inject a pause.
- `call(callback, params?, position?)` – Timeline-friendly `delayedCall`.
- `clear(includeLabels?)` – Remove children (optional labels).
- `eventCallback(type, callback, params?)` – Manage timeline callbacks.
- `progress(value?, suppressEvents?)` / `totalProgress` – Get/set playback progress (0–1).
- `time(value?, suppressEvents?)` / `totalTime` – Get/set time.
- `duration(value?)` / `totalDuration` – Get/set durations.
- `seek(position, suppressEvents?)` – Jump to time/label.
- `pause(atTime?, suppressEvents?)`, `play(from?, suppressEvents?)`, `resume()`, `reverse(from?, suppressEvents?)`, `restart(includeDelay?, suppressEvents?)` – Playback controls.
- `repeat(value?)`, `repeatDelay(value?)`, `yoyo(value?)` – Loop configuration.
- `shiftChildren(amount, adjustLabels?, ignoreBeforeTime?)` – Nudge child positions.
- `tweenTo(position, vars?)`, `tweenFromTo(fromPosition, toPosition, vars?)` – Auto-generated tweens for scrubbing to labels/times.
- `kill()` / `killTweensOf(targets, props?)` – Cleanup.
- `invalidate()` – Recompute start/end values.
- `then(onFulfilled)`, `catch` – Timelines/tweens are promises in GSAP 3 (resolve on completion).

### Tween Methods
- `delay(value?)`, `duration(value?)`, `timeScale(value?)` – Inspect/configure playback.
- `iteration(value?)`, `iterationDuration()` – Manage repeat iterations.
- `isActive()` – Boolean when tween currently playing or paused.
- `targets()` – Return current target list.
- `then` / `catch` – Promise support for chaining asynchronous logic.
- `kill()` / `kill(null, property)` – Remove tween or particular properties.
- `progress`, `totalProgress`, `time`, `totalTime`, `repeat`, `repeatDelay`, `repeatRefresh`, `smoothChildTiming`, `data`, `id` – same semantics as timeline.
- `invalidate()` – Flush cached values for dynamic recalculation.

### Ticker
- `gsap.ticker.add(callback, once?, priority?)` – Register a callback. Pass `once: true` for single tick or priority > 0 to influence order.
- `gsap.ticker.remove(callback)` – Remove registered callback.
- `gsap.ticker.tick()` – Force an immediate tick (rarely needed).
- `gsap.ticker.deltaRatio(fps?)` – How much delta time occurred relative to the target fps (default 60).
- `gsap.ticker.fps(value?)` – Set/get requested frames per second.
- `gsap.ticker.lagSmoothing(threshold, adjustedLag)` – Dampens long gaps (default `500, 33`). Pass (`0`) to disable.
- `gsap.ticker.useRAF(value)` – Toggle requestAnimationFrame usage.
- `gsap.ticker.sleep()` / `wake()` – Pause/resume ticker updates (auto-sleeps when idle if `autoSleep` enabled).
## Utilities & Helpers

### gsap.utils Highlights
- `toArray(targets)` – Normalize selector/NodeList into array.
- `selector(scope)` – Returns a scoped selector function (used internally by `context`).
- `clamp(min, max, value?)` – Clamp values; returns function when value omitted.
- `wrap(min, max)` / `wrap(array)` – Wrap values around ranges or array indices.
- `wrapYoyo(min, max)` – Like wrap but yoyoing back and forth.
- `snap(increment | array | function)` – Quantize values (returned function is fast).
- `normalize(min, max, value?)` – Map into 0–1 range.
- `mapRange(inMin, inMax, outMin, outMax, value?)` – Linear mapping.
- `distribute(config)` – Generate stagger distribution functions (`amount`, `each`, `from`, `grid`, `axis`, `ease`).
- `random(min, max?, rounding?)` – Random number generator; returns function when called without immediate execution.
- `shuffle(array)` – In-place Fisher-Yates shuffle.
- `pipe(...functions)` – Compose multiple functions.
- `interpolate(min, max, progress)` – Interpolate values (supports color arrays).
- `splitColor(color)` / `unitize(func, unit)` / `snapDirectional(target, direction, increment)`.
- `checkPrefix(property)` – Resolve vendor prefix for CSS property.
- `getUnit(value)` – Extract unit string from CSS value.

### Quick Setters
- `gsap.quickSetter(targets, property, unit?)` – Returns fast setter function for high-frequency updates.
- `gsap.quickTo(target, property, vars)` – Hybrid between setter and tween; subsequent calls smoothly animate to new values using the provided `vars` defaults.

### Modifiers & Function-Based Values
- `modifiers` property inside tween vars intercepts computed values (`{ x: x => Math.round(x / 10) * 10 + 'px' }`).
- Function-based values receive (`index`, `target`, `targets`) – ideal for data-driven transforms.
## Plugin Catalogue

| Category | Plugin | Purpose | Notes |
|----------|--------|---------|-------|
| Core (auto-included) | `CSSPlugin` | Animate CSS transforms, filters, colors, CSS variables | Ships with gsap; no manual import needed. |
| Core (auto-included) | `AttrPlugin` | Animate DOM/SVG attributes (`stroke-dashoffset`, `viewBox`) | Works on any attribute; use `attr: { }` block. |
| Core (auto-included) | `SnapPlugin` | Quantize tweened values | Available via `snap` tween vars or `gsap.utils.snap`. |
| Core (auto-included) | `ModifiersPlugin` | Intercept computed values for wrapping, clamping, units | Ideal for slider wraps, modulo positioning. |
| Core (auto-included) | `DirectionalRotationPlugin` | Shortest-path rotation with direction hints | Use `rotation: "360_short"` style strings. |
| Core (auto-included) | `EaselPlugin` | Animate EaselJS display objects | Works with CreateJS/Easel scenes. |
| Core (auto-included) | `PixiPlugin` | Animate Pixi.js properties/uniforms | Accepts Pixi display objects, filters. |
| CSS Utilities | `ScrollToPlugin` | Animate window/element scroll positions | `gsap.to(window, { scrollTo: 0 });`. |
| Layout | `Flip` | First-Last-Invert-Play layout transitions | Snapshot state with `Flip.getState()`; animate with `Flip.from()`. |
| Scroll | `ScrollTrigger` | Scroll-driven triggers, pinning, scrubbing | Provide `start`, `end`, `scrub`, `markers`; call `refresh()` after layout shifts. |
| Scroll | `ScrollSmoother` | Smooth scrolling wrapper | Club GreenSock bonus file; pair with ScrollTrigger. |
| Interaction | `Observer` | Low-level wheel/touch/pointer/scroll observer | `Observer.create({ target, onChange, tolerance })`; included with ScrollTrigger file. |
| Interaction | `Draggable` | Drag/drop handles for DOM/canvas/SVG | Supports inertia with `InertiaPlugin`. |
| Interaction | `InertiaPlugin` | Kinetic motion after drags/tweens | Allows velocity tracking; bonus plugin. |
| SVG/Text | `DrawSVGPlugin` | Animate stroke draw-on for SVG paths | Free since GSAP 3.11. |
| SVG/Text | `MorphSVGPlugin` | Morph SVG shapes | Bonus plugin; auto normalizes path segments. |
| SVG/Text | `MotionPathPlugin` | Align targets to path progress | `motionPath: { path, align, autoRotate }`. |
| SVG/Text | `SplitText` | Split text into chars/words/lines | Great for cascade effects; now free. |
| SVG/Text | `TextPlugin` | Animate plain text content | Accepts objects for class toggles, delimiters. |
| SVG/Text | `ScrambleTextPlugin` | Scramble characters during transitions | Bonus plugin. |
| SVG/Text | `RoughEase`, `CustomEase`, `CustomBounce`, `CustomWiggle`, `ExpoScaleEase` | Advanced easing packs | `CustomEase.create(name, data)` etc. |
| Physics | `Physics2DPlugin`, `PhysicsPropsPlugin` | Velocity-based motion | Use for charts, pointer physics, draggables. |
| Diagnostics | `GSDevTools` | Timeline scrubber UI | Useful in development; `GSDevTools.create({ animation })`. |
| Audio/Canvas | `SoundPlugin`, `ColorPropsPlugin` | Animate audio values and color objects | Bonus plugins. |
| Framework | `@gsap/react` | `useGSAP` hook + helpers | Register via `gsap.registerPlugin(useGSAP)`. |

> Club GreenSock (paid) plugins (e.g., `MorphSVGPlugin`, `SplitText`, `ScrollSmoother`, `InertiaPlugin`, `DrawSVGPlugin` prior to 3.11) require membership for production builds. Identify licensing constraints before emitting prompts that depend on them.

### Plugin Patterns
- Register once per bundle: `gsap.registerPlugin(MotionPathPlugin, ScrollTrigger, Draggable);`.
- Some plugins expose static helpers: `Flip.getState`, `ScrollTrigger.refresh`, `ScrollTrigger.batch`, `TextPlugin.split(...)`, `Observer.getById(id)`.
- Inspect plugin availability with `gsap.utils.checkPrefix` or fallback prompts if missing.
## Diagnostics & Tooling
- `gsap.utils.checkPrefix("clipPath")` – Determine browser-prefixed properties.
- `gsap.globalTimeline.timeScale(1.5)` – Speed up/slow down entire app for testing.
- `ScrollTrigger.getAll()` / `ScrollTrigger.getById(id)` – Inspect active triggers.
- `ScrollTrigger.addEventListener("refresh", callback)` – Hook into lifecycle events.
- `GSDevTools.create({ animation: timeline, minimal: true });` – Inline scrubber for debugging orchestrations.
- Enable `ScrollTrigger.config({ limitCallbacks: true, ignoreMobileResize: true, autoRefreshEvents: "visibilitychange,DOMContentLoaded,load" });` to control global scroll behavior.

## Resources
- Official docs: append `use context7` and fetch from `https://gsap.com/docs/v3/` for the most recent API surface (new hooks, plugin updates, option tables).
- React guide: `https://gsap.com/resources/react-basics/` and `https://gsap.com/resources/react-advanced/` cover `useGSAP`, `contextSafe`, timeline sharing, and SSR nuances.
- Plugin references: `https://gsap.com/docs/v3/Plugins/` (each plugin page lists vars, callbacks, caveats, and methods).
- Community snippets: `https://codepen.io/collection/AYZywG` showcases live demos for ScrollTrigger, Flip, Observer, and more.
- For prompt scaffolding, cite concrete configuration values (start/end, eases, durations) and remind the LLM to confirm option names via `use context7` before finalizing code.
