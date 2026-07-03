# Visualization & Motion Tools

Decision matrix for animation, charting, 3D, video, and icon work inside wiki
modules. The `/animation-authoring` skill has the syntax and creative patterns
for each tool. This file is the routing layer specific to wiki modules.

## Tool decision matrix

| You need... | Reach for | Why |
|-------------|-----------|-----|
| UI animation (reveal, stagger, transition) | **Framer Motion** | Native React, spring presets in `lib/motion.ts` and `module-runtime/motion.ts` |
| Educational data visualization | **visx** (PRIMARY) | Headless SVG primitives, composes with `motion.rect`/`motion.path` |
| Scroll-pinned demonstrations | **GSAP ScrollTrigger** via `ScrollyPin` primitive | Scrub/pin/timeline for scroll-driven teaching |
| Animated SVG diagrams | **SVG + Framer Motion** | `motion.path`, `motion.circle` for inline diagram animation |
| Complex path morphing | **GSAP MorphSVG** | Shape A to shape B transitions |
| 3D molecular/anatomical models | **React Three Fiber + drei** or **model-viewer** via `ModelViewerStage` | R3F for interactive scenes, model-viewer for simple display |
| Math/science derivation video | **Manim CE** via `ManimPlayer` | LaTeX-heavy, precise curves, outputs `.mp4` consumed by `ManimPlayer` |
| Lottie animations | **lottie-react** | Pre-made animations from LottieFiles |
| Copy-paste animated components | **Magic UI / Aceternity UI** | AnimatedBeam, TextReveal, etc. Adapt to the spring presets above |

## Charting policy: visx over Recharts/ECharts

**visx** (Airbnb) is the primary charting tool for wiki modules because:

- Headless SVG primitives that compose with Framer Motion (`motion.rect`,
  `motion.path`).
- Tree-shakeable: import only what you need (~50–100KB vs ~450KB for Recharts).
- No animation opinions of its own — the shared spring presets apply
  uniformly.
- Educational visualizations are custom by nature, not standard dashboards.

**Do NOT use Recharts.** It fights Framer Motion with its own animation system
and is less powerful than both visx (composability) and ECharts (features).

**Apache ECharts** is available as an escape hatch for complex interactive
dashboards with 10k+ data points or built-in zoom/pan/brush. It does not
compose with Framer Motion, so reach for it only when visx becomes a fight.

## Motion rules for wiki modules

1. Module presets live in `module-runtime/motion.ts`, re-exported from
   `lib/motion.ts`. Never write inline spring configs.
2. Section containers: `useInView({ once: true, margin: "-10%" })` for scroll
   reveal.
3. Stagger children at `0.06s` intervals via the `staggerChildren` transition.
4. Cards: `scale(0.95) → 1` + `opacity 0 → 1` entrance (`cardReveal` variant).
5. Sections: `y(24) → 0` + `opacity` entrance (`sectionReveal` variant).
6. Scene handoffs: `x(40) → 0` lateral transition (`sceneHandoff` variant).
7. Reduced-motion variants exist for everything (opacity-only, no transforms).
   Honor `usePrefersReducedMotion()` everywhere.
8. **Parent orchestrates, children declare.** Parent uses `animate="visible"` +
   `staggerChildren`. Children use only `variants` — never their own `animate`
   prop. Setting `animate` on a child breaks variant propagation.

## Icons and illustrations

- **BioIcons** (CC0) — biomedical illustrations, brand-remappable colors.
- **Noto Emoji** (Apache 2.0) — emoji as SVG paths, Jon's preferred source.
- **Lucide** — UI icons. Never as brand marks.
- Always research existing open-licensed assets before hand-authoring SVG. The
  `/animation-authoring` skill has the canonical asset routing rules.

## Ambient runtime escape hatch

If a module needs a persistent ambient field, scroll-driven chapter system,
particle runtime, scene manifests, or anything that touches the shared field
substrate, this skill is no longer the authority. Hand off to `/module` for
the field/chapter contract and `/threejs` (with `/webgpu` for compute) for the
canvas authoring rules. Wiki modules in this skill are static prose +
interactive compositions inside a wiki page, not field surfaces.

## When to read this file

You are picking a tool for a new visualization, replacing a chart library, or
auditing motion behavior across sections. For library syntax and creative
patterns, hand off to `/animation-authoring`.
