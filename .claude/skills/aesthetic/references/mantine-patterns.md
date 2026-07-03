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
//   extendedPastelVarNameByKey       — 12 PanelEdgeToc palette keys
//   dotTocPastelColorSequence        — 20-color cycle
//   semanticColorVarNameByKey        — 9 entity-type → wiki-graph colors
//   entityTypeCssColorByType         — runtime hex per entity type
```

`mantineNeutralColorsTuple` is a Mantine compatibility gray ramp. It is not the
shell surface contract. Page, panel, and landing backgrounds still come from
`app/styles/tokens.css`.

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
  white: themeSurfaceFallbackHexByKey.white,   // "#ffffff"
  black: themeSurfaceFallbackHexByKey.black,   // "#1a1817" (warm off-black, mirror of --text-primary)
})
```

`themeSurfaceFallbackHexByKey` lives in `apps/web/lib/pastel-tokens.ts`.
Mantine's `theme.black` matches `tokens.css` `--text-primary` so filled-button
text contrast lines up with body text.

### Provider setup

The provider is configured in `apps/web/app/providers.tsx` and the HTML root
in `apps/web/app/layout.tsx`. The defaults are **dark**, not `auto` — the
project ships a dark-first product surface and only opts back to light when
the user explicitly sets `mantine-color-scheme-value` to `"light"` in
`localStorage`.

```tsx
// apps/web/app/providers.tsx
const resolveCssVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-body": "var(--background)" },
  dark:  { "--mantine-color-body": "var(--background)" },
});

<MantineProvider
  theme={mantineTheme}
  defaultColorScheme="dark"
  cssVariablesResolver={resolveCssVariables}
>
  <DarkClassSync>
    <ShellRuntimeBindings>{children}</ShellRuntimeBindings>
  </DarkClassSync>
</MantineProvider>

// apps/web/app/layout.tsx
<html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} {...mantineHtmlProps}>
  <head>
    <ColorSchemeScript defaultColorScheme="dark" />
    {/* Pre-paint .dark class to mirror ColorSchemeScript and prevent FOUC */}
    <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_DARK_SYNC }} />
  </head>
  <body>
    <Providers>{children}</Providers>
  </body>
```

The `cssVariablesResolver` is wired (contrary to older docs that claimed
"not currently used"). It retargets `--mantine-color-body` at our
`--background` token. Why it has to be in `light`/`dark` and not `variables`:
Mantine's own dark override uses selector
`:root[data-mantine-color-scheme='dark']` (specificity `0,2,0`), which beats
plain `:root` (`0,1,0`) from `variables`. The `light`/`dark` keys inject at
matching specificity, so source order wins — the resolver runs after
Mantine's base stylesheet. See `references/css-architecture.md` for the
unlayered-vs-layered rule that drives this decision.

`mantineHtmlProps` is required: it injects `suppressHydrationWarning` plus
the data attributes Mantine needs to avoid SSR mismatch.

### DarkClassSync

Mantine uses `data-mantine-color-scheme` but our CSS tokens use `.dark` class. `DarkClassSync` bridges them:
- Reads `useComputedColorScheme("dark")` (resolves `auto` → concrete value, defaulting to dark)
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
  black: '#1a1817',                   // Warm off-black, mirror of --text-primary
})
```

### cssVariablesResolver — IS wired

This project does use `cssVariablesResolver` (in `apps/web/app/providers.tsx`)
to retarget `--mantine-color-body` at `--background`. The full pattern is:

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

In SoleMD design tokens live in `app/styles/tokens.css`, so the resolver is
intentionally minimal — it only injects body-level overrides where the
unlayered-vs-layered cascade would otherwise lose. Don't expand the resolver
to mirror the rest of `tokens.css`; that would duplicate the source of
truth.

### `vars` prop — runtime CSS vars on a single instance

Mantine 8's canonical way to plumb a runtime CSS var into a component's
internals is the `vars` callback. Use it when one instance of a component
needs to deviate from the global theme without subclassing CSS:

```tsx
<Button
  size="md"
  vars={(theme, props) => ({
    root: {
      '--button-fz': props.size === 'xxl' ? '24px' : undefined,
      '--button-padding-x': props.size === 'xxl' ? '32px' : undefined,
    },
  })}
>
  Custom-sized
</Button>
```

`vars` is preferred over reaching into `styles` for everything Mantine
already exposes as a CSS variable (font-size, padding, color, radius, height).
The variable names follow Mantine's component-internal naming (`--button-*`,
`--input-*`, etc.) — check the component's docs for the full list.

### `theme.autoContrast` — dynamic black/white text on filled colors

When you turn on `theme.autoContrast = true` (with optional
`theme.luminanceThreshold`), Mantine auto-picks black or white text on
filled buttons/badges based on the shade's luminance. This generalizes the
`DARK_ON_COLOR` pattern: instead of forcing `#1a1817` everywhere a pastel
button has dark text, Mantine computes it.

```ts
createTheme({
  autoContrast: true,
  luminanceThreshold: 0.4, // optional: tune flip point
  // …rest
})
```

If you turn it on, audit existing `DARK_ON_COLOR` callers — most can drop
the explicit color override.

### `theme.respectReducedMotion`

Setting `theme.respectReducedMotion = true` automatically gates Mantine's
`Transition` component on `prefers-reduced-motion: reduce`. This is the
zero-cost way to make every Mantine-driven animation respect the OS
preference. Custom animations elsewhere still need their own gate (see
`/animation-authoring`).

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

## React 19 + React Compiler Patterns

This project ships React 19 (`^19.2.4`) and `babel-plugin-react-compiler`
(`^19.1.0-rc.3`). Authoring rules:

- **Don't add `useMemo`/`useCallback`/`React.memo` defensively.** The
  compiler memoizes inputs and expressions automatically. Sprinkling them
  in defeats the optimizer and adds noise.
- **Escape hatch.** If a hot-path component must opt out (e.g. you depend
  on referential identity equality across renders that the compiler would
  otherwise inline), add `'use no memo'` at the top of the file or function.
- **`useActionState` is the React 19 owner-of-result hook.** When a form
  submission needs state, use `useActionState` — it replaces the
  `useFormStatus`-as-state-owner pattern. `useFormStatus` is still the right
  choice for read-only child components inside a `<form>` that need pending
  state but do not own the result.

```tsx
// React 19 form pattern with Mantine
'use client';
import { useActionState } from 'react';
import { Button, TextInput } from '@mantine/core';

async function submit(prev: State, formData: FormData) {
  // server action or async function returning new state
  return { ok: true, value: String(formData.get('q') ?? '') };
}

export function SearchForm() {
  const [state, formAction, isPending] = useActionState(submit, { ok: false, value: '' });
  return (
    <form action={formAction}>
      <TextInput name="q" defaultValue={state.value} />
      <Button type="submit" loading={isPending}>Search</Button>
    </form>
  );
}
```

- **`mantineHtmlProps`** on `<html>` is required for SSR — it injects
  `suppressHydrationWarning` plus the Mantine data attributes that prevent
  flicker across the React 19 hydration boundary.

## Container Queries

When you author a panel that has to scale its internal layout to its own
host (not the viewport), the canonical pattern is a CSS container query:

```css
/* On a panel surface */
.panel-host {
  container-type: inline-size;
  container-name: panel;
}

/* On internal content */
@container panel (min-width: 480px) {
  .panel-grid { grid-template-columns: 1fr 1fr; }
}
```

Tailwind 4 generates container-query variants out of the box once the host
sets `@container/panel`:

```tsx
<section className="@container/panel">
  <div className="grid grid-cols-1 @sm/panel:grid-cols-2 @md/panel:grid-cols-3" />
</section>
```

Use container queries for SoleMD's docked / floating / fullscreen panel
surfaces — the panel host itself is what changes width as the user pins,
unpins, or fullscreens. Media queries on the viewport miss those transitions.

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
return <div style={{ background: isDark ? '#1c1c1f' : '#faf9f7' }} />;

// GOOD — CSS vars auto-swap
return <div className="bg-[var(--background)]" />;
```

## Components & Hooks In Use

Defaults wired in `lib/mantine-theme.ts` (see Theme Configuration above):
`Button` (`radius="xl"` / `size="md"` / `fontWeight: 400`), `Card` /
`Paper` / `TextInput` / `Select` / `Textarea` / `ActionIcon` (`radius="lg"`),
`Badge` (`radius="xl"`). Layout primitives — `Stack`, `Group`, `Flex`,
`Container`, `SimpleGrid` — pull no defaults; reach for them as needed.
Reach for `@mantine/core` first; the project lists 145 components in the
Mantine MCP.

Common hooks from `@mantine/hooks`: `useDisclosure` (open/close state),
`useWindowScroll` (sticky header), `useMantineColorScheme` (read/write
scheme), `useComputedColorScheme` (resolves `auto` to a concrete value).

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

1. **Mantine MCP server** (first-party, fastest)
   - `mcp__mantine__list_items`, `mcp__mantine__get_item_doc`,
     `mcp__mantine__get_item_props`, `mcp__mantine__search_docs`
   - 145 components, props normalized, official source
   - Best first stop for any Mantine question
2. **context7 MCP** (fallback for adjacent libs / latest snippets)
   - `mcp__context7__resolve-library-id` → `mcp__context7__query-docs`
   - Use when the answer needs cross-library context (Tailwind, Next, React 19)
3. **Local reference** (offline, complete)
   - `docs/mantine-llms.txt` (full Mantine docs in markdown) when you need
     to grep without an active MCP
4. **MantineHub** (visual reference)
   - [mantinehub.com](https://mantinehub.com/) — interactive theme builder
   - Exports CSS variables, not JS `createTheme()` objects (would need
     translation if you want to fold something into `lib/mantine-theme.ts`)
   - Good for previewing component variants/sizes; has copy-paste Blocks
     and Dashboard Templates inspired by shadcn themes
