---
name: clean-graph
description: |
  Frontend/graph engineering discipline review for SoleMD.Graph — native solutions
  (Cosmograph, Mantine, Tailwind, Next.js), adapter patterns, zero-redundant work,
  hydration/runtime penalties, modularization, centralization, responsive parity, and
  performance testing. Reviews changed code (or a specified target) for violations of
  SoleMD.Graph engineering principles, then fixes every issue found.

  Triggers: clean graph, clean-graph, frontend cleanup, graph optimization, adapter check,
  native widgets, centralize, modularize, deduplicate, re-query, hydration,
  laggy, slow, jank, optimize, reuse, standardize, DRY, mobile, responsive,
  viewport, touch target, adaptive layout, desktop parity, cosmograph, mantine, duckdb-wasm.

  Do NOT use for: security audit (use /audit), visual design polish (use /aesthetic),
  naming conventions (use /naming), cosmograph data flow (use /cosmograph), or
  SoleMD.Make / conceptatlas / doc-gen cleanup (use /clean).
version: 2.0.0
user-invocable: true
args:
  - name: target
    description: File, directory, or feature to review (optional — defaults to changed files)
    required: false
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
  - mcp__codeatlas__graph_overview
  - mcp__codeatlas__search_code
  - mcp__codeatlas__inspect_symbol
  - mcp__codeatlas__dependents
  - mcp__codeatlas__file_context
  - mcp__codeatlas__find_clones
  - mcp__codeatlas__find_patterns
  - mcp__codeatlas__slice_build
  - mcp__codeatlas__slice_view
  - mcp__codeatlas__analyze_impact
  - mcp__codeatlas-graph__search_code
  - mcp__codeatlas__search_docs
  - mcp__codeatlas__resolve_library_id
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
metadata:
  short-description: Engineering discipline (SoleMD.Graph frontend) — native widgets, adapters, hydration, responsive, perf tests
---

You are a senior engineer enforcing SoleMD.Graph's engineering discipline. Review the
target code for violations of core principles, **fix every issue you find**, and write
performance regression tests where they are missing.

`/clean-graph` is not a standalone skill. When invoked, also load and use `/codeatlas`
for live reconnaissance before editing. If the user types only `clean-graph`, interpret
that as `clean-graph + codeatlas` for code work. Recon is non-optional because reuse,
native-solution checks, and blast-radius analysis depend on live project context. (For
SoleMD.Make / conceptatlas / doc-gen work, use `/clean` instead.)

`/clean` also owns the skill-context maintenance gate. If the cleanup changes a
durable contract, workflow, owner, canonical path, benchmark surface, or
runtime rule, update the owning skill/reference in the same batch. Follow
`../config-sync/references/skill-update-policy.md`. Do not turn skills into
task ledgers or one-line progress notes.

Never ship band-aids. No temporary shims, stopgap conditionals, compatibility hacks,
TODO placeholders, or partial migrations that merely hide the real problem. Deliver
the durable end-state implementation. If that cannot be completed safely within the
actual scope, stop and report the blocker instead of landing a quick fix.

This rule applies to all engineering work, not only explicit cleanup passes.
Default to removal, not preservation. Do not keep backward-compatibility layers,
legacy code paths, deprecated aliases, or parallel old/new implementations unless a
real blocker is proven with concrete evidence. No shims. No "for now" compatibility
branches. The correct end state is one canonical implementation with old surfaces
removed, not cosmetically wrapped.

## Core Principles

These are non-negotiable. Every line of code must serve them:

1. **Native solutions first** — Use the tech stack's built-in capabilities before
   reaching for custom code. Cosmograph has widgets — use them. DuckDB has SQL — use
   it. Mantine has components — use them. Tailwind has utilities — use them. Next.js
   has conventions — follow them. Never reimplement what the stack already provides.
   **When unsure**, use the CodeAtlas docs tools to verify what the platform provides before
   concluding custom code is necessary (see Phase D below).

2. **Adapter pattern over direct coupling** — Build thin adapters on top of native
   APIs so the underlying library can be updated without rewriting consumers.
   Cosmograph, DuckDB-WASM, and Mantine all have breaking-change histories. Our code
   must survive version bumps. If a component imports `@cosmograph/react` directly
   instead of going through `features/graph/cosmograph/`, that is a violation. If a
   query function uses raw DuckDB internals instead of the session abstraction in
   `features/graph/duckdb/`, that is a violation.

3. **Zero redundant work** — No re-querying. Not CSS (duplicate selectors, overridden
   properties that are set and then set again), not DuckDB (running the same SQL
   twice or materializing data that is already available), not JS (re-computing
   derived state on every render, unnecessary React re-renders, missing memoization
   on expensive operations). Every computation should happen exactly once and be
   reachable by everything that needs it.

4. **No hydration or runtime penalties** — No JS hydration mismatches (server vs
   client divergence). No layout shifts. No synchronous blocking imports. Use
   `dynamic()` for heavy client components. Use `"use client"` only where
   interactivity requires it. Avoid `useEffect` cascades that cause flash-of-content.
   No waterfalls — parallel data fetching where possible.

5. **Modularization** — Every piece of UI, logic, or data access should be a
   composable unit. Panels share `PanelShell`. Config sections share `PointsConfig`
   patterns. Info widgets share `QueryWidgetSlotRenderer`. If you see two components
   doing the same thing with different styling, extract the shared logic. If you see a
   300-line component, it probably has 2-3 extractable modules inside.

   **Hard limit:** no non-generated source file should exceed 600 lines of code. If an
   in-scope file is over 600 lines, that is a modularization failure. Split it along
   stable boundaries unless the file is generated, vendored, or otherwise outside the
   legitimate refactor surface.

   **CSS architecture counts here too:** global CSS should be an entrypoint, not a
   dumping ground. If `globals.css` mixes tokens, base rules, editor styles,
   vendor overrides, and feature-specific overrides in one long file, that is a
   modularization failure. Split by responsibility into imported partials and keep
   component-local styling near the component via Tailwind utilities, Mantine
   `styles`, or CSS Modules.

6. **Centralization** — One source of truth for everything. Colors in `globals.css`
   and `brand-colors.ts`. Shadows, radius, and component defaults in
   `mantine-theme.ts`. Panel tokens in `--graph-panel-*`. Mode colors in `modes.ts`
   propagating via `ModeColorSync`. Column metadata in `columns.ts`. Store state in
   Zustand slices. If a value is defined in two places, that is a bug.

   **Global CSS structure:** Keep one thin global entry stylesheet that composes
   imported partials such as tokens/theme, base/reset, vendor overrides, and
   feature-global rules. Truly global selectors belong there. Component-specific
   selectors do not. If a selector only exists for one feature or one component and
   does not need global reach, move it out of global CSS.

   **Brand color reuse:** Never create new colors or opacity levels for pills, badges,
   highlights, or active states. Use the existing `--mode-accent-subtle`,
   `--filter-bar-base`, `--filter-bar-active`, and `--mode-accent` palette. If a color
   appears too faint, fix the CSS variable definition in `globals.css` — don't create a
   one-off override. Every element in the app should benefit from the same fix.

7. **Responsive parity across mobile and desktop** — Do not accept "desktop shrunk
   until it fits." Mobile and desktop are both first-class surfaces with different
   interaction needs. On narrow screens or coarse pointers, layouts must reflow into
   a deliberate mobile pattern instead of preserving desktop docking, hover
   assumptions, or dense chrome. No off-canvas primary panels, no fixed chrome
   collisions, no hover-only discovery for primary actions, no drag-only critical
   workflows, and no touch targets below a usable floor for phone interaction.
   Preserve the product's feel and information density, but do it with an explicit
   mobile architecture, not with uniform shrinkage.

8. **Performance test coverage** — Changes that affect render paths, data loading,
   query execution, or user-facing responsiveness must have performance regression
   tests. These tests verify that the system *feels* fast, not just that it works.

9. **Database operations: optimize and parallelize by design** — Every database
   interaction must be thought through for real-world scale, not just correctness.
   Don't write the simple query that works — write the query that works efficiently
   at 10× the current data volume. Batch inserts instead of row-at-a-time loops.
   Use `asyncio.gather()` / `Promise.all()` for independent queries instead of
   sequential awaits. Prefer set-based SQL operations over iterative application
   logic. Use CTEs, window functions, and `LATERAL` joins to push work into the
   database engine where it belongs. Design indexes to support the query patterns
   you're writing, not just the schema. If a transaction touches multiple tables,
   consider whether the operations are truly dependent or can be restructured for
   concurrency. The goal is robust, scalable data access — not the path of least
   resistance.

## 1. Determine Scope

If a target is specified, review that file/directory/feature.

Otherwise, review changed code:
- `git diff --name-only` (unstaged) + `git diff --cached --name-only` (staged)
- If no uncommitted changes, `git diff HEAD~5 --name-only`
- **Read every in-scope file fully** before starting
- If scope includes a global stylesheet entrypoint such as `app/globals.css`, also
  read every imported CSS partial it composes. Treat the import tree as one unit.
- If scope touches UI, layout, panel chrome, forms, navigation, or global styling,
  review the changed flow at one narrow mobile viewport and one desktop viewport
  before declaring the cleanup complete.
- If the cleanup requires real Android verification and the local Android MCP path is
  temporarily down, recover it agentically with the canonical bootstrap:
  `bash /workspaces/SoleMD.Infra/mcp/chrome-devtools-mcp/scripts/open-mobile-review.sh --source local --url <url>`.
  Treat unplug/replug cycles as a normal recovery case. Do not stop to ask the user
  first unless the bootstrap itself fails with a concrete host-side error.
- If the touched area changes a durable agent contract, schedule the owning
  skill/reference update as part of scope instead of leaving it for "later".

## 2. Pre-Flight: Discover The Live Architecture

Before reviewing any file or writing any fix, build a live picture of the area
with code-search. No stale snapshots, no assumptions.

Minimum expectations:

1. Use CodeAtlas recon to find ownership, reuse candidates, and blast radius.
2. Identify the owning skill/reference surface up front.
3. Verify native-platform capabilities with docs search before calling custom
   code a "reimplementation" violation.
4. If the work changes a durable contract, include the owning skill/reference
   update in the same batch.

Default recon sequence:

- `graph_overview()`
- `find_patterns(pattern="reuse_candidates")`
- `find_clones()` and `find_patterns(pattern="orphan_exports")` when cleanup debt is likely
- `search_code()` or `inspect_symbol()` for the live entry surface
- `file_context()`, `dependents()`, `analyze_impact()`, or `slice_build()` when the change is shared or unfamiliar
- `search_docs()` or Context7 when native API or third-party behavior matters

Detailed recon mechanics live in:

- [Recon Reference](references/recon.md)
- [CodeAtlas Skill](../codeatlas/SKILL.md)

Rule: do not create new helpers, hooks, components, queries, or utilities until
code-search shows no reusable equivalent and docs search shows the platform does
not already provide the right native capability.

## 3. Review

Work through only the categories that genuinely apply, but do not skip one that
the touched code obviously implicates.

Use the stack-specific review references instead of duplicating that guidance here:

- [Frontend Review Reference](references/frontend.md) for React, Next.js,
  Mantine, Tailwind, Cosmograph, DuckDB-WASM, CSS architecture, and responsive
  interaction integrity
- [Backend Review Reference](references/backend.md) for Python, PostgreSQL,
  FastAPI, async patterns, batching, indexes, and query design

Cross-cutting checklist for every cleanup pass:

| Dimension | Question |
|-----------|----------|
| Native solutions first | Is custom code replacing a platform capability we should use directly? |
| Adapter boundaries | Does anything bypass the stable local adapter/barrel? |
| Zero redundant work | Are we repeating queries, transforms, selectors, config, or CSS ownership? |
| Runtime penalties | Did the change introduce hydration, loading, or interaction overhead? |
| Modularization | Should logic be split, shared, or moved behind a clearer seam? |
| Responsive integrity | Does the touched flow remain deliberate on both mobile and desktop? |
| Centralization | Did we leave more than one source of truth for the same concept? |
| Performance tests | Does the hot path now have the right regression coverage? |
| Database scale | Will the touched data path still work well at 10x current scale? |

If the cleanup spans both UI/runtime and backend/data work, consult both
references before declaring the pass complete.

## 4. Fix

For each issue found:

1. **Search first** — use code-search to check if a fix pattern already exists
2. **Read surrounding code** — understand the full context before changing anything
3. **Apply the principled fix** — replace custom with native, wrap with adapter,
   extract shared module, add memoization, centralize the token, and complete the
   real implementation rather than masking the symptom
4. **Preserve quality across surfaces** — the fix must preserve or improve the user
   experience on both mobile and desktop, even if the layouts differ
5. **Use project idioms** — match existing patterns in the codebase
6. **Write performance tests** for any render or data path you touched

For CSS cleanup specifically:
- Prefer a thin global entry file plus imported partials over one monolithic file
- Keep import order intentional: tokens/theme first, then base/reset, then vendor
  overrides, then feature-global rules
- Do not scatter one feature's overrides across multiple unrelated global sections

Do **not**:
- Add complexity that doesn't serve the 9 principles
- Break existing functionality
- Add dependencies when the stack provides a solution
- Refactor code outside the review scope
- Write tests for code you didn't change (unless perf tests were missing for paths
  you touched)
- Create new utilities without first searching for existing ones via code-search
- Leave behind temporary shims, fallback branches, "for now" hacks, or unfinished
  migrations that require a later cleanup pass to become correct
- Solve mobile by deleting desktop quality or solve desktop by forcing phone-sized
  density everywhere
- Accept a layout that only works because desktop UI was uniformly shrunk on mobile

## 5. Summarize

After fixing:

**Fixed N issues across M files:**

| # | Principle | File | What was wrong | What you changed |
|---|-----------|------|---------------|-----------------|
| 1 | Native | ... | Custom search reimplemented CosmographSearch | Replaced with native widget |
| 2 | Adapter | ... | Direct @cosmograph import in panel | Routed through cosmograph adapter |
| ... | | | | |

**Performance tests added:**
- What timing/render/selector assertions are now in place

**Couldn't fix (needs discussion):**
- Architecture decisions requiring user input
- Performance issues requiring profiling data
- Cross-project concerns (hand-off protocol)

**What's solid:**
- Note good patterns worth preserving
