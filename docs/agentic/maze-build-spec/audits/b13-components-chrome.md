# B13 audit — Component registry (`Rg` / `xy` / `yy`) + chrome vs. SoleMD chrome

**Auditor**: Agent 11
**Subsystem**: Bucket B13 — Component registry + chrome components (Header, Progress, SwiperSlider + 8 non-homepage)
**Maze lines audited**: [55180, 55283] (registry) + [55043, 55132] (`Cg` Header class) + [53996, 54050] (`wg` SwiperSlider class)
**SoleMD files audited**:
- `apps/web/features/graph/components/chrome/ChromeBar.tsx`
- `apps/web/features/graph/components/chrome/BrandWordmarkButton.tsx`
- `apps/web/features/graph/components/chrome/Wordmark.tsx`
- `apps/web/features/graph/components/chrome/ModeToggleBar.tsx`
- `apps/web/features/graph/components/chrome/ThemeToggle.tsx`
- `apps/web/features/graph/components/chrome/TimelineBar.tsx`
**Cross-references**: B12 (Progress controller `gg`) is audited separately by Agent 10 — this audit treats `Progress` as a registry *entry* only and does not re-audit the class body.
**Date**: 2026-04-19

## Summary

Maze's component registry (`Rg` / `xy` / `yy`) is a DOM-scan attach pattern: the app shell instantiates `Rg`, which queries `document.querySelectorAll("[data-component]")`, looks up each value in the `xy` class map, news up an instance per node, and threads lifecycle (`init` / `onState` / `animateIn` / `animateOut` / `resize` / `destroy` / `onComponentChange` via `ul.CHANGE`). `yy` is a page-class registry with a single entry (`Page: Rg`) so the AJAX navigation shell can swap page classes.

SoleMD has **no equivalent** DOM-scan registry. React component trees replace the `[data-component]` → class map — the chrome surface is composed by `Wordmark.tsx` rendering `BrandWordmarkButton` + `ChromeBar`, and `ChromeBar` renders `ThemeToggle`, `TimelineBar`, and inline pill/tray menus directly. The registry pattern itself is a **sanctioned architectural deviation**: Next.js App Router + React composition replaces Maze's AJAX-swap + DOM-scan runtime (this is the same architectural boundary documented in B2's app-shell audit).

Of the 11 `xy` component classes, only **3 are homepage-active** (`Header`, `Progress`, `SwiperSlider`). The other 8 (`FormsPagination`, `ArticleNav`, `Product`, `Load`, `Sort`, `More`, `Toggle`, `ShareArticle`) are non-homepage components belonging to Maze's blog / article / product-listing routes — all are **sanctioned omissions** for SoleMD's homepage parity scope.

Within the 3 homepage-active entries:
- **`Header` (`Cg`)** drifts structurally from SoleMD chrome. Maze's `Cg` is a single horizontal nav with a sliding underline tied to `.js-item a` hover / active state and pathname matching. SoleMD's chrome is a very different surface: two right-top icon pills (content + mode menus), a left-top brand wordmark button, a theme toggle, and a bottom-edge timeline bar. There is **no structural 1:1** — this is a sanctioned product divergence (SoleMD is a graph UI, not a marketing site), not a bug.
- **`Progress` (`gg`)** — registry entry only; class body audited by Agent 10 (see `b12-progress.md`). Registry-level integration is parity.
- **`SwiperSlider` (`wg`)** — has **no SoleMD counterpart**. The Maze class wraps a Swiper.js carousel with nav buttons and keyboard/touch support. SoleMD's chrome does not include a slider. This is a **sanctioned omission** because (a) the homepage slider in Maze is a marketing content carousel (screenshots / testimonials band, line 976 `.m-slider__inner`), and (b) SoleMD's graph UI does not have a marketing content band. Document this as a sanctioned deviation in the build spec rather than rebuilding.

## Parity overview

| Behavior / surface                                       | Maze line         | SoleMD location                                                    | Ownership          | State                            |
| -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ | ------------------ | -------------------------------- |
| Component registry class `Rg` (Ll subclass)              | 55180–55269       | *none — replaced by React composition*                             | architectural      | sanctioned deviation             |
| Component class map `xy` (11 entries)                    | 55270–55282       | *none — Next.js route segments + component imports*                | architectural      | sanctioned deviation             |
| Page-class registry `yy` (1 entry: `Page`)               | 55283             | *none — Next.js App Router pages*                                  | architectural      | sanctioned deviation             |
| `buildComponents()` DOM scan + instantiate               | 55244–55262       | *none — JSX tree renders components directly*                      | architectural      | sanctioned deviation             |
| `preload()` (img.preload warmup via `th.preload()`)      | 55192–55196       | Next.js `<Image>` + route-level preload                            | delegated to shell | sanctioned deviation             |
| `onState()` propagation to children                      | 55197–55204       | React re-render via store subscriptions (Zustand)                  | delegated to store | sanctioned deviation             |
| `animateIn()` / `animateOut()` (0.6s GSAP opacity fade)  | 55205–55232       | Framer `AnimatePresence` in panels / chrome pills                  | delegated          | sanctioned deviation             |
| `onComponentChange` → `ul.CHANGE` trigger                | 55184–55187       | *none — React reconciliation handles tree updates*                 | architectural      | sanctioned deviation             |
| `data-options` JSON parse for per-instance config        | 55251             | *none — props passed through JSX*                                  | architectural      | sanctioned deviation             |
| Header class `Cg` (`.js-header`, sliding underline)      | 55043–55132       | `ChromeBar.tsx` + `BrandWordmarkButton.tsx` + `ModeToggleBar.tsx`  | product divergence | sanctioned deviation             |
| `Cg.findCurrentItem()` (pathname-matching active link)   | 55066–55072       | `useGraphModeController` + `ModeToggleBar` active-mode highlight   | analogue           | parity-adjacent (different mechanism) |
| `Cg.updateUnderlinePosition()` (GSAP underline slide)    | 55073–55082       | *none* — SoleMD active mode uses background fill + expand-label    | product divergence | sanctioned deviation             |
| `Cg` resize listener (debounced underline reposition)    | 55109–55114       | Mantine / Framer handle resize; no manual listener needed          | delegated          | parity-adjacent                  |
| Progress class `gg` (registry entry only)                | 55272             | `FieldStoryProgress.tsx` (see b12 audit)                    | Agent 10 audit     | *see b12-progress.md*            |
| SwiperSlider class `wg` (Swiper.js carousel wrapper)     | 53996–54050       | *none*                                                             | product divergence | sanctioned omission              |

## Drift items

### D1. No DOM-scan component registry in SoleMD

- **Maze reference**: scripts.pretty.js:55180–55283 (`Rg` class + `xy` map + `yy` page-class registry)
- **SoleMD location**: no equivalent. Chrome composition is direct JSX: `Wordmark.tsx` → `BrandWordmarkButton` + `ChromeBar`, and `ChromeBar` → `ThemeToggle` + pills + tray menus + `TimelineBar`.
- **Drift**: Maze's `Rg` is a runtime DOM-scan attach mechanism (`document.querySelectorAll("[data-component]")` at construction) paired with a class-map `xy` for lookup. It exists because Maze's app shell `by` uses AJAX swap + manual DOM mount cycles — the registry gives every page a uniform way to attach JS behavior to freshly swapped HTML. SoleMD uses Next.js App Router (React Server Components / client components); component attach is compile-time JSX, not runtime DOM scan.
- **Severity**: Delegated (sanctioned deviation)
- **Proposed fix**: None. Build spec should state explicitly that the `Rg` / `xy` / `yy` registry pattern is replaced wholesale by Next.js App Router + React composition. No runtime `[data-component]` scan is to be introduced on SoleMD surfaces. Related pattern — `[data-gfx]` + controller registry `jx` — is a separate audit (Agent 3 / B7); that pattern *is* recommended for port because the field controllers are DOM-anchored, unlike generic chrome.
- **Canonical reference**: `.claude/skills/module/SKILL.md` (React composition owns chrome); catalog § B2 / B13 cross-edge.
- **Verification**: Confirm no file in `apps/web/features/graph/components/chrome/` runs `document.querySelectorAll("[data-component]")`. (Confirmed: none does.)

### D2. Header (`Cg`) structural divergence — sliding underline vs. pill+tray chrome

- **Maze reference**: scripts.pretty.js:55043–55132 (`Cg` class extends `Ei`). Body: queries `.js-wrap` + `.js-underline` inside `.js-header`, binds mouseenter/mouseleave/click on `.js-item a` children, animates a visible `.js-underline` span via `gsap.to(underline, { left, width })`, and uses `window.location.pathname` to find the active item on load / route change.
- **SoleMD location**: `ChromeBar.tsx` (513 lines, top-right two-pill structure with tray menus), `BrandWordmarkButton.tsx` (top-left brand button), `Wordmark.tsx` (orchestrator), `ModeToggleBar.tsx` (graph mode toggle — note this is not rendered inside the top chrome; it's a separate surface gated by prompt state).
- **Drift**: Maze's `Cg` is a **single horizontal pathname-driven nav bar** (think marketing-site top nav: Home / Product / Pricing / Blog). SoleMD's chrome is a **graph-UI toolbar** with iconography (panel openers, timeline, table, theme, View/Display/Selection/Chrome menus). The surfaces serve fundamentally different products. The "active item" concept in Maze (pathname match) has a loose SoleMD analogue in `ModeToggleBar`'s active-mode state, but the mechanism (underline slide on hover/active) has no SoleMD counterpart and shouldn't have one — SoleMD uses `backgroundColor: var(--mode-accent-subtle)` fill + `aria-pressed` for active, and Framer `AnimatePresence` for the expanding label width.
- **Severity**: Delegated (sanctioned product divergence)
- **Proposed fix**: Build spec should state: "SoleMD chrome is a graph-UI toolbar, not a marketing nav. Maze's `Cg` sliding-underline nav is not to be ported; SoleMD's active-mode highlight lives in `ModeToggleBar` (background fill + expand-label) and `aria-pressed` state on pill buttons in `ChromeBar`." If any future SoleMD surface needs a marketing-style nav (e.g., a landing page route), treat that as a greenfield component, not a port of `Cg`.
- **Canonical reference**: `apps/web/features/graph/components/chrome/ChromeBar.tsx` JSDoc ("Top-right chrome bar — identical structure across mobile and desktop...").
- **Verification**: Confirm no underline sliding element exists in SoleMD chrome. (Confirmed: none.)

### D3. SwiperSlider (`wg`) has no SoleMD counterpart

- **Maze reference**: scripts.pretty.js:53996–54050 (`wg` class extends `Ei`). Wraps Swiper.js with `slidesPerView: "auto"`, loop option, 600ms speed, next/prev buttons via `.js-slider-button-{next,prev}` selectors, keyboard support. Instantiated on `data-component="SwiperSlider"` at `index.html:976` — a content module in story 3 (marketing carousel band).
- **SoleMD location**: none.
- **Drift**: No equivalent component or surface. SoleMD is a graph UI, not a marketing site with testimonial / screenshot carousels.
- **Severity**: Delegated (sanctioned omission)
- **Proposed fix**: None. Build spec should record this as a sanctioned omission with rationale: "Maze's SwiperSlider is a homepage marketing carousel; SoleMD's homepage is graph-focused and has no content band that demands a carousel. If a future SoleMD route needs a carousel, introduce it as a greenfield component (Embla / Swiper / pure CSS scroll-snap — decision deferred to product scope at that time)."
- **Canonical reference**: catalog § B13 Open Question #1.
- **Verification**: N/A (no implementation to verify).

### D4. Progress (`gg`) registry entry — cross-reference only

- **Maze reference**: scripts.pretty.js:55272 (`Progress: gg` in `xy` map). Class body at 50178–50255.
- **SoleMD location**: `apps/web/features/field/FieldStoryProgress.tsx`.
- **Drift**: Not re-audited here. See Agent 10 output at `docs/agentic/maze-build-spec/audits/b12-progress.md` for the progress-controller parity audit. Registry-level note: in Maze, `Progress` is instantiated twice (index.html:323, 718 — both story chapters). SoleMD's React tree renders `FieldStoryProgress` at the appropriate surface positions via JSX composition rather than DOM scan. The instantiate-twice behavior is preserved structurally (one render per chapter) but via React, not registry scan.
- **Severity**: Cross-reference (delegated to Agent 10)
- **Proposed fix**: See `b12-progress.md`.
- **Canonical reference**: `b12-progress.md`.
- **Verification**: See `b12-progress.md`.

### D5. Non-homepage component slots (8 entries) are sanctioned omissions

Each of the 8 non-homepage `xy` entries maps to Maze routes outside the homepage scope. All are **sanctioned omissions** for SoleMD homepage parity.

| `xy` key          | Maze class | Purpose (inferred from name + Maze route context)                           | SoleMD disposition |
| ----------------- | ---------- | --------------------------------------------------------------------------- | ------------------ |
| `FormsPagination` | `fg`       | Multi-step form pagination (likely contact / demo-request form)             | sanctioned omission — no multi-step forms on homepage |
| `ArticleNav`      | `pg`       | Blog/article in-page nav (section anchors, sticky TOC)                      | sanctioned omission — no article routes in scope      |
| `Product`         | `Sg`       | Product-listing page behavior (filter/sort/display)                         | sanctioned omission — no product-listing routes       |
| `Load`            | `Mg`       | "Load more" button for paginated lists                                      | sanctioned omission — no paginated lists on homepage  |
| `Sort`            | `Tg`       | Client-side list sort control                                               | sanctioned omission — no sortable lists on homepage   |
| `More`            | `mg`       | Generic "show more" reveal control (FAQ-style or truncated copy)            | sanctioned omission — pattern unused in SoleMD chrome |
| `Toggle`          | `Eg`       | Generic toggle (accordion / expand-collapse)                                | sanctioned omission — SoleMD uses Mantine collapsible |
| `ShareArticle`    | `Ag`       | Social-share buttons for article pages                                      | sanctioned omission — no article routes in scope      |

None of these are required for **broader parity** either, because SoleMD's product surface (graph UI + future learn modules + wiki panel) is architecturally distinct from Maze's blog / product-listing / form-based site structure. Any future SoleMD route that needs one of these behaviors should introduce a greenfield React component rather than porting the Maze class.

## Sanctioned deviations encountered

1. **Registry-pattern replaced by React composition.** Maze's `Rg` / `xy` / `yy` runtime DOM-scan pattern exists because of AJAX page-swap. SoleMD uses Next.js App Router. **Sanctioned: yes**, via the B2 app-shell audit and project architecture (Next.js replaces AJAX nav wholesale). No runtime `[data-component]` scan on SoleMD chrome.

2. **Header (`Cg`) → graph-UI toolbar.** Maze's sliding-underline horizontal nav is a marketing-site pattern; SoleMD's chrome is a graph-UI toolbar with icon pills, tray menus, and mode toggles. **Sanctioned: yes**, via product scope (graph UI ≠ marketing site). Do not port the underline mechanism.

3. **SwiperSlider (`wg`) has no homepage surface in SoleMD.** Maze's slider is a marketing carousel band; SoleMD's homepage does not include a marketing content band. **Sanctioned: yes**, via product scope.

4. **The 8 non-homepage components are out of scope.** They belong to Maze's blog / product / form routes. SoleMD has none of those routes in the homepage parity scope. **Sanctioned: yes**, via scope boundary — each is a pattern to keep in mind if a future SoleMD route needs it, not a component to port now.

5. **`preload()` (`th.preload(img.preload)`) is delegated.** SoleMD uses Next.js `<Image>` + route-level preload primitives. **Sanctioned: yes**, via Next.js framework.

6. **`onComponentChange` / `ul.CHANGE` event model.** Maze uses an `Ll`-based event emitter to signal children when DOM is swapped. SoleMD uses React reconciliation + Zustand store subscriptions. **Sanctioned: yes**, via architecture.

## Answer to catalog Open Question #1 — component 1:1 vs. sanctioned

> "Maze's `xy` registers `Header`, `Progress`, `SwiperSlider` plus 8 non-homepage components (`FormsPagination`, `ArticleNav`, `Product`, `Load`, `Sort`, `More`, `Toggle`, `ShareArticle`). SoleMD likely has a different chrome structure; the build-spec should document which Maze components map 1:1 and which are sanctioned deviations (e.g., SoleMD may use Next.js route segments instead of a `SwiperSlider` pattern)."

**Answer (for build-spec lock-in):**

| Maze `xy` entry    | Maze class | Homepage-active | SoleMD counterpart                                             | Disposition                         |
| ------------------ | ---------- | :-------------: | -------------------------------------------------------------- | ----------------------------------- |
| `Header`           | `Cg`       | yes             | `ChromeBar.tsx` + `BrandWordmarkButton.tsx` + `Wordmark.tsx` + `ModeToggleBar.tsx` + `ThemeToggle.tsx` + `TimelineBar.tsx` | **sanctioned product divergence** — graph-UI toolbar, not marketing nav; no underline port |
| `Progress`         | `gg`       | yes (x2)        | `FieldStoryProgress.tsx`                                | **~1:1 port** (see b12 audit)       |
| `SwiperSlider`     | `wg`       | yes             | *none*                                                         | **sanctioned omission** — no marketing carousel on SoleMD homepage |
| `FormsPagination`  | `fg`       | no              | *none*                                                         | **sanctioned omission** — no multi-step forms in scope |
| `ArticleNav`       | `pg`       | no              | *none*                                                         | **sanctioned omission** — no article routes in scope |
| `Product`          | `Sg`       | no              | *none*                                                         | **sanctioned omission** — no product-listing routes |
| `Load`             | `Mg`       | no              | *none*                                                         | **sanctioned omission** — no paginated lists   |
| `Sort`             | `Tg`       | no              | *none*                                                         | **sanctioned omission** — no sortable lists    |
| `More`             | `mg`       | no              | *none*                                                         | **sanctioned omission** — pattern unused       |
| `Toggle`           | `Eg`       | no              | *none* (Mantine `Collapse` used when needed)                   | **sanctioned omission** — Mantine primitive suffices |
| `ShareArticle`     | `Ag`       | no              | *none*                                                         | **sanctioned omission** — no article routes    |
| `Rg` (page class in `yy`) | `Rg` | n/a             | *none — Next.js App Router pages*                              | **sanctioned architectural deviation** |

**Bottom line**: of 11 `xy` entries, **1 has a ~1:1 port** (Progress, owned by Agent 10), **1 is a sanctioned product divergence** with a SoleMD analogue of different shape (Header → graph-UI chrome), and **9 are sanctioned omissions** with no SoleMD counterpart (either out-of-scope routes or replaced by framework primitives / React composition).

## Open questions for build-spec synthesis

1. **Mode-active highlight parity**: Maze's `Cg` uses a sliding underline tied to `window.location.pathname`. SoleMD's closest analogue is `ModeToggleBar`'s active-mode background fill. These serve different concepts (Maze: route-level nav; SoleMD: intra-page mode switch). Build spec should record that SoleMD has **no pathname-driven top-nav** surface — if one is ever added, it's greenfield, not a `Cg` port.

2. **Future carousel needs**: If a SoleMD route ever needs a carousel (e.g., learn-module gallery, wiki image strip), does it port `wg` or introduce a greenfield Embla / CSS scroll-snap component? Recommend **greenfield** — `wg` depends on Swiper.js and Maze's `Vl` / `hy` / `uy` module layout, which is heavier than SoleMD's typical need. Defer the decision until the concrete surface exists.

3. **Data-options JSON config**: Maze uses `data-options='{"loop": true}'` on DOM nodes to pass config to component instances (line 55251). SoleMD passes props via JSX. This is architecturally handled, but the build spec should note: when porting behaviors that consume `data-options` in Maze, the SoleMD equivalent passes props + stores state in Zustand, not in DOM dataset attributes.

4. **Preload warmup**: Maze's `Rg.preload()` calls `th.preload(img.preload)` before animating in. SoleMD uses Next.js `<Image>` priority + route-level preload. Build spec should confirm: no manual `imagesLoaded`-style preload step is required on SoleMD chrome.

5. **`animateIn` / `animateOut` envelope**: Maze fades the entire registry view (`this.view.style.opacity`) over 0.6s on page in/out (lines 55212–55217, 55223–55228). SoleMD's page transitions are handled by Next.js App Router + Framer `AnimatePresence` in panels. Build spec should record whether the 0.6s full-page fade is to be reproduced globally (it currently isn't — SoleMD transitions are more surgical).

## Scope discoveries (Phase 1 re-slicing signal)

Bucket scope is correct. B13 covers the registry shape + Header/Progress/SwiperSlider surface. The registry body is self-contained at [55180, 55283]; `Cg` and `wg` class bodies are immediately adjacent ([55043, 55132] and [53996, 54050] respectively). `Progress`'s class body (`gg`) is in B12 as designed. No re-slicing needed.

## Format feedback for Phase 3

- The "Delegated (sanctioned deviation)" severity from the pilot template is the right call for every single drift item in this bucket. This bucket is almost entirely an architectural boundary, not a line-by-line drift audit. The parity-overview table's **Ownership** column (added per pilot format feedback) was essential here — "architectural", "delegated to shell", "product divergence" all distinguish the not-a-bug cases from true drift.
- **Cross-bucket reference discipline**: `Progress` was cleanly delegated to Agent 10's audit without re-auditing the class body. Pilot template did not explicitly structure this; recommend the Phase 3 template include a "Cross-referenced items" row to make the hand-off explicit.
- **Open-question answer format**: providing the full disposition table in the audit (not just the return message) gives the Phase 4 build-spec synthesizer an artifact it can lift verbatim. Recommend this pattern be the norm when an audit bucket maps directly to a catalog Open Question.
