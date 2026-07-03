# CSS Token Architecture

CSS is split across nine purpose-built files in `apps/web/app/styles/`. `apps/web/app/globals.css` is the entry point — it declares cascade layers, pulls Tailwind 4 layers, and imports the styles files in order. It contains no rules of its own beyond layer ordering and the dark `@custom-variant`.

## File Layout

```
apps/web/app/
├── globals.css                  ← layer order + imports + @custom-variant
├── layout.tsx                   ← mounts MantineProvider, ColorSchemeScript
└── styles/
    ├── tokens.css               ← all CSS custom properties
    ├── base.css                 ← reset, density, scrollbar, view transitions
    ├── entity-highlights.css    ← editor entity highlight pills
    ├── editor.css               ← rich-text editor surface
    ├── vendor-overrides.css     ← third-party widget patches
    ├── graph-ui.css             ← graph chrome (icon-btns, Cosmograph fixes, keyframes)
    ├── chrome-surface.css       ← shell chrome surfaces
    ├── wiki-content.css         ← wiki page typography
    ├── wiki-module-content.css  ← wiki module section typography
    └── viewport-toc-rail.css    ← viewport edge ToC rail

apps/web/lib/
├── mantine-theme.ts             ← createTheme() bridge
├── pastel-tokens.ts             ← CSS var ↔ Mantine tuple bridge, entity maps
└── density.ts                   ← --app-density helpers

apps/web/features/graph/lib/
├── modes.ts                     ← Ask/Explore/Learn/Create mode registry
└── brand-colors.ts              ← WebGL hex constants (mirror of tokens.css)
```

## Layer 1 — `tokens.css` (Source of Truth for Tokens)

Four scopes inside this file:

### `@theme` block (Tailwind v4 color generation)

Defines `--color-*` and `--font-*` that Tailwind v4 reads at build time. These become available as `text-soft-blue`, `bg-soft-blue`, etc., AND as CSS custom properties consumers can reference with `var(--color-soft-blue)`.

- **Core brand pastels (9)**: `--color-soft-blue`, `--color-muted-indigo`, `--color-golden-yellow`, `--color-fresh-green`, `--color-warm-coral`, `--color-soft-pink`, `--color-soft-lavender`, `--color-paper`, `--color-teal`
- **Semantic category pastels (9)**: `--color-semantic-disorder`, `--color-semantic-chemical`, `--color-semantic-gene`, `--color-semantic-anatomy`, `--color-semantic-physiology`, `--color-semantic-procedure`, `--color-semantic-section`, `--color-semantic-paper`, `--color-semantic-module`
- **Extended pastels (12)** for the `PanelEdgeToc` rainbow cycle: `--color-seafoam`, `--color-amber`, `--color-sky`, `--color-rose`, `--color-mint`, `--color-orchid`, `--color-maize`, `--color-powder`, `--color-peach`, `--color-sage`, `--color-plum`, `--color-pear`
- **Feedback**: `--color-feedback-warning`, `--color-feedback-danger`
- **Surface radius ramp**: `--radius-surface-sm`, `--radius-surface`, `--radius-surface-lg` → generates Tailwind `rounded-surface-sm/-/--lg`
- **Fonts**: `--font-sans`, `--font-mono`

### `:root` block (semantic light tokens)

Everything downstream uses these. Grouped into families:

- **Foundations** — `--background`, `--surface`, `--surface-alt`, `--surface-raised`, `--text-primary/secondary/tertiary`, `--border-default/subtle`, `--shadow-sm/md/lg`, `--brand-accent`, `--brand-accent-alt`, `--interactive-hover`, `--interactive-active`
- **Tone helpers** — `--tint-accent-bg`, `--tint-accent-border`, `--tint-accent-pill`, `--tint-accent-strong`, `--rim-light`, `--on-accent`
- **Graph canvas + panels** — `--graph-canvas-filter`, `--graph-bg`, `--graph-panel-bg`, `--graph-panel-border`, `--graph-panel-text`, `--graph-panel-text-muted`, `--graph-panel-text-dim`, `--graph-panel-input-bg`, `--graph-panel-hover`, `--graph-panel-shadow`, `--graph-panel-scale`, `--graph-panel-reading-scale`
- **Wiki graph** — `--wiki-graph-node-{diso,chem,gene,anat,phys,proc,section,paper,default,module}`, `--wiki-graph-link`, `--wiki-graph-label`
- **Entity accent** — `--entity-accent`, `--entity-highlight-radius` (rewired by `[data-entity-type]` selectors)
- **Graph overlays (chrome)** — `--graph-prompt-*`, `--graph-label-*`, `--graph-greyout-opacity`, `--graph-overlay-scrim`, `--graph-overlay-scrim-strong`
- **Filter/timeline** — `--filter-bar-base`, `--filter-bar-active`, `--filter-bar-marker`
- **Mode accent spectrum** — `--mode-accent`, `--mode-accent-subtle`, `--mode-accent-hover`, `--module-accent-default` (set by `ModeColorSync`, derived via `color-mix()`)
- **Icon sizing** — `--icon-size`, `--icon-stroke-width`, `--panel-icon-size`, `--panel-icon-stroke-width`
- **Graph control (matte shell)** — `--graph-icon-color`, `--graph-control-idle-bg`
- **Feedback states** — `--feedback-warning-{accent,bg,border,text}`, `--feedback-danger-{accent,bg,border,text}`
- **Density** — `--app-density: 0.8` (global scale multiplier)

### `html:root` block (Cosmograph overrides)

Higher specificity than Cosmograph's runtime `:root` injection. Overrides the base `--cosmograph-ui-*` tokens (background, text, element, highlighted-element, selection, font-family, font-size) plus widget-specific vars (Timeline, Search, Legend, Button, Histogram, SizeLegend, Popup).

### `.dark` and `html.dark` blocks (dark overrides)

Every foundation/semantic token that needs to change in dark mode is re-declared under `.dark`. Cosmograph dark divergences go in `html.dark`.

### Entity-type attribute selectors

`[data-entity-type="disease"] { --entity-accent: var(--wiki-graph-node-diso); }` — one selector per entity type (disease, chemical, gene, receptor, anatomy, network, biological process, species, module). The `panelAccentCardEntityStyle` reads `--entity-accent` with a `var(--mode-accent)` fallback.

## Layer 2 — `base.css`

- Universal box-sizing reset
- HTML/body: `--app-density` binding, `font-sans`, foreground/background
- Heading defaults
- `.thin-scrollbar` utility
- Global scrollbar hide (overridden by Cosmograph module classes)
- View-transition animations (`solemd-fade-out/in`) with `prefers-reduced-motion` gate

## Layer 3 — `graph-ui.css`

Component-level CSS that doesn't fit token blocks.

- **Mantine overrides**: `.table-pagination`, `.table-scope-toggle`, `.detail-accordion`
- **Matte control shells**: `.graph-icon-btn` (idle/hover/pressed/active from `--graph-control-*` tokens), `.panel-icon-btn`
- **Icon sizing utilities**: `.graph-icon-btn svg[class*="lucide"]` reads `--icon-size` / `--icon-stroke-width`
- **Cosmograph widget fixes**: rect/polygon selection scaling, light-mode filter bars, type-legend scrollbar hide
- **Keyframe animations**: `pill-activate`, `constellation-drift-0/1/2`, `constellation-glow`
- **Entity accent pill**: `.entity-accent-pill` uses `color-mix()` with `--entity-accent`

## Layer 4 — Mantine Bridge (`lib/mantine-theme.ts` + `lib/pastel-tokens.ts`)

### `lib/mantine-theme.ts`

```ts
createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 3, dark: 3 },
  colors: { brand: mantineBrandColorsTuple, gray: mantineNeutralColorsTuple },
  fontFamily: 'var(--font-sans)',
  headings: { fontFamily: 'var(--font-sans)', fontWeight: '500' },
  radius: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
  defaultRadius: 'lg',
  shadows: {
    xs: 'var(--shadow-sm)', sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)', lg: 'var(--shadow-lg)', xl: 'var(--shadow-lg)',
  },
  components: {
    Button:     { defaultProps: { radius: 'xl', size: 'md' }, styles: { root: { fontWeight: 400 } } },
    Card:       { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'xl' } },
    TextInput:  { defaultProps: { radius: 'lg', size: 'md' } },
    Select:     { defaultProps: { radius: 'lg', size: 'md' } },
    Textarea:   { defaultProps: { radius: 'lg', size: 'md' } },
    ActionIcon: { defaultProps: { radius: 'lg', size: 'md' } },
    Paper:      { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'md' } },
    Badge:      { defaultProps: { radius: 'xl' } },
  },
})
```

### `lib/pastel-tokens.ts`

The canonical CSS-var ↔ Mantine-tuple bridge. Exports:

- `brandPastelVarNameByKey` — 9 keys → `--color-*` names
- `mantineBrandColorsTuple` — 10-shade blue for Mantine's primary
- `mantineNeutralColorsTuple` — 10-shade gray for Mantine's `gray`
- `extendedPastelVarNameByKey` — 12 keys for the PanelEdgeToc palette
- `dotTocPastelColorSequence` — 20-color cycle
- `semanticColorVarNameByKey` — 9 entity-type → wiki-graph color mappings
- `entityTypeCssColorByType` — runtime hex per entity type (used by entity profile pill tints)

When adding a new brand color: add to `@theme` in `tokens.css`, then add to `brandPastelVarNameByKey` + tuple if it's a Mantine primary, or to `extendedPastelVarNameByKey` if it's for the PanelEdgeToc cycle.

## Layer 5 — `apps/web/features/graph/lib/brand-colors.ts` (WebGL Hex Mirror)

WebGL/Cosmograph React props cannot read CSS vars. This file centralizes the hex literals:

```ts
export const BRAND = {
  light: { bg: "#faf9f7", ring: brandPastelFallbackHexByKey["muted-indigo"], greyout: 0.25 },
  dark:  { bg: "#000000", ring: brandPastelFallbackHexByKey["soft-blue"],   greyout: 0.12 },
} as const;

export const DARK_ON_COLOR = "#1a1817";   // mirror of tokens.css --text-primary (light)
export const NOISE_COLOR = "#555555";
export const NOISE_COLOR_LIGHT = "#999999";
export const DEFAULT_POINT_COLOR = brandPastelFallbackHexByKey["soft-blue"];
```

Both `tokens.css` and `brand-colors.ts` carry breadcrumb comments
referencing each other. `BRAND.light.bg` matches `tokens.css` `--background`
(`#faf9f7`). Do not confuse it with `themeViewportColorByScheme.light`
(`#f8f9fa`) in `apps/web/lib/pastel-tokens.ts`, which is the Next viewport
`themeColor` and a different concern.

## Surface-Lab Verification

The canonical verification surface for this styling system is `/surface-lab`.
Use it to check:

- accent options
- shell variant
- panel tone
- prompt tone
- density and panel scale
- real panel-family previews

Do not treat `/surface-lab` as a motion contract; it is the shell/tokens
authority.

## Import Order

`apps/web/app/globals.css` is exactly:

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
/* Preflight omitted — Mantine provides base styles via postcss-preset-mantine */
@import "tailwindcss/utilities.css" layer(utilities);

@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/entity-highlights.css";
@import "./styles/editor.css";
@import "./styles/vendor-overrides.css";
@import "./styles/graph-ui.css";
@import "./styles/chrome-surface.css";
@import "./styles/wiki-content.css";
@import "./styles/wiki-module-content.css";
@import "./styles/viewport-toc-rail.css";

@custom-variant dark (&:where(.dark, .dark *));
```

Layer order is declared up front (`theme, base, components, utilities`), and
Tailwind's preflight (`tailwindcss/preflight.css`) is intentionally omitted
because Mantine ships its own reset via `postcss-preset-mantine`. Tokens load
before any component-level CSS, so every downstream file can safely read
`--app-density`, `--graph-panel-*`, etc.

`apps/web/app/layout.tsx` imports `@mantine/core/styles.css` before
`./globals.css`, so Mantine's own preflight lands first and our overrides win.

### Cascade Layers — Tailwind vs. Mantine

`@layer utilities` (Tailwind 4) is a layered rule. Mantine's `@mantine/core/styles.css`
ships unlayered. Per CSS cascade rules, **any unlayered rule beats any layered
rule at equal specificity**. Practical consequence:

- Tailwind utility on the wrapper element — works.
- Tailwind utility hoping to override Mantine's internal CSS at the
  same specificity — loses.

When you author a Mantine component you therefore reach for `styles`,
`classNames`, or `vars` to drive Mantine internals; Tailwind classes go on
the surrounding wrapper. The `cssVariablesResolver` in
`apps/web/app/providers.tsx` exists precisely to retarget
`--mantine-color-body` at our `--background` token, because Mantine's own
`body { background: var(--mantine-color-body) }` is unlayered and would beat
our layered `@layer base { body { ... } }` in `styles/base.css`.

## Tailwind 4 Migration Audit (v3 → v4)

When you copy patterns from older code or external snippets, the canonical
Tailwind 4 form is:

| v3 syntax | v4 replacement |
|-----------|----------------|
| `@tailwind base/components/utilities;` | `@import "tailwindcss";` (or split per-layer as above) |
| `bg-opacity-50`, `text-opacity-*`, `placeholder-opacity-*` | Slash syntax: `bg-black/50`, `text-white/70` |
| `flex-shrink-0`, `flex-grow-1` | `shrink-0`, `grow` |
| `outline-none` | `outline-hidden` (still invisible, preserves a11y outline ring) |
| `ring` (3px default) | `ring` is now 1px; use `ring-3` for the v3 look or set `--default-ring-width: 3px` in `@theme` |
| Default border = `gray-200` | Default border = `currentColor`; set explicit color or `--default-border-color` |
| `theme(spacing.4)` | `var(--spacing-4)` or `--spacing(4)` |
| `bg-[--brand]` | `bg-(--brand)` (parens, not square brackets, for arbitrary CSS vars) |
| `space-y-4`, `divide-y` | Selector model changed; prefer `gap-4` with flex/grid |
| `first:*:pt-0` (variant on parent) | Variants stack left-to-right: `*:first:pt-0` |
| `hover:` always applies | `hover:` is now wrapped in `@media (hover: hover)`; touch devices skip. To restore: `@custom-variant hover (&:hover);` |
| `tailwind.config.js` with theme keys | `@theme` block in `tokens.css` (already done here) |

The project ships a single `@import "tailwindcss/theme.css"` plus a separate
`@import "tailwindcss/utilities.css"` (preflight intentionally omitted), so
do not introduce a fresh `@import "tailwindcss"` line in this codebase.

## Dark Mode Strategy

- Mechanism: `.dark` class on `<html>`. No `data-theme`, no `prefers-color-scheme` media queries.
- `ColorSchemeScript` (Mantine) runs before paint — prevents FOUC.
- `DarkClassSync` (sibling of `MantineProvider`) mirrors Mantine's `data-mantine-color-scheme` into the `.dark` class.
- All downstream `var()` references auto-swap; no per-component dark overrides needed.

## Specificity Reference

| Selector | Specificity | Used For |
|----------|------------|----------|
| `:root` | `0,1,0` | Semantic light tokens; also Cosmograph runtime defaults (injected by JS) |
| `html:root` | `0,1,1` | Our Cosmograph overrides (beats runtime) |
| `.dark` | `0,1,0` | Dark-mode token overrides |
| `html.dark` | `0,1,1` | Cosmograph dark divergences |
| `[data-entity-type="..."]` | `0,1,0` | Entity accent rewiring |

## Decision Tree — What Goes Where

| "I need to..." | Put it in... |
|----------------|--------------|
| Add a brand or pastel color | `tokens.css` `@theme` + `lib/pastel-tokens.ts` if bridging to Mantine |
| Add a semantic token (surface, border, panel-*) | `tokens.css` `:root` + `.dark` |
| Add a Cosmograph widget color | `tokens.css` `html:root` (+ `html.dark` if it needs a hard-coded dark value) |
| Add a new panel style object | `features/graph/components/panels/PanelShell/panel-styles.ts` + export from `index.ts` |
| Add a CSS-only component rule (animation, icon sizing) | `graph-ui.css` |
| Add a reset/global rule | `base.css` |
| Add a WebGL hex constant | `apps/web/features/graph/lib/brand-colors.ts` (mirror the value in `tokens.css`) |
| Bridge a token to Mantine's theme | `lib/mantine-theme.ts` |
| Map an entity type to a graph color | `lib/pastel-tokens.ts` + matching `[data-entity-type]` rule in `tokens.css` |

**Never** add tokens directly to `apps/web/app/globals.css` — it's pure cascade-layer ordering plus imports plus the dark `@custom-variant` declaration.

## Decision Tree — Tailwind vs. Mantine `styles`/`classNames`/`vars`

| Surface | Use |
|---------|-----|
| Wrapper layout, spacing, position | `className` with Tailwind utilities |
| Mantine internal sub-element CSS | `styles` prop (object keyed by sub-element) |
| Mantine internal class names | `classNames` prop |
| Plumb a runtime CSS var into Mantine internals | `vars` prop (Mantine 8 canonical) — see `references/mantine-patterns.md` |
| Global Mantine component defaults | `components` in `lib/mantine-theme.ts` |
| Override `--mantine-color-body` and other body-level Mantine vars | `cssVariablesResolver` on `MantineProvider` (already wired in `app/providers.tsx`) |
