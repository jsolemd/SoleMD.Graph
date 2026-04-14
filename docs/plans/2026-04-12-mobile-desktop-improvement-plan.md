# SoleMD.Graph Mobile/Desktop Improvement Plan
Date: 2026-04-12

Derived from:
- `docs/plans/2026-04-12-mobile-desktop-review.md`

## Goal
Build a first-class mobile experience for SoleMD.Graph without diluting the product's
desktop strengths. The graph should remain the hero. Desktop should remain a powerful
multi-panel workbench. Mobile should become an intentional browse/read/ask/learn
experience instead of a scaled-down desktop shell.

## Product Intent To Preserve
- The app should still feel like SoleMD: graph-forward, information-dense, calm, and
  clinically serious rather than consumer-app generic.
- Desktop should keep the fast expert workflow: graph, panels, table, and rich shell
  tools can coexist when there is room.
- Mobile should favor clarity over simultaneous chrome. That does not mean "simplify
  the product away." It means changing layout form while preserving capability.
- Wiki pages and learning modules can become more page-like or sheet-like on mobile
  without betraying the product. That is likely the correct expression of the product
  on a phone.

## Best-Practice Basis
- Responsive layouts should change shape by viewport and input mode, not only scale:
  [web.dev responsive web design basics](https://web.dev/articles/responsive-web-design-basics)
- Media queries should consider viewport and input characteristics:
  [MDN media queries](https://developer.mozilla.org/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- Pointer-aware design matters for touch devices:
  [MDN `@media (pointer)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/pointer)
- Touch targets need a minimum floor:
  [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Interaction responsiveness should be measured, not assumed:
  [web.dev Optimize INP](https://web.dev/articles/optimize-inp)
- Drag-only workflows need alternatives:
  [WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)
- Bottom-sheet / single-surface mobile patterns are valid for dense tools:
  [Material 3 bottom sheets](https://m3.material.io/components/bottom-sheets/overview)

## Success Criteria

### Product criteria
- No primary panel or action becomes unreachable on a phone.
- The graph remains usable on mobile as a browse/focus surface.
- Wiki reading, module consumption, and prompt interaction feel deliberate on mobile.
- Desktop keeps multi-panel power without being constrained by the mobile solution.

### UX criteria
- No clipped primary panels at `390-430px` width.
- No prompt or toolbar overlap on actionable panel rows.
- Persistent mobile controls expose `44-48px` hit areas where practical, and nothing
  falls below the WCAG `24x24` floor.
- Mobile inputs and composers use readable editing sizes and remain keyboard-safe.

### Engineering criteria
- One explicit layout policy controls shell behavior across mobile and desktop.
- Mobile and desktop verification become part of `/clean`.
- Interaction timing is measured for panel open/close, prompt transitions, and table/
  timeline toggles.
- Local-cache corruption on `/` self-heals or exposes a one-click recovery path.

## What Changes First

### 1. Establish a single responsive shell contract
Owner areas:
- `features/graph/stores/dashboard-store.ts`
- `features/graph/components/panels/PanelShell/PanelShell.tsx`
- `features/graph/components/shell/DashboardShellViewport.tsx`

Plan:
- Introduce one layout policy function or shell state that decides between:
  - desktop workbench
  - tablet/intermediate layout if needed
  - mobile shell
- Base it on viewport width plus input mode (`pointer: coarse`, `hover: none`) rather
  than only density scaling.
- Stop letting `PanelShell`, `WikiPanel`, `PromptBox`, and bottom chrome make partly
  independent geometry decisions.

Acceptance criteria:
- The shell can answer, in one place, whether it is in desktop or mobile mode.
- No primary panel placement relies on desktop dock offsets when in mobile mode.

### 2. Replace desktop side-docking with a mobile shell model
Owner areas:
- `features/wiki/components/WikiPanel.tsx`
- `features/graph/components/explore/*Panel*`
- `features/graph/components/panels/*`

Plan:
- On mobile, allow one major panel at a time:
  - `about`
  - `config`
  - `filters`
  - `info`
  - `wiki`
  - `query`
  - `detail`
  - `rag`
- Use patterns by job:
  - Wiki page / module / detail / RAG: full-screen sheet or full-page route-like view
  - Filters / config: bottom sheet or full-height modal sheet
  - About: simple modal or sheet
- Preserve desktop side-dock behavior for wide viewports.

Acceptance criteria:
- Opening `Info` and `Wiki` together on mobile no longer clips the second surface.
- All primary panel content is reachable without horizontal scrolling.
- Desktop still allows multi-panel coexistence.

### 3. Redesign the prompt for mobile instead of shrinking it
Owner areas:
- `features/graph/components/panels/prompt/PromptBoxSurface.tsx`
- `features/graph/components/panels/prompt/use-prompt-box-controller.ts`
- `features/graph/stores/dashboard-store.ts`

Plan:
- Keep the floating centered prompt for desktop.
- On mobile:
  - use a full-width bottom composer or bottom sheet
  - reserve real bottom space for it
  - collapse secondary actions into overflow
  - keep only mode switch, primary action, and one more high-value affordance visible
- Raise mobile input and placeholder typography to comfortable editing sizes.
- Ensure the prompt and panel body share one bottom-clearance system.

Acceptance criteria:
- No panel action row renders beneath the prompt or bottom toolbar.
- Mobile prompt controls are readable and reliably tappable.
- Desktop prompt behavior remains intact.

### 4. Simplify persistent mobile chrome
Owner areas:
- `features/graph/components/shell/chrome/BottomToolbar.tsx`
- `features/graph/components/explore/CanvasControls.tsx`
- `features/graph/components/chrome/*`

Plan:
- Split controls into:
  - persistent mobile essentials
  - overflow/secondary actions
- Candidate persistent mobile essentials:
  - panel access
  - fit/focus
  - scope/selection summary
  - ask/create entry
- Move labels, legend, links, screenshot, and lower-frequency controls into a menu or
  secondary sheet on phones.
- Increase mobile hit areas without necessarily increasing icon artwork.

Acceptance criteria:
- Primary mobile controls meet the hit-area policy.
- Accidental taps decrease because control density is lower.
- Desktop keeps richer always-visible chrome.

### 5. Add tap-first graph interaction alternatives
Owner areas:
- `features/graph/components/explore/CanvasControls.tsx`
- graph selection/state flows
- prompt scope integration

Plan:
- Do not rely on drag as the only path to build scope on mobile.
- Add explicit tap-first alternatives:
  - tap to focus node
  - tap to add/remove node from selection
  - use current visible scope
  - send current focus/selection to Ask/Learn/Create
  - selection summary chip or list
- Keep richer drag tools for desktop where they make sense.

Acceptance criteria:
- Mobile users can scope work without precision drag.
- The mobile graph remains a viable exploration entrypoint instead of read-only scenery.

### 6. Stabilize bundle recovery and local cache behavior
Owner areas:
- graph bundle boot/load path
- error surfaces on `/`

Plan:
- On OPFS/DuckDB open failure, attempt automatic invalidation/rebuild of the local
  cache rather than surfacing a raw fatal error first.
- If automatic repair fails, expose a clear user action such as `Reset local graph
  cache`.
- Keep technical exception text out of the primary user-facing error surface.

Acceptance criteria:
- Stale local graph files do not trap users behind repeated reload failures.
- Error recovery is understandable on mobile and desktop.

## Recommended Rollout

### Phase 0: Contract and safety rails
- Build `mobileShell` layout policy.
- Add responsive shell test scaffolding.
- Add cache-reset recovery path for invalid local graph state.

### Phase 1: Shell geometry
- Convert panel placement to mobile single-surface behavior.
- Make prompt and panel clearance share one contract.
- Reduce persistent mobile chrome.

### Phase 2: Wiki/modules/detail experience
- Promote wiki pages and modules to full-screen or route-like mobile surfaces.
- Keep desktop wiki paneling intact.
- Ensure modules feel premium on mobile rather than cramped.

### Phase 3: Interaction and performance
- Add tap-first graph scope actions.
- Measure interaction timings and tighten the slowest transitions.
- Refine mobile labels/menus/toolbars after the main shell is stable.

## Ongoing Desktop Optimization
- Keep desktop as the primary expert workspace.
- Do not force desktop into the mobile simplification model.
- Use desktop to preserve:
  - multi-panel coexistence
  - rich graph chrome
  - faster compare/explore workflows
  - persistent workspace context
- Desktop optimization should focus on:
  - reducing visual dead space
  - keeping panel open/close latency low
  - preserving graph visibility while panels are open
  - minimizing unnecessary re-renders and chunk-load gaps

## Ongoing Mobile Optimization
- Treat mobile as a distinct mode, not a fallback.
- Optimize for three mobile jobs:
  - browse/focus the graph
  - read wiki/module/detail content
  - ask/create with scoped context
- Prefer:
  - one primary surface at a time
  - bottom or full-screen sheets
  - large tap areas
  - visible primary labels
  - keyboard-safe composers

## Validation Plan

### Real-device review
- Android real-device pass on:
  - `/`
  - `/loading-preview`
  - key wiki and module states once the mobile shell exists

### Desktop comparison
- Desktop pass on:
  - multi-panel shell
  - prompt + panel coexistence
  - timeline/table coexistence
  - wiki + info + detail workflows

### Automated checks to add
- Responsive geometry tests:
  - no off-canvas primary panel at mobile width
  - no prompt/panel overlap at mobile width
  - desktop multi-panel layout remains valid
- Touch-target checks for primary mobile chrome
- Interaction timing assertions for:
  - panel open
  - prompt expand/collapse
  - timeline toggle
  - table toggle

## `/clean` Integration
- `/clean` now needs to treat mobile/desktop parity as a core engineering principle,
  not a cosmetic review item.
- Future cleanup passes should fail:
  - desktop-only dock math on narrow screens
  - undersized touch targets
  - hover-only primary interactions
  - prompt/panel/sticky chrome overlap
  - mobile fixes that degrade desktop quality

## Immediate Next Actions
1. Implement a `mobileShell` layout policy and route all shell geometry through it.
2. Convert mobile primary panels to one-at-a-time presentation.
3. Redesign the mobile prompt as a true bottom composer/sheet with reserved space.
4. Reduce mobile persistent chrome and raise hit areas.
5. Add cache-recovery behavior for invalid local graph state.
6. Add responsive geometry tests and real-device review to the normal cleanup path.
