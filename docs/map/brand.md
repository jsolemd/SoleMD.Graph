# SoleMD.Graph Brand and Aesthetic

> Elegant, precise, calm. Refined medical authority with soft confidence.

Date: 2026-07-10
Scope: Graph field/orb/Cosmograph/wiki product surfaces

The public personal/lecture site has a related but distinct composition. Its
contract lives in `/workspaces/SoleMD.Web/docs/brand.md`. The shared
`aesthetic` skill routes by repository; do not apply Graph panel rules to the
public site.

## Canonical sources

When prose and code disagree, code wins:

- `apps/web/app/styles/tokens.css`
- `apps/web/app/styles/base.css`
- `apps/web/lib/pastel-tokens.ts`
- `apps/web/lib/mantine-theme.ts`
- `apps/web/features/graph/components/panels/PanelShell/`
- `/surface-lab`

`apps/web/app/globals.css` owns cascade order and imports, not token values.

## Shared palette

| Token | Value |
|---|---:|
| Soft blue | `#a8c5e9` |
| Muted indigo | `#747caa` |
| Golden yellow | `#e5c799` |
| Fresh green | `#aedc93` |
| Warm coral | `#ffada4` |
| Soft pink | `#e0aed8` |
| Soft lavender | `#d8bee9` |
| Paper | `#d4c5a0` |
| Teal | `#7ecfb0` |

Pastels retain their light-mode chroma on the dark canvas. Do not maintain a
second desaturated dark palette.

## Semantic foundations

Light mode:

| Token | Value |
|---|---:|
| `--background` | `#faf9f7` |
| `--surface` | `#fffffe` |
| `--surface-alt` | `#f5f4f1` |
| `--surface-raised` | `#ffffff` |
| `--text-primary` | `#1a1817` |
| `--text-secondary` | `#5e5c58` |
| `--border-default` | `#eae8e4` |

Dark mode uses the AMOLED/inky ladder:

| Token | Value |
|---|---:|
| `--background` | `#000000` |
| `--surface` | `#0f1012` |
| `--surface-alt` | `#1a1b1e` |
| `--surface-raised` | `#2a2c30` |
| `--text-primary` | `#e4e6eb` |
| `--text-secondary` | `#aeb1b7` |
| `--border-default` | `#26272b` |

## Graph product grammar

- Matte, opaque panels; no glass panels.
- AMOLED field/canvas with inky elevated surfaces.
- Mostly borderless chrome. Tone, rim light, and shadow establish depth.
- `PanelShell` owns reusable panel surfaces, cards, text, pills, header actions,
  and scale helpers.
- `--app-density` and `--graph-panel-scale` compose through
  `panelScaledPx(...)`; do not hardcode panel dimensions.
- Mode and entity accents are semantic. Components consume tokens instead of
  branching on dark mode or copying hex values.
- Cosmograph CSS widgets derive from the base `--cosmograph-ui-*` variables;
  WebGL props use the mirror constants in `brand-colors.ts`.
- Inter is the primary typeface; JetBrains Mono is reserved for code/data.
- Motion is purposeful float/fade/lift. No bounce, shake, flash, or mandatory
  animation. Reduced motion is first-class.

## Accessibility

- WCAG AA: 4.5:1 for normal text, 3:1 for large text and meaningful UI marks.
- Pastel surfaces generally require dark text in light mode.
- Keyboard navigation and visible focus are required.
- Color never carries meaning alone.

## Stack boundary

Graph currently uses Next 16, React 19.2, Mantine 8, Tailwind 4, and the
`framer-motion` package. The public site uses Mantine 9 and the `motion`
package. Do not copy version-specific provider or component patterns between
the two repositories.
