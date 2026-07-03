# Module Primitives (Tier 1)

Pure UI atoms in `apps/web/features/wiki/module-runtime/primitives/`. They render one
thing, accept `children` or simple props, and never accept typed content arrays.

## Hard rule

You do not pass `items: Foo[]` or `stages: Stage[]` into a primitive. If you find
yourself wanting to, you are reaching for a Tier 4 section renderer or a Tier 2
interaction shell instead.

Primitives barrel-export from `module-runtime/primitives/index.ts`. Import via the
folder when convenient, or directly when a module section already specifies the
file.

## The 11 primitives

| Primitive | Purpose | Typical use |
|-----------|---------|-------------|
| `SceneSection` | Section wrapper with scroll-triggered `sectionReveal` animation, title, subtitle, accent color | Wraps every top-level section in a module |
| `ProseBlock` | Readable text block with max-width prose constraint | Orientation prose, transition copy |
| `RevealCard` | Click-to-reveal card with accent border, typing-reveal animation | Definition cards, "tap for more" beats inside a Tier 2 shell |
| `ChatBubble` | Single message bubble (user or AI role), avatar, content slot | Used inside `ChatThread.Message`; rarely standalone |
| `AnimationStage` | Embeds a named animation from the animation registry (`features/animations/manifest.json`) | Inline animation beats inside `MechanismSection` stages, foundational concept demos |
| `GlossaryHover` | Term tooltip that pulls definitions from the module glossary (`module-runtime/glossary.ts`) | Inline term definitions inside prose |
| `ManimPlayer` | Manim `.mp4` video playback with poster + accessible controls | Math/science derivations rendered offline by Manim |
| `ModelViewerStage` | `<model-viewer>` wrapper for 3D GLB display | Static 3D molecular/anatomical models |
| `ScrollyPin` | Scroll-pinning wrapper (GSAP ScrollTrigger under the hood) | Pinned reveal sequences inside a section |
| `CitationFootnote` | Citation reference linked to module citations | Inline footnotes inside prose |
| `ObjectiveList` | Learning objectives display | Module header / opener |

## Decision rules

- A new "atomic UI element" you want to add should pass these tests, in order:
  1. It does not accept typed content arrays.
  2. It is reusable across at least 2 modules.
  3. It does not duplicate behavior already in a primitive (`RevealCard` does
     reveal animation; do not build a second one).
  4. It does not impose a content shape (no "header + body + footer" template
     logic — that's a section renderer).
- If only one module needs the atom, keep it in the module's `sections/` folder
  until a second consumer arrives. Do not promote prematurely.
- If the atom needs sequencing, keyboard navigation, or multi-step state, it
  is not a primitive — it belongs in Tier 2 as an interaction shell.
- Match existing prop conventions: `accent?: ModuleAccent`, `sectionId?: string`,
  `children: ReactNode`. Do not invent new patterns.

## File and export contract

- One primitive per file. Filename matches the export, PascalCase
  (`SceneSection.tsx`, `RevealCard.tsx`).
- Add the export to `primitives/index.ts` so module sections can import from
  the barrel.
- Keep all motion behavior using the canonical presets from
  `module-runtime/motion.ts` (`cardReveal`, `cardRevealReduced`,
  `staggerChildren`, `sectionReveal`). Do not write inline spring configs.
- Always honor `usePrefersReducedMotion()` and ship a reduced variant.

## When to read this file

You are about to add a new primitive, audit existing primitives for engineering
discipline, or decide whether something belongs in Tier 1 vs Tier 2/3/4. If the
answer is "Tier 4 typed-prop section renderer", read `section-renderers.md`. If
the answer is "compound interaction shell", read `interaction-shells.md`.
