---
name: learn-modules
description: |
  Interactive wiki module authoring for SoleMD.Graph: primitives, interaction
  shells, shared section renderers, module sections, visualization tools, and
  SHOW-don't-TELL design.

  Triggers: wiki module, module-runtime, features/wiki/modules,
  features/wiki/module-runtime, wikiPageSlug, WikiModuleContent, ModuleShell,
  interaction shell, ChatThread, StepThrough, ToggleCompare, DemoStage,
  KeyFactsSection, MechanismSection, BeforeAfterSection, DefinitionStackSection,
  CaseVignetteSection, ResourcesSection, SHOW-don't-TELL, register-all,
  interactive lesson.

  Do NOT use for: field substrate, scroll chapters, scene manifests, particle
  runtime (use /module), motion craft (use /animation-authoring), graph panels
  (use /graph), styling (use /aesthetic), three.js or shaders (use /threejs).
version: 2.0.0
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
paths: "apps/web/features/wiki/{modules,module-runtime}/**"
metadata:
  short-description: Wiki module authoring contract — primitives, shells, sections
---

# Wiki Module Authoring

Interactive educational modules that render **inline inside wiki pages** under
`apps/web/features/wiki/modules/{slug}/`. Every section SHOWS a concept through
interaction. Text-only sections are a design failure.

## Boundary: this skill vs `/module`

The two skills both claim "wiki module" as a trigger. Lock the boundary before
you start.

| Surface | Owner | Substrate |
|---------|-------|-----------|
| Static prose + interactive compositions inside a wiki page | **this skill** | React + Framer Motion + visx, no field |
| Field-substrate authoring (any surface using Field + chapter system, scene manifests, scroll-driven runtime, particle runtime, FixedStageManager) | `/module` | Field substrate, three.js |

You hand off to `/module` the moment a learn module needs a persistent ambient
field, scroll-driven chapters, scene manifests, GSAP timeline choreography
spanning multiple sections, or any R3F/three.js rendering. For three.js
authoring rules underneath that handoff, read `/threejs` (and `/webgpu` for raw
compute). You stay in this skill for in-page Framer Motion, visx, ScrollyPin,
ManimPlayer, ModelViewerStage embeds, and SVG diagrams.

## Integration: how a module reaches the page

There is **no** standalone `/learn/<slug>` route. Modules render inline inside
wiki pages.

- `apps/web/features/wiki/modules/{slug}/register.ts` calls `registerModule`.
- `apps/web/features/wiki/modules/register-all.ts` side-effect imports every
  `register.ts` once.
- `apps/web/features/wiki/components/WikiModuleContent.tsx` looks the module up
  by `wikiPageSlug` and renders it inside a Suspense boundary, optionally
  wrapped by `ModuleShell` (`module-runtime/shell/ModuleShell.tsx`) +
  `ModuleHeader` + `ModuleFooter`.
- The wiki page passes its own `wikiPageSlug` (e.g. `"modules/ai-for-mds"`).

Full anatomy in `references/module-anatomy.md`.

## ModuleManifest (canonical shape)

Defined in `apps/web/features/wiki/module-runtime/types.ts`.

```ts
export interface ModuleManifest {
  title: string;
  accent: ModuleAccent;
  audience: string;
  estimatedMinutes: number;
  version: string;
  lastUpdated: string;
  authors: string[];
  objectives: string[];
  sections: ModuleSection[];
  citations: ModuleCitation[];
  glossaryTerms: string[];
  animations: string[];
  /** Canonical wiki page slug where the module is rendered inline. */
  wikiPageSlug: `modules/${string}`;
}
```

Things agents miss:

- No `slug` field. Modules key off `wikiPageSlug`.
- `wikiPageSlug` is a **required templated string** (`modules/${string}`).
- `accent` is one of the eight values in `module-runtime/tokens.ts`.

## The four tiers

This architecture follows Mathigon (interactive textbooks) and PhET (science
sims) for content reuse, plus Radix UI's compound component model for
interaction shells. The key insight: **interaction mechanics** are reusable
across hundreds of modules; **domain content** is not. Separate them, and add
a tier for content shapes that repeat verbatim.

| Tier | Folder | Purpose |
|------|--------|---------|
| 1. Primitives | `module-runtime/primitives/` | Pure UI atoms. No content opinions. |
| 2. Interaction shells | `module-runtime/interactions/` | Compound components with content slots and an interaction pattern. |
| 3. Module sections | `modules/{slug}/sections/` | Bespoke per-module compositions of shells + primitives + domain viz. |
| 4. Shared section renderers | `module-runtime/sections/` | Typed-prop, data-driven section components used when 2+ modules share a content shape. |

### Tier 1: Primitives

11 atoms today: `SceneSection`, `ProseBlock`, `RevealCard`, `ChatBubble`,
`AnimationStage`, `GlossaryHover`, `ManimPlayer`, `ModelViewerStage`,
`ScrollyPin`, `CitationFootnote`, `ObjectiveList`. They accept `children` or
simple props, never typed content arrays. Full inventory and rules in
`references/primitives.md`.

### Tier 2: Interaction shells (4 built)

| Shell | Pattern |
|-------|---------|
| `ChatThread` | Message flow, typing indicator, swappable AI responses |
| `StepThrough` | Sequential stages with keyboard nav (arrow keys, role=tablist) |
| `ToggleCompare` | Control drives a visual state change |
| `DemoStage` | Control panel + visualization area, linked reactively |

Future shells (`ProgressiveReveal`, `Checklist`) are not built. Do not depend
on them. Build a shell only when the same interaction pattern appears in 2+
modules. The compound component recipe (hook + context + sub-components +
`Object.assign`) lives in `references/interaction-shells.md`.

### Tier 3: Module sections

`modules/{slug}/sections/` is where domain knowledge meets interaction shells
plus module-specific visualizations (e.g. `TokenDemo`, `ProbabilityDistribution`,
`HallucinationDemo`). One concept = one component file. Domain visualizations
stay here until 3 modules consume them — only then do they graduate to a
primitive or shared location.

### Tier 4: Shared section renderers (6 built)

`module-runtime/sections/` holds typed-prop renderers when 2+ modules share a
content shape: `KeyFactsSection`, `MechanismSection`, `BeforeAfterSection`,
`DefinitionStackSection`, `CaseVignetteSection`, `ResourcesSection`. Prop shapes
live in `module-runtime/types.ts`. This is the legitimate exception to the
"no typed content arrays" rule from Tier 1/2: when the data shape is stable and
identical across modules, a typed renderer is the right primitive of reuse.
Decision matrix and build rules in `references/section-renderers.md`.

## Decision matrix: which tier?

| Need | Reach for |
|------|-----------|
| Atomic UI element with no content opinions | Tier 1 primitive |
| Sequencing, keyboard nav, or per-step custom slots | Tier 2 shell |
| Bespoke section unique to this module | Tier 3 (in `modules/{slug}/sections/`) |
| Repeating content shape used by 2+ modules with no per-step variation | Tier 4 shared renderer |

The trap: building a Tier 4 renderer that needs a `customSlot` prop. If the
content shape varies per instance, you outgrew Tier 4 and need a Tier 2 shell.
Conversely, if your "shell" never varies its content, you should be using
Tier 4 instead.

## SHOW Don't TELL

The foundational design test: if you removed all the prose text from a
section, would the demo still teach something? If yes, ship it. If the demo is
just a "tap to reveal more text" card, it fails.

Pattern → tier mapping (full table and TELL/SHOW examples in
`references/show-dont-tell.md`):

| Pattern | Tier 2 / Tier 4 |
|---------|-----------------|
| Manipulate & observe | `DemoStage`, `ToggleCompare` |
| Step through | `StepThrough`, `MechanismSection` |
| Simulate the experience | `ChatThread` |
| Compare alternatives | `ToggleCompare`, `BeforeAfterSection` |
| Apply and test | `CaseVignetteSection` plus shells inside reveals |

## Visualization tooling (quick map)

`visx` is the primary chart library — headless SVG primitives that compose
with Framer Motion. Recharts is banned. ECharts is the escape hatch for
heavyweight dashboards. 3D models route through `ModelViewerStage` (display)
or R3F + drei (interactive). Manim videos use `ManimPlayer`. Full decision
matrix and motion preset rules in `references/visualization-tools.md`.

## Engineering discipline

After building or modifying any module, run `/clean` on the changed files.
Wiki modules are particularly prone to:

- Redundant motion setup (repeated `useRef` + `useInView` + `staggerChildren`
  in every section instead of the right Tier 2/4 component).
- Inline style objects with hard-coded colors (use `module-runtime/tokens.ts`,
  Mantine props, or Tailwind tokens).
- Data-driven renderer trap: building `FooSection({ items })` for content the
  shell layer should own, or building a shell for content that is actually
  shared verbatim across modules (Tier 4).
- Missing `prefers-reduced-motion` variants. Every animation needs one.
- Oversized files. 600-line cap per file. One concept demo per component.

| Rule | Why |
|------|-----|
| No source file over 600 lines | Modularization — split along stable boundaries |
| One concept demo per component file | Each demo is independently developable and testable |
| Interaction hooks testable in isolation | `useChatThread` works without rendering |
| Content data in `data/`, UI in `sections/` | Content updates do not touch UI code |
| Domain viz stays in module until 3 consumers | Prevents premature abstraction |
| All controls keyboard accessible | Educational content must be accessible |
| `prefers-reduced-motion` honored | Every animation has a reduced variant |
| Run `/clean` after changes | Catches violations before they accumulate |

## Reference router

| Question | Reference |
|----------|-----------|
| Which primitive should I use? Should I build a new one? | `references/primitives.md` |
| How do I build a compound interaction shell? | `references/interaction-shells.md` |
| Should this be a typed renderer in `module-runtime/sections/`? | `references/section-renderers.md` |
| How do I make a section actually teach instead of read? | `references/show-dont-tell.md` |
| Which animation/chart/3D tool? | `references/visualization-tools.md` |
| How do manifests, registration, and `WikiModuleContent` connect? | `references/module-anatomy.md` |

## Existing infrastructure to reuse

- **Animation registry**: `apps/web/features/animations/manifest.json` lists
  named animations. Use `AnimationStage` to embed them.
- **Motion presets**: `module-runtime/motion.ts` (module-specific) and
  `lib/motion.ts` (global). Never write inline spring configs.
- **Module types**: `module-runtime/types.ts` for all shared interfaces.
- **Module registry**: `module-runtime/registry.ts` for module discovery.
- **Token system**: `module-runtime/tokens.ts` maps accent names to CSS custom
  properties.
- **Glossary**: `module-runtime/glossary.ts`.

For animation tool syntax and creative patterns, hand off to
`/animation-authoring`. For broader Graph architecture, `/graph`. For visual
styling, `/aesthetic`. For three.js / shaders / WebGPU when an embedded 3D
canvas appears, `/threejs` and `/webgpu`.
