---
name: naming
description: |
  SoleMD.Web naming conventions — file names, exports, constants, types, stores, directories,
  and CSS variables. Make sure to use this skill whenever the user creates new files, components,
  hooks, stores, types, or CSS variables — even casual phrases like "what should I name this,"
  "add a new component," "create a hook," "naming convention," or "where does this file go."
  Always consult this skill before creating new files or exports to ensure consistent naming
  across the codebase.

  Triggers: naming, convention, file name, export, constant, type, interface, store, directory,
  css variable, PascalCase, camelCase, kebab-case, snake_case, UPPER_SNAKE, component name,
  hook name, store name, new file, new component, new hook, new store, new type, create file,
  rename, casing, suffix, prefix, organization, 600-line limit.

  Do NOT use for: CSS token values or color system (use /aesthetic),
  Cosmograph data props or WebGL (use /cosmograph),
  Neo4j code graph (use /graph).
version: 1.0.0
allowed-tools:
  - Read
  - Glob
  - Grep
metadata:
  short-description: File, export, constant, type, store, directory, and CSS variable naming conventions
---

# SoleMD.Web — Naming Conventions

## 1. File Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Components** | `PascalCase.tsx` | `DashboardShell.tsx`, `PanelShell.tsx`, `ModeColorSync.tsx` |
| **Hooks** | `use-<name>.ts` (kebab-case) | `use-typewriter.ts`, `use-graph-data.ts` |
| **Lib / utilities** | `kebab-case.ts` | `brand-colors.ts`, `duckdb-queries.ts` |
| **Stores** | `<name>-store.ts` (kebab-case) | `dashboard-store.ts`, `graph-store.ts` |
| **Tests** | `kebab-case.test.ts` | `duckdb-queries.test.ts`, `use-typewriter.test.ts` |
| **Routes** | `lowercase` (Next.js convention) | `app/graph/page.tsx`, `app/about/page.tsx` |

---

## 2. Export Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **Components** | PascalCase named export | `export function DashboardShell()` |
| **Hooks** | `useCamelCase` | `export function useTypewriter()` |
| **Functions** | `camelCase` | `export function formatNumber()` |
| **Default exports** | Avoid — prefer named exports | `export function X` over `export default function` |

**Rule**: Prefer named exports over default exports. Named exports enforce consistent import names across the codebase and enable better tree-shaking and refactoring support.

---

## 3. Constant Casing (Two-Tier Rule)

### `UPPER_SNAKE_CASE` — Primitive / symbolic constants

Use for strings, numbers, frozen sets, and other immutable primitive values.

```typescript
const PANEL_TOP = 104
const NOISE_COLOR = "#ccc"
const READ_ONLY_QUERY_PREFIXES = ["SELECT", "EXPLAIN"] as const
const MAX_RETRIES = 3
const DEFAULT_ZOOM = 1.5
```

### `camelCase` — Style objects / config objects

Use for Mantine `styles` props, configuration objects, and any non-primitive `const`.

```typescript
const iconBtnStyles = { root: { border: 'none' } }
const panelTextStyle = { color: 'var(--text-secondary)', fontSize: 13 }
const badgeAccentStyles = { root: { backgroundColor: 'var(--mode-accent-subtle)' } }
const defaultChartConfig = { animate: true, duration: 300 }
```

### Rationale

Primitive constants are true "constants" — immutable values that never change shape. Style objects are *configuration* that happens to be `const`. The visual distinction (`PANEL_TOP` vs `panelTextStyle`) signals whether you're looking at a value or a structure at a glance.

---

## 4. Type / Interface Naming

| Category | Convention | Examples |
|----------|-----------|----------|
| **General** | PascalCase, no `I` prefix | `GraphPaperDetail`, `ClusterInfo` |
| **DB row types** | `<Entity>Row` suffix | `GraphPaperDetailRow`, `ChunkRow` |
| **Domain types** | No suffix | `GraphPaperDetail`, `ClusterInfo`, `ModeConfig` |
| **Strategy unions** | PascalCase | `PointColorStrategy`, `LayoutStrategy` |
| **Props** | `<Component>Props` suffix | `DashboardShellProps`, `PanelShellProps` |

**Rules**:
- Never prefix interfaces with `I` (e.g., `IGraphData` — use `GraphData`)
- Use `type` for unions and intersections, `interface` for object shapes that may be extended
- Suffix DB row types with `Row` to distinguish raw database shapes from domain models

---

## 5. Store Naming

| Element | Convention | Examples |
|---------|-----------|----------|
| **Hook** | `use<Domain>Store` | `useDashboardStore`, `useGraphStore` |
| **Actions** | `set<Field>` / `toggle<Field>` | `setPointColorColumn`, `toggleTimeline` |
| **Selectors** | `select<Concept>` | `selectBottomClearance`, `selectLeftClearance` |
| **File** | `<domain>-store.ts` | `dashboard-store.ts`, `graph-store.ts` |

**Pattern**:
```typescript
// lib/graph/stores/dashboard-store.ts
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

## 6. Directory Organization

### Standard directories

| Path | Contents |
|------|----------|
| `components/graph/` | Graph UI components |
| `components/graph/explore/` | Explore-mode panel components (future: `ask/`, `write/`, `learn/` per mode) |
| `lib/graph/hooks/` | Custom hooks |
| `lib/graph/stores/` | Zustand stores |
| `lib/` | Shared utilities and configuration |
| `app/` | Next.js routes and layouts |

### 600-line limit

Files exceeding 600 lines MUST be decomposed into a directory with `index.ts` re-exports:

```
# Before
components/graph/BigComponent.tsx  (700 lines)

# After
components/graph/BigComponent/
  index.ts          # Re-exports public API
  BigComponent.tsx  # Main component
  helpers.ts        # Extracted utilities
  types.ts          # Component-specific types (if needed)
```

The `index.ts` re-exports preserve the same import path for consumers:
```typescript
// index.ts
export { BigComponent } from './BigComponent'
export type { BigComponentProps } from './BigComponent'
```

---

## 7. CSS Variables

### Pattern: `--{scope}-{element}-{property}`

All CSS custom properties use kebab-case with a scope prefix.

| Scope | Purpose | Examples |
|-------|---------|----------|
| `graph-panel-` | Graph panel tokens | `--graph-panel-text-dim`, `--graph-panel-bg` |
| `graph-prompt-` | Prompt box tokens | `--graph-prompt-bg`, `--graph-prompt-border` |
| `mode-` | Active mode tokens | `--mode-accent`, `--mode-accent-subtle` |
| `brand-` | Brand identity tokens | `--brand-accent`, `--brand-accent-alt` |
| `color-` | Named palette colors | `--color-soft-blue`, `--color-warm-coral` |
| `shadow-` | Shadow levels | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| `cosmograph-ui-` | Cosmograph widget theme | `--cosmograph-ui-widget-background` |

### Rules

- Always define in both `:root` (light) and `.dark` (dark) blocks in `globals.css`
- Use semantic names (`--surface`, `--text-primary`) over appearance names (`--light-gray`)
- Cosmograph overrides go in `html:root` block (higher specificity)
- Never hardcode hex in components — always reference a CSS variable

---

## Quick Reference

| I want to... | Name it like... |
|---|---|
| Create a component | `PascalCase.tsx`, `export function PascalCase` |
| Create a hook | `use-kebab.ts`, `export function useCamelCase` |
| Create a utility | `kebab-case.ts`, `export function camelCase` |
| Create a store | `domain-store.ts`, `export const useDomainStore` |
| Create a type | `PascalCase` (no prefix, `Row` suffix for DB types) |
| Create a constant (primitive) | `UPPER_SNAKE_CASE` |
| Create a constant (object) | `camelCase` |
| Create a CSS variable | `--scope-element-property` |
| Decompose a large file | Directory with `index.ts` re-exports |
