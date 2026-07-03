# SoleMD Color System

All colors live in `app/styles/tokens.css`. This document enumerates them by category with verbatim CSS variable names.

## Core Brand Pastels (@theme block, 9)

| Name | Hex (light) | CSS Variable |
|------|-------------|-------------|
| Soft Blue | `#a8c5e9` | `--color-soft-blue` |
| Muted Indigo | `#747caa` | `--color-muted-indigo` |
| Golden Yellow | `#e5c799` | `--color-golden-yellow` |
| Fresh Green | `#aedc93` | `--color-fresh-green` |
| Warm Coral | `#ffada4` | `--color-warm-coral` |
| Soft Pink | `#e0aed8` | `--color-soft-pink` |
| Soft Lavender | `#d8bee9` | `--color-soft-lavender` |
| Paper | `#d4c5a0` | `--color-paper` |
| Teal | `#7ecfb0` | `--color-teal` |

On the live site, dark mode keeps these pastels lively against a pure-black
canvas instead of pre-desaturating them into charcoal.

## Extended Pastels (PanelEdgeToc rainbow cycle, 12)

| CSS Variable | Hex |
|--------------|-----|
| `--color-seafoam` | `#8ed4c6` |
| `--color-amber` | `#f5c26b` |
| `--color-sky` | `#7ec8e3` |
| `--color-rose` | `#e8a0b4` |
| `--color-mint` | `#b5e6a3` |
| `--color-orchid` | `#c9a0e8` |
| `--color-maize` | `#f0d48a` |
| `--color-powder` | `#a0d4e8` |
| `--color-peach` | `#e8c4a0` |
| `--color-sage` | `#a8d8b8` |
| `--color-plum` | `#d4a0c8` |
| `--color-pear` | `#c8d8a0` |

Consumed via `apps/web/lib/pastel-tokens.ts` → `dotTocPastelColorSequence`
(20-color cycle, name retained). The rendered component is `PanelEdgeToc`
(`apps/web/features/wiki/components/PanelEdgeToc.tsx`); it rotates through
the sequence per chapter.

## Feedback Colors

| CSS Variable | Purpose |
|--------------|---------|
| `--color-feedback-warning` | Warning accent hex |
| `--color-feedback-danger` | Danger/error accent hex |

## Semantic Foundations (`:root` + `.dark`)

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--background` | `#faf9f7` | `#000000` | Page background |
| `--surface` | `#fffffe` | `#0F1012` | Card/panel surfaces |
| `--surface-alt` | `#f5f4f1` | `#1A1B1E` | Inputs, toolbars |
| `--surface-raised` | `#ffffff` | `#2A2C30` | Prompts, popovers, lifted surfaces |
| `--text-primary` | `#1a1817` | `#E4E6EB` | Main text |
| `--text-secondary` | `#5e5c58` | `#AEB1B7` | Secondary text |
| `--text-tertiary` | `#9e9c97` | `#70747A` | Muted text |
| `--border-default` | `#eae8e4` | `#26272B` | Semantic/error borders |
| `--border-subtle` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` | Subtle dividers |
| `--brand-accent` | `#747caa` | `#a8c5e9` | Primary accent |
| `--brand-accent-alt` | `#a8c5e9` | `#89a3bf` | Secondary accent |
| `--interactive-hover` | `rgba(116,124,170,0.06)` | `rgba(168,197,233,0.08)` | Hover bg |
| `--interactive-active` | `rgba(116,124,170,0.10)` | `rgba(168,197,233,0.12)` | Active bg |

## Shadows

| Level | Light | Dark | CSS Variable |
|-------|-------|------|-------------|
| sm | `0 1px 3px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.3)` | `--shadow-sm` |
| md | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.4)` | `--shadow-md` |
| lg | `0 8px 24px rgba(0,0,0,0.08)` | `0 8px 24px rgba(0,0,0,0.5)` | `--shadow-lg` |

## Mode Accent Spectrum

`ModeColorSync` sets `--mode-accent` on `<html>` to the active mode's
`colorVar` (see `apps/web/features/graph/lib/modes.ts`). The subtle/hover
tokens derive via `color-mix()` so they auto-update.

| Variable | Opacity | Purpose |
|----------|---------|---------|
| `--mode-accent` | 100% | Full accent color |
| `--mode-accent-subtle` | dynamic `color-mix()` | Background fills |
| `--mode-accent-hover` | dynamic `color-mix()` | Hover states |

Mode colors: Ask → `--color-soft-blue`, Explore → `--color-golden-yellow`, Learn → `--color-fresh-green`, Create → `--color-warm-coral`. See `references/mode-system.md` for the full mode contract.

## Graph Panel Tokens

| Variable | Purpose |
|----------|---------|
| `--graph-bg`, `--graph-panel-bg` | Panel surface (opaque, no glass) |
| `--graph-panel-border`, `--graph-panel-shadow` | Panel edge + elevation |
| `--graph-panel-text`, `--graph-panel-text-muted`, `--graph-panel-text-dim` | Three text tiers |
| `--graph-panel-input-bg` | Embedded input/select backgrounds |
| `--graph-panel-hover` | Interaction state |
| `--graph-panel-scale` (1, user 0.8–1.4), `--graph-panel-reading-scale` | Scaling |

## Graph Prompt Tokens (distinct elevation tier)

| Variable | Purpose |
|----------|---------|
| `--graph-prompt-bg`, `--graph-prompt-shadow` | Floating prompt surface + two-tier shadow |
| `--graph-prompt-text`, `--graph-prompt-placeholder`, `--graph-prompt-inactive` | Prompt text tiers |
| `--graph-prompt-divider` | Motion divider below input |

## Wiki Graph Node Colors (10)

| Variable | Indirection | Used by |
|----------|-------------|---------|
| `--wiki-graph-node-diso` | → `--color-semantic-disorder` | Disease/disorder |
| `--wiki-graph-node-chem` | → `--color-semantic-chemical` | Chemical/drug |
| `--wiki-graph-node-gene` | → `--color-semantic-gene` | Gene/receptor |
| `--wiki-graph-node-anat` | → `--color-semantic-anatomy` | Anatomy |
| `--wiki-graph-node-phys` | → `--color-semantic-physiology` | Physiology/network/bio process |
| `--wiki-graph-node-proc` | → `--color-semantic-procedure` | Procedure/species |
| `--wiki-graph-node-section` | → `--color-semantic-section` | Document section |
| `--wiki-graph-node-paper` | → `--color-semantic-paper` | Paper |
| `--wiki-graph-node-default` | → `--color-semantic-physiology` | Fallback |
| `--wiki-graph-node-module` | → `--color-semantic-module` | Module |
| `--wiki-graph-link`, `--wiki-graph-label` | — | Edge + label styling |

Runtime bridge: `entityTypeCssColorByType` in `lib/pastel-tokens.ts` exposes these hexes as runtime constants for WebGL/SVG that can't read CSS vars.

## Entity Accent (attribute-driven theming)

`--entity-accent` is rewired by attribute selectors in `tokens.css`:

```css
[data-entity-type="disease"]            { --entity-accent: var(--color-semantic-disorder); }
[data-entity-type="chemical"]           { --entity-accent: var(--color-semantic-chemical); }
[data-entity-type="gene"]               { --entity-accent: var(--color-semantic-gene); }
[data-entity-type="receptor"]           { --entity-accent: var(--color-semantic-gene); }
[data-entity-type="anatomy"]            { --entity-accent: var(--color-semantic-anatomy); }
[data-entity-type="network"]            { --entity-accent: var(--color-semantic-physiology); }
[data-entity-type="biological process"] { --entity-accent: var(--color-semantic-physiology); }
[data-entity-type="species"]            { --entity-accent: var(--color-semantic-procedure); }
[data-entity-type="module"]             { --entity-accent: var(--color-semantic-module); }
```

Default (no data attribute) = `var(--brand-accent)`.

Consume by setting `data-entity-type` on a container and reading `var(--entity-accent)` inside — the entire subtree inherits the swap. `panelAccentCardEntityStyle` does exactly this.

`--entity-highlight-radius` controls the focus-ring radius used by entity overlays.

## Feedback State Tokens

| Variable | Purpose |
|----------|---------|
| `--feedback-warning-bg` | Subtle tinted bg via `color-mix()` with `--surface-alt` + `--color-feedback-warning` |
| `--feedback-warning-border` | Mixed with `--border-default` + `--color-feedback-warning` |
| `--feedback-danger-accent` / `-bg` / `-border` / `-text` | Same pattern, danger variant |

`panelErrorStyle` in `panel-styles.ts` wires these into a ready-to-use surface.

## Graph Control (matte shell) Tokens

| Variable | Purpose |
|----------|---------|
| `--graph-icon-color` | Shared idle icon tint across graph chrome + wordmark |
| `--graph-control-idle-bg` | Base shell background |
| Hover/pressed/active shell states | Derived in `graph-ui.css` from the idle bg + accent system, not separate tokens |

Wired by `.graph-icon-btn` / `.panel-icon-btn` rules in `graph-ui.css`.

## Icon Sizing

| Variable | Purpose |
|----------|---------|
| `--icon-size`, `--icon-stroke-width` | General icons (density-scaled) |
| `--panel-icon-size`, `--panel-icon-stroke-width` | Panel-scoped icons |

## Overlay Scrims

| Variable | Light | Dark | Used by |
|----------|-------|------|---------|
| `--graph-overlay-scrim` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.55)` | WikiPanel global graph backdrop |
| `--graph-overlay-scrim-strong` | `rgba(0,0,0,0.45)` | `rgba(0,0,0,0.65)` | WikiPanel fullscreen animation backdrop |
| `--graph-greyout-opacity` | `0.25` | `0.15` | Cosmograph greyed-out points |

## Filter / Timeline

| Variable | Light | Dark |
|----------|-------|------|
| `--filter-bar-base` | `color-mix(--mode-accent 30%, white)` | `color-mix(--mode-accent 20%, transparent)` |
| `--filter-bar-active` | `var(--mode-accent)` | `color-mix(--mode-accent 70%, white)` |
| `--filter-bar-marker` | `color-mix(--mode-accent 82%, black)` | `color-mix(--mode-accent 55%, black)` |

## Density

`--app-density: 0.8` — global scale multiplier on `<html>`. Multiplies spacing, shadow offsets, icon sizes. Composed with `--graph-panel-scale` to produce `--graph-panel-reading-scale` for panel-scoped sizing.

## Surface Radius Ramp (`@theme`)

| Variable | Value | Generated Tailwind utility |
|----------|-------|----------------------------|
| `--radius-surface-sm` | `1rem` | `rounded-surface-sm` |
| `--radius-surface` | `1.25rem` | `rounded-surface` |
| `--radius-surface-lg` | `1.5rem` | `rounded-surface-lg` |

Single source of truth for panel-family corners. When you author a new
panel/card/overlay, prefer `rounded-surface*` over hand-tuned `rounded-[…]`
literals — the ramp keeps the family of surfaces consistent.

## Tint Ramp + Accent Adjuncts (`:root`)

| Variable | Value (light default) | Used by |
|----------|----------------------|---------|
| `--tint-accent-bg` | `20%` | `color-mix()` ratio for accent card backgrounds |
| `--tint-accent-border` | `32%` | Accent card borders |
| `--tint-accent-pill` | `40%` | Pill background fill |
| `--tint-accent-strong` | `65%` | Pill border / strong emphasis |
| `--rim-light` | `none` light, `inset 0 1px 0 rgba(255,255,255,0.035)` dark | Top-edge highlight on stacked surfaces; gives "lit from above" depth in dark mode |
| `--on-accent` | `#ffffff` | Glyph color on the mode-accent affordance (e.g. send-circle arrow) |

These ramps centralize palette warmth/chroma decisions. To shift the entire
accent system (e.g. softer pills across the app), edit one number in
`tokens.css` rather than chasing every consumer.

## Module Accent Fallback

`--module-accent-default` (set to `var(--color-soft-blue)` in both light and
dark) is the fallback for module-scoped components that haven't been wired
to a mode. It is distinct from `--mode-accent` (active dashboard mode). Use
`--mode-accent` for mode-driven UI; reach for `--module-accent-default` only
when authoring a module shell that needs a stable accent regardless of mode.

## Mantine Brand Tuple

From `lib/pastel-tokens.ts` → `mantineBrandColorsTuple` (primary shade index = 3):

```
[0] #eef3f9   [1] #dce7f4   [2] #c9dcef   [3] #a8c5e9 (primary)
[4] #92b3d7   [5] #7c9fc5   [6] #668bb3   [7] #5077a1
[8] #3a638f   [9] #244f7d
```

## Dark Mode Design Rule

- Start from the real dark substrate in use: `#000000` for field/viewport
  backgrounds, tokenized near-black surfaces for chrome
- Lower lightness only as needed for readability and layering
- Preserve pastel identity instead of flattening everything toward gray
- Rebalance warmth/chroma per token family; do not apply one global formula

Goal: lively but controlled pastels that stay legible on black and dark surfaces.
Do not invert blindly, and do not gray the whole palette out.

## Anti-Patterns

- **Charcoal dark-mode fallback** → the canonical dark canvas is `#000000`
- **Cool gray page white** → the canonical light background is `#faf9f7`
- **Hardcoded hex** in components → always `var(--token)`; use `brand-colors.ts` only for WebGL React props
- **`isDark` ternaries** → tokens auto-swap via `.dark`
- **New tokens in `globals.css`** → add to `app/styles/tokens.css`
