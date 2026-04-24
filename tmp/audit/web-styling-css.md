# Audit: web-styling-css

## Inventory

### CSS files (LOC)

Total: **1,764 LOC across 13 files**.

| LOC | Path | Role |
|-----|------|------|
|  18 | `apps/web/app/globals.css` | Entry point: `@layer` order + Tailwind + 10 partials + `@custom-variant dark` |
|  85 | `apps/web/app/styles/base.css` | Reset, body type, scrollbars, view-transition fades, density |
| 399 | `apps/web/app/styles/tokens.css` | `@theme` (Tailwind v4 brand pastels), `:root` semantic tokens, dark overrides, Cosmograph 7-base mapping, entity-type accents |
|  56 | `apps/web/app/styles/entity-highlights.css` | `data-entity-type` mention/link/tiptap highlight surfaces |
| 231 | `apps/web/app/styles/editor.css` | Tiptap create-mode editor + toolbar + source mode |
|  28 | `apps/web/app/styles/vendor-overrides.css` | Cosmograph attribution mark + Mantine Popover/Select/Tooltip overrides |
| 298 | `apps/web/app/styles/graph-ui.css` | Pagination, segmented control, prompt placeholder, `graph-icon-btn`/`panel-icon-btn`, lucide sizing, Cosmograph filter-bars light-mode reskin, entity pill, constellation drift keyframes |
| 138 | `apps/web/app/styles/chrome-surface.css` | Flush↔pill chrome via body class + `@supports (animation-timeline)` scroll-driven |
| 241 | `apps/web/app/styles/wiki-content.css` | Wiki markdown typography, citations, callouts, tables, code |
|  71 | `apps/web/app/styles/wiki-module-content.css` | Embedded wiki module density + search marks |
|  16 | `apps/web/app/styles/viewport-toc-rail.css` | Scroll-progress fill via animation-timeline |
| 139 | `apps/web/features/field/overlay/field-hotspot-ring.css` | Maze hotspot port (`afr-` namespace) — feature-local |
|  44 | `apps/web/features/animations/_templates/route-transition.css` | Template duplicate of base.css view-transition keyframes |

No file exceeds the 600-LOC limit. Largest is `tokens.css` at 399.

### Theme + token files

- `apps/web/lib/mantine-theme.ts` (76 LOC) — `createTheme` with brand/gray tuples, radius ramp, shadow→`var(--shadow-*)`, component defaults (Button/Card/TextInput/Select/Textarea/ActionIcon/Paper/Badge).
- `apps/web/lib/pastel-tokens.ts` (177 LOC) — `brandPastel*`, `extendedPastel*`, `semanticColor*`, `entityType*`, `mantineBrandColorsTuple`, `mantineNeutralColorsTuple`, `themeSurfaceFallbackHexByKey`, `dotTocPastelColorSequence`. Single source of truth for hex↔CSS-var mapping.
- `apps/web/features/graph/lib/brand-colors.ts` (43 LOC) — WebGL-only mirror; explicitly comments "keep in sync with tokens.css".
- `apps/web/features/graph/lib/modes.ts` (142 LOC) — `MODES` registry, references `brandPastel*` keys for color/colorVar.
- `apps/web/features/graph/components/shell/ModeColorSync.tsx` (32 LOC) — writes `--mode-accent: var(<colorVar>)` on `<html>` per mode change.
- `apps/web/app/providers.tsx:48` — `MantineProvider theme={mantineTheme} defaultColorScheme="dark"`.

### Build config

- `apps/web/postcss.config.mjs` — `postcss-preset-mantine` → `postcss-simple-vars` (Mantine breakpoint vars) → `@tailwindcss/postcss`. No standalone `tailwind.config.*` — Tailwind v4 driven from `@theme` in `tokens.css`. Mantine preflight intentionally suppressed (globals.css:4 comment).

## Global CSS architecture review

**Verdict: thin entry point, well-composed.**

`globals.css` is 18 lines and does exactly four things:
1. Declares `@layer theme, base, components, utilities` order (line 1).
2. Imports Tailwind theme + utilities into the right layers (lines 3, 5).
3. Imports 10 partials in deliberate order: tokens → base → entity-highlights → editor → vendor-overrides → graph-ui → chrome-surface → wiki-content → wiki-module-content → viewport-toc-rail.
4. Defines the `dark` custom-variant for Tailwind v4.

Partial order is sound: tokens before consumers, vendor-overrides before feature CSS that depends on Mantine being neutralized, wiki layer last. **No component selectors live in globals.css.** `tokens.css` cleanly separates `@theme` (Tailwind utility generation) from `:root` (runtime semantic tokens) from `.dark` (override-only). Cosmograph theming is contained to one block with the documented "7 base vars" pattern.

The single architectural smell at the entry layer is missing import order documentation in `globals.css` itself — the load order is load-bearing (vendor-overrides before graph-ui so `!important` Mantine kills happen first; chrome-surface before wiki-content) but there's no comment explaining it.

## Critical issues

None. No remote `@import`, no unsafe `url()` against user content, no obvious CSS-injection vector. The `url(#...)` references in feature TSX are SVG fragment IDs, not stylesheet imports.

## Major issues (clean violations)

1. **Duplicate view-transition keyframes** — `apps/web/app/styles/base.css:66-85` and `apps/web/features/animations/_templates/route-transition.css:13-44` both define `solemd-fade-in/out` keyframes plus the `::view-transition-old/new(root)` rules verbatim. The template even has the comment "Apply by importing this CSS from app/template.tsx" but the canonical version already ships globally via base.css. Either delete the template, or convert it into `@keyframes`-free reference doc; right now whichever loads later silently wins.

2. **`html:not(.dark) .graph-filter-bars-widget …` reskin in `graph-ui.css:175-217`** is ~40 lines of Cosmograph-internal class-name overrides (`.scroll-container`, `.highlighted-bars-container`, `.row.selected`, `.bar-highlighted`, `.info > .label`, `.info > .count`). This is feature-specific Cosmograph plumbing, not global UI. It belongs either in `vendor-overrides.css` (alongside the other Cosmograph overrides) or beside the FilterBars feature. Currently it's the largest single block in graph-ui.css and dilutes what should be a "shared icon button + small Mantine knobs" file.

3. **`graph-ui.css` is mixed-purpose** — title is "Graph UI" but it covers (a) DataTable pagination/SegmentedControl Mantine overrides, (b) prompt placeholder, (c) icon-button shells, (d) Cosmograph button-inside-wrapper neutralization, (e) Cosmograph filter-bars reskin, (f) detail-accordion Mantine overrides, (g) graph canvas filter, (h) entity pill, (i) loading-constellation keyframes. At 298 LOC it's still under limit, but the Mantine-specific blocks (lines 4-20, 137-148) belong with vendor-overrides and the constellation keyframes (lines 261-298) belong with the LoadingConstellations feature.

4. **`!important` density in `wiki-module-content.css` (13 instances in 71 LOC)** — the file comments admit they're fighting "SceneSection uses Tailwind py-16/py-24" and Mantine `Card/SimpleGrid/Stack` defaults. This is a specificity war; the cleaner fix is a `compact` prop on the embedded module renderer (or a `data-density="wiki"` attribute the components read) rather than `!important` overrides on every primitive. Currently any change to module section defaults will silently desync this file.

5. **`brand-colors.ts` is a hand-maintained mirror of `pastel-tokens.ts` + `tokens.css`** — `apps/web/features/graph/lib/brand-colors.ts:6` literally relies on `brandPastelFallbackHexByKey['soft-blue']` for ring/default but redefines `bg: "#faf9f7"` (light) and `bg: "#000000"` (dark) as string literals. The light bg here doesn't match `tokens.css:79` (`--background: #faf9f7`) — they currently agree, but neither references the other. WebGL needs hex, but a `getComputedStyle(document.documentElement).getPropertyValue('--background').trim()` once at theme-change time would close the drift hole. At minimum extract these two hex values into `pastel-tokens.ts` so the contract is in one file.

6. **Wiki callout uses a 1px `border` on tinted background (`wiki-content.css:111-116`)** — `.wiki-callout` sets `background-color: var(--mode-accent-subtle); border: 1px solid var(--mode-accent);`. On dark panels this is the exact "hairline outline on dark panel" pattern flagged in `feedback_no_hairline_outlines.md`. Callouts should use rim-light + accent shadow or a thicker accent left-bar (which the danger/warning variants don't carry through anyway). The wiki-link dotted underline (`wiki-content.css:75`) and `--graph-panel-border: rgba(255,255,255,0.08)` 1px usage in `graph-panel-shadow` is on the line — comments at `tokens.css:319-329` claim "no 1px rings" yet `--graph-panel-border` is still defined and consumed by `wiki-content.css:30,173,192,201,233` for borders on dark mode.

7. **Wiki callout-warning/danger lose the colored title — `wiki-callout-title` stays `var(--mode-accent)` (line 134)** while body bg/border switch to `var(--feedback-warning-bg)` / `var(--feedback-danger-bg)`. The title color won't match the variant, producing a mode-blue title on a yellow/red callout. Title color should derive from the variant accent.

## Minor issues

8. **`color-mix(in srgb, ...)` vs `in oklch, ...)` is mixed** — `tokens.css` uses `oklch` for the mode-accent ramp (lines 161-162, 376-377) which is correct for perceptual uniformity, but `srgb` for entity highlights (`entity-highlights.css:8,12,30`) and feedback states (`tokens.css:182-186`). Pick one per category and document why; mixing creates uneven perceived saturation when entity color and mode color sit side by side.

9. **`transition: all 200ms ease` on Mantine Button (`mantine-theme.ts:48`)** — `transition: all` is the standard footgun (animates layout properties, fights `transform`, kills paint perf). Restrict to `background-color, color, box-shadow`.

10. **Two scrollbar systems coexist in `base.css`** — `.thin-scrollbar` (lines 40-46) and the global `*::-webkit-scrollbar { width: 0 }` (lines 56-58). The global rule then needs an opt-out via `.thin-scrollbar` *and* the `tiptap-create .tiptap` and `tiptap-source` rules in `editor.css:120-126,222-227` (which mirror `.thin-scrollbar` because Tiptap's auto-rendered element can't take the class). Centralize: either expose `.thin-scrollbar` as a `@mixin`-equivalent (a CSS layer or class applied via JS), or accept and document that any new scroll surface must pick `.thin-scrollbar` explicitly. The Tiptap mirror is duplicate logic that will drift.

11. **Constellation keyframes (`graph-ui.css:265-298`) are 34 LOC of feature-specific motion** dumped in graph-ui.css. Move to a feature-local file (matches the pattern in `field-hotspot-ring.css`).

12. **`graph-ui.css:160-163` `[data-graph-canvas] canvas { filter: ... }`** has a useful comment about z-index compensation, but this rule is untouched by `@layer` — it's a global selector against any matching element. Scope to the panel layer or document why the layer-bypass is intentional.

13. **`vendor-overrides.css` is 28 LOC and underused** — it's the obvious home for the Mantine Accordion/SegmentedControl/pagination/Tooltip/Popover overrides currently scattered across `graph-ui.css`. Consolidating would shrink graph-ui.css ~30%.

14. **No mobile-specific styles in any partial** — search across `app/styles/` shows no `@media (max-width:` or `@media (hover: hover)` outside graph-ui.css icon buttons. Either responsive lives entirely in component Tailwind classes (likely, given Tailwind v4 + Mantine breakpoints) — confirm and document — or mobile is currently shrunk-desktop. Worth a follow-up sweep.

15. **`route-transition.css` template lives under `_templates/`** but there's no contract file describing when to import it vs. when base.css already covers it. Either remove the template (already redundant) or replace its content with a one-liner pointing to base.css.

16. **Density token `--app-density` is consumed in 60+ places** but the only ramp is `0.8` baseline (`tokens.css:62`) with no documented user override. If density is one knob, it's effectively a magic number; if it's user-adjustable, surface that in the chrome.

17. **`tokens.css:282-309` warm-vs-cool dark text claim** — `--text-primary: #E4E6EB` (R≈228, G≈230, B≈235) is correctly cool (B>R by 7), and `--text-secondary: #AEB1B7` is also cool. Aligns with `feedback_dark_palette_direction.md`. But `DARK_ON_COLOR = "#1a1817"` (`brand-colors.ts:35`) is warm-off-black (R≈26, G≈24, B≈23 → R>B) and is used as text-on-pastel in WebGL. The comment even calls this out as warm — re-evaluate vs cool-neutral guidance, even acknowledging it's overlaid on tinted pastels.

## Token / brand-color centralization audit

**What's centralized correctly:**

- All 9 brand pastel hexes live exclusively in `pastel-tokens.ts:17-27` and `tokens.css:5-14` (these two files are the authoritative pair, intentionally mirrored — `tokens.css:76` carries the "WebGL mirror: lib/graph/brand-colors.ts — keep in sync" comment).
- Semantic entity colors flow `tokens.css @theme` → `:root` (`--wiki-graph-node-*`) → `[data-entity-type]` cascade → `--entity-accent` consumed in `entity-highlights.css`. One write site per token.
- Mantine shadows reference `--shadow-sm/md/lg` (`mantine-theme.ts:38-43`). Mantine radius matches `--radius-surface*` ramp by value (no `var()` though — see opportunity #2 below).
- Mode accent is the textbook centralization story: `MODES` registry → `ModeColorSync` writes `--mode-accent` on `<html>` → consumers use `var(--mode-accent)` or the OKLCH-mixed `--mode-accent-subtle/-hover` derivatives.

**Drift risks:**

- `brand-colors.ts:6` redefines `bg: "#faf9f7"` (light) and `bg: "#000000"` (dark) as string literals not sourced from `pastel-tokens.ts`. These match `tokens.css:79,294` today by manual coordination only.
- `themeViewportColorByScheme` (`pastel-tokens.ts:35-38`) defines `light: "#f8f9fa"` and `dark: "#0a0a0f"` — neither matches `tokens.css` `--background` for either theme (`#faf9f7` light, `#000000` dark). Either intentional (separate use) or bug — needs comment.
- `mantineNeutralColorsTuple` (`pastel-tokens.ts:53-64`) is a hand-tuned 10-step gray scale with no relationship to the foundation tokens (`--surface`, `--surface-alt`, `--text-*`, `--border-*`). If a designer tweaks foundations, neutral tuple silently drifts.
- Mantine `radius` (`mantine-theme.ts:28-34`) duplicates token values: Mantine `xl: "1.5rem"` vs token `--radius-surface-lg: 1.5rem`. Should reference the var: `xl: "var(--radius-surface-lg)"`.
- `pastel-tokens.ts:67-69` `themeSurfaceFallbackHexByKey.black = "#1a1817"` matches `DARK_ON_COLOR` (`brand-colors.ts:35`) — same warm-off-black redefined twice, neither in `tokens.css`.

## Reuse / consolidation opportunities

1. **Move all Mantine component overrides to `vendor-overrides.css`** — pagination (`graph-ui.css:4-9`), SegmentedControl (`graph-ui.css:12-20`), detail-accordion (`graph-ui.css:137-148`), and the Cosmograph filter-bars block (`graph-ui.css:175-217`). Result: graph-ui.css shrinks to ~120 LOC of just shared `.graph-icon-btn`/`.panel-icon-btn` shell + entity pill + canvas filter + constellation drift; vendor-overrides.css becomes the single "third-party kill switch" file.

2. **Mantine theme references token vars directly** — `mantine-theme.ts` already does this for shadows; extend to radius (use `var(--radius-surface*)`) and component-specific colors. Eliminates the parallel scale.

3. **Extract canvas-bg + viewport-bg hexes into `pastel-tokens.ts`** — single export consumed by `brand-colors.ts` and verified at build/test time against `tokens.css` foundation values. Closes the silent-drift hole in major #5.

4. **Wiki callout variants share structure with feedback states** — `tokens.css:182-187,385-390` already define `--feedback-warning-bg/border` and `--feedback-danger-bg/border`. Add `--feedback-info-bg/border` (mode-accent-derived) so `.wiki-callout` (info), `.wiki-callout--warning`, `.wiki-callout--danger` use the same `var()` pair structure with no border-color hardcoded to `var(--mode-accent)`. Also fixes the variant-title-color bug (#7).

5. **Tiptap scrollbar dedupe** — `editor.css:120-126,222-227` mirrors `.thin-scrollbar`. Tiptap renders into a known DOM hook; add the class via `editorProps.attributes.class` rather than restating the rules.

6. **`route-transition.css` collapse** — base.css already ships the keyframes globally; delete the template or convert to a `<!-- see base.css -->` doc note. Saves 44 LOC and removes the silent collision risk.

7. **Cluster constellation drift into a feature partial** matching `field-hotspot-ring.css` (already feature-local under `features/field/overlay/`). Pattern: motion-heavy decorative keyframes belong with the feature owning them.

8. **`--graph-panel-border` rename or removal** — comments at `tokens.css:323-329` say "no 1px rings — hairlines read as a border and are avoided", yet `wiki-content.css` uses this token for table cells, code blocks, and `<hr>`. Either rename to `--graph-rule-color` (its actual use is rules and tonal dividers, not panel borders), or document that the "no hairlines" rule is panel-only.

## What's solid

- `globals.css` is genuinely thin (18 LOC). Layer order declared up front. No component CSS leaked here.
- `tokens.css` foundations → derived → Cosmograph → entity-type pattern is textbook. The `:root` block resolves to dark-mode by overriding only foundations, exactly as the comment claims (line 274).
- `.dark` overrides honor the cool-neutral dark-palette guidance (`feedback_dark_palette_direction.md`): `--text-primary: #E4E6EB` is B>R by 7. Foundations comment correctly calls out "Inky Meta ladder (B > R by ~2)".
- AMOLED panel elevation explicitly avoids hairline rings (`tokens.css:323-329` comment) and uses rim-light + halo + offset, matching `feedback_no_hairline_outlines.md`. The two stacked omnidirectional white halos pattern is documented.
- ModeColorSync writes one CSS var on `<html>`; all mode-aware components consume `var(--mode-accent)` derivatives. This is the canonical centralization story.
- Cosmograph theming hits the documented "7 base vars" + per-widget divergence pattern (`tokens.css:202-254`) — minimal override surface, comment explains specificity.
- Reduced-motion guards present in `base.css:80`, `chrome-surface.css:130`, `field-hotspot-ring.css:128`, `graph-ui.css:294`. Consistent.
- `entity-highlights.css` correctly uses `color-mix()` at use-site (rather than precomputing) so `[data-entity-type]` overrides cascade — comment at `tokens.css:127` calls this out.
- No `1px solid rgba(255,255,255,...)` outlines on actual panels (the only rgba(255,255,255,0.08) usage is for `--graph-panel-border` consumed in `--graph-panel-shadow` and wiki rule-borders — borderline but defended).
- No remote `@import`, no `url()` ingesting user content, no inline `<style>`-injected runtime CSS in tokens.

## Recommended priority (top 5)

1. **Delete or collapse `route-transition.css`** — duplicates `base.css` keyframes verbatim and silently fights for cascade. 5-minute fix that removes a real footgun (major #1).

2. **Move all Mantine + Cosmograph DOM-class overrides to `vendor-overrides.css`** — the filter-bars block, pagination, SegmentedControl, accordion. Shrinks `graph-ui.css` ~40%, makes "where does this third-party override live" answer single-file (major #2/3, opportunity #1).

3. **Fix wiki callout variants** — title color must follow variant accent; warning/danger should expose `--feedback-*-text` and use the same token-pair pattern as info. While there, audit the `border: 1px solid var(--mode-accent)` line against the no-hairline rule (major #6/7, opportunity #4).

4. **Close the `brand-colors.ts` ↔ `tokens.css` drift hole** — extract canvas/viewport hex values into `pastel-tokens.ts` so WebGL constants source from the same module as Mantine and CSS-var fallbacks (major #5, opportunity #3). Simultaneously decide whether `themeViewportColorByScheme` (currently disagrees with `--background`) is a bug or a separate token.

5. **De-`!important` `wiki-module-content.css`** — replace specificity wars with a `compact` prop or `data-density` attribute on the embedded module renderer (major #4). Currently 13 `!important` in 71 LOC; any change to module section defaults silently desyncs.
