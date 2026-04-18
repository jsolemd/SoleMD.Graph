# SoleMD Color System

All colors live in `app/styles/tokens.css`. This document enumerates them by category with verbatim CSS variable names.

## Core Brand Pastels (@theme block, 9)

| Name | Hex (light) | CSS Variable |
|------|-------------|-------------|
| Soft Blue | `#a8c5e9` | `--color-soft-blue` |
| Muted Indigo | `#747caa` | `--color-muted-indigo` |
| Golden Yellow | `#fbb44e` | `--color-golden-yellow` |
| Fresh Green | `#aedc93` | `--color-fresh-green` |
| Warm Coral | `#ffada4` | `--color-warm-coral` |
| Soft Pink | `#eda8c4` | `--color-soft-pink` |
| Soft Lavender | `#d8bee9` | `--color-soft-lavender` |
| Paper | `#d4c5a0` → dark `#a89b78` | `--color-paper` |
| Teal | `#7ecfb0` | `--color-teal` |

Dark-mode values are desaturated ~25–35% lightness, ~20–30% saturation.

## Extended Pastels (DotToc rainbow cycle, 12)

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

Consumed via `lib/pastel-tokens.ts` → `dotTocPastelColorSequence` (20-color cycle). The DotToc component rotates through this sequence.

## Feedback Colors

| CSS Variable | Purpose |
|--------------|---------|
| `--color-feedback-warning` | Warning accent hex |
| `--color-feedback-danger` | Danger/error accent hex |

## Semantic Foundations (`:root` + `.dark`)

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--background` | `#fafafa` | `#18181b` | Page background |
| `--foreground` | `#1a1b1e` | `#e4e4e9` | Primary text |
| `--surface` | `#ffffff` | `#1c1d21` | Card/panel surfaces |
| `--surface-alt` | `#f5f6f8` | `#232427` | Inputs, toolbars |
| `--text-primary` | `#1a1b1e` | `#e4e4e9` | Main text |
| `--text-secondary` | `#5c5f66` | `#a1a1aa` | Secondary text |
| `--text-tertiary` | `#9ca3af` | `#6b6b73` | Muted text |
| `--border-default` | `#eaedf0` | `#2a2c31` | Primary borders |
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

`ModeColorSync` sets `--mode-accent` on `<html>` to the active mode's `colorVar` (see `lib/graph/modes.ts`). The subtle/hover/border tokens derive via `color-mix()` so they auto-update.

| Variable | Opacity | Purpose |
|----------|---------|---------|
| `--mode-accent` | 100% | Full accent color |
| `--mode-accent-subtle` | ~10% | Background fills |
| `--mode-accent-hover` | ~18% | Hover states |
| `--mode-accent-border` | ~30% | Colored borders |

Mode colors: Ask → `--color-soft-blue`, Explore → `--color-golden-yellow`, Learn → `--color-fresh-green`, Write → `--color-warm-coral`.

## Graph Panel Tokens

| Variable | Purpose |
|----------|---------|
| `--graph-bg`, `--graph-panel-bg` | Panel surface (opaque, no glass) |
| `--graph-panel-border`, `--graph-panel-shadow` | Panel edge + elevation |
| `--graph-panel-text`, `--graph-panel-text-muted`, `--graph-panel-text-dim` | Three text tiers |
| `--graph-panel-input-bg` | Embedded input/select backgrounds |
| `--graph-panel-hover`, `--graph-panel-active` | Interaction states |
| `--graph-panel-scale` (1, user 0.8–1.4), `--graph-panel-reading-scale` | Scaling |

## Graph Prompt Tokens (distinct elevation tier)

| Variable | Purpose |
|----------|---------|
| `--graph-prompt-bg`, `--graph-prompt-border`, `--graph-prompt-shadow` | Floating prompt surface + two-tier shadow |
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
| `--feedback-warning-accent` | Hex from `--color-feedback-warning` |
| `--feedback-warning-bg` | Subtle tinted bg via `color-mix()` with `--surface-alt` |
| `--feedback-warning-border` | Mixed with `--border-default` |
| `--feedback-warning-text` | Same as accent |
| `--feedback-danger-accent` / `-bg` / `-border` / `-text` | Same pattern, danger variant |

`panelErrorStyle` in `panel-styles.ts` wires these into a ready-to-use surface.

## Graph Control (matte shell) Tokens

| Variable | Purpose |
|----------|---------|
| `--graph-control-icon-color`, `--graph-control-active-icon-color` | Icon tints (idle, active) |
| `--graph-control-idle-bg`, `--graph-control-idle-border` | Base shell |
| `--graph-control-hover-bg`, `--graph-control-pressed-bg`, `--graph-control-active-bg` | Interaction states |

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

## Mantine Brand Tuple

From `lib/pastel-tokens.ts` → `mantineBrandColorsTuple` (primary shade index = 3):

```
[0] #eef3f9   [1] #dce7f4   [2] #c9dcef   [3] #a8c5e9 (primary)
[4] #92b3d7   [5] #7c9fc5   [6] #668bb3   [7] #5077a1
[8] #3a638f   [9] #244f7d
```

## Dark Mode Design Rule

- Lightness −25 to −35%
- Saturation −20 to −30%
- Slight hue shift toward neutral

Goal: muted, calm variants that never feel neon against `#18181b`. Never invert — desaturate.

## Anti-Patterns

- **Pure black** `#000000` for dark bg → use `#18181b` (warm charcoal)
- **Pure white** `#fafafa`-adjacent → use `#fafafa` (warm off-white)
- **Hardcoded hex** in components → always `var(--token)`; use `brand-colors.ts` only for WebGL React props
- **`isDark` ternaries** → tokens auto-swap via `.dark`
- **New tokens in `globals.css`** → add to `app/styles/tokens.css`
