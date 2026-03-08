# Optional Dependencies

Libraries documented but **not installed** in the production bundle.
Install on demand when building the feature that needs them.

All installs require `--legacy-peer-deps` (visx + React 19 peer conflict).

## Forms & Validation

```bash
npm install react-hook-form @hookform/resolvers zod --legacy-peer-deps
```

## Date Handling

```bash
npm install date-fns react-day-picker --legacy-peer-deps
```

## UI Components

```bash
# Carousel (standalone — Mantine carousel uses embla internally)
npm install embla-carousel embla-carousel-react --legacy-peer-deps

# Resizable split panes
npm install react-resizable-panels --legacy-peer-deps

# Intersection observer (alternative to native API / Framer Motion whileInView)
npm install react-intersection-observer --legacy-peer-deps
```

## Mantine Extensions

Only `@mantine/core` and `@mantine/hooks` are installed.
Add sub-packages as needed:

```bash
npm install @mantine/carousel --legacy-peer-deps   # Carousel (embla-based)
npm install @mantine/charts --legacy-peer-deps      # Chart components
npm install @mantine/code-highlight --legacy-peer-deps
npm install @mantine/dates --legacy-peer-deps       # DatePicker, Calendar (needs date-fns)
npm install @mantine/dropzone --legacy-peer-deps    # File upload dropzone
npm install @mantine/form --legacy-peer-deps        # Form state management
npm install @mantine/modals --legacy-peer-deps      # Modal manager
npm install @mantine/notifications --legacy-peer-deps
npm install @mantine/nprogress --legacy-peer-deps   # Navigation progress bar
npm install @mantine/spotlight --legacy-peer-deps   # Command palette (Cmd+K)
```

## Animation & Visualization

See [docs/animation/Animations.md](animation/Animations.md) for Three.js, GSAP, and visx install commands.
