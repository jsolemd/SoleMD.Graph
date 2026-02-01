# Theme Standardization Plan

## Evaluation Snapshot
- Hero baseline combines a muted gradient background, centered typography, and the ScrollDown Lottie accent to establish the desired `clean-minimal` mood (`app/page.tsx:46`, `app/page.tsx:87`).
- Secondary sections on key pages fall back to plain `content-container` blocks with dense paragraph stacks and minimal surface styling, e.g. the About "Story" grid lacks a card wrapper or background tint (`app/about/AboutPageClient.tsx:89`).
- Statistic/impact rows rely on floating icon pills over bare backgrounds instead of shaded cards (`app/about/AboutPageClient.tsx:296`).
- Education subpages blend Tailwind utility shells, Mantine cards, and bespoke borders, creating a different visual grammar than the landing hero (`app/education/EducationPageClient.tsx:104`, `app/education/ai-for-md/foundations/AIForMDFoundationsPageClient.tsx:39`).
- Several legacy Mantine `Card` usages still ship their own shadows and padding, bypassing the `floating-card` treatment (`app/education/ai-for-md/foundations/components/ModuleWrapper.tsx:4`).

## Design Goals
- Apply the hero aesthetic (soft gradients, breathing room, layered card surfaces, motion easing) to every major section while preserving content hierarchy.
- Normalize background treatments (base, tinted, gradient) via reusable section shells instead of per-file inline styles.
- Standardize surface components: one canonical floating card, a stat/info variant, and a CTA card that reuses hero shadow tokens.
- Ensure motion feels consistent: entrance timings, hover easing, and Lottie accents should stem from shared animation utilities.
- Preserve accessibility (contrast and reduced-motion) while updating visuals.

## Implementation Roadmap

### Phase 1 – Foundations
- Extract hero styling tokens (gradient, spacing, Lottie placement) into reusable utilities: e.g. `HeroShell` and `SectionShell` components with configurable background presets (`gradient`, `tinted`, `plain`).
- Extend global CSS variables with secondary gradient/tint tokens for About, Research, Education so we can call `var(--gradient-about)` etc. without per-page literals.
- Audit and document available animation variants in `@/lib/animation-utils` to guarantee consistent entry/hover curves.

### Phase 2 – Surface Library
- Refine `floating-card-base` to support headline/subheadline slots, stat rows, and optional illustration blocks so all card-like content reuses the same shadow/padding (`components/ui/floating-card-base.tsx:18`).
- Implement a `FloatingStatCard` wrapper for icon + metric patterns currently hard-coded on About and Education pages.
- Create a `PageSectionHeader` component bundling label, eyebrow, description, and accent underline to replace repeated `motion.div` setups in each page.

### Phase 3 – Page Refactors
1. Home (`app/page.tsx`)
   - Swap inline section styles for the new section shell and header components; keep content intact but remove bespoke padding.
2. About (`app/about/AboutPageClient.tsx`)
   - Wrap the "Story" content in a two-column `SectionShell` with a subtle card backdrop behind the narrative text.
   - Replace the professional background and impact grids with `FloatingCard`/`FloatingStatCard` variants to align shadows and icon treatments.
3. Research (`app/research/ResearchPageClient.tsx`)
   - Introduce alternating tinted backgrounds between major sections and migrate the filter toolbar into a `floating-card` toolbar to keep surfaces consistent.
4. Education (`app/education/EducationPageClient.tsx` and AI for MD subpages)
   - Replace ad-hoc Mantine cards with floating card variants; move hero into `HeroShell` so the foundations course mirrors the landing experience.
5. Global components (navigation, footer)
   - Review for background mismatches and update to use the same tokens so transitions between sections feel seamless.

### Phase 4 – Motion & Polish
- Reuse ScrollDown Lottie or lighter weight SVG animations as section separators where helpful (e.g., at the start of major scroll segments) via an optional prop on `HeroShell`.
- Apply `ANIMATION_VARIANTS.cardHover` and consistent stagger timings across all card grids; centralize duration/delay values to avoid drift.
- Validate `prefers-reduced-motion` behaviors after consolidating animations to ensure compliance.

### Phase 5 – QA & Documentation
- Run design QA on desktop, tablet, and mobile breakpoints focusing on spacing, card alignment, and background transitions.
- Update the design system documentation (consider extending `sleep-neurobiology-design` or creating `/docs/theme.md`) with screenshots and usage guidelines for the new section and card components.
- Add Storybook (or MDX snippets) entries for `HeroShell`, `SectionShell`, and card variants to keep future work aligned.

## Dependencies & Considerations
- Ensure Tailwind v4 + Mantine styles continue to load in the documented order (`app/layout.tsx:1`).
- Watch for transform conflicts: Mantine buttons embedded inside Framer Motion wrappers must retain `transform: none !important` hover overrides (`app/education/ai-for-md/foundations/AIForMDFoundationsPageClient.tsx:95`).
- Coordinate with any ongoing content updates so refactors do not collide with copy edits.

## Definition of Done
- All top-level pages render with consistent section shells, cards, and motion primitives that visually echo the landing hero.
- No remaining ad-hoc Mantine `Card` styling; all surfaces derive from the floating card system or documented section shells.
- Manual accessibility check passes (contrast + keyboard focus) and automated tests/lint continue to succeed (`make check`).
- Documentation reflects the new theming guidelines so future contributors can extend the system without regressions.
