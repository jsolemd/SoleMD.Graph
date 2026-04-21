---
name: aesthetic
description: |
  SoleMD.Web design system for Mantine 8, Tailwind CSS 4, brand colors, dark mode,
  CSS tokens, and UI styling. Use this skill whenever the user is asking for visual,
  layout, spacing, typography, theme, animation, or component styling work.

  Triggers: ui, mantine, tailwind, css, color, brand, aesthetic, style, theme,
  font, dark mode, palette, typography, spacing, globals.css, CSS variables,
  card, button, panel, layout, responsive, hover, cosmograph theme,
  animation, framer-motion, appearance.

  Do NOT use for: Cosmograph canvas/WebGL rendering or data props (use /cosmograph),
  graph data fetching or store logic (use /cosmograph),
  Neo4j code graph (use /graph).
  NOTE: For Cosmograph CSS theming integration, this skill IS the authority — /cosmograph
  defers here for all CSS variable theming questions.
version: 3.3.0
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - mcp__doc-search__query-docs
  - mcp__doc-search__resolve-library-id
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
metadata:
  short-description: SoleMD.Web visual identity, Mantine 8 + Tailwind 4 styling, Cosmograph CSS integration
---

# SoleMD.Web — Design System & UI Styling

## Quick Reference

| I want to... | Do this |
|---|---|
| **Use a brand color** | CSS: `var(--color-soft-blue)`. Tailwind: `text-[var(--color-soft-blue)]`. See [Colors](references/colors.md) |
| **Style a card** | Prefer `panelCardStyle` / `panelAccentCardStyle` from `PanelShell`. Matte, opaque, and usually borderless — never glass morphism |
| **Handle dark mode** | Use CSS vars (auto-swap via `.dark`). Never use `isDark` ternaries in components |
| **Add a new CSS token** | Add to `:root` AND `.dark` in `app/styles/tokens.css`. See [CSS Architecture](references/css-architecture.md) |
| **Add a Mantine component** | Import from `@mantine/core`. `className` for Tailwind layout, `styles` prop only for Mantine internals. See [Mantine Patterns](references/mantine-patterns.md) |
| **Create a floating panel** | Use `PanelShell` from `features/graph/components/panels/PanelShell/`. Pull style objects from `panel-styles.ts` — never hand-roll `--graph-panel-*` triples |
| **Style a panel component** | Import `panelSurfaceStyle`, `panelTextStyle`, `panelCardStyle`, etc. from `PanelShell`. See [Panel Patterns](references/panel-patterns.md) |
| **Validate shell styling** | Use `/surface-lab` as the canonical token/panel/prompt verification surface |
| **Wrap Cosmograph widgets** | Mantine Stack/Group for layout, CSS vars for theming, never inline styles on containers. See [Panel Patterns](references/panel-patterns.md) |
| **Understand Cosmograph data/props** | See /cosmograph skill for CosmographConfig, strategies, DuckDB bundle, widget refs |
| **Add hover/motion** | Use `@/lib/motion` presets (`crisp`, `smooth`, `bouncy`, `panelReveal`, etc.). Float/fade/lift only |
| **Look up Mantine API** | doc-search `/mantinedev/mantine` (8,173 chunks, v8.3.16) → context7 `@mantinedev/mantine` → local `docs/mantine-llms.txt` |
| **Check the full palette** | [references/colors.md](references/colors.md) — 40+ colors with light/dark pairs |
| **Fix dark mode inconsistency** | Check `:root` AND `.dark` in `app/styles/tokens.css`. Check `DarkClassSync` in `app/providers.tsx` |
| **Theme Cosmograph widgets** | Override the base `--cosmograph-ui-*` vars in `tokens.css` `html:root` block. See [Cosmograph Integration](references/cosmograph-integration.md) |
| **Style an entity profile** | Use `panelAccentCardEntityStyle` + `data-entity-type={…}`. The `[data-entity-type]` attribute rewires `--entity-accent` per type |
| **Scale panel sizing** | `panelScaledPx(10)` composes `--app-density` × `--graph-panel-scale`. Never hardcode px in panels |
| **Install a Mantine extension** | See [Mantine Patterns → Extensions](references/mantine-patterns.md#extensions) |
| **Preview Mantine themes** | [MantineHub](https://mantinehub.com/) — interactive theme builder, component preview playground |

## Brand Personality

**Elegant, Precise, Calm.** Refined medical authority with soft confidence.
Think Apple Health meets the New England Journal of Medicine — premium quality that never shouts.

## Canonical Truth

When this skill needs to choose between older docs and the live implementation,
the canonical truth is:

- the current landing shell under
  `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/`
- the current token and panel system under `apps/web/app/styles/` and
  `apps/web/features/graph/components/panels/PanelShell/`
- `/surface-lab` as the self-check surface for panel tones, prompt tones,
  accents, density, scale, and shell families

`/surface-lab` is the style/tokens authority. It is not the field runtime or
motion authority.

---

## Architecture — How Styling Works

```
app/styles/ (Source of Truth)          Mantine Theme (Bridge)        Components
┌────────────────────────────────┐    ┌──────────────────────────┐   ┌─────────────────────┐
│ tokens.css                     │    │ lib/mantine-theme.ts     │   │ Tailwind classes     │
│  @theme { brand pastels... }   │───>│   shadows → CSS vars     │   │ + className prop     │
│  :root  { semantic + graph }   │    │   radius → rem values    │   │                     │
│  .dark  { overrides }          │    │   colors → brand tuple   │   │ Mantine components   │
│  html:root { cosmograph }      │    │   component defaults     │   │ + styles prop        │
│                                │    └──────────────────────────┘   │ (internals only)    │
│ graph-ui.css                   │                                   │                     │
│  .graph-icon-btn, animations,  │    lib/pastel-tokens.ts           │ PanelShell/          │
│  cosmograph widget fixes       │    ┌──────────────────────────┐   │  panel-styles.ts     │
│                                │    │ CSS var ↔ Mantine tuple  │   │ (panel surfaces,     │
│ base.css                       │    │ bridge (brand + neutral) │   │  text, cards, pills) │
│  reset, --app-density, vt      │    └──────────────────────────┘   └─────────────────────┘
└────────────────────────────────┘
       │
       ▼
  app/globals.css  (pure import ordering — NOT token source)
  app/layout.tsx   (<html> props, ColorSchemeScript, Providers)
```

Five layers work together:

1. **`app/styles/tokens.css`** — design tokens (@theme for Tailwind v4 color generation) + semantic tokens (`:root` light, `.dark` overrides) + Cosmograph overrides (`html:root`, `html.dark`) + entity-type attribute selectors. This is the one place tokens get defined.
2. **`app/styles/graph-ui.css`** — component-level CSS: `.graph-icon-btn`/`.panel-icon-btn` matte control shells, Mantine overrides (`.table-pagination`, `.detail-accordion`), Cosmograph widget fixes, animations (`pill-activate`, `constellation-drift-0/1/2`).
3. **`app/styles/base.css`** — reset, `--app-density` scaling, scrollbar utilities, view-transition animations.
4. **`lib/mantine-theme.ts` + `lib/pastel-tokens.ts`** — bridge tokens into Mantine's theme object (shadows, radius, 10-shade brand/neutral tuples, component defaults).
5. **`lib/graph/brand-colors.ts`** — hex constants WebGL/Cosmograph needs (can't read CSS vars). Mirror-synced with `tokens.css`.

`app/globals.css` is the entry file: it imports `tokens.css`, `base.css`, `graph-ui.css` in order — nothing else lives there. Don't put new tokens or rules in `globals.css`.

### Key Files

| File | Role |
|------|------|
| `app/styles/tokens.css` | All CSS custom properties — Tailwind v4 `@theme` block + semantic `:root`/`.dark`/`html:root`/`html.dark` + entity-type attribute selectors. Source of truth for tokens. |
| `app/styles/graph-ui.css` | Component-level styles: control shells, Mantine overrides, Cosmograph widget tweaks, keyframe animations. |
| `app/styles/base.css` | Reset, density scaling, scrollbar utilities, view transitions. |
| `app/globals.css` | Import ordering only — pulls the three files above. |
| `lib/mantine-theme.ts` | Mantine `createTheme()` — brand colors, shadows, radius, component defaults. |
| `lib/pastel-tokens.ts` | CSS-var ↔ Mantine 10-shade tuple bridge; entity-type → semantic color map; DotToc palette cycle. |
| `lib/graph/brand-colors.ts` | WebGL hex constants (`BRAND`, `DARK_ON_COLOR`, etc.) — mirror of `tokens.css`. |
| `app/providers.tsx` | `MantineProvider` + `DarkClassSync` for app-wide color-scheme synchronization. |
| `app/layout.tsx` | `mantineHtmlProps` on `<html>`, `ColorSchemeScript` before paint. |
| `lib/graph/modes.ts` | Mode registry — `color` + `colorVar` per mode (Ask/Explore/Learn/Write). |
| `features/graph/components/panels/PanelShell/` | Canonical panel directory — `PanelShell.tsx`, `panel-primitives.tsx`, `panel-header-actions.tsx`, `panel-styles.ts`. |

For detailed architecture, see [references/css-architecture.md](references/css-architecture.md).

### Token Families (cheat sheet)

All defined in `tokens.css`. Use the prefix to find the right block.

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `--color-*` | Brand/extended pastels (9 core + 12 extended for DotToc) | `--color-soft-blue`, `--color-seafoam` |
| `--surface`, `--background`, `--foreground`, `--text-*`, `--border-*`, `--shadow-*` | Semantic foundations | `--surface-alt`, `--text-tertiary`, `--shadow-md` |
| `--brand-accent*`, `--interactive-*` | App-wide accent + interaction states | `--interactive-hover` |
| `--graph-panel-*` | Docked panel surface + scaling | `--graph-panel-bg`, `--graph-panel-scale`, `--graph-panel-reading-scale` |
| `--graph-prompt-*` | Floating prompt overlay (separate elevation tier) | `--graph-prompt-bg`, `--graph-prompt-shadow` |
| `--graph-wordmark-*`, `--graph-stats-*`, `--graph-label-*` | Canvas chrome | `--graph-label-shadow` |
| `--graph-overlay-scrim*`, `--graph-greyout-opacity` | Full-viewport scrims | `--graph-overlay-scrim-strong` |
| `--wiki-graph-node-*`, `--wiki-graph-link`, `--wiki-graph-label` | Wiki graph colors (10 node types) | `--wiki-graph-node-diso` |
| `--entity-accent`, `--entity-highlight-radius` | Per-entity-type accent (rewired via `[data-entity-type]`) | — |
| `--mode-accent*` | Active mode spectrum (set by `ModeColorSync`) | `--mode-accent-subtle`, `--mode-accent-hover` |
| `--filter-bar-*` | Timeline/histogram bars (mode-aware) | `--filter-bar-active` |
| `--graph-control-*` | Matte control shell base state | `--graph-control-idle-bg` |
| `--icon-size`, `--icon-stroke-width`, `--panel-icon-*` | Icon sizing (density-scaled) | — |
| `--feedback-warning-*`, `--feedback-danger-*` | State chrome | `--feedback-danger-bg` |
| `--app-density` | Global scale multiplier (default 0.8) | — |
| `--cosmograph-ui-*` | Cosmograph widget overrides (in `html:root`) | `--cosmograph-ui-background` |

### Scaling Axis

Two composable multipliers drive every panel-scoped dimension:

- `--app-density` (default `0.8`) — global scale set on `<html>` in `base.css`. Multiplies spacing, shadow offsets, icon sizes.
- `--graph-panel-scale` (default `1`, user-adjustable `0.8–1.4` via `PanelScaleControl`) — per-panel reading scale.
- `--graph-panel-reading-scale` = `calc(var(--app-density) * var(--graph-panel-scale))` — what panel-styles.ts consumes.

All panel sizing goes through `panelScaledPx(basePx)` (in `panel-styles.ts`), which returns `calc(${base}px * var(--graph-panel-reading-scale, ...))`. Never hardcode px in panel components.

---

## Design Principles

1. **White space is a feature, not waste.** Use spacious, viewport-driven rhythm for hero and landing surfaces. Do not collapse long-form sections into tight app spacing.
2. **Color communicates meaning.** Use accent tokens, semantic colors, and mode accents to localize emphasis. Do not wash the entire UI in one chapter tint.
3. **Motion earns attention.** Soft, scroll-triggered. Float/fade/lift only. Never bounce/shake/flash.
4. **Depth through layering.** Matte, opaque surfaces. In dark mode, rim-light plus soft halo depth are preferred over visible strokes.
5. **Accessibility non-negotiable.** WCAG AA (4.5:1 text, 3:1 large). Keyboard nav. `prefers-reduced-motion`.
6. **Mostly borderless chrome.** Visible borders are reserved for true semantic/error states. Regular cards and prompt shells should read through tone, shadow, and rim-light before strokes.

---

## Color System

### Core Brand Colors

| Name | Light | CSS Variable | Semantic |
|------|-------|-------------|----------|
| Soft Blue | `#a8c5e9` | `--color-soft-blue` | Home / brand primary |
| Muted Indigo | `#747caa` | `--color-muted-indigo` | Foreground accent |
| Golden Yellow | `#e5c799` | `--color-golden-yellow` | Innovation |
| Fresh Green | `#aedc93` | `--color-fresh-green` | Education |
| Warm Coral | `#ffada4` | `--color-warm-coral` | Research / action |
| Soft Pink | `#e0aed8` | `--color-soft-pink` | Contact |
| Soft Lavender | `#d8bee9` | `--color-soft-lavender` | About |

In dark mode, these pastels intentionally keep their chroma against an AMOLED
black canvas. Only the neutral ladder flips; the brand voice stays alive.

Full extended palette and token families: [references/colors.md](references/colors.md)

### System Surfaces

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--background` | `#faf9f7` | `#000000` | Page background |
| `--surface` | `#fffffe` | `#0F1012` | Card/panel surfaces |
| `--surface-alt` | `#f5f4f1` | `#1A1B1E` | Alternate surfaces (inputs, toolbars) |
| `--surface-raised` | `#ffffff` | `#2A2C30` | Popovers, prompts, lifted surfaces |
| `--text-primary` | `#1a1817` | `#E4E6EB` | Primary text |
| `--text-secondary` | `#5e5c58` | `#AEB1B7` | Secondary text |
| `--text-tertiary` | `#9e9c97` | `#70747A` | Tertiary text |
| `--border-default` | `#eae8e4` | `#26272B` | Semantic/error borders only |
| `--border-subtle` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` | Subtle dividers |

### Shadows

| Level | CSS Variable | Light | Dark |
|-------|-------------|-------|------|
| Small | `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.3)` |
| Medium | `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.4)` |
| Large | `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.08)` | `0 8px 24px rgba(0,0,0,0.5)` |

### Brand Accents

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--brand-accent` | `#747caa` (muted indigo) | `#a8c5e9` (soft blue) | Primary accent / highlights |
| `--brand-accent-alt` | `#a8c5e9` (soft blue) | `#89a3bf` | Secondary accent |
| `--interactive-hover` | `rgba(116,124,170,0.06)` | `rgba(168,197,233,0.08)` | Hover backgrounds |
| `--interactive-active` | `rgba(116,124,170,0.10)` | `rgba(168,197,233,0.12)` | Active state backgrounds |

### Dark Mode Rule

Dark mode is a pure-black AMOLED canvas with an inky panel ladder. The product
keeps brand and semantic pastels alive on black instead of pre-desaturating
them into charcoal. Do not "mute everything" in dark mode.

---

## Typography

- **Font**: Inter (system fallback stack via `--font-sans`) for all text, JetBrains Mono for code
- **Weight**: Regular (400) body → Medium (500) headings → Semibold (600) emphasis
- **Sizing**: Fluid scale, mobile-first responsive

## Spacing & Radius

- **Border radius**: Mantine default `lg` (1rem). Buttons use `xl` (1.5rem).
- **Mantine radius scale**: `xs: 0.25rem, sm: 0.5rem, md: 0.75rem, lg: 1rem, xl: 1.5rem`
- **Landing rhythm**: long viewport-driven spacing for chaptered surfaces; follow the live landing before introducing a tighter rhythm
- **Panel spacing**: use `panelScaledPx()` / density helpers instead of hand-tuned raw px

---

## Mantine 8 Integration

### Current Configuration (`lib/mantine-theme.ts`)

```typescript
const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 3, dark: 3 },
  colors: { brand: [/* 10-shade soft-blue tuple */], gray: neutral },
  fontFamily: 'var(--font-sans)',
  headings: { fontFamily: 'var(--font-sans)', fontWeight: '500' },
  radius: { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
  defaultRadius: 'lg',
  shadows: {
    xs: 'var(--shadow-sm)', sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)', lg: 'var(--shadow-lg)', xl: 'var(--shadow-lg)',
  },
  components: {
    Button:    { defaultProps: { radius: 'xl', size: 'md' }, styles: { root: { fontWeight: 400 } } },
    Card:      { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'xl' } },
    TextInput: { defaultProps: { radius: 'lg', size: 'md' } },
    Select:    { defaultProps: { radius: 'lg', size: 'md' } },
    Textarea:  { defaultProps: { radius: 'lg', size: 'md' } },
    ActionIcon: { defaultProps: { radius: 'lg', size: 'md' } },
    Paper:     { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'md' } },
    Badge:     { defaultProps: { radius: 'xl' } },
  },
  white: '#ffffff',
  black: '#1a1b1e',
})
```

### Provider Setup

```tsx
// app/layout.tsx
<html lang="en" {...mantineHtmlProps}>
  <head>
    <ColorSchemeScript defaultColorScheme="auto" />
  </head>
  <body>
    <Providers>{children}</Providers>
  </body>
</html>

// app/providers.tsx
<MantineProvider theme={theme} defaultColorScheme="auto">
  <DarkClassSync />  {/* Keeps .dark class on <html> in sync */}
  {children}
</MantineProvider>
```

### Key Mantine 8 APIs

**`cssVariablesResolver`** — Inject custom CSS vars per color scheme:
```typescript
const resolver: CSSVariablesResolver = (theme) => ({
  variables: { '--mantine-hero-height': `${theme.other.heroHeight}px` },
  light: { '--mantine-color-deep-orange': theme.other.deepOrangeLight },
  dark: { '--mantine-color-deep-orange': theme.other.deepOrangeDark },
});
// <MantineProvider theme={theme} cssVariablesResolver={resolver}>
```
We don't currently use this — our design tokens live in `app/styles/tokens.css`
and are imported through `app/globals.css`. But it's available if
Mantine-scoped light/dark vars are needed.

**`virtualColor`** — Map one color name to different palettes per scheme:
```typescript
import { virtualColor } from '@mantine/core';
const theme = createTheme({
  colors: {
    primary: virtualColor({ name: 'primary', dark: 'pink', light: 'cyan' }),
  },
});
```

**`cssVariablesSelector`** — Change where Mantine injects CSS vars (default `:root` and `:host`). Useful for shadow DOM or scoped containers.

### Styling Rules

- `className` with Tailwind on Mantine components — always fine
- `styles` prop — only for overriding Mantine internal sub-elements
- `classNames` prop — for targeting Mantine slots by class name
- `useMantineColorScheme()` + `useComputedColorScheme()` for theme toggle — never `next-themes`
- Component defaults live in `lib/mantine-theme.ts` — check before adding inline styles
- `defaultColorScheme="auto"` in provider — respects system preference

### Mantine API Lookup (priority order)

1. **doc-search MCP** — `query-docs` with `/mantinedev/mantine` (8,173 chunks, v8.3.16). Best for component APIs, hooks, patterns.
2. **context7 MCP** — `resolve-library-id` + `query-docs` for `@mantinedev/mantine`. Fallback for latest API surface.
3. **Local reference** — `docs/mantine-llms.txt` (2.2MB full Mantine docs in markdown)
4. **MantineHub** — [mantinehub.com](https://mantinehub.com/) — interactive theme builder playground. Exports CSS variables (not JS `createTheme()` objects). Good for visual component preview across variants/sizes. Inspired by shadcn themes. Also has copy-paste Blocks (Hero, Features, FAQ, Pricing, Newsletter) and Dashboard Templates.

For detailed patterns, component defaults, and extension packages: [references/mantine-patterns.md](references/mantine-patterns.md)

---

## Dark Mode Implementation

1. `ColorSchemeScript` in `<head>` (prevents flash)
2. `MantineProvider` with `defaultColorScheme="auto"`
3. `DarkClassSync` component keeps `.dark` class on `<html>` in sync with Mantine's `data-mantine-color-scheme`
4. All tokens defined in both `:root` and `.dark` in `app/styles/tokens.css`
5. Components use CSS vars — they auto-swap. No `isDark` ternaries.
6. Cosmograph widgets theme via `html:root` + `html.dark` blocks in `tokens.css` (higher specificity than runtime injection)

### Adding dark mode for new tokens

```css
/* app/styles/tokens.css */
:root {
  --my-new-token: #value-light;
}
.dark {
  --my-new-token: #value-dark;
}
```

Then use `var(--my-new-token)` in components — it swaps automatically.

---

## Mode System & Styling

The app has 4 modes: **Ask**, **Explore**, **Learn**, **Write**. Each mode has a color and controls which UI chrome is visible. The mode system is data-driven via `lib/graph/modes.ts` — **NOT CSS-driven**.

### Mode Color Architecture

Each mode defines both a `color` (hex) and `colorVar` (CSS variable name) in `lib/graph/modes.ts`:

| Mode | `color` | `colorVar` | CSS Variable |
|------|---------|------------|-------------|
| Ask | `#a8c5e9` | `--color-soft-blue` | `var(--color-soft-blue)` |
| Explore | `#fbb44e` | `--color-golden-yellow` | `var(--color-golden-yellow)` |
| Learn | `#aedc93` | `--color-fresh-green` | `var(--color-fresh-green)` |
| Write | `#ffada4` | `--color-warm-coral` | `var(--color-warm-coral)` |

**`ModeColorSync`** (sibling of `DarkClassSync`) watches the active mode and sets `--mode-accent: var(<colorVar>)` on `<html>`. This gives every component access to the active mode's color via CSS — and it auto-swaps light/dark because the underlying `--color-*` vars have `.dark` overrides in `app/styles/tokens.css`.

### Mode Accent Spectrum (`tokens.css`)

`color-mix()` derives an opacity spectrum from `--mode-accent` automatically:

| Token | Opacity | Purpose |
|-------|---------|---------|
| `--mode-accent` | 100% | Full accent color |
| `--mode-accent-subtle` | dynamic `color-mix()` | Resting fills and active chips |
| `--mode-accent-hover` | dynamic `color-mix()` | Hover states |

**To swap mode colors**: Change `color` + `colorVar` in one place in `modes.ts`. Everything propagates — CSS tokens, Mantine controls, timeline bars, pagination, data table row numbers.

### Mode Color Usage Patterns

**CSS consumers** (components and imported CSS layers) — use
`var(--mode-accent)`:
```css
/* graph-ui.css — pagination active page color */
.table-pagination [data-active] { color: var(--mode-accent) !important; }
```
```tsx
// DataTable row numbers, TimelineBar bars, PointsConfig Switch/Slider
color: "var(--mode-accent)"
```

**PromptBox toggles** — uses `config.color` hex directly (needs all 4 mode colors simultaneously):
```tsx
backgroundColor: isActive ? `${config.color}15` : "transparent"
borderColor: isActive ? config.color : "transparent"
```

**PromptBox submit button** — always-dark text on pastel bg:
```tsx
backgroundColor: activeMode.color
color: DARK_ON_COLOR  // from brand-colors.ts, always "#1a1b1e"
```

**`DARK_ON_COLOR`** ensures dark text on pastel mode-color backgrounds in both light and dark mode. Using `var(--foreground)` would produce light text on light pastel in dark mode = invisible.

### Key Files

| File | Role |
|------|------|
| `lib/graph/modes.ts` | Source of truth — `color` + `colorVar` per mode |
| `features/graph/components/shell/ModeColorSync.tsx` | Sets `--mode-accent` on `<html>` when mode changes |
| `app/styles/tokens.css` | Defines `--mode-accent-*` spectrum via `color-mix()` |

---

## CSS ↔ WebGL Boundary

WebGL (Cosmograph canvas) cannot read CSS custom properties. This creates two parallel color systems:

| System | Values | Source | Used By |
|--------|--------|--------|---------|
| **CSS tokens** | `var(--surface)`, `var(--brand-accent)` | `app/styles/tokens.css` | Mantine, Tailwind, Cosmograph CSS widgets |
| **WebGL hex** | `"#faf9f7"`, `"#747caa"` | `apps/web/features/graph/lib/brand-colors.ts` | Cosmograph React props (`backgroundColor`, `hoveredPointRingColor`, etc.) |

**Both files have sync breadcrumbs**: `tokens.css` says `/* WebGL mirror: lib/graph/brand-colors.ts — keep in sync */` and `apps/web/features/graph/lib/brand-colors.ts` says `/** Keep in sync with tokens.css. */`.

When changing brand colors: update `tokens.css` `:root` / `.dark` → update `brand-colors.ts` → update `lib/mantine-theme.ts` brand tuple if the primary blue shade changed.

---

## Panel Styling — PanelShell is Canonical

Every floating/docked panel (Info, Prompt, Wiki, Explore data table, etc.) composes from `features/graph/components/panels/PanelShell/`. Never hand-roll panel surfaces from raw tokens — import the exported style objects.

### Style objects (from `panel-styles.ts`)

| Export | What it does |
|--------|--------------|
| `panelSurfaceStyle` | Docked-panel surface: `--graph-panel-bg` + transparent border + `--graph-panel-shadow` |
| `promptSurfaceStyle` | Prompt overlay surface (separate elevation tier: `--graph-prompt-*`) |
| `panelTextStyle` / `panelTextMutedStyle` / `panelTextDimStyle` | 10/10/10px scaled body text across 3 opacity tiers |
| `panelCardStyle` + `panelCardClassName` | Neutral input-bg card (`rounded-lg px-2 py-1.5`) |
| `panelAccentCardStyle` + `panelAccentCardClassName` | Mode-accent tinted card (`rounded-xl px-3 py-3`) |
| `panelAccentCardEntityStyle` + `panelAccentCardEntityClassName` | Entity-accent tinted card (reads `--entity-accent` via `[data-entity-type]`) |
| `panelPillStyles` / `panelTypePillStyles` | 14px-tall compact pill for counts/labels |
| `panelSwitchStyles` | 24×12 track compact switch |
| `panelSelectStyles` | 22px-tall Select/input row |
| `sectionLabelStyle` / `panelTableHeaderStyle` | Uppercase section/column labels |
| `panelChromeStyle` / `panelStatValueStyle` | Panel-chrome 9px / stat-value 11px |
| `pillActiveColors` / `pillInactiveColors` / `interactivePillBase` | Raw-span interactive pill kit |
| `badgeAccentStyles` / `badgeOutlineStyles` | Mantine Badge `styles` presets |
| `iconBtnStyles` / `panelIconBtnStyles` / `graphControlBtnStyles` | Mantine ActionIcon `styles` presets |
| `nativeIconBtnFrameStyle` / `nativeIconBtnInnerStyle` | Shared frame for non-Mantine controls |
| `panelErrorStyle` | Feedback-danger surface |
| `panelScaledPx(n)` / `createPanelScaleStyle(n)` | Density-scaled px helper + panel-local scale override |

### Header actions (from `panel-header-actions.tsx`)

| Component | Contract |
|-----------|----------|
| `PanelIconAction` | 24px Mantine ActionIcon, transparent variant, icon `color: var(--graph-panel-text)` |
| `PanelScaleControl` | `±`/reset buttons; displays scale% in `tabular-nums` |
| `PanelWindowActions` | Pin/close pair, 12px icons |
| `PanelHeaderDivider` | `h-3.5 w-px` rule at `var(--graph-panel-border)` 0.75 opacity |
| `PanelHeaderActions` | Slot container grouping the above |

### Dual namespace: `--graph-panel-*` vs `--graph-prompt-*`

Intentional. Docked panels use `--graph-panel-*` (subtle shadow, input-bg cards, compact density). The prompt overlay uses `--graph-prompt-*` (distinct elevation with a two-tier shadow, placeholder tokens, divider accent). Don't collapse them — they represent different elevation tiers in the canvas.

### Entity profile pattern (Wiki)

`features/wiki/components/entity-profiles/` (Disease/Chemical/GeneReceptor/Anatomy/Network) use:

```tsx
<div
  className={panelAccentCardEntityClassName}
  data-entity-type={page.entity_type?.toLowerCase()}
  style={panelAccentCardEntityStyle}
>
```

`tokens.css` has `[data-entity-type="disease"] { --entity-accent: var(--wiki-graph-node-diso); }` (and seven more types). The card style mixes `--entity-accent` against the panel surface so each profile automatically tints correctly in both light and dark.

---

## Cosmograph ↔ Mantine Integration

Cosmograph widgets use their own CSS variable system, completely separate from
Mantine. Integration happens through **shared foundation tokens** in
`app/styles/tokens.css`. For the full reference, see
[references/cosmograph-integration.md](references/cosmograph-integration.md).

**Quick summary**: Override Cosmograph's base `--cosmograph-ui-*` vars (7 core tokens: background, text, element color, highlighted/selection, font family + size) in `tokens.css` `html:root`. These cascade to every widget. Then override widget-specific tokens (Timeline, Search, Legend, Button, Histogram, SizeLegend, Popup) only where they must diverge.

**Scope boundary**: This skill owns Cosmograph CSS variable theming. The `/cosmograph` skill owns data props, WebGL rendering, and CosmographConfig. When in doubt: if it's a `--cosmograph-*` CSS var → this skill. If it's a React prop on `<Cosmograph>` → `/cosmograph` skill.

**When to consult /cosmograph**: If you need to know which React props to pass (e.g., `pointColorStrategy`, `duckDBConnection`), widget component APIs (e.g., `CosmographHistogramRef.setSelection()`), DuckDB data flow, or event callback signatures (e.g., `onPointsFiltered`) — consult the /cosmograph skill. This skill covers the *visual appearance* of those widgets, not their data behavior.

---

## New Component Checklist

1. Check if a Mantine component exists first (use doc-search MCP `query-docs`)
2. Use CSS vars from `app/styles/tokens.css` for colors — never hardcode hex
3. Use `rounded-[1rem]` (or Mantine `radius="lg"`) for border radius
4. Use `shadow-[var(--shadow-sm)]` for default shadows
5. Add hover lift: increase shadow level + subtle translateY
6. Test both light and dark mode
7. Ensure keyboard navigability for interactive elements
8. Check contrast ratios (4.5:1 text, 3:1 large text)

---

## Anti-Patterns

| Don't | Do Instead |
|-------|-----------|
| Hardcode hex colors in components | Use CSS vars: `var(--color-soft-blue)` |
| `isDark` ternaries in JSX | CSS vars that auto-swap with `.dark` |
| `next-themes` | `useMantineColorScheme()` |
| Glass morphism on panels | Opaque backgrounds with `--graph-panel-bg` |
| Invent a second dark backdrop | Use `#000000` for field/viewport cases or tokenized `--background` / `--surface` from `tokens.css` |
| Pure white `#ffffff` as page bg | `#faf9f7` (warm off-white) |
| Bounce/shake/flash animations | Float/fade/lift only |
| Auto-playing animations | Scroll-triggered or interaction-triggered |
| Fixed spacing law everywhere | Landing uses viewport-driven rhythm; panel internals use `panelScaledPx(...)` |
| Enterprise SaaS aesthetic | Soft, premium, Apple-inspired |
| CSS modules or styled-components | Tailwind + Mantine components |
| Override every Cosmograph CSS var | Override 9 base vars, let the rest cascade |
| Inline styles for Cosmograph theme | `html:root` block in tokens.css (higher specificity) |
| Hand-roll `--graph-panel-bg`/`--graph-panel-shadow` on a new panel | Spread `panelSurfaceStyle` from `PanelShell/panel-styles.ts` |
| Re-declare `color-mix(... var(--entity-accent) ...)` per entity profile | Use `panelAccentCardEntityStyle` + `data-entity-type` attribute |
| Hardcode px font sizes inside a panel | `panelScaledPx(baseValue)` |
| Define new tokens in `globals.css` | Define in `app/styles/tokens.css` — globals.css is pure import ordering |
| `cosmographTheme` object on container | Removed — `html:root` handles all theming |
| Use `--shadow-subtle/medium/floating` | Use `--shadow-sm/md/lg` (actual token names) |
| Hardcode mode color in components | Use `var(--mode-accent)` — auto-set by ModeColorSync |
| `var(--foreground)` on mode-color bg | `DARK_ON_COLOR` from `brand-colors.ts` (pastel needs dark text) |
| Hardcode WebGL hex in components | Import from `brand-colors.ts` |
| Duplicate BRAND object per file | Single import from `lib/graph/brand-colors.ts` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dark mode not updating | Check `.dark` block in `app/styles/tokens.css` has the token. Check `DarkClassSync` in `app/providers.tsx` |
| Mantine component looks wrong | Check `lib/mantine-theme.ts` for defaults. Override with `styles` or `classNames` prop |
| Shadow not visible | Use `var(--shadow-*)` CSS vars, not raw box-shadow. Check dark variant |
| Card doesn't float | Add `shadow-[var(--shadow-sm)]` + hover state with higher shadow |
| Cosmograph panel invisible | Panels need opaque `--graph-panel-bg`, not semi-transparent with blur |
| Cosmograph widgets wrong color | Check `html:root` block in `tokens.css` overrides the base `--cosmograph-ui-*` vars |
| Cosmograph ignores our theme | Cosmograph injects `:root` at runtime. Must use `html:root` (specificity 0,1,1 > 0,1,0) |
| Color too vibrant in dark mode | Add darker variant in `.dark` block of `tokens.css` (−25% lightness, −25% saturation) |
| Panel font/icon doesn't scale with panel scale control | Using raw px instead of `panelScaledPx(n)` from `PanelShell/panel-styles.ts` |
| Entity accent color missing on wiki profile | Set `data-entity-type={entity_type.toLowerCase()}` on the card; `[data-entity-type]` selectors in `tokens.css` rewire `--entity-accent` |
| Tailwind class not working | Tailwind CSS 4 uses `@theme` block, not `tailwind.config.js` |
| Mantine radius inconsistent | Default is `lg` in theme. Use `radius` prop per-component |
| Hydration mismatch on theme | Ensure `ColorSchemeScript` is in `<head>` before `MantineProvider` |
| `npm install` fails | Use `--legacy-peer-deps` (Cosmograph declares react ^16/^17/^18) |

---

## References

| Topic | File |
|-------|------|
| Full color palette (40+ colors) | [references/colors.md](references/colors.md) |
| Mantine component patterns | [references/mantine-patterns.md](references/mantine-patterns.md) |
| CSS token architecture | [references/css-architecture.md](references/css-architecture.md) |
| Cosmograph CSS integration | [references/cosmograph-integration.md](references/cosmograph-integration.md) |
| Panel styling patterns | [references/panel-patterns.md](references/panel-patterns.md) |
| Brand & visual identity | `docs/brand.md` |
| Architecture overview | `docs/architecture.md` |
| Mantine docs (doc-search) | `/mantinedev/mantine` (8,173 chunks, v8.3.16) |
| Cosmograph docs (doc-search) | `/jsolemd/cosmograph-docs` (176 chunks) |
| MantineHub theme builder | [mantinehub.com](https://mantinehub.com/) |

---

## Impeccable Design Reference

Condensed principles from the impeccable design system. Apply these when polishing, auditing, or building UI.

### Typography (`/typeset`)
- Modular scale with consistent ratios. Vertical rhythm via line-height multiples.
- Fluid sizing with `clamp()`. Enable OpenType features (`font-feature-settings`).
- Avoid invisible defaults — every font property should be intentional.

### Color (`/colorize`)
- OKLCH color space, not HSL. Tinted neutrals (never pure gray).
- 60-30-10 rule: dominant, secondary, accent. Dark mode is desaturation + lightness shift, not color inversion.
- Strategic color adds meaning — monochrome is a valid starting point, not a problem.

### Layout (`/arrange`)
- 4pt base grid. Semantic spacing tokens (`--space-xs` through `--space-3xl`).
- Avoid card proliferation — not everything needs a container. Use whitespace as a grouping mechanism.
- Visual rhythm through intentional variation in spacing and density.

### Distillation (`/distill`)
- Strip to essence. Remove elements until the design breaks, then add the last one back.
- Great design is simple, powerful, and clean. Every element must earn its place.

### Responsiveness (`/adapt`)
- Container queries over media queries when possible. Content-driven breakpoints, not device-driven.
- Test at arbitrary widths, not just phone/tablet/desktop. Ensure touch targets are 44px minimum.

### Motion (`/animate`)
- Duration tiers: micro 100ms, standard 300ms, emphasis 500ms. Exits faster than entrances.
- Transform + opacity only for 60fps. Never bounce easing. `prefers-reduced-motion` must disable non-essential animation.
- Motion should communicate state change, not decorate.

### Delight (`/delight`)
- Optimistic UI (update before server confirms). Skeleton states over spinners.
- Micro-interactions that reward user actions. Personality through copy, not just visuals.

### Layout Stability (Zero Jerk)
**Nothing changes size or position in response to state changes.** Elements appearing,
disappearing, or changing content width causes jerky motion — this violates the calm,
precise brand. Design solutions that prevent layout shifts:
- **Fixed-width pills**: Use `minWidth`, `tabular-nums`, and fixed-format labels (e.g. `N.NN×`)
  so content changes never alter pill width.
- **Toggle-in-place, not show/hide**: Instead of conditionally rendering a clear X button
  (which shifts neighbors), use the pill itself as the clear target (click accent pill to
  deselect — same pattern as FilterBarWidget). Color change = visual affordance; no extra element.
- **Reserve space**: If a conditional element is truly needed, always reserve its space with
  `visibility: hidden` or a same-size placeholder. Never use conditional rendering that changes
  the flex layout.
- **State changes = color/opacity, not size**: When a pill goes from inactive to active, change
  its background/border color — never its width, padding, or content length.

### Quality Audit (`/audit`)
- Accessibility: WCAG AA contrast, keyboard navigation, screen reader labels, focus rings.
- Performance: no layout shifts (CLS), lazy-load below fold, 60fps animations.
- Theme: all tokens defined in both `:root` and `.dark`. No hardcoded hex in components.
- Responsive: test at 320px, 768px, 1024px, 1440px. No horizontal overflow.

### Polish (`/polish`)
- Pixel alignment on all elements. Consistent spacing between siblings.
- All interactive states: default, hover, active, focus, disabled.
- 60fps scroll and animation. No janky transitions.

### Hardening (`/harden`)
- Error states for every form input and async operation. Graceful fallbacks for missing data.
- Text overflow: `truncate`, `line-clamp`, or `overflow-wrap: break-word` on all user-generated content.
- i18n: no hardcoded strings in components. RTL-safe layouts.

### Normalization (`/normalize`)
- All components must use design system tokens — no one-off values.
- Consistent component API: same prop names, same default sizes, same radius/shadow levels.

### Process Skills
- `/onboard` — Empty states tell users what to do. First-run experiences reduce time-to-value.
- `/critique` — Evaluate hierarchy, architecture, emotional resonance. Actionable feedback with severity.
- `/optimize` — Loading speed, rendering, animation perf, image optimization, bundle size.
- `/extract` — Identify reusable components and design tokens. Consolidate into the system.
- `/overdrive` — Technically ambitious implementations: shaders, virtual scrolling, spring physics, scroll-driven reveals.

### Tonal Adjustments
- `/quieter` — Reduce visual intensity while maintaining quality. Less contrast, simpler gradients, fewer colors.
- `/bolder` — Amplify safe designs. More contrast, larger type, bolder color, more dramatic spacing.

### AI Slop Fingerprints (Anti-Patterns)

Avoid these common AI-generated design tells:
- Cyan-on-dark color schemes
- Purple/blue gradients everywhere
- Glassmorphism on every surface (we use matte, opaque cards)
- Nested cards inside cards inside cards
- Bounce easing on animations
- Placeholder text used as labels
- Touch targets smaller than 44px
- Stock illustration aesthetic
- "Hero with gradient blob" pattern
- Excessive border-radius (pill-shaped everything)
