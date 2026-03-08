# SoleMD Brand & Aesthetic

> Elegant, Precise, Calm. Refined medical authority with soft confidence.
> Think Apple Health meets the New England Journal of Medicine.

## Personality

Premium quality that never shouts. The word "elegant" is intentionally woven throughout the codebase and copy. The graph feels like a **glowing landscape** — inviting, ambient, alive with knowledge. Not a clinical data dashboard. Not enterprise SaaS.

**Anti-references**: Dense medical dashboards, clinical-grey institutional sites, aggressive dark themes.

---

## Design Principles

1. **White space is a feature, not waste.** Generous spacing creates the calm, premium feel. Never compress layouts to "fit more in."
2. **Color communicates meaning.** Each section has a dedicated color that tints the UI. Color is semantic, not decorative.
3. **Motion earns attention.** Animations are soft, purposeful, scroll/interaction-triggered. Float, fade, lift — never bounce, shake, flash.
4. **Depth through layering.** Matte floating cards with deep multi-layer shadows create distinct planes. Cards hover above the canvas.
5. **Accessibility is non-negotiable.** WCAG AA (4.5:1 text, 3:1 large text). Keyboard-navigable. Respect `prefers-reduced-motion`.
6. **Zero chrome.** No sidebar, no nav bar, no hamburger menu. The graph IS the page. The prompt box is the only control.

---

## Aesthetic Principles

- **Matte floating cards** — solid opaque surfaces, NOT glass/frosted/backdrop-blur
- **Deep multi-layer shadows** create the "hovering" depth feel
- **Generous rounding** — `rounded-3xl` on prompt box, `rounded-2xl` on controls, `rounded-xl` on widgets
- **Spring physics everywhere** — shared `PANEL_SPRING` config (`stiffness: 300, damping: 30`)
- **Mode-colored submit** — pastel bg + dark `#1a1b1e` icon
- **Gradient dividers** — brand-accent gradient separators between grouped actions
- **Muted icons at rest** — `--graph-prompt-inactive`, colored accent when active at 15% bg tint
- **Minimalism preferred** — no decorative chrome, no labels where icons suffice

---

## Typography

| Role | Font | Weight Range |
|------|------|-------------|
| All text | Inter | 300–700 |
| Code | JetBrains Mono | 400 |

```css
--font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", Consolas, monospace;
```

Headings: `font-weight: 500`, `line-height: 1.25`. Body: `font-weight: 400`, `line-height: 1.5`.

---

## Color System

### Brand Palette (7 semantic colors)

| Token | Light | Dark | Semantic Role |
|-------|-------|------|---------------|
| `--color-soft-blue` | `#a8c5e9` | `#89a3bf` | Brand primary |
| `--color-muted-indigo` | `#747caa` | `#8b8fbf` | Brand accent |
| `--color-golden-yellow` | `#fbb44e` | `#c9a04e` | Innovation / explore |
| `--color-fresh-green` | `#aedc93` | `#8aad7a` | Education / learn |
| `--color-warm-coral` | `#ffada4` | `#c48e88` | Action / write |
| `--color-soft-pink` | `#eda8c4` | `#b88299` | Contact |
| `--color-soft-lavender` | `#d8bee9` | `#a899b3` | Extended accent |

### Brand Accent

| Context | Light | Dark |
|---------|-------|------|
| `--brand-accent` | `#747caa` (muted indigo) | `#a8c5e9` (soft blue) |
| `--brand-accent-alt` | `#a8c5e9` (soft blue) | `#89a3bf` (muted blue) |

Note: brand-accent **swaps** between light and dark — indigo in light, blue in dark.

### Semantic Foundations

| Token | Light | Dark |
|-------|-------|------|
| `--background` | `#fafafa` | `#18181b` |
| `--foreground` | `#1a1b1e` | `#e4e4e9` |
| `--surface` | `#ffffff` | `#1c1d21` |
| `--surface-alt` | `#f5f6f8` | `#232427` |
| `--text-primary` | `#1a1b1e` | `#e4e4e9` |
| `--text-secondary` | `#5c5f66` | `#a1a1aa` |
| `--text-tertiary` | `#9ca3af` | `#6b6b73` |
| `--border-default` | `#eaedf0` | `#2a2c31` |

### Shadows

Light mode uses subtle rgba shadows. Dark mode uses deep black shadows.

| Token | Light | Dark |
|-------|-------|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.08)` | `0 8px 24px rgba(0,0,0,0.5)` |

### Graph Canvas

| Token | Light | Dark |
|-------|-------|------|
| `--graph-bg` | `#f8f9fa` | `#111113` |
| `--graph-prompt-bg` | `var(--surface)` | `var(--surface)` |
| `--graph-prompt-border` | `var(--border-default)` | `#353840` |
| `--graph-greyout-opacity` | `0.25` | `0.15` |

---

## Motion

- **Framework**: Framer Motion for layout animations, spring physics for panels
- **Spring config**: `PANEL_SPRING = { stiffness: 300, damping: 30 }`
- **Mode transitions**: `layout` animations via framer-motion. Nothing snaps or jumps.
- **Graph transitions**: The canvas component never unmounts — it transforms fluidly
- **Scroll triggers**: Soft reveal on scroll, not auto-playing
- **Reduced motion**: Respect `prefers-reduced-motion` — skip animations, show content immediately

---

## Visual Language (Graph)

Every visual property on the graph encodes information. Nothing is decorative.

| Property | Nodes | Edges |
|----------|-------|-------|
| Size | Importance (citations, mentions) | Evidence weight |
| Color | Type + category | Relationship type |
| Opacity | Relevance to context | Confidence |
| Glow | Semantic similarity | — |
| Position | Embedding proximity | — |
| Style | — | Scientific certainty |

### Edge Semantics

```
━━━▶    affirmed (solid arrow = direction)
· · ·▶  speculative ("may", "could")
━╳━┤    negated (explicitly denied, flat bar = stop)
═⚡═     conflict (papers disagree)

THICK = many papers support
THIN  = single paper
FAINT = low confidence
```

### Position = Semantic Proximity

SPECTER2 positions papers. SapBERT positions entities. MedCPT positions chunks. Clusters form naturally from embedding proximity. Gaps between clusters = unexplored territory.

---

## Design Tone (Summary)

| Quality | Expression |
|---------|-----------|
| Warm | Dense clusters glow, ambient luminosity, pastel palette |
| Organic | Clusters form naturally, positions from embeddings not grids |
| Minimal | Zero chrome, one control (prompt box), panels emerge from interaction |
| Floating | Matte cards hover above canvas, deep shadows, generous rounding |
| Breathing | Smooth spring transitions, no snaps, no jumps |
| Alive | Graph reacts to conversation, typing, hover — it responds to you |

---

## Key Files

| File | Role |
|------|------|
| `app/globals.css` | All design tokens (semantic + graph + Cosmograph, ~280 lines) |
| `lib/mantine-theme.ts` | Mantine ↔ CSS variable bridge |
| `components/mantine-theme-provider.tsx` | `defaultColorScheme="auto"`, DarkClassSync |
| `components/graph/panels/PanelShell.tsx` | Shared panel chrome, `PANEL_SPRING` constant |
| `components/graph/CosmographRenderer.tsx` | `BRAND.light` / `BRAND.dark` WebGL constants |
