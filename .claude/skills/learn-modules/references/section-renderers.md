# Shared Section Renderers (Tier 4)

Typed-prop, data-driven section components in
`apps/web/features/wiki/module-runtime/sections/`. They are the legitimate place
for shared section shapes that 2+ modules use without per-instance variation.

## Why this tier exists

Tier 2 (interaction shells) intentionally avoids typed content arrays so each
step can hold anything. That works for bespoke educational sequences where every
step gets a custom visualization.

But some content shapes repeat verbatim across modules:

- "Six key facts as cards"
- "A mechanism with N numbered stages of title + description"
- "Before/after comparison rows"
- "Stack of definitions"
- "A clinical case with progressive reveals"
- "Resource list with categories"

For those, building a compound component per module is wasted work. The data
shape is stable, the rendering is identical, and modules supply only the
content. That is exactly when you reach for Tier 4.

## The six built section renderers

All of them barrel-export from `module-runtime/sections/index.ts`.

| Renderer | Prop shape | Use case |
|----------|------------|----------|
| `KeyFactsSection` | `{ facts: KeyFact[]; title?: string; columns?: 2 \| 3; sectionId?: string }` | Grid of icon + label + description tiles for orientation, summary, or "what you'll learn" beats |
| `MechanismSection` | `{ stages: MechanismStage[]; title?: string; sectionId?: string }` | Numbered vertical mechanism with optional `animationName` per stage |
| `BeforeAfterSection` | `{ items: BeforeAfterItem[]; title?: string; beforeLabel?: string; afterLabel?: string; sectionId?: string }` | Side-by-side before/after rows |
| `DefinitionStackSection` | `{ items: DefinitionItem[]; title?: string; sectionId?: string }` | Vertical stack of term + definition (+ optional detail) |
| `CaseVignetteSection` | `{ data: CaseVignetteData; sectionId?: string }` | Clinical case: scenario + progressive reveals |
| `ResourcesSection` | `{ items: ResourceItem[]; title?: string; categories?: string[]; sectionId?: string }` | Categorized resource list with optional links |

The exact prop interfaces live in `module-runtime/types.ts` alongside the
`ModuleManifest` type. Read that file when adding new prop shapes — do not
duplicate the type definitions in component files.

## Decision matrix: Tier 2 shell vs Tier 4 renderer

Use this matrix when picking between a compound shell and a typed renderer:

| Question | If yes | If no |
|----------|--------|-------|
| Does every step need a custom visualization, slider, or embedded component? | Tier 2 shell | Continue |
| Will 2+ modules render this exact content shape with no per-step variation? | Tier 4 renderer | Tier 3 module-specific composition |
| Does the section need keyboard navigation, sequencing state, or context-aware children? | Tier 2 shell | Tier 4 renderer is fine |
| Is the content shape one of the six already built (`KeyFacts`, `Mechanism`, `BeforeAfter`, `DefinitionStack`, `CaseVignette`, `Resources`)? | Reuse the existing renderer | Continue |
| Could a future module legitimately need this same data layout? | Build Tier 4 once you have a second consumer | Keep it in Tier 3 (module-specific) |

The trap to avoid: building `MechanismSection({ stages })` for content that
actually wants a slider per stage. If you find yourself adding a `customSlot`
prop, you have outgrown Tier 4 and need a Tier 2 shell.

## Build rules for Tier 4

- Define the prop type in `module-runtime/types.ts`, not inline. Pair it with
  the data type (e.g. `MechanismSectionProps` and `MechanismStage`).
- Wrap the body in `SceneSection` so titles, ids, and the entrance animation
  stay consistent.
- Use `framer-motion` with `useInView({ once: true, margin: "-10%" })` and the
  `staggerChildren` transition from `module-runtime/motion.ts`. Children declare
  variants only — never set their own `animate` prop.
- Always honor `usePrefersReducedMotion()`.
- Default `title` and `sectionId` so module composition can stay terse.
- Add the export to `sections/index.ts`.

## When NOT to add a Tier 4 renderer

- Only one module needs the shape. Keep it in `modules/{slug}/sections/` until
  a second consumer arrives.
- The shape needs per-step custom slots. Use a Tier 2 shell instead.
- The content is unique prose with no repeating structure. Use `SceneSection` +
  `ProseBlock` directly in the module.

## When to read this file

You are about to build a new shared section renderer, modify an existing one,
or decide whether a content pattern justifies Tier 4 vs staying in Tier 3. If
the answer is "needs custom per-step slots", read `interaction-shells.md`. If
the answer is "atomic UI element", read `primitives.md`.
