---
name: aesthetic
description: 'SoleMD visual-system router for the Mantine 9 public site and Mantine 8 Graph runtime: Tailwind CSS 4, brand colors, dark mode, CSS tokens, responsive layout, typography, surfaces, and component styling. Use whenever the user mentions UI, Mantine, Tailwind, CSS, color, brand, aesthetic, style, theme, font, dark mode, palette, typography, spacing, globals.css, CSS variables, panel surface, prompt overlay, shell tone, rounded-surface, surface tokens, tint-accent, PanelShell, surface-lab, mode-accent, color-mix, cssVariablesResolver, mantineHtmlProps, vars prop, container query, or autoContrast. Route by repository before applying rules. Do NOT use for motion craft (use /animation-authoring), Cosmograph data props or WebGL (use /cosmograph), graph data fetching (use /cosmograph), three.js or shader visuals (use /threejs), raw WebGPU (use /webgpu), Neo4j code graph (use /graph), file or export naming conventions (use /naming), or field-substrate UI runtime (use /module).'
allowed-tools: Read Glob Grep Bash
paths: "{apps/web,src}/**/*.{tsx,ts,css,scss}"
metadata:
  short-description: SoleMD design router — public site + Graph runtime
---

# SoleMD — Visual System Router

Route by the active repository before applying any component rule. SoleMD.Web
and SoleMD.Graph share a palette, but they intentionally use different product
grammar and different Mantine majors.

## Project routing — read first

| Repository | Contract | Stack | Do not import from the other context |
|---|---|---|---|
| `/workspaces/SoleMD.Web` | `docs/brand.md`, `docs/architecture.md`, `src/app/styles/tokens.css` | Mantine 9, Tailwind 4, Motion | Graph PanelShell, density, mode, Cosmograph, field, or dark-first rules |
| `/workspaces/SoleMD.Graph` | The Graph contract below and its five references | Mantine 8, Tailwind 4, Framer Motion | Public-site viewport hero, marketing header, or lecture-card rules |

### SoleMD.Web public-site contract

For the public site, read `/workspaces/SoleMD.Web/docs/brand.md` before visual
changes. Always preserve these rules:

- The original personal-site composition is canonical: centered `100svh`
  editorial heroes, BrainCircuit/SoleMD wordmark, inset pill header, route-aware
  accents, 2rem floating cards, and centered stacked footer.
- The shared orb palette is canonical, through semantic CSS variables. Home is
  soft blue, About lavender, and Lectures green. Small light-mode text uses the
  accessible companion token `--page-accent-text`, never a low-contrast pastel.
- Light mode is warm paper (`#faf9f7`); dark mode uses the Graph AMOLED/inky
  ladder. Both are first-class.
- Mantine 9 uses `@mantine/core/styles.layer.css`, `mantineHtmlProps`,
  `ColorSchemeScript`, and `MantineProvider`. Tailwind owns layout utilities.
- Motion comes from `motion`, uses `LazyMotion`, and is progressive enhancement:
  server HTML must remain visible before hydration or when JavaScript fails.
- Future interactive lectures keep the site shell and tokens. Do not copy
  branding into a standalone experience; extract a versioned brand package if
  a separate deployment is truly required.
- Use CodeAtlas indexed docs first for Next, React, Mantine, Tailwind, and Motion.

The rest of this file is the **SoleMD.Graph-only contract** unless a rule is
explicitly described as shared.

---

## SoleMD.Graph contract

### Graph quick reference

| You want to… | Do this |
|---|---|
| Use a brand color | CSS: `var(--color-soft-blue)`. Tailwind: `text-soft-blue` (auto-generated from `@theme`). Full palette → `references/colors.md` |
| Style a card | Prefer `panelCardStyle` / `panelAccentCardStyle` from the `PanelShell` barrel. Matte, opaque, borderless — never glass morphism |
| Handle dark mode | CSS vars auto-swap via `.dark`. Never use `isDark` ternaries in components |
| Add a new CSS token | Add to `:root` AND `.dark` in `apps/web/app/styles/tokens.css`. See `references/css-architecture.md` |
| Add a Mantine component | Import from `@mantine/core`. `className` for Tailwind layout, `styles`/`classNames`/`vars` for Mantine internals. See `references/mantine-patterns.md` |
| Create a floating panel | Compose from `PanelShell` (`apps/web/features/graph/components/panels/PanelShell/`). Pull style objects from `panel-styles.ts` — never hand-roll `--graph-panel-*` triples |
| Style a panel component | Import `panelSurfaceStyle`, `panelTextStyle`, `panelCardStyle`, etc. from the barrel. See `references/panel-patterns.md` |
| Validate shell styling | Use `/surface-lab` — the canonical token/panel/prompt verification surface |
| Wrap Cosmograph widgets | Mantine `Stack`/`Group` for layout; CSS vars for theming; never inline styles on containers. See `references/panel-patterns.md` and `references/cosmograph-integration.md` |
| Theme Cosmograph widgets | Override the `--cosmograph-ui-*` base vars in `tokens.css` `html:root`. See `references/cosmograph-integration.md` |
| Style an entity profile | Use `panelAccentCardEntityStyle` + `data-entity-type={…}`. The `[data-entity-type]` selector rewires `--entity-accent` per type |
| Scale panel sizing | `panelScaledPx(10)` composes `--app-density` × `--graph-panel-scale`. Never hardcode px in panels |
| Configure a mode color | Edit `MODES[k].color` and `colorVar` in `apps/web/features/graph/lib/modes.ts`. See `references/mode-system.md` |
| Look up Mantine API | CodeAtlas indexed Mantine docs first → official Mantine docs if the index has a gap → `docs/mantine-llms.txt` |
| Preview Mantine themes | [MantineHub](https://mantinehub.com/) — interactive theme builder, copy-paste Blocks |

## Brand Personality

**Elegant, Precise, Calm.** Refined medical authority with soft confidence.
Apple Health meets New England Journal of Medicine — premium quality that
never shouts.

## Graph canonical truth

When this skill needs to choose between older docs and the live
implementation, the canonical truth is:

- the current landing shell under
  `apps/web/features/field/surfaces/FieldLandingPage/`
- the current token and panel system under `apps/web/app/styles/` and
  `apps/web/features/graph/components/panels/PanelShell/`
- `/surface-lab` as the self-check surface for panel tones, prompt tones,
  accents, density, scale, and shell families

`/surface-lab` is the style/tokens authority. It is not the field runtime
or motion authority. Hand off to `/animation-authoring` for motion craft
and to `/module` for the field substrate.

---

## Architecture — How Styling Works

```
app/styles/ (Source of Truth)          Mantine Theme (Bridge)        Components
┌────────────────────────────────┐    ┌──────────────────────────┐   ┌─────────────────────┐
│ tokens.css                     │    │ lib/mantine-theme.ts     │   │ Tailwind utilities   │
│  @theme { brand pastels,       │───>│   shadows → CSS vars     │   │ + className prop     │
│           --radius-surface-* } │    │   radius → rem values    │   │                     │
│  :root  { semantic + graph     │    │   colors → brand tuple   │   │ Mantine components   │
│           + tint + entity }    │    │   component defaults     │   │ + styles/classNames  │
│  .dark  { overrides }          │    │   white/black            │   │ + vars (instance     │
│  html:root { cosmograph }      │    └──────────────────────────┘   │  CSS vars)          │
│                                │                                   │                     │
│ base.css                       │    lib/pastel-tokens.ts           │ PanelShell barrel    │
│  reset, --app-density,         │    ┌──────────────────────────┐   │ (panel-styles.ts +   │
│  view transitions              │    │ CSS var ↔ Mantine tuple  │   │  surface-styles.ts)  │
│                                │    │ bridge (brand + neutral) │   │ — surfaces, text,    │
│ +6 more scoped sheets          │    │ + entity → semantic map  │   │  cards, pills,       │
│ (entity-highlights, editor,    │    └──────────────────────────┘   │  switches, icons     │
│  vendor-overrides, graph-ui,   │                                   │                     │
│  chrome-surface, wiki-content, │                                   │                     │
│  wiki-module-content,          │                                   │                     │
│  viewport-toc-rail)            │                                   │                     │
└────────────────────────────────┘
       │
       ▼
  app/globals.css   (cascade-layer order + imports + @custom-variant dark — NOT a token source)
  app/layout.tsx    (<html> mantineHtmlProps, ColorSchemeScript defaultColorScheme="dark", pre-paint .dark sync script)
  app/providers.tsx (MantineProvider defaultColorScheme="dark", cssVariablesResolver pinning --mantine-color-body, DarkClassSync)
```

### Five-layer system

1. **`apps/web/app/styles/tokens.css`** — design tokens (`@theme` for
   Tailwind v4 utility generation, including the `--radius-surface-*`
   ramp) + semantic tokens (`:root` light, `.dark` overrides) +
   Cosmograph overrides (`html:root`, `html.dark`) + entity-type
   attribute selectors. The single place tokens are defined.
2. **`apps/web/app/styles/base.css`** — reset, `--app-density` scaling,
   scrollbar utilities, view-transition animations.
3. **`apps/web/app/styles/{graph-ui,chrome-surface,entity-highlights,
   editor,vendor-overrides,wiki-content,wiki-module-content,
   viewport-toc-rail}.css`** — scoped component CSS for graph chrome,
   shell chrome, editor entity pills, third-party widget patches, wiki
   typography, viewport edge ToC.
4. **`apps/web/lib/mantine-theme.ts` + `apps/web/lib/pastel-tokens.ts`**
   — bridge tokens into Mantine's theme object (shadows, radius,
   10-shade brand/neutral tuples, component defaults). The
   `themeSurfaceFallbackHexByKey.black = "#1a1817"` constant is the
   warm-off-black that mirrors `--text-primary`.
5. **`apps/web/features/graph/lib/brand-colors.ts`** — hex constants
   WebGL/Cosmograph needs (can't read CSS vars). Mirror-synced with
   `tokens.css`. `DARK_ON_COLOR = "#1a1817"`.

`apps/web/app/globals.css` is the entry file: it declares cascade layers,
imports Tailwind 4 layers, then the styles files in order, and registers
`@custom-variant dark`. **Don't put new tokens or rules in
`globals.css`** — full layer order is in `references/css-architecture.md`.

### Token Families (cheat sheet)

All defined in `tokens.css`. Use the prefix to find the right block.

| Prefix | Purpose |
|--------|---------|
| `--color-*` | Brand pastels (9), semantic category pastels (9), extended pastels (12, PanelEdgeToc cycle), feedback (2) |
| `--radius-surface*` | Panel-family corner ramp → Tailwind `rounded-surface*` utilities |
| `--surface`, `--background`, `--foreground`, `--text-*`, `--border-*`, `--shadow-*` | Semantic foundations |
| `--brand-accent*`, `--interactive-*` | App-wide accent + interaction states |
| `--tint-accent-*` (`bg/border/pill/strong`), `--rim-light`, `--on-accent` | Centralized tint ramp + accent adjuncts |
| `--graph-panel-*` | Docked panel surface + scaling |
| `--graph-prompt-*` | Floating prompt overlay (separate elevation tier) |
| `--graph-wordmark-*`, `--graph-stats-*`, `--graph-label-*` | Canvas chrome |
| `--graph-overlay-scrim*`, `--graph-greyout-opacity` | Full-viewport scrims |
| `--wiki-graph-node-*`, `--wiki-graph-link`, `--wiki-graph-label` | Wiki graph colors |
| `--entity-accent`, `--entity-highlight-radius` | Per-entity-type accent (rewired via `[data-entity-type]`) |
| `--mode-accent*` | Active mode spectrum (set by `ModeColorSync`); `--module-accent-default` is the unscoped fallback |
| `--filter-bar-*` | Timeline/histogram bars (mode-aware) |
| `--graph-control-*` | Matte control shell base state |
| `--icon-size`, `--icon-stroke-width`, `--panel-icon-*` | Icon sizing (density-scaled) |
| `--feedback-warning-*`, `--feedback-danger-*` | State chrome |
| `--app-density` | Global scale multiplier (default `0.8`) |
| `--cosmograph-ui-*` | Cosmograph widget overrides (in `html:root`) |

### Scaling Axis

Two composable multipliers drive every panel-scoped dimension:

- `--app-density` (default `0.8`) — global scale set on `<html>` in
  `base.css`. Multiplies spacing, shadow offsets, icon sizes.
- `--graph-panel-scale` (default `1`, user-adjustable `0.8–1.4` via
  `PanelScaleControl`) — per-panel reading scale.
- `--graph-panel-reading-scale` = `calc(var(--app-density) *
  var(--graph-panel-scale))` — what `panel-styles.ts` consumes.

All panel sizing goes through `panelScaledPx(basePx)` (in
`panel-styles.ts`), which returns `calc(${base}px *
var(--graph-panel-reading-scale, ...))`. Never hardcode px in panel
components.

---

## Design Principles

1. **White space is a feature, not waste.** Use spacious, viewport-driven
   rhythm for hero and landing surfaces. Do not collapse long-form
   sections into tight app spacing.
2. **Color communicates meaning.** Use accent tokens, semantic colors,
   and mode accents to localize emphasis. Do not wash the entire UI in
   one chapter tint.
3. **Motion earns attention.** Soft, scroll-triggered. Float/fade/lift
   only. Never bounce/shake/flash. (Motion craft → `/animation-authoring`.)
4. **Depth through layering.** Matte, opaque surfaces. In dark mode,
   rim-light plus soft halo depth are preferred over visible strokes.
5. **Accessibility non-negotiable.** WCAG AA (4.5:1 text, 3:1 large).
   Keyboard nav. `prefers-reduced-motion`.
6. **Mostly borderless chrome.** Visible borders are reserved for true
   semantic/error states. Regular cards and prompt shells should read
   through tone, shadow, and rim-light before strokes.

---

## Color System (summary)

Brand voice is seven core pastels that stay alive on AMOLED black instead
of pre-desaturating into charcoal. Light mode sits on a warm off-white
(`#faf9f7`); dark mode is `#000000` for field/viewport plus an inky panel
ladder.

Full palette (40+ colors with light/dark pairs, shadows, foundations,
scrims, filter bars, density), the dark-mode rule, and anti-patterns
live in `references/colors.md`. Mode-color contract → `references/mode-system.md`.

Typography: Inter (`--font-sans`) for everything, JetBrains Mono
(`--font-mono`) for code. Weights: 400 body → 500 headings → 600
emphasis. Mantine radius scale: `xs 0.25rem, sm 0.5rem, md 0.75rem,
lg 1rem, xl 1.5rem`; `defaultRadius: 'lg'`. The surface ramp
(`rounded-surface*`) lives separately in the `@theme` block.

---

## Mantine 8 + React 19 Integration (summary)

Provider configuration in `apps/web/app/providers.tsx`:

- `defaultColorScheme="dark"` (not `auto` — dark-first product surface)
- `cssVariablesResolver` pins `--mantine-color-body` at `var(--background)`
  in the `light` and `dark` keys (the `variables` key would lose the
  cascade because Mantine's own dark override has higher specificity)
- `DarkClassSync` mirrors Mantine's `data-mantine-color-scheme` into the
  `.dark` class on `<html>` so token cascading works

`mantineHtmlProps` is set on `<html>` in `apps/web/app/layout.tsx` plus a
small pre-paint script that sets `.dark` from `localStorage` to prevent
FOUC. `ColorSchemeScript defaultColorScheme="dark"`.

When you author components:

- `className` with Tailwind for layout, spacing, positioning
- `styles` / `classNames` props for Mantine internal sub-elements
- `vars` prop (Mantine 8 canonical) for runtime CSS vars on a single
  instance — `vars={(theme, props) => ({ root: { '--button-fz': ... } })}`
- React 19 / React Compiler is wired (`babel-plugin-react-compiler ^19.1.0-rc.3`).
  **Don't add `useMemo`/`useCallback`/`React.memo` defensively.** Use
  `'use no memo'` as the per-file escape hatch.
- For form-state ownership use `useActionState` (React 19); `useFormStatus`
  remains valid for read-only child pending state inside `<form>`.

`theme.autoContrast = true` (with optional `luminanceThreshold`)
generalizes the `DARK_ON_COLOR` pattern for filled buttons.
`theme.respectReducedMotion = true` auto-gates Mantine's `Transition`.

Full configuration, the `vars` pattern, container queries, the
React 19 form pattern, and Mantine API lookup priority live in
`references/mantine-patterns.md`. Cascade-layer reasoning and the
Tailwind 4 v3→v4 trap audit live in `references/css-architecture.md`.

---

## Mode System (summary)

Four modes — **Ask**, **Explore**, **Learn**, **Create**. Each owns a
hex `color` and a `colorVar` (CSS variable name) in
`apps/web/features/graph/lib/modes.ts`. `ModeColorSync` watches the
active mode and writes `--mode-accent: var(<colorVar>)` on `<html>`.
The `--mode-accent-{subtle,hover}` spectrum is derived via `color-mix()`
in `tokens.css` and re-mixed for dark mode (transparent instead of white).

Components consume `var(--mode-accent)`. The PromptBox toggle row needs
all four mode colors at once and reads from `MODES[k].color` directly.
Submit-button text on a pastel mode-color background uses
`DARK_ON_COLOR = "#1a1817"` from `apps/web/features/graph/lib/brand-colors.ts`.

Full mode-color contract, dark-text rule, switching workflow, and key
files → `references/mode-system.md`.

---

## CSS ↔ WebGL Boundary

WebGL (Cosmograph canvas) cannot read CSS custom properties. This creates
two parallel color systems:

| System | Values | Source | Used By |
|--------|--------|--------|---------|
| CSS tokens | `var(--surface)`, `var(--brand-accent)` | `apps/web/app/styles/tokens.css` | Mantine, Tailwind, Cosmograph CSS widgets |
| WebGL hex | `"#faf9f7"`, `"#747caa"` | `apps/web/features/graph/lib/brand-colors.ts` | Cosmograph React props (`backgroundColor`, `hoveredPointRingColor`, etc.) |

Both files carry sync breadcrumbs. When changing brand colors:
update `tokens.css` `:root` / `.dark` → update `brand-colors.ts` →
update `lib/mantine-theme.ts` brand tuple if the primary blue shade
changed. Detail → `references/css-architecture.md`.

---

## Panel Styling — PanelShell is Canonical

Every floating/docked panel (Info, Prompt, Wiki, Explore data table,
etc.) composes from `apps/web/features/graph/components/panels/PanelShell/`.
**Always import via the barrel** (`@/features/graph/components/panels/PanelShell`).
Never reach into internal files.

The barrel exports shells (`PanelShell`, `BottomTrayShell`, `PopoverSurface`,
`OverlaySurface`, `OverlayCard`, `MetaPill`, `PanelSearchField`),
header actions (`PanelIconAction`, `PanelScaleControl`,
`PanelWindowActions`, `PanelHeaderActions`, `PanelHeaderDivider`),
primitives (`PanelBody`, `PanelDivider`, `PanelInlineLoader`,
`GatedSwitch`), every shared style object (`panelSurfaceStyle`,
`promptSurfaceStyle`, `panelCardStyle`, `panelAccentCardStyle`,
`panelAccentCardEntityStyle`, `panelTextStyle*`, `panelChromeStyle`,
`panelStatValueStyle`, `sectionLabelStyle`, `panelTableHeaderStyle`,
`panelMonoLabelStyle`, `panelPillStyles`, `panelTypePillStyles`,
`pillActiveColors`, `pillInactiveColors`,
`badgeAccentStyles`, `badgeOutlineStyles`, `panelSwitchStyles`,
`panelSelectStyles`, `iconBtnStyles`, `panelIconBtnStyles`,
`graphControlBtnStyles`, `nativeIconBtnFrameStyle`,
`nativeIconBtnInnerStyle`, `disabledNativeIconBtnStyle`,
`chromeFlushSurfaceStyle`, `chromePillSurfaceStyle`, `panelErrorStyle`),
scaling helpers (`panelScaledPx`, `createPanelScaleStyle`), and constants
(`PANEL_ACCENT`, `PANEL_SCALE_CSS_VAR`, `PANEL_TOP`,
`ChromeSurfaceMode`).

The `--graph-panel-*` and `--graph-prompt-*` namespaces represent
distinct elevation tiers — do not collapse them. Detail, header
actions, entity-profile pattern, container-query layout, and
anti-patterns → `references/panel-patterns.md`.

---

## Cosmograph ↔ Mantine Integration

Cosmograph widgets use their own CSS variable system, completely
separate from Mantine. Integration happens through **shared foundation
tokens** in `tokens.css`. Override the 7 `--cosmograph-ui-*` base vars
(plus 2 density-scaled font-size tokens) in the `html:root` block —
67+ widget-specific vars derive from those bases automatically.

**Scope boundary**: this skill owns Cosmograph CSS variable theming.
The `/cosmograph` skill owns data props, WebGL rendering, and
`CosmographConfig`. If it is a `--cosmograph-*` CSS var → this skill.
If it is a React prop on `<Cosmograph>` → `/cosmograph`. Detail,
widget taxonomy, and dark-mode patterns → `references/cosmograph-integration.md`.

---

## New Component Checklist

1. Check if a Mantine component exists first (use CodeAtlas indexed Mantine docs).
2. Use CSS vars from `tokens.css` for colors — never hardcode hex.
3. Use `rounded-surface*` (or Mantine `radius="lg"`) for border radius.
4. Use `shadow-[var(--shadow-sm)]` for default shadows.
5. Add hover lift: increase shadow level + subtle translateY.
6. Test both light and dark mode.
7. Ensure keyboard navigability for interactive elements.
8. Check contrast ratios (4.5:1 text, 3:1 large text). Consider
   `theme.autoContrast` instead of branching color manually.

---

## Anti-Patterns

| Don't | Do Instead |
|-------|-----------|
| Hardcode hex colors in components | Use CSS vars: `var(--color-soft-blue)` |
| `isDark` ternaries in JSX | CSS vars that auto-swap with `.dark` |
| `next-themes` | `useMantineColorScheme()` + `useComputedColorScheme("dark")` |
| Glass morphism on panels | Opaque `--graph-panel-bg` |
| Invent a second dark backdrop | `#000000` for field/viewport, tokenized `--background` / `--surface` for chrome |
| Pure white `#ffffff` as page bg | `#faf9f7` (warm off-white, mirror of `--background`) |
| Bounce/shake/flash animations | Float/fade/lift only (motion craft → `/animation-authoring`) |
| Auto-playing animations | Scroll-triggered or interaction-triggered |
| Fixed spacing law everywhere | Landing uses viewport-driven rhythm; panel internals use `panelScaledPx(...)` |
| Enterprise SaaS aesthetic | Soft, premium, Apple-inspired |
| CSS modules or styled-components | Tailwind + Mantine components |
| `tailwind.config.js` v3-style theme keys | `@theme` block in `tokens.css` (Tailwind 4) |
| `bg-opacity-50`, `flex-shrink-0`, `outline-none`, `bg-[--brand]` | `bg-black/50`, `shrink-0`, `outline-hidden`, `bg-(--brand)` (see `references/css-architecture.md` audit) |
| Override every Cosmograph CSS var | Override the 7 ui base vars; let widget vars cascade |
| Inline styles for Cosmograph theme | `html:root` block in `tokens.css` (higher specificity than runtime injection) |
| Hand-roll `--graph-panel-bg`/`--graph-panel-shadow` on a new panel | Spread `panelSurfaceStyle` from the `PanelShell` barrel |
| Re-declare `color-mix(... var(--entity-accent) ...)` per entity profile | Use `panelAccentCardEntityStyle` + `data-entity-type` attribute |
| Hardcode px font sizes inside a panel | `panelScaledPx(baseValue)` |
| Define new tokens in `globals.css` | Define in `tokens.css` — `globals.css` is layer order + imports + dark variant only |
| Use `--shadow-subtle/medium/floating` | Use `--shadow-sm/md/lg` (actual token names) |
| Hardcode mode color in components | `var(--mode-accent)` — auto-set by `ModeColorSync` |
| `var(--foreground)` on mode-color bg | `DARK_ON_COLOR` from `brand-colors.ts` (or `theme.autoContrast`) |
| Hardcode WebGL hex in components | Import from `brand-colors.ts` |
| Duplicate `BRAND` object per file | Single import from `apps/web/features/graph/lib/brand-colors.ts` |
| Defensive `useMemo` / `useCallback` / `React.memo` | React Compiler handles it; use `'use no memo'` to opt out a hot file |
| Viewport media query for docked vs. fullscreen panel | Container query (`@container/panel`) — see `references/panel-patterns.md` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dark mode not updating | Check `.dark` block in `tokens.css` has the token. Check `DarkClassSync` in `app/providers.tsx` |
| Mantine component looks wrong | Check `lib/mantine-theme.ts` for defaults. Override with `styles`/`classNames`/`vars` prop |
| Shadow not visible | Use `var(--shadow-*)` CSS vars, not raw box-shadow. Check dark variant |
| Card doesn't float | Add `shadow-[var(--shadow-sm)]` + hover state with higher shadow |
| Cosmograph panel invisible | Panels need opaque `--graph-panel-bg`, not semi-transparent with blur |
| Cosmograph widgets wrong color | Check `html:root` block in `tokens.css` overrides the base `--cosmograph-ui-*` vars |
| Cosmograph ignores our theme | Cosmograph injects `:root` at runtime. Must use `html:root` (specificity 0,1,1 > 0,1,0) |
| Color too vibrant in dark mode | Add darker variant in `.dark` block of `tokens.css` (−25% lightness, −25% saturation) |
| Panel font/icon doesn't scale with panel scale control | Using raw px instead of `panelScaledPx(n)` from the barrel |
| Entity accent color missing on wiki profile | Set `data-entity-type={entity_type.toLowerCase()}` on the card |
| Tailwind class not working | Tailwind 4 uses `@theme` block, not `tailwind.config.js`. Check the v3→v4 trap audit in `references/css-architecture.md` |
| Mantine radius inconsistent | Default is `lg` in theme. Use `radius` prop per-component |
| Hydration mismatch on theme | Ensure `ColorSchemeScript` is in `<head>` before `MantineProvider`; `mantineHtmlProps` must be on `<html>` |
| `npm install` fails | Use `--legacy-peer-deps` (Cosmograph declares react ^16/^17/^18) |
| `--mantine-color-body` ignores `--background` token | Confirm `cssVariablesResolver` in `app/providers.tsx` writes to `light`/`dark` keys, not `variables` |

---

## References

| Topic | File |
|-------|------|
| Full color palette + tokens | `references/colors.md` |
| Mode color contract | `references/mode-system.md` |
| Mantine 8 + React 19 patterns | `references/mantine-patterns.md` |
| CSS token architecture + Tailwind 4 audit | `references/css-architecture.md` |
| Cosmograph CSS integration | `references/cosmograph-integration.md` |
| Panel styling patterns + container queries | `references/panel-patterns.md` |
| Brand & visual identity | `docs/map/brand.md` |
| Architecture overview | `docs/map/architecture.md` |
| Mantine docs (indexed) | CodeAtlas Mantine library documentation |
| Mantine docs (offline) | `docs/mantine-llms.txt` |
| MantineHub theme builder | [mantinehub.com](https://mantinehub.com/) |
