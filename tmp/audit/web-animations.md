# Audit: web-animations

Slice root: `/home/workbench/SoleMD/SoleMD.Graph/apps/web/features/animations/`
4 902 LOC across 47 source files. Largest single file 372 LOC (well under 600).

## Slice inventory

Boundary surfaces:
- `manifest.ts` (55 LOC) — typed wrapper over `manifest.json` (16 entries) keyed by `name`. Public API: `getAnimationRef`, `getAnimationsForEntity`, `listAnimations`. `manifest.ts:17` uses `with { type: "json" }` import attribute (Node 22 / TS 5.6+ syntax).
- `registry.tsx` (128 LOC) — string→ComponentType registry; 15 entries, all `next/dynamic` with skeleton fallback; r3f and model-viewer entries flagged `ssr: false`.
- `manifest.json` (130 LOC) — 16 ref entries; one entry (`smoke-manim-scene`) is consumed via `<video>` not registry, so fewer registry entries than manifest entries by design.
- `publish-manifest.json` — checksum table for the Make→Graph publish flow.

Subdirectories:
- `_assets/` — glb, lottie (incl. `library/noto/`), svg-sprites (gitkeeped).
- `_smoke/` — 16 smoke modules (D1–D18) used by the wiki smoke catalog.
- `_templates/` — 11 author templates (canvas hook, animated beam, r3f, model-viewer, biology mechanism, mechanism scroll, marketing hero, icon-handcrafted, icon-lottie wrapper, viz reveal, manim, route-transition CSS).
- `_thirdparty/magic-ui/animated-beam/` — Magic UI port (133 LOC, MIT) with brand recolor.
- `biology/dopamine-d2-receptor/DopamineD2Binding.tsx` — first production biology mechanism (217 LOC).
- `brand/` — `SoleMDLogo.tsx` (372 LOC, hero animated mark), `SoleMDLogoMark.tsx` (Lucide-based), `LogomarkCompare.tsx`, `ClaudeCandidates.tsx`, `DistilledSnapshots.tsx`.
- `canvas/connectome-loader/` — `ConnectomeLoader.tsx` (333 LOC, R3F particle field, double-LPF cascade), with perf+bounds tests.
- `icons/` — `ActivityLucide.tsx`, `Phase2eHeartLottie.tsx`.
- `lottie/` — primitive layer: `recolor-lottie.ts` (132 LOC walker + CSS resolver), `LottieAccent.tsx`, `LottiePulseLoader.tsx`, `SearchToggleLottie.tsx`, `NotoLottie.tsx`.
- `text-reveal/TextReveal.tsx` — production primitive used by registry's smoke wrapper.

Empty / placeholder (gitkeep only): `marketing/`, `viz/`, `transitions/`, `icons/` root, `biology/` root, `_assets/glb/`, `_assets/svg-sprites/`.

## Critical issues

C1. **`recolorLottie` mutates and clones the entire JSON every render — breaks structuredClone on cyclic / non-cloneable inputs and pressures GC.**
`lottie/recolor-lottie.ts:77` calls `structuredClone(data)` on every invocation; `LottieAccent.tsx:66` and `LottiePulseLoader.tsx:76` call it inside `useMemo([raw, accent])`, but `accent` is reset on every theme/mode/colorScheme change via a new array allocation (`resolveCssColor` returns a fresh tuple each call), so the memo cache key is stable only by reference equality and recomputes on each color/mode tick. With the 712×712 Noto-tier loader JSON (often 200–600 KB parsed), each recolor does a deep clone of the full animation data, including every keyframe. Two consequences: (a) measurable jank on theme toggle / mode switch on the loader path, (b) GC pressure from large transient object trees. Fix: do an in-place walk on a one-time clone keyed by `raw` only, then mutate `c.k` shape colors on every accent change without re-cloning; or memoize accent via `JSON.stringify` / per-channel scalar deps.

C2. **`getAnimationComponent` registry skips type safety on the entry props.**
`registry.tsx:107` uses `Record<string, ComponentType<any>>` and `getAnimationComponent` returns `ComponentType<any> | undefined`. Callers downstream lose all prop validation. Combined with the manifest only carrying `path` (not prop schema), there is no way to assert a registry entry matches its manifest entry's expected props at the boundary. Acceptable for trivial smoke cards, but `dopamine-d2-binding` is now a production mount on `wiki | panel | graph-attached` — the moment a future entry takes a prop, this is a runtime-failure surface. Fix: add a discriminated union over manifest `format` so entries can declare their prop shape; gate registry entries through that union.

C3. **`SearchToggleLottie` runs a 60-attempt `requestAnimationFrame` busy-loop on every mode change waiting for the lottie-react player to mount.**
`lottie/SearchToggleLottie.tsx:67-79` retries `syncPlayer` up to `MAX_SYNC_ATTEMPTS = 60` rAFs (~1 s) per `[animationData, mode, playbackSpeed, reduced]` change. If the consumer toggles search rapidly, multiple overlapping retry chains can race; the cleanup only cancels the most recent `frame`, leaving older chains' `attempt + 1` recursions un-cancelled. Add a generation counter or use lottie-react's `lottieRef` callback prop pattern (the player's animationItem is available via a ref-callback once mounted) instead of polling.

## Major issues

M1. **Three near-identical Lottie cache + fetch + recolor stacks (`LottieAccent`, `LottiePulseLoader`, `SearchToggleLottie`) — extract one primitive.**
`LottieAccent.tsx:13-24`, `LottiePulseLoader.tsx:22-30`, and `NotoLottie.tsx:50-61` each define a per-file `jsonCache = new Map<string, Promise<...>>` plus an inline `fetch().then(json).catch(null)` fetcher. `SearchToggleLottie` skips caching but re-implements the recolor+resolve dance. Consolidate into one `useRecoloredLottie(src | json, { colorVar, fallback, loop })` hook that owns the cache, the `requestAnimationFrame` resolveCssColor handshake, the recolor memo, and the reduced-motion gate. Estimated savings: 80–100 LOC + fixes C1/C3 in one place.

M2. **Two `useNodeFocusSpring` sources — template at `_templates/canvas-hook.ts:19` and live primitive at `_smoke/node-focus/useNodeFocusSpring.ts:14` are byte-identical except for header comment.**
This is exactly the duplication the registry+template pattern was meant to prevent. Either: (a) make the template re-export from the canonical primitive, or (b) move the primitive to a non-`_smoke` home (e.g. `motion/` alongside `text-reveal/`) and delete the template.

M3. **`DopamineD2Binding` swaps the receptor SVG into the doc tree on every state change because `motion.path` re-renders with new `animate=` strings; brand tokens and inline `<defs>` re-flow.**
`biology/dopamine-d2-receptor/DopamineD2Binding.tsx:185-194` puts the path's `animate={activeState}` and a per-state `transition` on a path that lives inside a hand-translated `<g transform="translate(32, 28) scale(2.1)">`. Each re-render of the parent re-paints the entire SVG (including `<defs>` with `radialGradient` / `linearGradient`). Move animated nodes into a single Framer Motion variant graph driven by the parent's `animate=` and let the children inherit, instead of each `<motion.*>` re-evaluating. Also: `setInterval` at `:79` is paused on `inView` but resumes immediately when scrolled back, with no debounce — fast scroll-by triggers visible state-snap.

M4. **GSAP cleanup pattern in `ScrollMechanism.tsx` mutates a `let cleanup = () => {}` from inside an async IIFE — the React effect's cleanup may run before the IIFE assigns the real cleanup, leaving ScrollTriggers alive on unmount during fast nav.**
`_smoke/scroll-mechanism/ScrollMechanism.tsx:27-69`. This is a known async-effect race: the returned cleanup captures `cleanup` by closure but if the component unmounts during the dynamic import (~50–200 ms) `cleanup` is still the no-op. Fix with `useGSAP({ scope: ref })` (already used by `DrawMorph` and `ScrollFade` siblings) — ScrollMechanism is the lone holdout that hand-rolls the lifecycle. `_templates/mechanism-scroll.tsx:31-62` has the same race (template propagates the bug).

M5. **`ConnectomeLoader` shared `sharedSimState` singleton is theme-keyed but never disposes the previous theme's typed arrays.**
`canvas/connectome-loader/ConnectomeLoader.tsx:142-211`: when the user toggles theme, `getOrCreateSimState(theme)` allocates fresh `Float32Array(NODE_COUNT * 3) × 5` (~360 KB total) and silently replaces the cached singleton; the previous arrays are referenced by any `<ConnectomeField>` instance still mounted while the new theme renders the next frame. Bigger concern: the design comment at `:14-19` claims "only one Canvas is mounted at a time" but the singleton-vs-double-mount contract is enforced by no test. Also: the `circleTextureCache` `CanvasTexture` at `:101` is never disposed — if the page unmounts permanently (route change to non-graph route), the texture's GPU handle leaks until the WebGL context is collected. Add `circleTexture.dispose()` and `gl.deleteTexture` cleanup somewhere (or at least document explicitly that this is intentional shared state).

M6. **`<model-viewer>` has no error boundary or load-failure path.**
`_smoke/model-viewer-demo/ModelViewerDemo.tsx:24-32` resolves `ready` only on import success; an import failure is never surfaced (no `.catch`). The element itself fires `error` events for missing/bad GLB but the wrapper doesn't listen. `_templates/model-viewer-wrapper.tsx:18-21` is worse: `void import(...)` discards the promise entirely. A 404 on the GLB silently shows the `<model-viewer>` poster forever. Add an `onError` handler and a fallback panel.

M7. **`LottieAccent` returns `null` under reduced-motion with no caller-visible fallback contract documented at the type level.**
`lottie/LottieAccent.tsx:71`: "`return null` — caller decides the fallback" is explicit in the comment but the return type is just the inferred ReactNode, so consumers won't get a TS hint. Either return a typed `null | JSX.Element`, or accept a `fallback?: ReactNode` prop and return that — the only consumers won't have to ship their own conditional. Today the consumer pattern is "show a CSS pulse" which is duplicated each call site.

M8. **`Phase2eHeartLottie` swallows fetch errors silently with a TODO comment.**
`icons/phase2e-heart-lottie/Phase2eHeartLottie.tsx:36-38`: `.catch(() => { /* TODO: surface error state */ })`. The wrapper renders an empty 280×w div forever if the JSON 404s. Same anti-pattern as M6.

## Minor issues

m1. **`registry.tsx` smoke-text-reveal entry is a 18-line inline factory with hardcoded copy.** `registry.tsx:59-78`. Move that demo wrapper to its own file (`_smoke/text-reveal/TextRevealRegistryDemo.tsx`) so the registry stays a flat name→component map.

m2. **Manifest entries with no registry counterpart.** `manifest.json` lists `smoke-manim-scene` (consumed as `<video>` not via registry) — fine — but multiple slice components are NOT in either manifest or registry: `Phase2eMagnetic`, `ActivityLucide`, `Phase2eHeartLottie`, `NotoLibrary`. Either they are consumed externally (out of slice — see SCOPE rule, can't verify) or they are orphan demos that should be cleaned up or wired in.

m3. **`Phase2eMagnetic.tsx:23` magnetic strength `0.3` hard-coded; `Phase2eHeartLottie.tsx:44` 280px height hard-coded; `RotatingCube.tsx:43` 360px hard-coded; `ConnectomeLoader.tsx:51` `NODE_COUNT = 6000` exported but other constants (BOUNDARY_RADIUS, POINT_SIZE) are not.** No central `motion-tokens.ts` palette inside the slice. The `@/lib/motion` import surfaces (`canvasReveal`, `dataReveal`, `panelReveal`, `smooth`, `crisp`, `loadingBreathe`) suggest a token system exists outside the slice — good — but height/duration constants for animation cards still leak into each component. Centralize a `cardSize` and a `breathDuration` token.

m4. **`GOAL_DAMPING = 0.999` in ConnectomeLoader is integrated against `INITIAL_VEL_SPREAD = (2 * GOAL_KICK) / Math.sqrt(12 * (1 - GOAL_DAMPING²))` — formula is correct but `(1 - GOAL_DAMPING * GOAL_DAMPING) ≈ 0.001999` produces an `INITIAL_VEL_SPREAD ≈ 0.103`, which is well above the per-frame `GOAL_KICK = 0.008`. Comment claims "steady-state amplitude" but the integrated steady state is `K / sqrt(12 (1-D²))` = 0.0517, off by 2×. Either the formula's intent is misnamed or `(2 * GOAL_KICK)` should be just `GOAL_KICK`. Trivial visual impact but worth correcting since the comment is the only spec.

m5. **`SoleMDLogo` runs k-means and k-NN on every mount with no memoization.** `brand/SoleMDLogo.tsx:280-282`: `useEffect(() => setLayout(buildLayout()), [])` fires on every component instance. `buildLayout` does `O(N²)` neighbor sort + 14 iterations of k-means at N=140. Once per mount is fine, but multiple instances (e.g. if the logo appears in nav + footer + favicon) each pay the cost; consider a module-level `let cachedLayout: Layout | null = null`. Also: it appends/removes a hidden `<svg>` to `document.body` for path sampling at `:88-129` — works, but spawns layout reads. A document fragment would avoid the body mutation.

m6. **`LogomarkCompare` table renders 8 candidates × 4 sizes × 2 variants = 64 cells, each potentially building its own `MiniConnectome` / `Snapshot70` (with hundreds of inline `<line>` elements for Snapshot70).** `brand/LogomarkCompare.tsx:104-127`. Snapshot70.tsx alone is ~220 hand-coded `<line>`s; rendered 4× in this table = ~880 SVG primitives just for one row. Wrap each cell in `useMemo` keyed by `(name, size, variant)`.

m7. **`AnimatedBeam.tsx:77-81` ResizeObserver observes container + both anchors but never re-fires on parent layout changes outside the observed element trio.** If the page reflows because of font load, scrollbar appearance, etc., the anchors might not change size but their absolute positions could shift. Acceptable for the current demo but worth noting in a comment.

m8. **`canvasReveal`/`dataReveal`/`panelReveal` are imported as spread props (`{...canvasReveal}`) in a dozen files; no Jest snapshot guards what those primitives expose.** Out of slice (`@/lib/motion`) so unenforceable here, but inside the slice nothing protects the contract.

m9. **`text-reveal/TextReveal.tsx:54` always reads `useReducedMotion()` then early-returns, so the rest of the hooks are skipped — fine functionally but lints will flag conditional render not changing hook order; doc the pattern or restructure.** Actually reviewing: only the JSX changes, not the hook count, so this is OK. Worth a comment for future maintainers.

m10. **`_smoke/text-reveal/TextReveal.tsx` (115 LOC, the demo) and `text-reveal/TextReveal.tsx` (114 LOC, the production primitive) share name and overlapping content.** The demo's `renderChars` could be expressed as `<TextReveal text={HEADLINE} grain="chars" trigger="in-view" />`. Demo is dead-weight duplication of the primitive.

m11. **`BioIconsSmoke.tsx:44` uses `dangerouslySetInnerHTML` to inline a static SVG string.** Works, but a JSX `<svg>` block would be parsed at build time, get full TS/JSX coverage, and benefit from Tailwind-class targeting. The SVG is 100% static — there's no reason for the runtime parse cost.

m12. **`registry.tsx:23` `const fallback = <Skeleton height={280} radius="lg" />;`** — single shared element instance is fine, but Mantine `Skeleton` is being rendered even for the `RotatingCube` (h-[360px]) and `ScrollMechanism` (h-[520px]) cards. Visible flash on slow connections shows a 280-height skeleton then a much taller card. Per-entry skeleton heights would match the actual content.

m13. **`Phase2eMagnetic.tsx:35-36` rebuilds `onPointerMove`/`onPointerLeave` on every `xy` update**, causing React to re-attach the listeners. Use `useCallback` or move logic to a ref pattern.

m14. **`AnimatedBeamDemo.tsx` sets `tint` on the wrapping div via `style={{ color: tint }}` and then sets `color: var(--text-primary)` again on the inner span — the `color` cascade overrides nothing intentional and could be a `var()` directly on the SVG icon.** Cosmetic.

m15. **The `_smoke/manim/trivial_scene.py` file is checked into the slice but produces no consumed asset** (registry doesn't render `smoke-manim-scene`; only manifest lists it). If the .mp4 isn't published, the manifest entry is dangling.

## Reuse / consolidation opportunities

R1. **One `useRecoloredLottie` hook** replacing the duplicated cache+fetch+recolor+rAF dance in `LottieAccent`, `LottiePulseLoader`, `SearchToggleLottie`, and (partly) `NotoLottie` / `Phase2eHeartLottie`. Hook surface: `useRecoloredLottie({ src? | data?, colorVar?, fallback?, mode? })` returning `{ data, ready, accent }`. Resolves M1, C1, C3.

R2. **One `useLazyJson<T>(src)` hook** for `LottieFilesSmoke`, `Phase2eHeartLottie`, `NotoLottie.loadNotoCatalog`, `NotoLibrary`. Each currently has its own cancellation-flag effect.

R3. **Brand-token map for the connectome palette is duplicated in two contexts** — `ConnectomeLoader.tsx:75-91` defines `CONNECTOME_PALETTE_KEYS` inline, while `lib/pastel-tokens` (out of slice) also enumerates the keys. The `CONNECTOME_PALETTE_KEYS` here is just a subset projection; expose it from the token module so both stay in sync.

R4. **`SoleMDLogo` and `NotoBrain` and `LottieDemo` all contain the same Noto/Twemoji brain path data.** SoleMDLogo extracts and samples the paths; `NotoBrain.tsx` renders them whole. Extract `brand/noto-brain-paths.ts` so the strings live in one place.

R5. **The `canvasReveal`-wrapped 280×280 card pattern is the de-facto template for every smoke card** (Pulse, ChartReveal, NotoBrain, LottieDemo, BioIconsSmoke, ActivityLucide, Phase2eHeartLottie, NodeFocusDemo, AnimatedBeamDemo, Phase2eMagnetic, etc.). Wrap it in a `<SmokeCard reveal="canvas">` shell so the height + flex centering + breath wrapper is one place.

R6. **`recolorLottie` darkness threshold + matte/glow handling lives in the walker** but the `MODE_ACCENT_FALLBACK` / `GRAPH_ICON_FALLBACK` / `SEARCH_TOGGLE_FALLBACK_COLOR` per-component fallbacks are scattered. A `lottieFallbackColors` table keyed by CSS variable name would centralize them.

R7. **`useGSAP` is correctly used in `DrawMorph` and `ScrollFade`** but `ScrollMechanism`, `_templates/mechanism-scroll.tsx`, and `_templates/icon-hand-crafted.tsx` still hand-roll the async useEffect lifecycle. Standardize on `useGSAP({ scope })` everywhere.

## What's solid

S1. **Registry pattern** (`registry.tsx`) — explicit `name → dynamic(import)` map with per-entry SSR gating; documents *why* dynamic-string imports were rejected; tree-shake friendly.

S2. **Reduced-motion hygiene** — every interactive component (Pulse, ChartReveal, ScrollFade, DrawMorph, ScrollMechanism, NotoBrain, LottieDemo, BioIconsSmoke, TextReveal, DopamineD2Binding, NodeFocusDemo, Phase2eMagnetic, NotoLottie, AnimatedBeam, Phase2eHeartLottie) checks `useReducedMotion` and renders a meaningful resting state, not just `null`. This is well above industry baseline.

S3. **`useGSAP({ scope })` adoption** in `DrawMorph` and `ScrollFade` — StrictMode-safe with `gsap.matchMedia` for reduced motion. The DrawSVG plugin import is even guarded with try/catch for bundler-resolution failure (`DrawMorph.tsx:30-34`).

S4. **`gsap.matchMedia` reduced-motion pattern** in `ScrollFade.tsx:28-49` — properly distinguishes the two media states and skips animation entirely rather than shortening it.

S5. **`ConnectomeLoader` performance test** (`__tests__/connectome-perf.test.ts`) covers both throughput (60 frames < 250 ms for 6 000 nodes) and bounded-position invariant (600 frames stays inside `BOUNDARY_RADIUS` + margin). With JIT warmup. This is the exemplar of the "performance regression test" rule from `/clean`.

S6. **Cancellation flags on every async effect** — `NotoLottie:90-112`, `LottieAccent:51-59`, `LottiePulseLoader:54-62`, `LottieFilesSmoke:21-35`, `Phase2eHeartLottie:29-42`, `ModelViewerDemo:24-32`, `NotoLibrary:36-51`. Pattern is consistent and correct.

S7. **`AnimatedBeam` ResizeObserver** observes container + both anchors and disconnects on cleanup (`_thirdparty/magic-ui/animated-beam/AnimatedBeam.tsx:77-81`) — exactly the right scope.

S8. **`@google/model-viewer` gating** — `ModelViewerDemo.tsx:21-44` waits for `customElements.define()` to land before rendering the element, preventing the never-upgraded-element trap.

S9. **License attribution is consistent and per-file** — Twemoji (MIT/CC-BY), Noto Emoji (Apache 2.0 / OFL 1.1), BioIcons (CC-BY 4.0), Health Icons (CC0), Lucide (ISC), Magic UI (MIT), LottieFiles (Simple License), Twitter Twemoji are all called out at the top of their consumer files.

S10. **All files under 400 LOC**, well under the 600 cap. Slice modularization is good.

## Recommended priority (top 5)

1. **Fix recolor allocation churn (C1).** Make `recolorLottie` walk in place on a per-source clone, cache by `(src, accentTuple)` with scalar deps; eliminates the per-mode-tick deep-clone of large Noto JSON. Highest user-visible perf win on theme/mode toggles.
2. **Extract `useRecoloredLottie` + `useLazyJson` hooks (M1, R1, R2).** Folds `LottieAccent`, `LottiePulseLoader`, `SearchToggleLottie` (and resolves C3's busy-loop) into one primitive with one cache + one cleanup story. Eliminates ~80 LOC of duplication.
3. **Replace `SearchToggleLottie` rAF poll with lottie-react's ref callback (C3).** Use the `lottieRef` pattern lottie-react exposes to receive `animationItem` exactly when ready; remove `MAX_SYNC_ATTEMPTS` and the un-cancelled retry chains.
4. **Convert `ScrollMechanism` and `_templates/mechanism-scroll.tsx` to `useGSAP({ scope })` (M4, R7).** Both have the async-cleanup race; `useGSAP` is already the project standard in sibling smoke files.
5. **Tighten `<model-viewer>` and `Phase2eHeartLottie` failure paths (M6, M8).** Add `onError` / `.catch` handlers that surface a fallback panel; today a missing GLB or 404'd Lottie JSON shows an empty 280px void with no log. Then dedupe the empty-card pattern via a `<SmokeCard>` shell (R5).
