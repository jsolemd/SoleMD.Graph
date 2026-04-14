# SoleMD.Graph Mobile-First Review
Date: 2026-04-12

Follow-on plan:
- `docs/plans/2026-04-12-mobile-desktop-improvement-plan.md`

## Scope Reviewed
- Primary product surface: `/`
- Primary shell states on `/`: panels, prompt box, bottom toolbar, selection controls, loading/error recovery
- Supporting product route: `/loading-preview`
- Non-product/dev route: `/smoke` was spot-checked only and treated as low-priority signal

## Devices And Surfaces Used
- Real Android device via `chrome-devtools-android`
- Mobile product viewport observed live at `411x780` CSS px, `devicePixelRatio=3.5`
- Desktop comparison from a recovered desktop-sized live session at `1440x900`
- Repo inspection for layout ownership and responsive logic

## Method
- Reviewed the live app on the Android device first, using snapshots plus DOM geometry reads to measure real control sizes, overlap, clipping, and reachability.
- Exercised the main shell states on `/`, especially panel coexistence, prompt chrome, filter controls, and recovery states.
- Compared the same graph-shell panel configuration against a desktop-sized session to isolate mobile-specific breakage from general shell behavior.
- Read the layout and state code that owns panel offsets, prompt placement, and bottom chrome before writing recommendations.

## Executive Summary
- The core problem is not that the graph shell fails everywhere. It is that the shell stays fundamentally desktop-docked on phones. Mobile currently gets a scaled-down desktop workspace instead of a narrow-screen mode.
- The highest-severity issue is panel reachability. On mobile, opening multiple docked panels can push later panels off the right edge with no horizontal scroll path, which makes parts of the product unreachable.
- The second major issue is chrome crowding. The prompt, bottom toolbar, and panel bodies compete for the same vertical space, so important panel controls end up under fixed UI.
- Touch ergonomics are consistently below a reasonable mobile standard. Many controls measured `22x22` to `29x29`, and some inputs rendered at `13px` or smaller. The prompt placeholder rendered at about `8.8px`.
- The graph shell also needs better resilience around cached local state. During review, multiple Android tabs hit a fatal OPFS/DuckDB load error or fell into `chrome-error://chromewebdata/`. Some of that may be dev-environment-specific, but the fatal bundle-load path is user-visible and needs an in-product recovery path.

## Prioritized Findings

| Severity | Route / State | Exact Issue | Impact On Mobile Users | Recommended Fix |
|---|---|---|---|---|
| High | `/` initial load / stale local state | The main app can hard-fail with a visible bundle-load error when the cached OPFS DuckDB file is invalid. Observed message: invalid DuckDB database file in `opfs://...duckdb`. | Users can be locked out of the main product surface before they reach the graph. Reload alone is not a reliable recovery path. | Detect open failures for cached local databases, invalidate the local cache automatically, and rebuild. Add a clear user-facing recovery action such as `Reset local graph cache`. |
| High | `/` with `Info` + `Wiki` open on mobile | The mobile shell still uses desktop dock math. On the real Android viewport, `Info` occupied roughly `x=10..266` and `Wiki` began around `x=276` with width `238`, extending to about `x=514` on a `411px` viewport. There was no horizontal scroll path to reach the clipped wiki panel. | Core content becomes unreachable. This is a functional failure, not a cosmetic one. | Add a narrow-width shell mode. On phones, allow only one major panel at a time, or switch panels to full-screen sheets/pages. Do not side-dock multiple primary panels on narrow screens. |
| High | `/` with filters/info panels open | The fixed prompt and bottom toolbar overlap panel content instead of yielding space to it. On mobile, the prompt sat around `y=674..697` while open panels extended into the same region. In the filters panel, `Add Filter · 6` rendered at about `y=730..754`, overlapping the bottom toolbar at about `y=740..767`. | Lower panel controls are visually crowded, partially obscured, or harder to activate. This is especially harmful in filters and longer panel bodies. | Define an explicit mobile layout contract between `PanelShell`, `PromptBox`, and bottom chrome. On mobile, either dock the prompt as a true bottom sheet that reserves space, or collapse it when a panel is open. Add bottom-safe padding inside panel bodies based on open chrome. |
| High | `/` shell chrome everywhere | Touch targets are too small for reliable phone use. Measured examples on Android: top and bottom toolbar icons at `27x27`; prompt utility controls at `22x22`; submit at `29x29`; filter close/remove icons at `14x14`; filter search fields at `24px` tall. | Taps are error-prone, discoverability is worse, and accessibility suffers for users with coarse touch input or tremor. | Set a mobile hit-area floor of at least `44-48px` for high-frequency controls, regardless of icon size. Reduce the number of always-visible actions and move lower-frequency controls into overflow menus or secondary sheets. |
| Medium | `/` shell typography and inputs | Mobile text sizing is too dense in important interaction areas. Filter search inputs rendered at `13px`, and the prompt placeholder rendered at about `8.8px`. | Readability is weak on a phone, typing affordances feel cramped, and focused input states are likely to be fragile once the software keyboard appears. | Raise mobile field text to at least `16px` in composer/search surfaces, increase field height, and simplify the prompt chrome so the input area can breathe. |
| Medium | `/` filters accessibility semantics | Filter option rows behaved as interactive controls but were exposed in the accessibility tree mostly as static text. The containing generic region took focus instead of the option rows themselves. | Screen-reader semantics and focus discoverability are weaker than they should be. Pointer users can still use the UI, but assistive tech users lose meaningful control affordances. | Expose filter options as buttons, options, or checkbox-like controls with clear state and names. Do not rely on clickable generic containers around static text. |
| Medium | `/` mobile interaction/discoverability | Several controls behaved like desktop tooltip-first chrome. A single tap often surfaced a tooltip or focused the control before the state changed. The `About SoleMD` control required a second activation in review before the panel actually opened. | The UI feels ambiguous on touch. Users should not have to infer whether a tap selected, focused, previewed, or activated something. | Reduce tooltip dependence on mobile, prefer visible labels for primary controls, and ensure first tap activates the intended action on coarse pointers. |
| Medium | `/` selection interactions | The graph workflow still leans heavily on drag/precise pointer interaction, while mobile alternatives are limited. | Users on phones may be able to look, but targeted selection and graph manipulation are less dependable than on desktop. | Provide stronger tap-first alternatives for graph selection and scope setting: tap-to-focus, tap-to-add, selection list, and explicit “use current visible scope” actions. |
| Low | `/loading-preview` | The loading-shell overlay generally fits on mobile, but several controls are still undersized: constellation relation nodes at `21-24px`, hero nodes at `40px`, reset at `22x22`, and bottom actions at `34px` height. | The preview route is usable but not comfortably touch-first, especially for inspecting smaller constellation nodes. | Increase hit areas for preview-only controls, especially reset/back and smaller constellation nodes. Keep the route as a preview surface, but make it consistent with the mobile target-size policy. |
| Low | `/smoke` | This is a dev/test route, not a product flow, but it still shows overflow problems on mobile. The Manim video rendered about `498px` wide from `x=-43` on a `411px` viewport, and the large logo demo pushed past the right edge near the bottom of the page. | Low product impact, but it confirms some media components are not constrained safely on narrow screens. | Treat as a low-priority cleanup item. Add explicit max-width and overflow rules for dev/demo media so test surfaces remain readable on phones. |

## Cross-Cutting Mobile Patterns Observed
- The shell uses density scaling, not a real mobile mode. The UI shrinks, but the interaction model does not change.
- Too many elements are fixed at once on mobile: left panel controls, right/top controls, bottom toolbar, prompt box, selection tools, and sometimes multiple panels.
- The prompt is treated as a permanent floating desktop composer instead of a mobile-primary interaction surface with its own state transitions.
- Tooltip-heavy icon-only chrome works much better with mouse/hover than with touch.
- Some panel content assumes there is always spare vertical room below it. That is not true once the bottom toolbar and prompt are visible.
- The graph canvas is correctly treated as the hero surface, but the surrounding chrome does not yet respect the constraints of a phone viewport.

## Desktop Vs Mobile Comparison Notes
- Desktop-sized session (`1440x900`): `Info` at about `256px` wide and `Wiki` at about `656px` wide both fit side-by-side. The side-dock model is viable there.
- Mobile session (`411x780`): the same panel model clips the second panel offscreen. This is a mobile layout-policy failure, not a general rendering failure.
- The prompt overlaps panels on both surfaces, but on desktop the remaining space is still usable. On mobile the overlap removes too much of the already-limited working area.
- The same control sizes exist on desktop, but the harm differs. On desktop they are mostly an efficiency choice for mouse users. On mobile they become a reliability and accessibility issue.
- Desktop benefits from hover/tooltip discoverability. Mobile does not, so the current icon-only chrome loses clarity on phones.

## Best-Practice Research Summary

### 1. Responsive layouts should change shape, not just scale
- Source: [Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)
- Source: [Using media queries](https://developer.mozilla.org/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- Source: [@media pointer](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/pointer)

What this means for SoleMD.Graph:
- The current shell is mostly applying a compact density system and fixed docking rules. That is not enough for a graph workbench on a phone.
- The app needs a real narrow-screen breakpoint strategy using viewport width and input characteristics such as `pointer: coarse` and `hover: none`.
- Concretely: `PanelShell`, `WikiPanel`, `PromptBox`, and the bottom toolbar should all consult one shared “mobile shell” decision instead of each shrinking independently.

### 2. Touch targets need minimum size and spacing
- Source: [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- Source: [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Source: [What’s New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)

What this means for SoleMD.Graph:
- WCAG 2.2 Level AA sets a floor of `24x24` CSS px, and the current shell violates even that floor in several places.
- For the main graph chrome, the right target is stricter than bare AA. Engineers should aim for `44-48px` interactive hit areas for primary mobile controls.
- The fix is not “make every icon larger.” It is “keep icons compact if desired, but enlarge the hit area and reduce simultaneous control count.”

### 3. Mobile forms and inputs should not be tiny or chrome-heavy
- Source: [Sign-in form best practices](https://web.dev/articles/sign-in-form-best-practices)
- Source: [Using the viewport meta element](https://developer.mozilla.org/docs/Web/HTML/Guides/Viewport_meta_element)

What this means for SoleMD.Graph:
- The repo already sets a correct mobile viewport in `app/layout.tsx`. The problem is not the meta viewport. The problem is the composer/input design layered on top of it.
- Composer and search inputs should not render at `13px` or below on phones. Prompt/search inputs should be comfortably readable and keyboard-safe.
- The prompt should behave more like a mobile composer sheet than a desktop floating toolbar with dense adjacent action icons.

### 4. Responsiveness should be measured over the whole interaction, not just load
- Source: [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)

What this means for SoleMD.Graph:
- For this product, responsiveness is not just initial bundle load. It includes opening a panel, filtering, showing timeline/table, and switching scope.
- Measure INP and custom interaction timings around panel open/close, prompt transitions, filter activation, timeline toggle, and table toggle.
- Avoid moving chrome immediately if the corresponding panel/content is still chunk-loading. On mobile, dead air after a toolbar shift feels broken.

### 5. Drag-heavy interactions need simple pointer alternatives
- Source: [Understanding SC 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)
- Source: [What’s New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)

What this means for SoleMD.Graph:
- Graph exploration can stay graph-native on desktop, but mobile cannot assume precise drag as the only practical way to scope work.
- Provide tap-first alternatives for common graph tasks: focus node, add/remove from selection, open current visible scope in info/table, and send selected scope to Ask/Learn/Create.
- Modules are a good candidate for full-page mobile presentation, because they map naturally to reading and guided exploration rather than multi-panel docked work.

## Concrete Recommendations For This Codebase

### Mobile shell policy
- Introduce a single `mobileShell` layout policy based on `max-width` plus `pointer: coarse` / `hover: none`.
- In `mobileShell`, allow one primary panel at a time: `about`, `config`, `filters`, `info`, `wiki`, `query`, `detail`, or `rag`.
- Treat wiki pages and modules as full-screen or near-full-screen mobile surfaces. Modules should default to full-page/full-sheet presentation on phones.

### Panel and prompt strategy
- Replace desktop side-docking on phones with one of:
- Full-screen sheet for wiki/modules/detail/RAG.
- Bottom sheet for filters/config.
- Full-width composer sheet for Ask/Create.
- Reserve actual bottom space for the prompt when it is visible. Do not let panel content extend under it.
- Remove or collapse secondary prompt actions on mobile. Keep mode switch, primary action, and one overflow affordance.

### Graph control strategy
- Keep a very small persistent control set on mobile: maybe `Panels`, `Fit`, `Scope`, and `Ask`.
- Move labels/legend/links/screenshot/advanced tools into a menu or secondary surface.
- Prefer visible labels or segmented controls for the most important mobile actions instead of tooltip-only icon buttons.

### Accessibility and semantics
- Upgrade filter rows and similar interactive list items to proper semantic controls with visible state.
- Raise mobile input text sizing and field height.
- Ensure focus states are not obscured by fixed prompt/bottom chrome.

### Resilience and performance
- Add automatic cache invalidation / repair for corrupt local OPFS graph databases.
- Instrument INP and interaction timings for panel open, filter apply, prompt expand, and timeline/table open.
- Re-test on a clean Android browser state after fixing the shell, because the current review surfaced both product issues and some dev-session instability.

## Quick Wins
- Enforce a mobile hit-area floor for all shell controls.
- Convert mobile shell to one primary panel at a time.
- Move the prompt to a full-width bottom sheet on mobile and collapse secondary controls behind overflow.
- Add bottom-safe-area padding to panel bodies so panel actions do not sit under prompt/toolbar chrome.
- Add a “reset local graph cache” recovery path for invalid OPFS/DuckDB state.
- Remove tooltip dependence for primary mobile actions.

## Larger Structural Recommendations
- Build an explicit mobile information architecture for the graph shell instead of relying on density scaling.
- Promote wiki pages and modules to route-like mobile experiences with clear back navigation.
- Centralize layout policy so `dashboard-store`, `PanelShell`, `WikiPanel`, `PromptBox`, and bottom chrome all make the same breakpoint decision.
- Treat mobile as a distinct workflow:
- Graph-first browse mode.
- Full-page read/learn mode.
- Focused ask/create composer mode.
- Keep the rich multi-panel workspace for desktop, where it matches the project’s power-user goals.

## Open Questions And Gaps Not Fully Reviewed
- I did not complete a trustworthy Android pass for every state on `/` because several tabs became `chrome-error://chromewebdata/` during extended interaction, and older tabs also surfaced the stale OPFS/DuckDB error path.
- I did not fully validate `timeline`, `table`, `detail`, `query`, `rag`, and deep wiki/module flows on the real Android device after the session became unstable.
- I did not run a full network or Lighthouse performance audit in this pass. The report’s performance guidance is based on live behavior and current official guidance, not a scored benchmark.
- `/smoke` was intentionally de-emphasized because it is a dev/test page, not a product destination.
