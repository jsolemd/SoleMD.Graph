# Frontend Review Reference

Stack-specific review guidance for Next.js, React, Mantine, Tailwind, Cosmograph,
and DuckDB-WASM (client-side).

## Native Solution Examples

| Layer | Native solution | Violation example |
|-------|----------------|-------------------|
| **Cosmograph** | Built-in widgets (`CosmographSearch`, `CosmographHistogram`, `CosmographBars`, `CosmographTypeColorLegend`, etc.) | Custom search input reimplementing `CosmographSearch` |
| **DuckDB-WASM** | SQL views, window functions, CTEs, aggregates | JS-side `.filter()/.map()/.reduce()` on data that could be a SQL query |
| **Mantine** | `Stack`, `Group`, `ActionIcon`, `Tooltip`, `Menu`, `Select`, `TextInput`, theme defaults | Custom flexbox wrapper when `<Stack gap="md">` suffices |
| **Tailwind** | Utility classes, `@theme` tokens, responsive prefixes | Inline `style={{ marginTop: 16 }}` instead of `mt-4` |
| **Next.js** | App Router, Server Components, `dynamic()`, route handlers, `metadata` | Client component that could be a Server Component. Manual fetch in `useEffect` instead of server-side data fetching |
| **React** | `useMemo`, `useCallback`, `memo`, `Suspense`, `startTransition` | Expensive computation on every render without memoization |
| **CSS** | `color-mix()`, custom properties, `:has()`, container queries | JS-computed colors when CSS `color-mix()` handles it |

## Adapter Boundaries

**Cosmograph adapter**: All `@cosmograph/react` and `@cosmograph/cosmograph` imports
MUST go through `features/graph/cosmograph/`. Direct imports in panel components,
hooks, or pages are violations.

**DuckDB adapter**: All DuckDB-WASM interactions MUST go through
`features/graph/duckdb/`. Raw `duckdb-wasm` imports outside this boundary are
violations.

**Store adapter**: All Zustand store access MUST go through the barrel exports in
`features/graph/stores/`. Direct file imports that bypass the barrel are violations.

## CSS Redundancy

- Same property set multiple times on the same selector (last one wins, others waste)
- Selectors that override each other unnecessarily (specificity wars)
- Properties already inherited from parent or set by Mantine theme defaults
- `!important` used to fight specificity instead of fixing the cascade
- Duplicate `var()` definitions across `:root` / `.dark` / component styles
- Monolithic global CSS files mixing unrelated concerns instead of imported partials
- Component-local selectors living in global CSS

**CSS cleanup pattern**: Prefer a thin global entry file plus imported partials.
Keep import order intentional: tokens/theme first, then base/reset, then vendor
overrides, then feature-global rules.

## JS/React Redundancy

- `useMemo`/`useCallback` missing on expensive operations (>1ms or O(n) where n>100)
- Derived state recomputed on every render instead of memoized
- Components re-rendering because parent state they don't consume changed (missing `memo()` or selector)
- Zustand selectors that return new object references on every call
- Event handlers recreated on every render without `useCallback`
- `useEffect` with missing or over-broad dependency arrays

## DuckDB Query Redundancy

- Same SQL query executed from multiple components (should be shared in `features/graph/duckdb/queries/`)
- Data fetched via SQL then re-processed in JS when SQL could do it
- Views or CTEs that duplicate logic already in `graph_points_web`
- Multiple round-trips when one query would suffice

## Hydration & Runtime

**Hydration mismatches**:
- Server rendering different HTML than client first paint (dates, random values, `window` checks)
- Components that should be `"use client"` but aren't (interactive, uses hooks)
- Components that are `"use client"` but don't need to be (could be Server Component)

**Bundle penalties**:
- Heavy library imported at top level instead of `dynamic(() => import(...), { ssr: false })`
- Synchronous import of something only needed on interaction
- Re-exporting entire libraries when only one function is used

**Layout shifts**:
- Elements that pop in after load without reserved space
- Images/iframes without explicit dimensions

**Render waterfalls**:
- Sequential data fetches that could be parallel (`Promise.all`)
- `useEffect` chains where effect A triggers state that triggers effect B
- Suspense boundaries placed too broadly

## Panel Ecosystem Coherence

- All panels MUST use `PanelShell` for their chrome
- All panel text MUST use shared text classes from PanelShell exports
- All panel sections MUST use consistent spacing tokens
- Config sub-panels MUST follow the pattern in `PointsConfig` (label + control)

## Responsive & Input-Modality Integrity

**The rule:** mobile and desktop are both first-class. A responsive cleanup is not
finished until both surfaces are intentionally good. Desktop may keep a dense
multi-panel workbench. Mobile may use sheets, single-surface flows, or route-like
reading modes. What is forbidden is a desktop layout that was merely shrunk.

### Layout violations

- Multiple primary docked panels rendered side-by-side after they no longer fit
- Off-canvas primary content with no reachable alternative
- Prompt/toolbars/fixed chrome overlapping panel bodies, drawers, tables, or forms
- Horizontal overflow caused by panel math, media, or fixed positioning
- Desktop-specific hover/tooltip assumptions left as the only discovery path on touch

### Input and touch violations

- Primary controls below a practical mobile hit area (`44-48px` target area preferred)
- Any control below WCAG 2.2 `24x24` CSS px minimum
- Search/composer/input text rendered too small for comfortable phone editing
- Drag-only critical flows with no tap/click alternative
- Sticky/fixed chrome that blocks focused inputs or keyboard-safe interaction

### Review matrix

When the cleanup touches shell geometry, panel chrome, prompt behavior, forms,
navigation, or global CSS, verify:

- Narrow mobile width (`390-430px` or equivalent)
- Desktop width (`>=1280px`)
- Pointer assumptions (`hover: none` / coarse touch vs desktop pointer)

### Questions to answer

- Does the layout reflow, or does it only shrink?
- Can a phone user complete the primary task without hover and without precision drag?
- Are the prompt, panels, tables, and sticky bars aware of each other?
- Does the mobile solution preserve the product's feel instead of turning the app into
  a generic drawer-heavy template?
- Did the desktop workbench stay strong, or was desktop quality traded away?

## Centralization (Frontend)

**Single source of truth violations**:
- Hex color defined in a component instead of `globals.css` / `brand-colors.ts`
- Shadow value inline instead of `var(--shadow-*)` token
- Radius value inline instead of Mantine `radius="lg"` or `rounded-[1rem]`
- Spacing hardcoded instead of Tailwind utility or Mantine `gap`
- Column metadata hardcoded instead of imported from `columns.ts`
- Mode-specific logic hardcoded instead of reading from `modes.ts` registry
- Store state duplicated in local component state

**Brand color reuse**: Never create new colors or opacity levels for pills, badges,
highlights, or active states. Use the existing `--mode-accent-subtle`,
`--filter-bar-base`, `--filter-bar-active`, and `--mode-accent` palette.

**Global CSS structure**: Keep one thin global entry stylesheet composing imported
partials. Truly global selectors belong there. Component-specific selectors do not.

## Frontend Performance Tests

```typescript
// DuckDB query perf: execution stays under threshold
it("summary query completes within 100ms for 50k points", async () => {
  const start = performance.now();
  await queries.summary(session);
  expect(performance.now() - start).toBeLessThan(100);
});

// React render perf: no unnecessary re-renders
it("ConfigPanel does not re-render when unrelated store state changes", () => {
  const renderCount = { current: 0 };
  // ... render with counter, update unrelated state, assert count unchanged
});

// Selector perf: stable references
it("config selector returns stable reference when config unchanged", () => {
  const a = useConfigSlice.getState().pointColor;
  const b = useConfigSlice.getState().pointColor;
  expect(a).toBe(b); // reference equality, not deep equality
});

// Bundle initialization perf
it("DuckDB session initializes within 3s", async () => {
  const start = performance.now();
  await loadGraphBundle(testBundle);
  expect(performance.now() - start).toBeLessThan(3000);
});

// Responsive shell integrity
it("mobile shell does not hide primary panel content off-canvas", async () => {
  // render shell at narrow width, open primary panel states, assert content is reachable
});

// Touch target floor
it("primary mobile chrome exposes minimum hit areas", () => {
  // inspect the hit-area boxes for persistent shell controls
});

// Chrome coexistence
it("prompt and bottom chrome do not overlap panel action rows on mobile", async () => {
  // open a panel + prompt at narrow width and assert no overlap
});
```

## CSS Override Discovery (RepoWise)

When the area touches styling:
- Use `mcp__repowise__get_context(repo="graph", targets=["app/globals.css"])` to get the
  triage card for the global stylesheet
- Use `mcp__repowise__search_codebase(query="<concept>", repo="graph")` for ownership,
  querying the distinctive identifiers (class names, custom-property names, component
  names) rather than a verbose description — verbose queries dilute coverage and land
  `caution` even when the `selected_owner` is right
- Branch on the per-row evidence (`dense_cosine`, `lexical_rank`, `exact_name`, `lane`),
  and read `selected_owner.{file, reason}` before trusting a hit
- Use `rg` for exact CSS hunting (selectors, custom properties, at-rules)

**Rule**: use RepoWise first for ownership; use `rg` second for exact text lookup.
