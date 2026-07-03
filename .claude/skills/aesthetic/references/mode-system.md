# Mode System & Mode Accents

The dashboard exposes four modes: **Ask**, **Explore**, **Learn**, **Create**.
Each mode owns a hex color, a CSS-variable name, a placeholder, and a layout
contract. The mode registry is data-driven, not CSS-driven.

Source of truth: `apps/web/features/graph/lib/modes.ts`.

## Mode Registry

When you author or edit modes, the canonical pattern is to set both `color`
(hex hint) and `colorVar` (the CSS variable name without `var()`) on every
entry. `ModeColorSync` reads `colorVar` and assigns `--mode-accent: var(<colorVar>)`
on `<html>`. Because the underlying `--color-*` tokens have `.dark` overrides
in `app/styles/tokens.css`, the active mode color auto-swaps light/dark with
no per-component branching.

| Mode | `color` | `colorVar` | Resolved CSS Variable |
|------|---------|------------|-----------------------|
| Ask | `#a8c5e9` | `--color-soft-blue` | `var(--color-soft-blue)` |
| Explore | `#e5c799` | `--color-golden-yellow` | `var(--color-golden-yellow)` |
| Learn | `#aedc93` | `--color-fresh-green` | `var(--color-fresh-green)` |
| Create | `#ffada4` | `--color-warm-coral` | `var(--color-warm-coral)` |

The hex column is sourced from `brandPastelFallbackHexByKey` in
`apps/web/lib/pastel-tokens.ts`. Do not duplicate hex literals at the call
site — import the fallback table.

## Mode Accent Spectrum

The `:root` block in `app/styles/tokens.css` derives an opacity ramp from
`--mode-accent` via `color-mix()`. When you need a state colorway, reach for
the spectrum tokens before recomputing your own ratio.

| Token | Resolved value | Use for |
|-------|----------------|---------|
| `--mode-accent` | full accent (`var(--color-*)`) | Toggle-on, primary borders, send button |
| `--mode-accent-subtle` | `color-mix(in oklch, accent 55%, white\|transparent)` | Resting fills, active chips, tinted cards |
| `--mode-accent-hover` | `color-mix(in oklch, accent 72%–78%, white\|transparent)` | Hover affordances |

In dark mode the second mix variant uses `transparent` (not `white`) so the
tint reads against the AMOLED canvas. That divergence is already baked into
`tokens.css` — you do not branch in components.

## Authoring Patterns

### CSS consumers — pull `var(--mode-accent)`

```css
/* graph-ui.css — pagination active page color */
.table-pagination [data-active] { color: var(--mode-accent) !important; }
```

```tsx
// Component-side: prefer the token over per-mode hex literals
<DataTableRowNumber style={{ color: "var(--mode-accent)" }} />
```

### Components that need every mode color simultaneously

The `PromptBox` toggle row renders four mode chips at once, so it cannot rely
on the active-mode token. It reaches into `MODES` directly.

```tsx
backgroundColor: isActive ? `${config.color}15` : "transparent"
borderColor:     isActive ? config.color : "transparent"
```

### `DARK_ON_COLOR` — the always-dark text rule

When you paint text on a pastel mode-accent background (the prompt submit
button is the canonical case), use the warm off-black constant from
`apps/web/features/graph/lib/brand-colors.ts`:

```ts
export const DARK_ON_COLOR = "#1a1817";
```

```tsx
<SubmitButton
  style={{
    backgroundColor: activeMode.color,
    color: DARK_ON_COLOR,
  }}
/>
```

`var(--foreground)` would render light text on a pastel background in dark
mode and disappear. The constant matches `tokens.css` `--text-primary` (light
mode) and `themeSurfaceFallbackHexByKey.black` in `lib/pastel-tokens.ts`,
both `#1a1817`.

If you want Mantine to make this decision automatically for filled buttons,
turn on `theme.autoContrast = true` (with optional `luminanceThreshold`) in
`lib/mantine-theme.ts` — it auto-picks black or white text per shade. See
`references/mantine-patterns.md`.

## Switching the Mode Color

To change a mode's color you edit one place — the `colorVar` (and its
`color` mirror) inside `MODES` in `apps/web/features/graph/lib/modes.ts`.
Everything downstream — `--mode-accent` spectrum, Cosmograph histogram bars,
filter bars, pagination, data-table row numbers, mode chips — recomputes
because each consumer reads `--mode-accent` (or `MODES[k].color` for the
multi-mode case).

## Key Files

| File | Role |
|------|------|
| `apps/web/features/graph/lib/modes.ts` | Source of truth: `color` + `colorVar` per mode |
| `apps/web/features/graph/components/shell/ModeColorSync.tsx` | Sets `--mode-accent` on `<html>` when active mode changes |
| `apps/web/app/styles/tokens.css` | Defines the `--mode-accent-*` spectrum via `color-mix()`, plus light/dark divergences |
| `apps/web/features/graph/lib/brand-colors.ts` | `DARK_ON_COLOR` and other WebGL-side hex constants |

## Anti-Patterns

| Don't | Do instead |
|-------|------------|
| Hardcode a mode hex inside a CSS-consumer component | `var(--mode-accent)` — auto-set by `ModeColorSync` |
| Recompute `color-mix(... var(--mode-accent) ...)` per component | Use `--mode-accent-subtle` / `--mode-accent-hover` |
| Use `var(--foreground)` for text on a mode-color background | Use `DARK_ON_COLOR` (or `theme.autoContrast`) |
| Branch on `isDark` inside a mode-aware component | The spectrum tokens already swap via `.dark` |
| Add a fifth mode without updating `GraphMode` union, the registry, AND any consumer that iterates `MODE_ORDER` | Walk all three before shipping |
