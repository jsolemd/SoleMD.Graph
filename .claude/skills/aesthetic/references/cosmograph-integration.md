# Cosmograph ↔ Mantine CSS Integration

## Cross-Skill Reference

- **CSS tokens & `app/styles/tokens.css`**: /aesthetic skill SKILL.md
- **Mantine layout for wrapping widgets**: /aesthetic → [references/mantine-patterns.md](mantine-patterns.md)
- **Panel styling patterns (PanelShell, shared styles)**: /aesthetic → [references/panel-patterns.md](panel-patterns.md)
- **Cosmograph React props, DuckDB, data flow**: /cosmograph skill

## How It Works

Cosmograph and Mantine are **completely independent CSS systems** that we unify through shared CSS custom properties in `app/styles/tokens.css`. All Cosmograph overrides live in that file's `html:root` (light) and `html.dark` (dark divergences) blocks — not in `app/globals.css`, which is pure import ordering.

```
tokens.css                          Cosmograph Widgets          Mantine Components
┌─────────────────────┐             ┌──────────────────┐       ┌──────────────────┐
│ :root {             │             │ @cosmograph/ui   │       │ @mantine/core    │
│   --surface         │──html:root──│ reads             │       │ reads             │
│   --text-primary    │   override  │ --cosmograph-ui-* │       │ --mantine-color-* │
│   --brand-accent    │             │ base vars         │       │ via createTheme() │
│ }                   │             └──────────────────┘       └──────────────────┘
│ .dark { ... }       │
│ html:root {         │── Cosmograph overrides (specificity 0,1,1)
│   --cosmograph-*    │
│ }                   │
│ html.dark {         │── Cosmograph dark-only overrides
│   --cosmograph-*    │
│ }                   │
└─────────────────────┘
```

### Why `html:root` Instead of `:root`?

Cosmograph's `@cosmograph/ui` package uses `vite-plugin-css-injected-by-js` to inject `<style>` tags at runtime. These styles define dark-themed defaults on `:root` (specificity `0,1,0`). Since the injected `<style>` appears AFTER our stylesheet in document order, Cosmograph's `:root` rules win by source order.

**Fix**: Use `html:root` (specificity `0,1,1` > `0,1,0`) for our overrides in `tokens.css`. This always beats Cosmograph's runtime `:root`.

### Why Not Inline Styles?

Inline styles on the Cosmograph container do NOT reach portaled/detached elements (search dropdown, tooltips). CSS custom property overrides at the document level are the only reliable approach.

### Why Not `MantineProvider.cssVariablesResolver`?

Mantine's `cssVariablesResolver` could theoretically inject `--cosmograph-*` vars. But:
1. It adds React rendering overhead for something that's pure CSS
2. The vars would be injected on `:root` (or `cssVariablesSelector`), still losing to Cosmograph's source order
3. Our current approach (static CSS with `html:root`) is simpler and works perfectly

---

## The 9 Base Variables

Cosmograph defines ~76 CSS variables total. But almost all derive from these 9 base vars. Override the bases, and 67 widget-specific vars update automatically.

| Base Variable | Cosmograph Default | Our Override | Purpose |
|---|---|---|---|
| `--cosmograph-ui-background` | `rgb(45, 49, 58)` | `var(--surface)` | All widget backgrounds |
| `--cosmograph-ui-text` | `#ffffffc7` | `var(--text-primary)` | All widget text |
| `--cosmograph-ui-element-color` | `#5C616A` | `var(--border-default)` | Bars, inactive elements |
| `--cosmograph-ui-highlighted-element-color` | `white` | `var(--brand-accent)` | Active/highlighted elements |
| `--cosmograph-ui-selection-control-color` | `#8d949ea8` | `var(--mode-accent)` | Selection brushes (follows active mode) |
| `--cosmograph-ui-font-family` | `inherit` | `var(--font-sans)` | All widget fonts |
| `--cosmograph-ui-font-size` | `12px` | `calc(11px * var(--app-density))` | Base font size (density-scaled) |
| `--cosmograph-ui-tick-font-size` | `11px` | `calc(10px * var(--app-density))` | Axis tick labels (density-scaled) |
| `--cosmograph-scrollbar-background` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.08)` | Custom scrollbar thumb |

**Key insight**: Cosmograph defaults to dark mode. There is NO built-in light/dark toggle. Our overrides point at semantic tokens (`--surface`, `--text-primary`) that auto-swap via `.dark`, giving us automatic light/dark Cosmograph theming.

---

## Widget-Specific Overrides (Current)

These are widget-specific vars we override because the base derivation doesn't produce the desired result. Listed in `tokens.css` `html:root` block:

### Timeline
```css
--cosmograph-timeline-bar-color: var(--brand-accent-alt);  /* custom brand color, not border-default */
--cosmograph-timeline-font-size: 10px;
```

### Search
```css
--cosmograph-search-background: var(--surface-alt);        /* opaque, not transparent */
--cosmograph-search-list-background: var(--surface);       /* opaque, not rgba(0,0,0,.2) */
--cosmograph-search-list-match-background: var(--interactive-active);
--cosmograph-search-accessors-background: var(--surface-alt);
--cosmograph-search-select-all-background: var(--surface-alt);
--cosmograph-search-select-all-hover-background: var(--interactive-hover);
--cosmograph-search-font-size: 12px;
```

### Color Legend
```css
--cosmograph-color-legend-type-font-size: 11px;
--cosmograph-color-legend-type-others-color: var(--text-tertiary);
```

### Buttons
```css
--cosmograph-button-background: var(--surface);            /* surface, not element-color */
--cosmograph-button-border-radius: 8px;                    /* matches our radius system */
```

### Histogram
```css
--cosmograph-histogram-bar-color: var(--color-soft-blue);  /* brand color */
--cosmograph-histogram-axis-color: rgba(0, 0, 0, 0.15);   /* subtle axis */
```

### Size Legend
```css
--cosmograph-size-legend-form-color: rgba(0, 0, 0, 0.25); /* subtle shape fill */
```

### Popup (Pre-defined for upcoming CosmographPopup widget)
```css
--cosmograph-popup-background: var(--graph-panel-bg);
--cosmograph-popup-border-radius: 12px;
--cosmograph-popup-shadow: var(--graph-panel-shadow);
```
**Note**: These 3 vars are pre-defined for an upcoming CosmographPopup integration. `@cosmograph/cosmograph`'s popup uses hardcoded inline styles, not CSS variables. These only work if manually wired up in our own popup implementation.

### Scrollbar
```css
--cosmograph-scrollbar-background: rgba(0, 0, 0, 0.08);
```

---

## Dark Mode Overrides (`html.dark`)

Only override widget-specific vars that use literal values (not `var()` references to foundation tokens):

```css
html.dark {
  --cosmograph-timeline-axis-color: rgba(255, 255, 255, 0.12);
  --cosmograph-histogram-axis-color: rgba(255, 255, 255, 0.12);
  --cosmograph-histogram-bar-color: #527292;
  --cosmograph-size-legend-form-color: rgba(255, 255, 255, 0.25);
  --cosmograph-scrollbar-background: rgba(255, 255, 255, 0.10);
}
```

Vars that reference foundation tokens (e.g., `var(--surface)`, `var(--brand-accent)`) auto-swap via the `.dark` block — no additional Cosmograph dark override needed.

---

## Complete CSS Variable Taxonomy

73 official `--cosmograph-*` CSS variables extracted from `@cosmograph/ui` v2.1.0 + `@cosmograph/cosmograph` v2.1.0 source (69 from `@cosmograph/ui`, 4 additional search vars from `@cosmograph/cosmograph`). Plus 1 core renderer var and 1 undeclared var consumed by CSS.

### Timeline (9 vars)
| Variable | Default |
|---|---|
| `--cosmograph-timeline-background` | `var(--cosmograph-ui-background)` |
| `--cosmograph-timeline-text-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-timeline-axis-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-timeline-bar-color` | `var(--cosmograph-ui-element-color)` |
| `--cosmograph-timeline-highlighted-bar-color` | `var(--cosmograph-ui-highlighted-element-color)` |
| `--cosmograph-timeline-selection-color` | `var(--cosmograph-ui-selection-control-color)` |
| `--cosmograph-timeline-selection-opacity` | `.5` |
| `--cosmograph-timeline-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-timeline-font-size` | `var(--cosmograph-ui-tick-font-size)` |

### Search (12 vars)
| Variable | Default |
|---|---|
| `--cosmograph-search-background` | `transparent` |
| `--cosmograph-search-text-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-search-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-search-font-size` | `14px` |
| `--cosmograph-search-list-background` | `rgba(0, 0, 0, .2)` |
| `--cosmograph-search-list-font-size` | `13.5px` |
| `--cosmograph-search-list-match-background` | `rgba(255, 255, 255, .2)` |
| `--cosmograph-search-list-match-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-search-accessors-background` | `#8791a159` |
| `--cosmograph-search-select-all-background` | `#ffffff1a` |
| `--cosmograph-search-select-all-color` | `#ffffffbf` |
| `--cosmograph-search-select-all-hover-background` | `#ffffff26` |

### Histogram (9 vars)
| Variable | Default |
|---|---|
| `--cosmograph-histogram-background` | `var(--cosmograph-ui-background)` |
| `--cosmograph-histogram-text-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-histogram-axis-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-histogram-bar-color` | `var(--cosmograph-ui-element-color)` |
| `--cosmograph-histogram-highlighted-bar-color` | `var(--cosmograph-ui-highlighted-element-color)` |
| `--cosmograph-histogram-selection-color` | `var(--cosmograph-ui-selection-control-color)` |
| `--cosmograph-histogram-selection-opacity` | `.5` |
| `--cosmograph-histogram-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-histogram-font-size` | `var(--cosmograph-ui-tick-font-size)` |

### Bars (8 vars)
| Variable | Default |
|---|---|
| `--cosmograph-bars-font-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-bars-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-bars-font-size` | `var(--cosmograph-ui-font-size)` |
| `--cosmograph-bars-ui-font-size` | `11.5px` |
| `--cosmograph-bars-background` | `var(--cosmograph-ui-element-color)` |
| `--cosmograph-bars-bar-height` | `20px` |
| `--cosmograph-bars-bar-bottom-margin` | `2px` |
| `--cosmograph-bars-highlighted-color` | `var(--cosmograph-ui-highlighted-element-color)` |

### Color Legend — Type/Categorical (11 vars)
| Variable | Default |
|---|---|
| `--cosmograph-color-legend-type-font-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-color-legend-type-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-color-legend-type-font-size` | `11px` |
| `--cosmograph-color-legend-type-hover-color` | `var(--cosmograph-ui-highlighted-element-color)` |
| `--cosmograph-color-legend-type-others-color` | `#bab0ab` |
| `--cosmograph-color-legend-type-unknown-color` | _(used in CSS, no declared default)_ |
| `--cosmograph-color-legend-type-bullet-size` | `8px` |
| `--cosmograph-color-legend-type-bullet-radius` | `1rem` |
| `--cosmograph-color-legend-type-items-margin` | `4px` |
| `--cosmograph-color-legend-type-hide-transform` | `translateY(125%)` |
| `--cosmograph-color-legend-type-show-transform` | `translateX(0)` |

### Color Legend — Range/Continuous (11 vars)
| Variable | Default |
|---|---|
| `--cosmograph-color-legend-range-font-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-color-legend-range-font-family` | `var(--cosmograph-ui-font-family)` |
| `--cosmograph-color-legend-range-font-size` | `var(--cosmograph-ui-font-size)` |
| `--cosmograph-color-legend-range-label-font-size` | `var(--cosmograph-ui-font-size)` |
| `--cosmograph-color-legend-range-sublabel-font-size` | `10px` |
| `--cosmograph-color-legend-range-hover-color` | `var(--cosmograph-ui-highlighted-element-color)` |
| `--cosmograph-color-legend-range-gradient-height` | `6px` |
| `--cosmograph-color-legend-range-gradient-radius` | `8px` |
| `--cosmograph-color-legend-range-gradient-top-margin` | `6px` |
| `--cosmograph-color-legend-hide-transform` | `translateY(100%)` |
| `--cosmograph-color-legend-show-transform` | `translateX(0)` |

### Size Legend (10 vars)
| Variable | Default |
|---|---|
| `--cosmograph-size-legend-form-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-size-legend-font-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-size-legend-font-family` | `inherit` |
| `--cosmograph-size-legend-font-size` | `var(--cosmograph-ui-font-size)` |
| `--cosmograph-size-legend-sublabel-font-size` | `10px` |
| `--cosmograph-size-legend-hover-color` | `var(--cosmograph-ui-highlighted-element-color)` |
| `--cosmograph-size-legend-line-radius` | `2px` |
| `--cosmograph-size-legend-line-width` | `30px` |
| `--cosmograph-size-legend-hide-transform` | `translateY(100%)` |
| `--cosmograph-size-legend-show-transform` | `translateX(0)` |

### Button (3 vars)
| Variable | Default |
|---|---|
| `--cosmograph-button-color` | `var(--cosmograph-ui-text)` |
| `--cosmograph-button-background` | `var(--cosmograph-ui-element-color)` |
| `--cosmograph-button-border-radius` | `2px` |

### Scrollbar (1 var)
| Variable | Default |
|---|---|
| `--cosmograph-scrollbar-background` | `rgba(255, 255, 255, .1)` |

### Core Renderer (1 var)
| Variable | Default |
|---|---|
| `--cosmograph-text-color` | `#fff` |

---

## Adding New Cosmograph Widgets

When adding a new Cosmograph sub-component (e.g., `CosmographPopup`):

1. Check if the widget has its own CSS vars by searching `node_modules/@cosmograph/` for `*.css.js` files containing `--cosmograph-{widget}-*`
2. If it uses base vars (`var(--cosmograph-ui-*)`) → it already matches our theme automatically
3. If it has literal defaults (hardcoded hex/rgba values) → add overrides to `tokens.css` `html:root` block
4. Test both light and dark mode
5. Update this reference file with the new widget's vars

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Override every Cosmograph CSS var | Override 9 base vars + divergences only |
| Use inline styles for theming | Use `html:root` in tokens.css |
| Wrap Cosmograph in a Mantine theme div | Cosmograph reads `:root` vars, not scoped elements |
| Use `isDark` ternaries for Cosmograph | Foundation tokens auto-swap via `.dark` class |
| Forget `html.dark` for literal values | Any literal (not `var()`) needs a `.dark` override |
| Use `!important` for Cosmograph overrides | `html:root` specificity is sufficient |
