# CSS Token Architecture

CSS is split across three purpose-built files in `app/styles/`. `app/globals.css` is the entry point — it imports the three files in order and contains no rules of its own.

## File Layout

```
app/
├── globals.css                  ← imports only; not a source of truth
├── layout.tsx                   ← mounts MantineProvider, ColorSchemeScript
└── styles/
    ├── tokens.css               ← all CSS custom properties
    ├── base.css                 ← reset, density, scrollbar, view transitions
    └── graph-ui.css             ← component CSS (icon-btns, Mantine overrides,
                                    Cosmograph widget fixes, keyframes)

lib/
├── mantine-theme.ts             ← createTheme() bridge
├── theme/
│   └── pastel-tokens.ts         ← CSS var ↔ Mantine tuple bridge, entity maps
└── graph/
    ├── modes.ts                 ← Ask/Explore/Learn/Write mode registry
    └── brand-colors.ts          ← WebGL hex constants (mirror of tokens.css)
```

## Layer 1 — `tokens.css` (Source of Truth for Tokens)

Four scopes inside this file:

### `@theme` block (Tailwind v4 color generation)

Defines `--color-*` and `--font-*` that Tailwind v4 reads at build time. These become available as `text-soft-blue`, `bg-soft-blue`, etc., AND as CSS custom properties consumers can reference with `var(--color-soft-blue)`.

- **Core brand pastels (9)**: `--color-soft-blue`, `--color-muted-indigo`, `--color-golden-yellow`, `--color-fresh-green`, `--color-warm-coral`, `--color-soft-pink`, `--color-soft-lavender`, `--color-paper`, `--color-teal`
- **Extended pastels (12)** for DotToc rainbow cycle: `--color-seafoam`, `--color-amber`, `--color-sky`, `--color-rose`, `--color-mint`, `--color-orchid`, `--color-maize`, `--color-powder`, `--color-peach`, `--color-sage`, `--color-plum`, `--color-pear`
- **Feedback**: `--color-feedback-warning`, `--color-feedback-danger`
- **Fonts**: `--font-sans`, `--font-mono`

### `:root` block (semantic light tokens)

Everything downstream uses these. Grouped into families:

- **Foundations** — `--background`, `--foreground`, `--surface`, `--surface-alt`, `--text-primary/secondary/tertiary`, `--border-default/subtle`, `--shadow-sm/md/lg`, `--brand-accent`, `--brand-accent-alt`, `--interactive-hover`, `--interactive-active`
- **Graph canvas + panels** — `--graph-canvas-filter`, `--graph-bg`, `--graph-panel-bg`, `--graph-panel-border`, `--graph-panel-text`, `--graph-panel-text-muted`, `--graph-panel-text-dim`, `--graph-panel-input-bg`, `--graph-panel-hover`, `--graph-panel-active`, `--graph-panel-shadow`, `--graph-panel-scale`, `--graph-panel-reading-scale`
- **Wiki graph** — `--wiki-graph-node-{diso,chem,gene,anat,phys,proc,section,paper,default,module}`, `--wiki-graph-link`, `--wiki-graph-label`
- **Entity accent** — `--entity-accent`, `--entity-highlight-radius` (rewired by `[data-entity-type]` selectors)
- **Graph overlays (chrome)** — `--graph-prompt-*`, `--graph-wordmark-*`, `--graph-stats-*`, `--graph-label-*`, `--graph-greyout-opacity`, `--graph-overlay-scrim`, `--graph-overlay-scrim-strong`
- **Filter/timeline** — `--filter-bar-base`, `--filter-bar-active`, `--filter-bar-marker`
- **Mode accent spectrum** — `--mode-accent`, `--mode-accent-subtle`, `--mode-accent-hover`, `--mode-accent-border`, `--module-accent-default` (set by `ModeColorSync`, derived via `color-mix()`)
- **Icon sizing** — `--icon-size`, `--icon-stroke-width`, `--panel-icon-size`, `--panel-icon-stroke-width`
- **Graph control (matte shell)** — `--graph-control-icon-color`, `--graph-control-active-icon-color`, `--graph-control-idle-bg`, `--graph-control-idle-border`, `--graph-control-hover-bg`, `--graph-control-pressed-bg`, `--graph-control-active-bg`
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
- `extendedPastelVarNameByKey` — 12 keys for DotToc palette
- `dotTocPastelColorSequence` — 20-color cycle
- `semanticColorVarNameByKey` — 9 entity-type → wiki-graph color mappings
- `entityTypeCssColorByType` — runtime hex per entity type (used by entity profile pill tints)

When adding a new brand color: add to `@theme` in `tokens.css`, then add to `brandPastelVarNameByKey` + tuple if it's a Mantine primary, or to `extendedPastelVarNameByKey` if it's for the DotToc cycle.

## Layer 5 — `lib/graph/brand-colors.ts` (WebGL Hex Mirror)

WebGL/Cosmograph React props cannot read CSS vars. This file centralizes the hex literals:

```ts
export const BRAND = {
  light: { bg: "#f8f9fa", ring: "#747caa", label: "#1a1b1e", greyout: 0.25 },
  dark:  { bg: "#111113", ring: "#a8c5e9", label: "#e4e4e9", greyout: 0.15 },
} as const;

export const DARK_ON_COLOR = "#1a1b1e";
export const NOISE_COLOR = "#555555";
export const DEFAULT_POINT_COLOR = "#a8c5e9";
```

Both `tokens.css` and `brand-colors.ts` carry breadcrumb comments referencing each other.

## Import Order

`app/globals.css`:

```css
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/graph-ui.css";
```

Tokens before base (base.css reads `--app-density`, etc.) and before component rules (graph-ui.css reads `--graph-panel-*`).

`app/layout.tsx` imports `@mantine/core/styles.css` before `./globals.css`, so Mantine's own preflight lands first and our overrides win.

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
| Add a WebGL hex constant | `lib/graph/brand-colors.ts` (mirror the value in `tokens.css`) |
| Bridge a token to Mantine's theme | `lib/mantine-theme.ts` |
| Map an entity type to a graph color | `lib/pastel-tokens.ts` + matching `[data-entity-type]` rule in `tokens.css` |

**Never** add tokens directly to `app/globals.css` — it's pure import ordering.
