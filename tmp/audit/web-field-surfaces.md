# Audit: web-field-surfaces

Scope: `apps/web/features/field/surfaces/FieldLandingPage/**` and
`apps/web/features/field/routes/FieldLandingRoute.tsx`. Field runtime
internals (`renderer/`, `controller/`, `scene/`, `scroll/`, `stage/`)
referenced but not audited.

## Slice inventory

| File | LOC | Role |
|------|-----|------|
| `routes/FieldLandingRoute.tsx` | 28 | `next/dynamic` SSR=false adapter for the landing page |
| `surfaces/FieldLandingPage/FieldLandingPage.tsx` | 426 | Top shell: providers + canvas + chrome + section composition |
| `surfaces/FieldLandingPage/FieldHeroSection.tsx` | 76 | Hero copy (TextReveal, framer-motion eyebrow) |
| `surfaces/FieldLandingPage/FieldSurfaceRailSection.tsx` | 101 | Static "four layers" rail with reveal stagger |
| `surfaces/FieldLandingPage/FieldStoryChapter.tsx` | 138 | Generic chapter for story 1, 3, sequence beats |
| `surfaces/FieldLandingPage/FieldStoryTwoSection.tsx` | 46 | Centered story-2 beat, no Framer reveals |
| `surfaces/FieldLandingPage/FieldCtaSection.tsx` | 120 | CTA "Open the graph" surface, button gated on `graphReady` |
| `surfaces/FieldLandingPage/FieldStoryProgress.tsx` | 221 | Sticky desktop progress bar, GSAP-driven |
| `surfaces/FieldLandingPage/FieldConnectionOverlay.tsx` | 211 | SVG-over-canvas connection rails for synthesis beat |
| `surfaces/FieldLandingPage/FieldHotspotPool.tsx` | 122 | Static 41-slot DOM pool for blob hotspots |
| `surfaces/FieldLandingPage/FieldGraphWarmupAction.tsx` | 242 | Lottie play-arrow chrome action, prefetches `/graph` |
| `surfaces/FieldLandingPage/FieldScrollCue.tsx` | 59 | Lottie chevron cue, fixed bottom-center |
| `surfaces/FieldLandingPage/field-landing-content.ts` | 277 | Section + beat manifest + stage-item manifest |
| `surfaces/FieldLandingPage/field-connection-pairs.ts` | 112 | Cluster + edge manifest for synthesis overlay |
| `surfaces/FieldLandingPage/field-hotspot-overlay.ts` | 33 | 41-entry hotspot label manifest |
| `surfaces/FieldLandingPage/field-lit-particle-indices.ts` | 28 | Particle-index constants for info-8 spotlight |
| `surfaces/FieldLandingPage/index.ts` | 1 | Re-export |

Total: ~2,241 LOC across 17 files. All files under the 600-LOC modularization limit; the largest is `FieldLandingPage.tsx` at 426 LOC.

## Critical issues

None. No `dangerouslySetInnerHTML`, no XSS surfaces, no missing event-listener cleanup that would leak across navigations, no insecure URL constructions. The connection overlay correctly imperatively writes DOM bypassing React reconciliation.

## Major issues

### M1. `useLandingGraphReadyDebugOverride` violates Rules of Hooks

`FieldLandingPage.tsx:80-89` — the hook returns early after `useSearchParams()` based on `process.env.NODE_ENV === "production"`. Hook calls in a hook are fine, but the *consumer* `FieldLandingPage` (line 413) calls `useLandingGraphReadyDebugOverride()` on every render unconditionally — that's actually OK. The real risk: since `useSearchParams` is called and then in production the search params aren't read, you incur the (small) Suspense overhead and the route boundary requirement on every prod load just for a debug flag. Move the env check *before* `useSearchParams` and short-circuit, or read `window.location.search` lazily for the debug path only.

### M2. `FieldLandingShellContent` ref-handoff race in `handleControllerReady`

`FieldLandingPage.tsx:166-190`. `handleControllerReady` runs synchronously when `FieldCanvas` reports its blob controller. But `FieldHotspotPool.onRegisterRefs` runs in its own `useEffect` (`FieldHotspotPool.tsx:72-74`) — order between "blob controller ready" and "pool refs registered" is not deterministic. The shell handles both branches (lines 181-190 *and* lines 247-263 inside `onRegisterRefs`), but the second branch reads `blobControllerRef.current` synchronously while `handleControllerReady` is a non-stable function (re-created every render) — fine functionally but easy to break. Also: `blobHotspotRefsRef.current` may include entries for nodes that have already unmounted by the time the controller calls `projectHotspots`. There's no nullification on unmount; `useEffect` cleanups are missing in `FieldHotspotPool` for the registration callbacks.

### M3. `FieldStoryProgress` resize listener uses `gsap` without dispose

`FieldStoryProgress.tsx:120-125`. `gsap.to(root, ...)` tweens CSS variables but the cleanup at line 169-172 only removes the listener and unsubscribes from the scene store — it does not kill in-flight tweens. On unmount during a fast transition, gsap can still write to a now-detached DOM node. Add `gsap.killTweensOf(root)` in cleanup.

### M4. `FieldStoryProgress` re-runs scene-store sync on every store tick

`FieldStoryProgress.tsx:158`, `sceneStore.subscribe(sync)`. The store fires per scroll frame (it's the same store the connection overlay subscribes to). Each callback calls `getBoundingClientRect()` for every beat (`document.getElementById(beatId)` lookup + rect read) plus a `gsap.to`. With 3 beats × ~60 fps that's 180 layout reads/sec on desktop. The `mobileMql.matches` early-out spares phones, but desktop is the primary surface. Cache the beat nodes in a ref on mount and avoid `getElementById` on every tick. Consider rAF-throttling or only running when chapter is active (you already have `isFieldChapterActive`).

### M5. `FieldStoryProgress` mobile-MQL listener missing

`FieldStoryProgress.tsx:39`. `window.matchMedia("(max-width: 1023px)")` is captured once but never `addEventListener("change", …)`. If a user resizes through the breakpoint (or rotates a tablet), the progress bar continues to write CSS variables even though it is `lg:flex` (hidden on mobile). The `resize` listener at line 167 *does* handle mobile re-entry, but only by resetting bars — it does not re-attach the desktop sync path because `mobileMql.matches` is captured fresh inside `handleResize` (line 160), which is correct. So this is mainly redundant work, not a correctness bug — but should listen to `mql.change` for clarity.

### M6. `FieldConnectionOverlay.renderPaths` writes DOM during React render path on signal change

`FieldConnectionOverlay.tsx:165-167`. `useEffect(() => { renderPaths(); }, [chapterSignal, renderPaths])` re-runs whenever `chapterSignal` (from `useSyncExternalStore`) flips. `renderPaths` reads `framesRef.current` which may be `null` until `BlobController` pushes frames; that's handled. But `renderPaths` is also re-created when `sceneStore`/`sceneStateRef`/`chapterId` change, causing the effect to rerun and re-write SVG attrs — fine, just noting the dep array is correct. Lower-impact issue.

### M7. `FieldHotspotPool` re-fires registration callbacks every parent re-render

`FieldHotspotPool.tsx:72-78`. `useEffect` with deps `[onRegisterRefs]` and `[onRegisterCardRefs]`. The parent (`FieldLandingShellContent`) passes inline arrow functions (lines 248-262), so these effects fire on every render of the shell. Each fire re-publishes the `refsRef.current` array (mutated in place; reference stable, contents change as nodes mount). Mostly harmless because the parent's handler also reassigns `controller.hotspotRefs`. But it does mean `controller.hotspotRefs` is re-computed every render. Wrap the parent handlers in `useCallback`, or take stable refs via `useRef` setters.

### M8. `FieldGraphWarmupAction` has no observability

`FieldGraphWarmupAction.tsx:101-141`. Two effects schedule `fieldLoopClock.subscribe` callbacks that retry up to `MAX_SYNC_ATTEMPTS = 60` (line 33). If the Lottie `animationItem` never appears (CDN failure, dynamic import error), the only signal is silent retry exhaustion. There's no warn/log. This will be invisible in prod.

## Minor issues

### m1. SSR=false on entire landing page

`FieldLandingRoute.tsx:6-20`. `dynamic(..., { ssr: false })` means zero HTML for the marketing entry. Acceptable given the WebGL canvas substrate, but the loading fallback is a blank `min-h-screen` div — no skeleton, no copy, no LCP element. Bots and slow connections see nothing. Consider rendering hero copy server-side with a lightweight wrapper that hydrates into `FieldLandingPage`.

### m2. `getLandingSection` throws

`FieldLandingPage.tsx:91-99`. `throw new Error` if a section id is missing. With seven hard-coded lookups (lines 202-208), drift between `field-landing-content.ts` and the shell will crash render. Either type the manifest as a tuple/record so missing keys are a TS error, or render a safe fallback in dev.

### m3. `scrollToSection` not used

`FieldLandingPage.tsx:210-219`. Defined but no caller in the file — `ViewportTocRail` accepts entries directly and presumably uses `scrollOffsetPx` to compute its own scroll. Dead code.

### m4. `FieldLandingShellContent` indentation glitch

`FieldCtaSection.tsx:22` — `const sectionRef = ...` is dedented one space (not aligned with line 23). Cosmetic.

### m5. `FieldStoryChapter.BEAT_VIEWPORT.once: false`

`FieldStoryChapter.tsx:26`. With `once: false`, leaving and re-entering a beat replays the title/body reveal. Confirmed intentional ("bidirectional"), but combined with `amount: 0.2` this re-fires often on touch scroll back-and-forth. Consider `once: true` on mobile (where pacing is faster) via `useMediaQuery`.

### m6. `FieldStoryProgress` couples to global section IDs

`FieldStoryProgress.tsx:41` reads `FIELD_CHAPTER_SECTION_IDS[chapterKey]` from `chapter-adapters/types`. That coupling is fine, but `beatIds` are looked up via `document.getElementById` — fragile if any beat id collides with anything else on the page.

### m7. Race: `cameraRef` declared but never written/read

`FieldLandingPage.tsx:126`. `cameraRef = useRef<Camera | null>(null)` is passed to `FieldCanvas` but never read in this file. If the rest of the runtime ever drops the prop, this dead ref becomes silent. Add an explicit comment or remove if unused.

### m8. `FieldConnectionOverlay` stroke-dash math assumes `pathLength=1`

`FieldConnectionOverlay.tsx:182, 188-189`. `pathLength={1}` + `strokeDasharray: 1` is correct, but the comment trail attributes the dasharray as a draw-on effect when in practice it's only being toggled via `strokeDashoffset` between 0 and `1 - visibility`. Works, but the dasharray is constant — the visual is more "fade" than "draw". Document or simplify.

### m9. No tests anywhere in the slice

No `*.test.tsx` / `*.spec.tsx` colocated. Performance regression tests called for in the slice contract are absent.

### m10. `FieldLandingPage.tsx` does too much

426 LOC, 12 imports of sibling modules, three nested components (`FieldLandingShellContent`, `FieldLandingShell`, `FieldLandingPage`). Under 600 limit but the inner shell is a candidate to split: hotspot/connection wiring (~100 LOC) could move to a `useLandingHotspotBridge` hook that owns `blobControllerRef`, `connectionOverlayRef`, the loop-clock subscription, and the registration callbacks.

### m11. `FieldLandingShellContent` fix-ed-stage manager subscriber lacks loop-clock dep

`FieldLandingPage.tsx:136-164`. The `useEffect` deps are `[]` — correct because the closure reads refs only. But it captures `connectionOverlayRef` on first mount; if a future change introduces conditional mounting of the overlay, the closure will silently target a stale ref. Add a comment.

### m12. `FieldHotspotPool` aria-label leakage

`FieldHotspotPool.tsx:39-48`. Hotspots without title/badges return null; OK. But every named hotspot (3 cards) gets an `aria-label` on a `role="group"` that's hidden behind `pointer-events-none`. Screen readers can still encounter these unless an ancestor uses `aria-hidden`. The parent `<div>` at `FieldLandingPage.tsx:243-245` does set `aria-hidden="true"`, which suppresses the cards correctly. So actually fine — just brittle.

### m13. `field-connection-pairs.ts` runtime warn

`field-connection-pairs.ts:101-112`. Dev-only `console.warn` for OOB pair indices. Good, but consider hard-throwing in dev so the failure is loud.

### m14. `FieldGraphWarmupAction` re-entrant Lottie playback

`FieldGraphWarmupAction.tsx:101-121`. If `phase` flips `ready-playing -> ready-idle -> ready-playing` rapidly (e.g., color scheme change triggering `iconColor` recompute), each transition starts a new loop-clock subscription. The `disposer` is returned from the effect cleanup, so previous subscriptions tear down — fine. But `attempt` counter resets on each effect run; theoretically could cycle indefinitely.

### m15. `field-landing-content.ts` dual exports of beats

`field-landing-content.ts` exports `fieldStoryOneBeats`, `fieldStoryTwoBeats`, `fieldSequenceBeats`. The shell imports them twice — once in the manifest import block (lines 53-55) and again in the named beats import (lines 64-67). Cosmetic; consider a single grouped import.

### m16. `data-scroll` attribute used on most sections, but missing on story chapters

`FieldStoryChapter.tsx:57-64` does *not* set `data-scroll`. Other surfaces do (`data-scroll="hero"`, `"surfaceRail"`, `"storyTwo"`, `"cta"`). If anything (analytics, e2e tests) hooks on `data-scroll`, story 1/3/sequence are invisible to it. Either add it (`data-scroll={chapterKey}`) or document that it's deprecated.

## Reuse / consolidation opportunities

### r1. Three near-identical Framer reveal blocks

`FieldHeroSection.tsx:31-71` (eyebrow + title + body), `FieldCtaSection.tsx:42-83` (eyebrow + title + body + button), `FieldSurfaceRailSection.tsx:60-79` (title + body), and `FieldStoryChapter.tsx:80-128` (title + body, two layouts) all redefine the same `titleReveal` / `bodyReveal` variants with identical 0.6s duration, `[0.16, 1, 0.3, 1]` ease, `y: 22 / 16`, `delay: 0.08`. Extract one `apps/web/features/field/surfaces/FieldLandingPage/landing-reveal-variants.ts` (or under `lib/motion`) and reuse. Currently each file maintains its own copies — drift risk.

### r2. `BEAT_VIEWPORT` and `REVEAL_VIEWPORT` are identical

`FieldStoryChapter.tsx:26` (`{ once: false, amount: 0.2 }`), `FieldSurfaceRailSection.tsx:16` (`{ once: false, amount: 0.2 }`). Same constant.

### r3. Section shell pattern repeats

Every section file does `const sectionRef = useRef<HTMLElement | null>(null); useChapterAdapter(sectionRef, "X")` plus a `<section ref={sectionRef} id={section.id} data-ambient-section data-preset={section.preset} data-section-id={section.id} ...>`. Wrap as `<FieldChapterSection chapterKey="X" section={section} className="..." dataScroll="X">`.

### r4. Lottie + recolor + loop-clock-once pattern duplicated

`FieldGraphWarmupAction.tsx:78-89` and `FieldScrollCue.tsx:25-36` both: (a) subscribe to `fieldLoopClock` once, (b) call `resolveCssColor`, (c) `recolorLottie`, (d) cache result via `useMemo`. Extract `useRecoloredLottie(animationData, cssVar, fallback)` hook. Probably belongs under `features/animations/lottie/`, not in this slice — but the duplication is here.

### r5. Sticky chapter progress is "info" only

`FieldStoryProgress.tsx` is shared across 3 chapters via `chapterKey`. Good. But `FieldStoryTwoSection` does not get one (it's the centered "weight" pause). Consider documenting the "no-progress" variant decision in the section manifest.

## What's solid

- The runtime contract is genuinely native: chapter visuals are WebGL particles + DOM pool + SVG arcs driven by `BlobController`'s frame array. No visx/d3 anywhere. Aligns with the slice intent.
- Imperative loop-clock subscriptions (`fieldLoopClock.subscribe("...", priority, fn)`) consistently return their own disposer and are correctly returned from `useEffect`.
- `FieldConnectionOverlay` correctly bypasses React for per-frame DOM writes via `useImperativeHandle` + refs. Nice pattern.
- Centralized manifests: `fieldLandingSections`, `FIELD_SECTION_MANIFEST`, `fieldStoryOneBeats`, `fieldSequenceBeats`, `fieldConnectionPairs`, `fieldBlobHotspots`. Strong /clean centralization.
- `FixedStageManagerProvider` + `ShellVariantProvider` + `FieldSceneStoreProvider` cleanly separate concerns; the inner shell is leaf-level concerns only.
- Reduced-motion is handled at the `MotionConfig reducedMotion="user"` boundary AND with `useReducedMotion()` checks at consumers AND with `sceneStateRef.current.motionEnabled` push-down to the runtime.
- A11y: skip link present (line 227), `aria-hidden` on the offscreen stage (line 244), `role="progressbar"` on the chapter progress (line 178), `sr-only` status announcer in the warmup action (line 230-238).
- `next/dynamic` SSR=false on the landing route avoids hydration mismatches with the WebGL/DuckDB substrate.
- `useShellVariant`/`isCompactFieldViewport` cross-check ensures TOC rail only shows on true desktop with fine pointer.
- The landing-graph-ready debug param is gated to non-production (line 83).

## Recommended priority (top 5)

1. **M2 — hotspot ref-handoff race** (`FieldLandingPage.tsx:166-190`, `FieldHotspotPool.tsx:72-78`). Stabilize parent callbacks with `useCallback`, nullify pool entries on unmount, and document the controller-vs-refs registration ordering. Highest blast radius (visible blob controller writing to stale DOM).
2. **M4 — `FieldStoryProgress` per-frame `getElementById` + layout reads** (`FieldStoryProgress.tsx:90-156`). Cache beat nodes on mount; gate `sync` on `isFieldChapterActive`. Slice contract calls out scroll-heavy perf.
3. **M3 — kill in-flight gsap tweens on unmount** (`FieldStoryProgress.tsx:169-172`). Add `gsap.killTweensOf(root)`.
4. **r1 + r3 — Extract `landing-reveal-variants` and `FieldChapterSection` shell.** Removes drift across 4 files; aligns with /clean modularization. Also addresses m16 (data-scroll consistency).
5. **m9 + M8 — Add at least smoke + scroll-progress tests for the landing surfaces, and add observability (warn or counter) to `FieldGraphWarmupAction` retry exhaustion.** Slice has zero tests today; warmup failures are silent in prod.
