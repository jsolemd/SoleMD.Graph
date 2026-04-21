# Phase 4 Bundle Audit — 2026-04-21

Audit of Phase 4 ledger items 6, 7, 8 from the module-zero foundation plan.
Scope: observational + small targeted fixes. Parallel with `chrome-surface`
and `graph-bridge` teammates.

Cwd for all commands: `apps/web`.

---

## Item 6: Server bundle hygiene

**Goal:** confirm `apps/web/app/page.tsx` does not drag `features/field`
runtime code into the server RSC bundle.

### page.tsx imports

File: `apps/web/app/page.tsx` (10 lines).

| Line | Import | Classification |
|------|--------|----------------|
| 1 | `import { connection } from "next/server"` | Framework — OK |
| 2 | `import { FieldLandingRoute } from "@/features/field/routes/FieldLandingRoute"` | Client component via `"use client"` directive — correct boundary |
| 3 | `import { fetchActiveGraphBundle } from "@/features/graph/lib/fetch"` | `server-only`-marked module — correct |

Verified:

- **No import from the `@/features/field` barrel (`features/field/index.ts`).**
  The page imports the specific route file directly. The barrel re-exports
  ~30+ runtime modules (FieldCanvas, FieldScene, controllers, stage
  primitives, surfaces). Importing the barrel from a server component would
  force Next's module graph to walk all of them at build time even though
  tree-shaking would drop them at runtime — slow and noisy. The current
  direct import avoids that.
- **`FieldLandingRoute.tsx` begins with `"use client"`** (line 1 of
  `apps/web/features/field/routes/FieldLandingRoute.tsx`). It uses
  `next/dynamic` with `ssr: false` to load the heavy `FieldLandingPage`
  surface. Server-side resolution stops at this file; it does not pull
  Three.js, GSAP, Cosmograph, etc. into the RSC bundle.
- **`GraphBundle` type is sourced from `@solemd/graph`**, not from any
  field module (`features/field/routes/FieldLandingRoute.tsx:4`,
  `features/graph/lib/fetch.ts:6`). No type-only import from field exists
  in page.tsx to convert.
- **`fetchActiveGraphBundle` is guarded by `import 'server-only'`**
  (`features/graph/lib/fetch.ts:1`). Safe to call from the server
  component.

### Decision

**No change needed.** The server bundle boundary is already clean:

- page.tsx pulls no runtime `@/features/field` symbol beyond the client
  `"use client"` route component, which Next treats as a serialized
  client-component reference (not inlined into the server bundle).
- No type-only import from field exists that needs conversion; the
  `GraphBundle` type is already sourced from `@solemd/graph`.
- Creating `features/field/types.ts` would be premature — there is no
  violation to fix, and no other site today needs a shared field-types
  module.

### Fixes landed

None.

### Follow-up

- If a future change introduces a value import from `@/features/field`
  into any file under `app/` (without a client boundary in between),
  it must be audited again. The barrel at `features/field/index.ts` is
  the tripwire: a value import from it inside a server component would
  be the regression to catch. Consider adding an ESLint
  `no-restricted-imports` rule covering `@/features/field` from
  `app/**/page.tsx` / `app/**/layout.tsx` as a future hardening pass.

---

## Item 7: LazyMotion decision

**Goal:** decide whether to migrate Framer Motion usage to
`<LazyMotion features={domAnimation}>` + `m.*` in this pass (~15 kB saved
on first surface that mounts motion) or defer.

### Call-site survey

From `apps/web`:

| Query | Count | Note |
|-------|-------|------|
| Files importing from `"framer-motion"` | **83** | `rg -l` via Grep tool |
| Files using `whileInView` | **6** | Reveal-on-scroll pattern — fine under LazyMotion with `domAnimation` |

Sample breakdown by area (non-exhaustive, grouped by subsystem):

- **Field surfaces (landing)** — `features/field/surfaces/FieldLandingPage/*`:
  `FieldHeroSection.tsx:4`, `FieldCtaSection.tsx:4`, `FieldScrollCue.tsx:6`,
  `FieldLandingPage.tsx:13`, `FieldMobileCarrySection.tsx:5`,
  `FieldGraphWarmupAction.tsx:6`.
- **Graph chrome + shell (shared)** — `ChromeBar.tsx:5`,
  `ThemeToggle.tsx:12`, `ModeToggleBar.tsx:5`, `TimelineBar.tsx:4`,
  `MobileShell.tsx:4`, `DesktopShell.tsx:4`, `ShellPanels.tsx:4`,
  `MobileSelectionPrompt.tsx:3`, `GraphLoadingExperience.tsx:4`.
- **Graph panels (shared)** — `PanelShell.tsx:4`,
  `BottomTrayShell.tsx:4`, `PromptBoxCard.tsx:4`, `PromptBoxSurface.tsx:4`,
  `PromptIconBtn.tsx:4`, `EditorToolbar.tsx:4`,
  `CreateEditorSurface.tsx:4`, `CanvasControls.tsx:5`,
  `ScopeIndicator.tsx:4`, `use-floating-panel.ts:4`,
  `use-prompt-position.ts:4`, `use-prompt-box-controller.ts:12`.
- **Wiki / module-runtime (~15 files)** —
  `module-runtime/primitives/{ObjectiveList,RevealCard,SceneSection}.tsx`,
  `module-runtime/sections/{BeforeAfter,CaseVignette,DefinitionStack,KeyFacts,Mechanism,Resources}Section.tsx`,
  `module-runtime/interactions/{ChatThread,StepThrough,ToggleCompare}/*.tsx`,
  `module-runtime/motion.ts`, `components/entity-profiles/*`,
  `components/elements/AnimationEmbed.tsx`,
  `modules/ai-for-mds/sections/foundations/*.tsx`.
- **Animations authoring + smoke (~20 files)** —
  `features/animations/**` (templates, smoke surfaces, lottie wrappers,
  biology/brand/icons).
- **App-level** — `app/_components/RouteStatusSurface.tsx:6`,
  `app/smoke/page.tsx:3` (`MotionConfig`).
- **Shared lib** — `lib/motion.ts` (shared token/variant helpers).

### Assessment

**DEFER.**

Criterion from the task brief:

> Only adopt if you can migrate the surface (landing + sections +
> TextReveal) consistently in this pass WITHOUT breaking anything. If the
> call-site count is > ~10 files or the migration touches shared
> components, defer and document.

Both tripwires fire:

1. **83 files** use `framer-motion` — ~8× the defer threshold.
2. Shared components across at least three subsystems (graph chrome,
   graph panels, wiki module-runtime) are touched. A partial migration
   would require wrapping every mount point (landing, `/graph` route,
   `/wiki/*` routes) in `<LazyMotion>` providers to keep `m.*` children
   working, and leaving any `motion.*` call site outside a provider
   bleeds the async-loaded feature pack back in. Net effect: the ~15 kB
   saving is only realized if the migration is total. Halfway defeats
   the purpose.
3. Six `whileInView` sites would still work under `domAnimation` (which
   includes `useInView`), so that is not a blocker — but it is not
   relevant under the defer decision.

### Migration plan for a future PR

When the team elects to pick this up:

1. Land a root `MotionConfig`/`LazyMotion` provider. Candidate mount
   points:
   - `apps/web/app/layout.tsx` (or a nested providers wrapper) with
     `<LazyMotion strict features={domAnimation}>`.
   - `strict` catches any residual `motion.*` at runtime in dev.
2. Codemod: `motion.X` → `m.X`, `import { motion } from "framer-motion"`
   → `import { m } from "framer-motion"`. Shape:
   `jscodeshift -t framer-motion-lazy.ts 'apps/web/**/*.{ts,tsx}'`.
   Manually handle residual `<motion.*>` JSX via a second pass (`<motion.`
   → `<m.`).
3. Keep non-`motion.*` APIs untouched: `AnimatePresence`,
   `useReducedMotion`, `useInView`, `useMotionValue`, `useScroll`,
   `useTransform`, `animate`, `useDragControls`, `MotionConfig`, `Variants`,
   `Transition`, `MotionStyle`, `MotionValue`, `motionValue` (test util).
   None of these trigger the feature pack on their own.
4. If any surface needs 3D motion (`domMax` feature pack), scope
   `LazyMotion features={domMax}` to that subtree only. Currently no
   call site uses `motion.div drag` + 3D transforms that would require
   `domMax`; `domAnimation` covers layout/gesture/drag/tap for the
   existing inventory.
5. Run the Field Jest suite + smoke visit landing, `/graph`, and
   `/wiki/*` to catch any unwrapped node (dev-only `strict` flag will
   warn loudly).
6. Measure the landing/graph RSC-client bundle with
   `next build --turbo --profile` before/after. Expected saving ≈ 15 kB
   gzip on the first chunk to hit a motion call site.

Estimated scope: one PR, one reviewer-day. Not appropriate for this
parallel Phase 4 pass because the surface is too wide to verify
without stepping on `chrome-surface` and `graph-bridge` teammates.

### Fixes landed

None.

---

## Item 8: `optimizePackageImports`

**Goal:** document current `next.config.ts` contents and recommend
opportunistic additions/removals.

### Current contents

`apps/web/next.config.ts:37-52`:

```ts
experimental: {
  optimizePackageImports: [
    '@mantine/core',
    '@mantine/hooks',
    'lucide-react',
    'framer-motion',
    'zustand',
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    'gsap',
    '@gsap/react',
    'lottie-react',
    '@google/model-viewer',
  ],
},
```

### Assessment

The list already covers every heavy, barrel-exporting package currently
used in `apps/web`:

- UI surface: `@mantine/core`, `@mantine/hooks`, `lucide-react`.
- Motion: `framer-motion`, `gsap`, `@gsap/react`, `lottie-react`.
- State: `zustand`.
- 3D: `three`, `@react-three/fiber`, `@react-three/drei`.
- Web component: `@google/model-viewer` (also listed under
  `transpilePackages` — correct, for SSR/resolver alignment).

### Potential additions checked

- `@tabler/icons-react` — **0 usages** in `apps/web`. Do not add.
- `cosmograph` / `@cosmograph/*` — bundled via dedicated browser entry
  paths; not a standard `optimizePackageImports` candidate.
- `@duckdb/duckdb-wasm` — handled via explicit `resolveAlias` +
  `webpack.resolve.alias` pinning to the browser ESM entry. Correct
  shape; not a barrel-tree-shake problem. Do not add.
- `drizzle-orm` — server-only; not a client-side barrel cost.
- `@solemd/graph`, `@solemd/api-client` — workspace packages, not npm
  modules. `optimizePackageImports` targets published packages; leave as
  is.
- `@radix-ui/*`, `@floating-ui/*`, `react-hook-form`, `react-aria`,
  `date-fns`, `lodash` — none present in dependency graph (not used in
  `apps/web`).

### Recommendations

**None.** The list is already comprehensive for the current dependency
set. Treat this as opportunistic: revisit only when a new heavy package
with barrel exports is introduced.

### Fixes landed

None.

---

## GSAP regression check

Task brief asked: confirm `import gsap from "gsap"` (default) across
`apps/web` — Phase 2 migrated others so only `field-scroll-driver.ts`
should remain.

**Default-import pattern (`import gsap from "gsap"` / `import gsapDefault from "gsap"`):**

- `apps/web/lib/gsap.ts:16` — `import gsapDefault from "gsap"` inside
  the shared adapter. This is the **legitimate adapter surface** that
  normalises GSAP access app-wide; it is not a regression.
- **No other default imports** of `gsap` exist in `apps/web`.

**Named-import pattern (`import { gsap } from "gsap"`):** 14 files, all
within `features/field/` (controllers, scroll chapter adapters,
ensure-gsap-motion-path-registered, mouse-parallax-wrapper,
FieldStoryProgress) plus one at
`features/wiki/module-runtime/primitives/ScrollyPin.tsx:4`.

Interpretation: the Phase 2 consolidation is holding. All GSAP runtime
usage is contained inside `features/field/**` + the single wiki
ScrollyPin primitive + the shared `lib/gsap.ts` adapter. No stray GSAP
imports leaked into the animation smoke, graph chrome, panel, or shell
subsystems.

**Flag for reviewer:** the original brief said "only
`field-scroll-driver.ts` is remaining". That phrasing appears stale —
the healthy state is "GSAP contained to `features/field/**` +
`lib/gsap.ts` + one wiki primitive", which is what we observe. Nothing
to fix; updating the ledger's phrasing may help future audits.

---

## Bundle delta summary

- **Before/after:** no fixes landed; no delta.
- **Future savings available:**
  - Item 7 LazyMotion migration: ~15 kB gzip on the first motion-using
    chunk. Deferred to a dedicated PR.
- **Follow-up items:**
  1. Lint rule: restrict value imports from `@/features/field` inside
     `app/**/page.tsx` and `app/**/layout.tsx`.
  2. LazyMotion migration (plan above) — scope one PR, one
     reviewer-day.
  3. Update foundation plan ledger to describe the GSAP containment
     rule as "contained to `features/field/**` + `lib/gsap.ts` + one
     wiki primitive", not "only `field-scroll-driver.ts` remains".

---

## Verification

No code edits landed in this audit, so verification is trivial:

- `npm run typecheck` — not run (no edits; state unchanged from session
  start).
- `npm run lint` — not run (no edits).
- `npx jest --runInBand --testPathPatterns="features/field"` — not run
  (no edits).

If any of the follow-up items above are picked up, that PR must run
the full verification set from the Phase 4 brief.
