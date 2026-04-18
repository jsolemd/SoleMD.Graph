# Mantine 8 Patterns in SoleMD.Web

## Theme Configuration

The Mantine theme is configured in `lib/mantine-theme.ts`. It imports the 10-shade color tuples from `lib/pastel-tokens.ts` (the canonical CSS-var ↔ Mantine-tuple bridge) and pulls shadows from `app/styles/tokens.css`.

### Pastel-tokens bridge

```ts
// lib/pastel-tokens.ts (excerpt)
export const mantineBrandColorsTuple: MantineColorsTuple = [
  '#eef3f9', '#dce7f4', '#c9dcef',
  '#a8c5e9',  // [3] — primary, matches --color-soft-blue
  '#92b3d7', '#7c9fc5', '#668bb3', '#5077a1', '#3a638f', '#244f7d',
];

export const mantineNeutralColorsTuple: MantineColorsTuple = [
  '#fafafa', '#f5f5f5', '#eaedf0', '#d1d5db', '#9ca3af',
  '#6b7280', '#5c5f66', '#4b5563', '#374151', '#1f2937',
];

// Also exports:
//   brandPastelVarNameByKey          — 9 keys → CSS var names
//   extendedPastelVarNameByKey       — 12 DotToc palette keys
//   dotTocPastelColorSequence        — 20-color cycle
//   semanticColorVarNameByKey        — 9 entity-type → wiki-graph colors
//   entityTypeCssColorByType         — runtime hex per entity type
```

### Current theme settings (actual code)

```typescript
// lib/mantine-theme.ts
import { mantineBrandColorsTuple, mantineNeutralColorsTuple } from "./pastel-tokens";

const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 3, dark: 3 },
  colors: { brand: mantineBrandColorsTuple, gray: mantineNeutralColorsTuple },
  fontFamily: 'var(--font-sans)',
  headings: { fontFamily: 'var(--font-sans)', fontWeight: '500' },
  radius: {
    xs: '0.25rem', sm: '0.5rem', md: '0.75rem',
    lg: '1rem', xl: '1.5rem',
  },
  defaultRadius: 'lg',
  shadows: {
    xs: 'var(--shadow-sm)', sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)', lg: 'var(--shadow-lg)', xl: 'var(--shadow-lg)',
  },
  components: {
    Button:     { defaultProps: { radius: 'xl', size: 'md' },
                  styles: { root: { fontWeight: 400, transition: 'all 200ms ease' } } },
    Card:       { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'xl' } },
    TextInput:  { defaultProps: { radius: 'lg', size: 'md' } },
    Select:     { defaultProps: { radius: 'lg', size: 'md' } },
    Textarea:   { defaultProps: { radius: 'lg', size: 'md' } },
    ActionIcon: { defaultProps: { radius: 'lg', size: 'md' } },
    Paper:      { defaultProps: { radius: 'lg', shadow: 'sm', padding: 'md' } },
    Badge:      { defaultProps: { radius: 'xl' } },
  },
  white: '#ffffff',
  black: '#1a1b1e',
})
```

### Provider setup

```tsx
// app/providers.tsx
<MantineProvider theme={theme} defaultColorScheme="auto">
  <DarkClassSync />  {/* Keeps .dark class on <html> in sync */}
  {children}
</MantineProvider>

// app/layout.tsx
<html lang="en" {...mantineHtmlProps}>
  <head>
    <ColorSchemeScript defaultColorScheme="auto" />
  </head>
  <body>
    <Providers>{children}</Providers>
  </body>
```

### DarkClassSync

Mantine uses `data-mantine-color-scheme` but our CSS tokens use `.dark` class. `DarkClassSync` bridges them:
- Reads `useComputedColorScheme()` (resolves "auto" to actual value)
- Toggles `.dark` class on `<html>` accordingly
- Runs as a client component effect

## Mantine 8 Key APIs

### createTheme

Creates a partial theme override merged with defaults. Key properties:

```typescript
createTheme({
  primaryColor: 'brand',           // Which color tuple to use as primary
  primaryShade: { light: 3, dark: 3 }, // Which shade index for filled variants
  colors: { brand: [...10 shades] },   // Custom color tuples
  fontFamily: 'var(--font-sans)',       // CSS var reference
  radius: { xs, sm, md, lg, xl },      // Radius scale
  defaultRadius: 'lg',                 // Default radius for all components
  shadows: { xs, sm, md, lg, xl },     // Shadow scale (accepts CSS var refs)
  other: { ... },                      // Arbitrary bag for custom values
  components: { ... },                 // Component-level defaults
  white: '#ffffff',                    // White override
  black: '#1a1b1e',                   // Black override
})
```

### cssVariablesResolver

Inject custom CSS vars per color scheme. Not currently used by SoleMD.Graph (our vars are in `app/styles/tokens.css`) but available:

```typescript
const resolver: CSSVariablesResolver = (theme) => ({
  variables: {
    '--mantine-hero-height': `${theme.other.heroHeight}px`,
  },
  light: {
    '--mantine-color-deep-orange': theme.other.deepOrangeLight,
  },
  dark: {
    '--mantine-color-deep-orange': theme.other.deepOrangeDark,
  },
});
// <MantineProvider theme={theme} cssVariablesResolver={resolver}>
```

### virtualColor

Map one color name to different palettes per scheme:

```typescript
import { virtualColor } from '@mantine/core';
const theme = createTheme({
  primaryColor: 'primary',
  colors: {
    primary: virtualColor({ name: 'primary', dark: 'pink', light: 'cyan' }),
  },
});
```

### MantineProvider Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `theme` | `MantineThemeOverride` | - | Merged with default theme |
| `defaultColorScheme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Initial color scheme |
| `forceColorScheme` | `'light' \| 'dark'` | - | Locks scheme, ignores manager |
| `cssVariablesSelector` | `string` | `':root'` | Where CSS vars injected |
| `withCssVariables` | `boolean` | `true` | Whether to inject CSS vars |
| `deduplicateCssVariables` | `boolean` | `true` | Skip vars identical to defaults |
| `cssVariablesResolver` | `CSSVariablesResolver` | - | Custom CSS variable generator |
| `classNamesPrefix` | `string` | `'mantine'` | Prefix for static class names |

## Styling Patterns

### className (Tailwind) — use for layout and spacing

```tsx
<Button className="w-full mt-4 px-6">Submit</Button>
<Card className="bg-[var(--surface)] rounded-[1rem] p-8">Content</Card>
<Stack className="gap-6 max-w-2xl mx-auto">Items</Stack>
```

### styles prop — use only for Mantine internal sub-elements

```tsx
// Override Mantine's internal sub-element styles
<TextInput
  styles={{
    input: { backgroundColor: 'var(--graph-panel-input-bg)' },
    label: { color: 'var(--graph-panel-text-muted)' },
  }}
/>
```

### classNames prop — use for targeting Mantine slots by name

```tsx
<Drawer
  classNames={{
    header: 'bg-[var(--surface)]',
    body: 'bg-[var(--surface)] p-6',
    close: 'text-[var(--foreground)]',
  }}
/>
```

### When to use which

| Need | Use |
|------|-----|
| Layout, spacing, positioning | `className` with Tailwind |
| Colors, shadows, radius | CSS vars via `className` or theme defaults |
| Override Mantine's internal DOM | `styles` prop (object with sub-element keys) |
| Override Mantine's internal classes | `classNames` prop (object with sub-element keys) |
| Global component defaults | `components` in `lib/mantine-theme.ts` |

### Cosmograph Widgets (Special Case)

Cosmograph sub-components (`CosmographSearch`, `CosmographHistogram`, `CosmographBars`, etc.) are NOT Mantine components. They have their own CSS variable system. Wrap them in Mantine layout:

| Need | Use |
|------|-----|
| Layout around widgets | Mantine Stack/Group + className for Tailwind spacing |
| Style widget appearance | CSS vars in `tokens.css` `html:root` block (see /aesthetic → cosmograph-integration.md) |
| Widget container div | Never inline styles on containers — portaled elements won't inherit. Use CSS vars |
| Shared panel chrome | Import style objects from the `PanelShell` barrel (`features/graph/components/panels/PanelShell`) — see /aesthetic → panel-patterns.md |
| Error boundaries | Wrap volatile Cosmograph widgets in `CosmographWidgetBoundary` (see /aesthetic → panel-patterns.md) |

For Cosmograph CSS variable taxonomy: see /aesthetic → [references/cosmograph-integration.md](cosmograph-integration.md)
For Cosmograph React props and data: see /cosmograph skill
For concrete panel styling code examples: see /aesthetic → [references/panel-patterns.md](panel-patterns.md)

## Color Scheme

### Reading color scheme

```tsx
'use client';
import { useMantineColorScheme, useComputedColorScheme } from '@mantine/core';

function MyComponent() {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('light'); // resolves 'auto'

  // Toggle
  setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
}
```

### Never do this

```tsx
// BAD — causes hydration mismatches, doesn't work with SSR
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
return <div style={{ background: isDark ? '#1c1c1f' : '#fafafa' }} />;

// GOOD — CSS vars auto-swap
return <div className="bg-[var(--background)]" />;
```

## Components Currently Used

### From `@mantine/core`

| Component | Common Usage | Defaults |
|-----------|-------------|----------|
| `Button` | CTAs, form submissions | `radius="xl"`, `size="md"`, `fontWeight: 400` |
| `Card` | Content containers | `radius="lg"`, `shadow="sm"`, `padding="xl"` |
| `Text` | Body text | Inherits Inter font |
| `Title` | Headings (h1-h6) | Medium (500) weight |
| `Stack` | Vertical flex layout | - |
| `Group` | Horizontal flex layout | - |
| `Container` | Max-width wrapper | - |
| `SimpleGrid` | Responsive grid | - |
| `Skeleton` | Loading placeholders | - |
| `Badge` | Labels, tags | `radius="xl"` |
| `Alert` | Notices, warnings | - |
| `ActionIcon` | Icon-only buttons | `radius="lg"`, `size="md"` |
| `Tooltip` | Hover hints | - |
| `Burger` | Mobile menu toggle | - |
| `Drawer` | Side panels (mobile nav) | - |
| `Anchor` | Styled links | - |
| `Flex` | Flexible layout | - |
| `Paper` | Surface container | `radius="lg"`, `shadow="sm"`, `padding="md"` |
| `TextInput` | Text input | `radius="lg"`, `size="md"` |
| `Select` | Dropdown select | `radius="lg"`, `size="md"` |
| `Textarea` | Multi-line input | `radius="lg"`, `size="md"` |

### From `@mantine/hooks`

| Hook | Usage |
|------|-------|
| `useDisclosure` | Toggle boolean state (drawers, modals) |
| `useWindowScroll` | Track scroll position (sticky header) |
| `useMantineColorScheme` | Color scheme state (read/write) |
| `useComputedColorScheme` | Resolved color scheme (always 'light' or 'dark') |

## Extensions (Not Installed)

Install on demand with `npm install --legacy-peer-deps`:

| Package | Use Case | Install |
|---------|----------|---------|
| `@mantine/form` | Form state, validation | `npm i @mantine/form --legacy-peer-deps` |
| `@mantine/dates` | Date/time pickers | `npm i @mantine/dates dayjs --legacy-peer-deps` |
| `@mantine/notifications` | Toast notifications | `npm i @mantine/notifications --legacy-peer-deps` |
| `@mantine/modals` | Modal manager | `npm i @mantine/modals --legacy-peer-deps` |
| `@mantine/spotlight` | Command palette (Cmd+K) | `npm i @mantine/spotlight --legacy-peer-deps` |
| `@mantine/carousel` | Image/content carousel | `npm i @mantine/carousel embla-carousel-react --legacy-peer-deps` |
| `@mantine/charts` | Recharts wrapper | `npm i @mantine/charts recharts --legacy-peer-deps` |
| `@mantine/code-highlight` | Syntax highlighting | `npm i @mantine/code-highlight --legacy-peer-deps` |
| `@mantine/dropzone` | File upload | `npm i @mantine/dropzone --legacy-peer-deps` |
| `@mantine/nprogress` | Navigation progress bar | `npm i @mantine/nprogress --legacy-peer-deps` |

After installing, add the package CSS import in `app/layout.tsx`:
```tsx
import '@mantine/dates/styles.css'; // example for dates
```

## Mantine API Lookup

### Priority order

1. **doc-search MCP** (broadest, most reliable)
   - `query-docs` with library `/mantinedev/mantine` (8,173 chunks, v8.3.16)
   - Good for component APIs, hooks, patterns, cross-referencing
   - Indexed 2026-03-05 from `mantinedev/mantine` master

2. **context7 MCP** (latest snippets)
   - `resolve-library-id` with `mantine` → `query-docs`
   - Good for latest API surface and code examples

3. **Local reference** (offline, complete)
   - `docs/mantine-llms.txt` (2.2MB, full Mantine docs in markdown)
   - Read specific sections for complete API details

4. **MantineHub** (visual reference)
   - [mantinehub.com](https://mantinehub.com/) — interactive theme builder playground
   - Exports CSS variables (not JS `createTheme()` objects)
   - Good for visual component preview across all variants/sizes
   - Has copy-paste Blocks (Hero, Features, FAQ, Pricing, Newsletter, Team, Testimonials)
   - Has Dashboard Templates (stats, chat, payments, team, calendar)
   - Source: `github.com/RubixCube-Innovations/mantine-theme-builder`
   - Inspired by shadcn themes
   - Limitation: exports CSS vars, not JS theme objects — would need translation for `lib/mantine-theme.ts`
