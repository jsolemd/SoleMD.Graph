---
name: naming
description: |
  SoleMD.Web naming conventions for file names, exports, constants, types,
  stores, directories, CSS variables, Next.js App Router special files, and the
  600-line file policy.

  Triggers: naming, convention, file name, export, constant, type, interface,
  store, CSS variable, PascalCase, camelCase, kebab-case, snake_case,
  UPPER_SNAKE, component name, hook name, new file, new component, new hook,
  new type, rename, casing, suffix, prefix, 600-line limit, App Router,
  route.ts, page.tsx, layout.tsx, use client, ClientShell, barrel, feature
  module, test file.

  Do NOT use for: CSS token values or color system (use /aesthetic),
  Cosmograph data props or WebGL (use /cosmograph), backend graph architecture
  (use /graph), module-internal authoring contracts (use /module), interaction
  shell taxonomy (use /learn-modules).
version: 2.0.0
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
paths: "**/*.{ts,tsx,js,jsx,py,sql,css,scss,md}"
metadata:
  short-description: SoleMD.Web file/export/CSS-var naming conventions
---

# SoleMD.Web — Naming Conventions

You are authoring inside the SoleMD.Graph monorepo. The web frontend lives at `apps/web` and is organized as a Tier-4 feature-module tree: `apps/web/features/<domain>/{components,hooks,stores,lib,__tests__}/`. There is no top-level `components/` or `lib/graph/` directory — those names are stale.

## 1. Repository Topology

You will write into one of these locations:

| Path | Contents |
|------|----------|
| `apps/web/app/` | Next.js App Router entries (routes, layouts, route handlers) |
| `apps/web/features/orb/` | Orb runtime, WebGPU, picker, interaction |
| `apps/web/features/field/` | Field substrate, renderer, controllers, scroll, stage |
| `apps/web/features/wiki/` | Wiki module runtime, hooks, stores, graph runtime |
| `apps/web/features/graph/` | Graph panels, DuckDB, Cosmograph, hooks, stores |
| `apps/web/features/animations/` | Lottie, smoke tests, animation primitives |
| `apps/web/lib/` | Cross-feature utilities only: `db/`, `density.ts`, `gsap.ts`, `helpers.ts`, `mantine-theme.ts`, `motion.ts`, `motion3d.ts`, `pastel-tokens.ts` |
| `apps/web/app/styles/` | CSS source of truth: `tokens.css`, `base.css`, `chrome-surface.css`, `editor.css`, `entity-highlights.css`, `graph-ui.css`, `vendor-overrides.css`, plus wiki/viewport overlays |

Inside a feature module, follow the canonical sub-tree: `components/`, `hooks/`, `stores/`, `lib/`, `__tests__/`. New cross-cutting feature modules live at `apps/web/features/<domain>/`, not `apps/web/lib/<domain>/`.

---

## 2. File Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Components** | `PascalCase.tsx` | `DashboardClientShell.tsx`, `PanelShell.tsx`, `ConfigPanel.tsx` |
| **Top-level hooks** | `use-<name>.ts` | `features/graph/hooks/use-typewriter.ts`, `features/orb/interaction/use-orb-click.ts` |
| **Compound-component hooks** | `useCamelCase.ts` | `features/wiki/module-runtime/interactions/StepThrough/useStepThrough.ts` |
| **Function-export utilities** | `kebab-case.ts` | `features/graph/lib/duckdb-queries.ts`, `apps/web/lib/density.ts` |
| **Class-export modules** | `PascalCase.ts` | `features/field/controller/BlobController.ts`, `FieldController.ts`, `StreamController.ts`, `ObjectFormationController.ts` |
| **Stores** | `<name>-store.ts` (in `stores/` or co-located with its subsystem) | `features/graph/stores/dashboard-store.ts`, `features/orb/stores/snapshot-store.ts`, `features/orb/interaction/orb-picker-store.ts`, `features/orb/webgpu/orb-webgpu-runtime-store.ts` |
| **Tests** | `<file>.test.ts(x)` co-located in `__tests__/` | `features/graph/stores/__tests__/dashboard-store.test.ts` |
| **Stories (if added)** | `*.stories.tsx` (per `apps/web/.storybook/main.ts`) | `features/graph/components/Foo.stories.tsx` |

### Hook naming carve-out

The codebase has three valid hook patterns. Choose by location:

- **`hooks/` directory** → `use-kebab-case.ts`, exporting `useCamelCase`. Default for cross-feature reusable hooks.
- **Subsystem-private hooks** → `use-kebab-case.ts` co-located in a feature subsystem directory (`features/orb/interaction/`, `features/orb/bake/`). Use when the hook is private to one subsystem and serves multiple consumers within it. Examples: `features/orb/interaction/use-orb-click.ts`, `features/orb/bake/use-orb-focus-resolver.ts`. The subsystem directory acts as the scope; no generic `hooks/` indirection.
- **Compound-component co-located** → `useCamelCase.ts` next to its single `ComponentName.tsx` host, sharing the same PascalCase root. Use when the hook is private to one component family. Example: `StepThrough/StepThrough.tsx` + `StepThrough/useStepThrough.ts`.

Codebase examples of the camelCase carve-out: `useChapterAdapter.ts`, `useNodeFocusSpring.ts`, `useStepThrough.ts`, `useToggleCompare.ts`, `useChatThread.ts`, `useDemoStage.ts`. All sit beside their PascalCase host component, never in a generic `hooks/` directory.

### Class vs function modules

- A `.ts` file that primarily `export class Foo` → `Foo.ts` (PascalCase). Example: `BlobController.ts` exports `class BlobController`.
- A `.ts` file that exports functions, types, or constants → `kebab-case.ts`. Example: `blob-color-cycle.ts` exports `nextBlobColor()`.

When unsure, follow the controller pattern in `features/field/controller/`: PascalCase filename mirrors the exported class.

#### Naming-prefix family carve-out

When a subsystem uses a shared kebab-case prefix as a naming family (e.g., `orb-webgpu-*` under `features/orb/webgpu/`), every file in that family stays kebab-case — even when the file primarily exports a class. The prefix encodes ownership and grep-ability and overrides the per-file class/function distinction. Examples in `features/orb/webgpu/`:

- `orb-webgpu-pan.ts` → `export class OrbWebGpuPanController`
- `orb-webgpu-rotation.ts` → `export class OrbWebGpuRotationController`
- `orb-webgpu-zoom.ts` → `export class OrbWebGpuZoomController`
- `orb-webgpu-frame-uniforms.ts` → 3 classes + helpers
- `orb-webgpu-gate.ts` → `export class OrbWebGpuUnavailableError` + helpers
- `orb-webgpu-runtime.ts` → `class OrbWebGpuRuntimeImpl` (private) + factory

This contrasts with `features/field/controller/`, which uses PascalCase filenames per class because that subsystem is organized as a controller-per-file collection without a shared kebab prefix. Use the prefix-family form when the subsystem already has a coherent multi-file `<feature>-<subsystem>-*` naming convention; otherwise fall back to the per-file class/function rule.

---

## 3. Next.js App Router Special Files

App Router special files are an exception to "prefer named exports." They REQUIRE default exports per Next.js contract:

| File | Required signature |
|------|-------------------|
| `page.tsx` | `export default function NamedPage()` |
| `layout.tsx` | `export default function NamedLayout({ children })` |
| `loading.tsx` | `export default function NamedLoading()` |
| `error.tsx` | `export default function NamedError({ error, reset })` (must be a Client Component) |
| `not-found.tsx` | `export default function NotFound()` |
| `template.tsx` | `export default function NamedTemplate({ children })` |
| `default.tsx` | `export default function NamedDefault()` (parallel-route fallback) |
| `route.ts` | `export async function GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS()` (named, one per HTTP verb) |
| `middleware.ts` | `export function middleware(request)` (single named export at project root) |
| `instrumentation.ts` | `export function register()` (single named export at project root) |

Component name should match the route purpose: `WikiModulePage` for `app/wiki/modules/[slug]/page.tsx`, `DashboardLayout` for `app/(dashboard)/layout.tsx`.

### `'use client'` directive

Always double-quoted with semicolon, on the first line, before any imports:

```tsx
"use client";

import { useState } from "react";
```

The codebase has 311 occurrences of `"use client";` versus a handful of single-quoted variants — use the dominant form for new files.

### `<Domain>ClientShell.tsx` pattern

When a server-rendered route entry needs to wrap a tree of client components, the convention is `<Domain>ClientShell.tsx` co-located in the route segment:

```
app/(dashboard)/
  page.tsx                    # server entry
  layout.tsx                  # server layout
  DashboardClientShell.tsx    # "use client" wrapper
```

The shell is a PascalCase component file, exports the named component, and is imported into `page.tsx` as a child.

### API route structure

API handlers live at `apps/web/app/api/<domain>/<noun>/route.ts`:

```
app/api/entities/match/route.ts          # static segment
app/api/wiki/backlinks/[...slug]/route.ts # catch-all segment
app/graph-bundles/[checksum]/[asset]/route.ts # multiple dynamic segments
```

- Dynamic segment: `[name]` (e.g., `[checksum]`, `[asset]`).
- Catch-all segment: `[...name]` (e.g., `[...slug]` for variable-depth paths).
- Optional catch-all: `[[...name]]` (rare, use only when a route must serve both `/` and `/a/b`).
- Each `route.ts` exports named HTTP-verb async functions: `export async function GET(request: Request, { params })`.

---

## 4. Export Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Components** | PascalCase named export | `export function DashboardClientShell()` |
| **Hooks** | `useCamelCase` | `export function useTypewriter()` |
| **Functions** | `camelCase`, verb-first | `export function formatNumber()`, `fetchBundle()`, `loadGraph()` |
| **Async functions** | Verb-first, no `Async` suffix | `fetchBundle`, `loadGraph`, `resolveSelection` (the function being async is signaled by its return type, not its name) |
| **Default exports** | Avoid except for Next.js special files | See section 3 |

**Rule**: Prefer named exports over default exports outside the App Router. Named exports enforce consistent import names, enable better tree-shaking, and make grep-style refactors safe.

---

## 5. Constant Casing (Two-Tier Rule)

### `UPPER_SNAKE_CASE` — primitive / symbolic constants

Strings, numbers, frozen sets, and other immutable primitive values:

```typescript
const PANEL_TOP = 104
const NOISE_COLOR = "#ccc"
const READ_ONLY_QUERY_PREFIXES = ["SELECT", "EXPLAIN"] as const
const MAX_RETRIES = 3
const DEFAULT_ZOOM = 1.5
```

### `camelCase` — style objects / config objects

Mantine `styles` props, configuration objects, and any non-primitive `const`:

```typescript
const iconBtnStyles = { root: { border: "none" } }
const panelTextStyle = { color: "var(--text-secondary)", fontSize: 13 }
const badgeAccentStyles = { root: { backgroundColor: "var(--mode-accent-subtle)" } }
const defaultChartConfig = { animate: true, duration: 300 }
```

### Rationale

Primitive constants are true "constants" — immutable values that never change shape. Style objects are *configuration* that happens to be `const`. The visual distinction (`PANEL_TOP` vs `panelTextStyle`) signals at a glance whether you are looking at a value or a structure.

---

## 6. Type / Interface Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **General** | PascalCase, no `I` prefix | `GraphPaperDetail`, `ClusterInfo` |
| **DB row types** | `<Entity>Row` suffix | `GraphPaperDetailRow`, `ChunkRow` |
| **Domain types** | No suffix | `GraphPaperDetail`, `ClusterInfo`, `ModeConfig` |
| **Strategy unions** | PascalCase | `PointColorStrategy`, `LayoutStrategy` |
| **Props** | `<Component>Props` suffix | `DashboardClientShellProps`, `PanelShellProps` |

**Rules**:
- Never prefix interfaces with `I` (e.g., not `IGraphData`; use `GraphData`).
- The codebase leans heavily on `interface` (~503 declarations vs ~177 `type`). Default to `interface` for object shapes; use `type` for unions, intersections, and mapped/utility-type compositions where `interface` would not compile.
- Suffix DB row types with `Row` to distinguish raw database shapes from domain models.

---

## 7. Store Naming

| Element | Convention | Examples |
|---------|-----------|----------|
| **Hook** | `use<Domain>Store` | `useDashboardStore`, `useGraphStore`, `useWikiStore` |
| **Actions** | `set<Field>` / `toggle<Field>` | `setPointColorColumn`, `toggleTimeline` |
| **Selectors** | `select<Concept>` | `selectBottomClearance`, `selectLeftClearance` |
| **File** | `<domain>-store.ts` | `dashboard-store.ts`, `graph-store.ts`, `snapshot-store.ts` |
| **Location** | `features/<domain>/stores/` for cross-subsystem stores; co-located in `features/<domain>/<subsystem>/` for subsystem-private stores | `features/graph/stores/dashboard-store.ts`; `features/orb/interaction/orb-picker-store.ts`, `features/orb/webgpu/orb-webgpu-runtime-store.ts` |

**Pattern**:
```typescript
// features/graph/stores/dashboard-store.ts
export const useDashboardStore = create<DashboardState>()((set) => ({
  timeline: false,
  toggleTimeline: () => set((s) => ({ timeline: !s.timeline })),
  pointColorColumn: null,
  setPointColorColumn: (col) => set({ pointColorColumn: col }),
}))

// Selectors — defined outside the store for reuse
export const selectBottomClearance = (state: DashboardState) =>
  state.timeline ? TIMELINE_HEIGHT : 0
```

---

## 8. Test File Conventions

The codebase has 186 `.test.ts(x)` files and zero `.spec.*` files. Two rules:

1. **Suffix is always `.test.ts(x)`** — never `.spec`.
2. **Tests live in a co-located `__tests__/` directory**, not next to the source file. Example: source `features/graph/stores/dashboard-store.ts`, test `features/graph/stores/__tests__/dashboard-store.test.ts`.

Compound-component hook tests follow camelCase: `interactions/ChatThread/__tests__/useChatThread.test.tsx`.

---

## 9. Directory Organization

### Feature-module structure

```
apps/web/features/<domain>/
  components/    # PascalCase.tsx
  hooks/         # use-kebab.ts (top-level)
  stores/        # <name>-store.ts
  lib/           # kebab-case.ts utilities, PascalCase.ts classes
  __tests__/     # *.test.ts(x), or per-subdirectory __tests__/
```

Sub-features can carry their own `__tests__/` (e.g., `features/graph/duckdb/__tests__/`). Compound-component directories (interaction shells, controllers) co-locate the component, its hook, and its test:

```
features/wiki/module-runtime/interactions/ChatThread/
  ChatThread.tsx
  useChatThread.ts
  __tests__/useChatThread.test.tsx
```

### 600-line file policy

The hard rule is "files exceeding 600 lines should be decomposed into a directory with `index.ts` re-exports."

Current explicit waivers (audited 2026-05-09):

| File | Lines | Status |
|------|-------|--------|
| `features/graph/components/panels/prompt/__tests__/use-rag-query.test.ts` | 790 | Test exempt (see below) |
| `features/graph/stores/__tests__/dashboard-store.test.ts` | 744 | Test exempt |
| `features/orb/webgpu/orb-webgpu-runtime.ts` | 833 | Deferred decomp — single-file WebGPU runtime contract |
| `features/graph/components/panels/PanelShell/surface-lab/SurfaceLabPage.tsx` | 662 | Deferred decomp — lab page |
| `features/graph/components/shell/loading/graph-loading-constellations.ts` | 619 | Deferred decomp — generated/data-table constants |
| `features/field/controller/BlobController.ts` | 604 | Deferred decomp — single class |

**Tests are exempt** from the 600-line rule. Decomposing test files harms readability and breaks the "one suite per source file" mental model.

**Production source on the deferred decomp list** is grandfathered until a focused refactor lands. New production files must obey the 600-line rule. If you grow an existing file past 600 lines, prefer extraction over inflation.

### Decomposition pattern

```
# Before
features/graph/components/BigComponent.tsx  (700 lines)

# After
features/graph/components/BigComponent/
  index.ts          # Re-exports public API
  BigComponent.tsx  # Main component
  helpers.ts        # Extracted utilities
  types.ts          # Component-specific types
```

```typescript
// index.ts
export { BigComponent } from "./BigComponent"
export type { BigComponentProps } from "./BigComponent"
```

---

## 10. CSS Variables

### Pattern: `--{scope}-{element}-{property}`

All CSS custom properties use kebab-case with a scope prefix.

### Source of truth

Tokens live in `apps/web/app/styles/tokens.css` and are cascaded by `apps/web/app/globals.css` via `@import "./styles/tokens.css"`. Per-surface overrides live in the matching `styles/<surface>.css` file (e.g., `graph-ui.css`, `wiki-content.css`).

Define new tokens in `app/styles/tokens.css`. Do not redefine tokens directly inside `globals.css` — `globals.css` only orchestrates the import order.

### Scope taxonomy (representative)

The active codebase uses 25+ scope prefixes. Pick the one that matches your concern; create a new scope only when none of the existing ones fit:

| Family | Examples |
|--------|----------|
| Identity | `brand-*`, `mode-*`, `color-*`, `tint-*` |
| Surface | `surface-*`, `panel-*`, `app-*`, `background-*`, `border-*`, `shadow-*`, `rim-*`, `radius-*` |
| Typography | `font-*`, `text-*`, `on-*` (on-color contrast pairs) |
| Component | `graph-*`, `graph-panel-*`, `wiki-*`, `wiki-graph-node-*`, `panel-*`, `module-*`, `entity-*`, `icon-*` |
| Feedback / interactive | `feedback-*`, `interactive-*`, `filter-*` |
| Vendor | `cosmograph-*`, `cosmograph-ui-*` (Cosmograph widget theme overrides) |

Compound prefixes (`graph-panel-`, `wiki-graph-node-`) are preferred over deep `--graph-panel__node` BEM-style names — keep one kebab-case path.

### Rules

- Define in `app/styles/tokens.css` under both `:root` (light) and `.dark` (dark) blocks.
- Use semantic names (`--surface`, `--text-primary`) over appearance names (`--light-gray`).
- Cosmograph overrides go in `html:root` block (higher specificity than `:root`).
- Never hardcode hex in components — always reference a CSS variable.
- For full token-system policy (palette, dark mode, semantic mapping), defer to `/aesthetic`.

---

## 11. Database & Domain Casing

- **Database column names**: `snake_case`. Drizzle schema lives in `apps/web/lib/db/schema.ts`. Never use camelCase column identifiers in SQL or in column-mapping objects.
- **Database row types in TS**: PascalCase with `Row` suffix (`GraphPaperDetailRow`).
- **Brand symbol**: always `SoleMD` (PascalCase, capital `MD`). Not `Solemd`, not `SoleMd`, not `solemd` outside file paths or hostnames. The string literal in `app/layout.tsx` and all metadata uses `SoleMD`.

---

## 12. Quick Reference

| I want to... | Name it like... |
|---|---|
| Create a component | `PascalCase.tsx`, `export function PascalCase` |
| Create a top-level hook | `use-kebab.ts` in `hooks/`, `export function useCamelCase` |
| Create a compound-component hook | `useCamelCase.ts` next to `Component.tsx` |
| Create a utility module | `kebab-case.ts`, `export function camelCase` |
| Create a class module | `PascalCase.ts`, `export class PascalCase` |
| Create a store | `domain-store.ts` in `stores/`, `export const useDomainStore` |
| Create a type | `PascalCase` (no prefix; `Row` suffix for DB types) |
| Create a constant (primitive) | `UPPER_SNAKE_CASE` |
| Create a constant (object) | `camelCase` |
| Create a CSS variable | `--scope-element-property` in `app/styles/tokens.css` |
| Create a Next.js page | `app/<segment>/page.tsx` with `export default function NamedPage()` |
| Create an API route | `app/api/<domain>/<noun>/route.ts` with `export async function GET()` |
| Mark a file as Client Component | `"use client";` (double-quoted, semicolon, line 1) |
| Wrap a server route in a client tree | `<Domain>ClientShell.tsx` co-located in the route segment |
| Decompose a large file | Directory with `index.ts` re-exports (test files exempt) |
