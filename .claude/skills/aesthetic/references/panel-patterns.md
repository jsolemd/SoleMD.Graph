# Panel Styling Patterns

The canonical panel directory is `features/graph/components/panels/PanelShell/`. Every panel — Info, Prompt, Wiki, Explore data table, RAG response, detail sheets — composes from these exports.

```
PanelShell/
├── PanelShell.tsx              ← outer container component
├── panel-primitives.tsx        ← PanelBody, PanelDivider, PanelInlineLoader, GatedSwitch
├── panel-header-actions.tsx    ← PanelIconAction, PanelScaleControl, PanelWindowActions, PanelHeaderDivider
├── panel-styles.ts             ← every shared style object + panelScaledPx/density helpers
└── index.ts                    ← barrel (one import path: @/features/graph/components/panels/PanelShell)
```

**Always import via the barrel.** Never reach into internal files.

```tsx
import {
  PanelShell,
  PanelBody,
  PanelIconAction,
  panelSurfaceStyle,
  panelTextStyle,
  panelScaledPx,
} from "@/features/graph/components/panels/PanelShell";
```

## Style Objects (from `panel-styles.ts`)

### Surfaces

| Export | Tokens it wires | Use for |
|--------|-----------------|---------|
| `panelSurfaceStyle` | `--graph-panel-bg` / `--graph-panel-shadow` | Docked panels |
| `promptSurfaceStyle` | `--graph-prompt-bg` / `--graph-prompt-border` / `--graph-prompt-shadow` | Floating prompt overlay |
| `panelCardStyle` + `panelCardClassName` | `--graph-panel-input-bg` / `--graph-panel-border` / `rounded-lg px-2 py-1.5` | Neutral card (input-ish) |
| `panelAccentCardStyle` + `panelAccentCardClassName` | `--mode-accent-subtle` / `--mode-accent-border` / `rounded-xl px-3 py-3` | Mode-accent preview |
| `panelAccentCardEntityStyle` + `panelAccentCardEntityClassName` | `color-mix()` of `--entity-accent` (fallback `--mode-accent`) against panel bg/border | Wiki entity profile cards |
| `panelErrorStyle` | `--feedback-danger-bg` / `--feedback-danger-border` | Error surfaces |

### Text tiers

| Export | Color | Size | Use for |
|--------|-------|------|---------|
| `panelTextStyle` | `--graph-panel-text` | 10/14 scaled | Primary body |
| `panelTextMutedStyle` | `--graph-panel-text-muted` | 10/14 scaled | Secondary body |
| `panelTextDimStyle` | `--graph-panel-text-dim` | 10/14 scaled | Tertiary body |
| `panelChromeStyle` | inherit | 9/12 | Chrome labels (titles, section headings) |
| `panelStatValueStyle` | inherit | 11/14 | Stat values |
| `sectionLabelStyle` | `--graph-panel-text-muted` | 9/12 uppercase 0.05em | Uppercase section headers |
| `panelTableHeaderStyle` | `--graph-panel-text-muted` | 9 uppercase 0.03em 600 | Table column headers |

### Pills and badges

| Export | Shape |
|--------|-------|
| `panelPillStyles` | 14×auto, 8px, mode-accent tint — Mantine `Badge` |
| `panelTypePillStyles` | 14×auto, 8px, neutral tint — Mantine `Badge` |
| `interactivePillBase` + `pillActiveColors` / `pillInactiveColors` | Raw-span pills (non-Mantine) |
| `badgeAccentStyles` / `badgeOutlineStyles` | Mantine Badge `styles` presets |

### Switches, selects

| Export | Use for |
|--------|---------|
| `panelSwitchStyles` | 24×12 compact Mantine Switch (label + track + thumb) |
| `switchLabelStyle` | Quick label-only style for simpler switches |
| `panelSelectStyles` | 22px-tall Select/TextInput with dropdown sizing |

### Buttons and icons

| Export | Use for |
|--------|---------|
| `iconBtnStyles` / `panelIconBtnStyles` | Mantine ActionIcon `styles` for toolbar / panel icons |
| `graphControlBtnStyles` | Matte control shell (42px, reads `--graph-control-*`) |
| `nativeIconBtnFrameStyle` + `nativeIconBtnInnerStyle` | Shared 42px frame for non-Mantine controls |
| `disabledNativeIconBtnStyle` | `{ opacity: 0.35, pointerEvents: "none" }` |
| `PANEL_ACCENT` | `"var(--mode-accent)"` for Mantine `color` props |

### Scaling helpers

```ts
panelScaledPx(10);       // → "calc(10px * var(--graph-panel-reading-scale, ...))"
createPanelScaleStyle(1.2);  // → { "--graph-panel-scale": "1.2" }  (panel-local override)
```

Plus `densityCssPx(n)` and `densityCssSpace(lg, sm)` from `@/lib/density` for spacing that only needs `--app-density` scaling (not panel-scale).

Panel-scoped sizing **must** go through `panelScaledPx()`. Raw px bypasses the user's scale control.

## Header Actions (from `panel-header-actions.tsx`)

| Component | Purpose |
|-----------|---------|
| `PanelHeaderActions` | Slot container grouping right-aligned actions |
| `PanelIconAction` | 24px Mantine ActionIcon, transparent variant, `color: var(--graph-panel-text)` |
| `PanelScaleControl` | `±`/reset buttons + scale% readout (`tabular-nums`) |
| `PanelWindowActions` | Pin + close pair, 12px icons |
| `PanelHeaderDivider` | `h-3.5 w-px` rule at `var(--graph-panel-border)` 0.75 opacity |

## Namespace: Docked vs. Prompt

**Intentional split — don't collapse.**

| Namespace | Used by | Elevation |
|-----------|---------|-----------|
| `--graph-panel-*` | Docked panels (Info, Explore, Wiki, Settings) | Subtle shadow, input-bg cards, compact density |
| `--graph-prompt-*` | Floating prompt overlay | Distinct elevation, two-tier shadow, placeholder/inactive tokens, divider accent |

They represent different elevation tiers. The prompt floats over the canvas at its own depth; docked panels sit flush against the canvas chrome.

## Entity Profile Pattern (Wiki)

`features/wiki/components/entity-profiles/` has one component per wiki profile type — `DiseaseProfile`, `ChemicalProfile`, `GeneReceptorProfile`, `AnatomyProfile`, `NetworkProfile`. Each wraps its content in:

```tsx
<div
  className={panelAccentCardEntityClassName}
  data-entity-type={page.entity_type?.toLowerCase()}
  style={panelAccentCardEntityStyle}
>
  {/* profile content */}
</div>
```

How it works:

1. `tokens.css` has `[data-entity-type="disease"] { --entity-accent: var(--wiki-graph-node-diso); }` (and 8 more selectors).
2. `panelAccentCardEntityStyle` uses `color-mix()` to tint the card bg (12%) and border (20%) with `var(--entity-accent, var(--mode-accent))` against the panel surface.
3. The same `--entity-accent` cascades into children for animated scale bars, SVG fills, pill tints.

To add a new entity type:

1. Add the node-color token in `tokens.css` (`--wiki-graph-node-<short>`, mapped to a `--color-semantic-*`).
2. Add the `[data-entity-type="<long>"] { --entity-accent: ... }` selector in `tokens.css`.
3. Update `semanticColorVarNameByKey` in `lib/pastel-tokens.ts` if runtime (WebGL, SVG) consumers need the hex.
4. Add a new profile component in `entity-profiles/` if the type needs a custom layout.

## Example — Minimal Panel

```tsx
import {
  PanelShell,
  PanelBody,
  panelSurfaceStyle,
  panelTextStyle,
  panelTextMutedStyle,
  sectionLabelStyle,
  panelScaledPx,
} from "@/features/graph/components/panels/PanelShell";

export function MyPanel() {
  return (
    <PanelShell
      title="My Panel"
      style={panelSurfaceStyle}
      /* PanelShell already reads --graph-panel-scale */
    >
      <PanelBody>
        <p style={{ ...sectionLabelStyle, marginBottom: panelScaledPx(4) }}>
          Section
        </p>
        <p style={panelTextStyle}>Primary body text.</p>
        <p style={panelTextMutedStyle}>Secondary detail.</p>
      </PanelBody>
    </PanelShell>
  );
}
```

## Anti-Patterns

| Don't | Do instead |
|-------|-----------|
| Inline `{ color: "var(--graph-panel-text)", fontSize: "10px" }` | `panelTextStyle` |
| Hand-roll `backgroundColor: "var(--graph-panel-bg)", boxShadow: "var(--graph-panel-shadow)"` | `panelSurfaceStyle` |
| Duplicate `color-mix()` for `--entity-accent` per profile | `panelAccentCardEntityStyle` |
| Raw `px` font/padding in a panel | `panelScaledPx(n)` / `densityCssSpace(...)` |
| Merge `--graph-panel-*` and `--graph-prompt-*` into one namespace | Keep the two elevation tiers separate |
| Import from `PanelShell/panel-styles.ts` directly | Import from `PanelShell` barrel |
| Glass morphism (blur + transparency) on panel surface | Opaque `--graph-panel-bg` (glass is invisible over WebGL) |
| Hardcode entity type colors | Use `data-entity-type` attribute; tokens do the rest |

## Cosmograph Widget Hosting

Wrap Cosmograph widgets (Timeline, Histogram, SizeLegend) inside a `PanelShell` using Mantine `Stack`/`Group` for layout. CSS vars on the panel cascade into the widget — no inline styles on the widget containers. If a widget needs to diverge from the cascade, override its `--cosmograph-<widget>-*` vars in `tokens.css` `html:root` — not on the component.
