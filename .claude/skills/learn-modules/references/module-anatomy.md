# Module Anatomy: Manifest, Registration, Embedding

How a wiki module wires itself into the platform. There is **no** standalone
`/learn/<slug>` route. Every module renders inline inside a wiki page via
`WikiModuleContent` keyed by `wikiPageSlug`.

## File structure

```
apps/web/features/wiki/modules/{slug}/
  manifest.ts         # Metadata: title, accent, sections, objectives, citations, wikiPageSlug
  content.tsx         # Default-export component: composes Tier 4 sections + bespoke Tier 3 sections
  page.tsx            # Default-export: <ModuleShell manifest={manifest}>{<Content/>}</ModuleShell>
  register.ts         # Calls registerModule({ manifest, load, loadContent })
  sections/           # Module-specific bespoke sections (Tier 3)
    foundations/      # Sub-folder per section group when needed
      FoundationsSection.tsx
      ChainOfThoughtDemo.tsx
      TokenDemo.tsx
      index.ts
  data/               # Content text/data separated from UI
    index.ts          # Barrel re-export of every data file
    intro.ts
    prompting.ts
    safer.ts
```

## ModuleManifest interface

The canonical shape lives in `apps/web/features/wiki/module-runtime/types.ts`:

```ts
export interface ModuleManifest {
  title: string;
  accent: ModuleAccent;
  audience: string;
  estimatedMinutes: number;
  version: string;
  lastUpdated: string;          // ISO date
  authors: string[];
  objectives: string[];          // 3-5 learning objectives
  sections: ModuleSection[];     // Ordered section list with id, title, accent
  citations: ModuleCitation[];   // Referenced sources
  glossaryTerms: string[];       // Terms with GlossaryHover definitions
  animations: string[];          // Names from animation registry
  /** Canonical wiki page slug where the module is rendered inline. */
  wikiPageSlug: `modules/${string}`;
}
```

Notes that catch agents off guard:

- There is **no `slug` field**. The module is keyed by `wikiPageSlug`.
- `wikiPageSlug` is a **required templated string type** (`modules/${string}`)
  — not optional. The registry uses it as the lookup key.
- `accent` values: `soft-blue` | `muted-indigo` | `golden-yellow` |
  `fresh-green` | `warm-coral` | `soft-pink` | `soft-lavender` | `paper`,
  defined in `module-runtime/tokens.ts`.

## Registration flow

1. `register.ts` imports the manifest and calls
   `registerModule({ manifest, load, loadContent })` from
   `module-runtime/registry.ts`. `load` lazy-imports `./page`, `loadContent`
   lazy-imports `./content`. The registry stores both as
   `React.lazy(...)` exotic components keyed by `wikiPageSlug`.
2. `apps/web/features/wiki/modules/register-all.ts` is a **side-effect import
   barrel** that imports every module's `register.ts`. The wiki shell imports
   `register-all.ts` once so all modules are discoverable by the time a wiki
   page mounts.
3. `WikiModuleContent` (`apps/web/features/wiki/components/WikiModuleContent.tsx`)
   takes a `slug` prop, calls `getModuleByWikiPageSlug(slug)`, and renders the
   appropriate lazy component inside a Suspense boundary plus
   `WikiModuleErrorBoundary`. By default it uses `loadContent` (no shell);
   passing `withShell={true}` switches to the full `page.tsx` render with
   `ModuleShell`.

So the actual integration is:

- Wiki page reads its `wikiPageSlug` from the page bundle.
- Wiki page renders `<WikiModuleContent slug={wikiPageSlug} />`.
- `register-all.ts` has already populated the registry as a side effect.
- The matching module's `content.tsx` (or `page.tsx` when `withShell`) renders
  inline.

## ModuleShell, ModuleHeader, ModuleFooter

Located in `apps/web/features/wiki/module-runtime/shell/`. `ModuleShell` wraps
the module body, sets the accent CSS custom property via `setModuleAccent`
(from `module-runtime/tokens.ts`), and renders `ModuleHeader` above and
`ModuleFooter` below. It is used by `page.tsx` when the wiki page asks for the
shelled render (e.g. dedicated wiki page that hosts the full module). For most
inline embeds, `WikiModuleContent` defaults to the contentless render and the
wiki page provides its own surrounding chrome.

## content.tsx composition pattern

The module's `content.tsx` is where Tier 4 renderers and bespoke Tier 3
sections compose:

```tsx
"use client";

import { KeyFactsSection } from "@/features/wiki/module-runtime/sections/KeyFactsSection";
import { MechanismSection } from "@/features/wiki/module-runtime/sections/MechanismSection";
import { SceneSection } from "@/features/wiki/module-runtime/primitives/SceneSection";
import { ProseBlock } from "@/features/wiki/module-runtime/primitives/ProseBlock";
import { FoundationsSection } from "./sections/foundations";
import { introFacts, promptingStages } from "./data";

export default function AiForMdsContent() {
  return (
    <>
      <KeyFactsSection
        sectionId="introduction"
        facts={introFacts}
        title="Your Learning Journey"
        columns={3}
      />
      <SceneSection id="guide-intro" title="How This Module Works">
        <ProseBlock>{guideIntroContent}</ProseBlock>
      </SceneSection>
      <FoundationsSection /> {/* bespoke Tier 3 */}
      <MechanismSection
        sectionId="prompting"
        stages={promptingStages}
        title="Precision Prompting"
      />
      {/* ... */}
    </>
  );
}
```

Rules:

- Content data lives in `./data/`. Sections import named arrays. Updating
  prose does not touch UI.
- Bespoke sections live in `./sections/`. Tier 4 imports come from
  `module-runtime/sections/*`.
- Section IDs (`sectionId`) match the manifest's `sections` array entries so
  navigation, deep-linking, and analytics line up.

## Adding a new section to an existing module

Most module work is adding sections, not new modules. The checklist:

1. Append the section entry to `manifest.ts`'s `sections` array. Pick a stable
   `id` (kebab-case), `title`, optional `subtitle`, optional `accent`. Keep
   array order = render order.
2. Decide the tier with `references/show-dont-tell.md` and
   `references/section-renderers.md`:
   - Existing Tier 4 shape (`KeyFacts`, `Mechanism`, `BeforeAfter`,
     `DefinitionStack`, `CaseVignette`, `Resources`)? Add data to `data/` and
     compose the renderer in `content.tsx` with `sectionId` matching step 1.
   - Bespoke per-step content? Build a Tier 3 component in
     `sections/{section-name}/`. Use a sub-folder when the section composes
     multiple demos (see `sections/foundations/`); a flat
     `sections/{Name}.tsx` file is fine for single-demo sections.
3. For Tier 3 sections, the public component wraps `SceneSection` with
   `id` matching the manifest section id. Co-located demos export from
   `sections/{section-name}/index.ts`.
4. Import the section in `content.tsx` and place it in render order.
5. Section data lives in `data/{section}.ts`, re-exported from `data/index.ts`.
6. Run `/clean` on the changed files.

No registration step is needed for a new section — the module's `register.ts`
already side-effect imports the manifest and content, and the wiki page picks
them up via `WikiModuleContent` keyed by `wikiPageSlug`.

## Adding a new module checklist

1. Create `apps/web/features/wiki/modules/{slug}/` with `manifest.ts`,
   `content.tsx`, `page.tsx`, `register.ts`, plus `data/` and `sections/`
   folders.
2. Set `wikiPageSlug: "modules/{slug}"` (templated literal, required).
3. Import the new `register.ts` from
   `apps/web/features/wiki/modules/register-all.ts`.
4. Confirm a wiki page exists at the matching `wikiPageSlug` so
   `WikiModuleContent` has a host. This step lives outside `module-runtime`;
   coordinate with `/graph` if the wiki page bundle needs to be updated.
5. For each section in the manifest:
   1. Pick the interaction pattern from `show-dont-tell.md`.
   2. Reuse a Tier 4 renderer when the shape repeats; otherwise build a Tier 3
      bespoke section using a Tier 2 shell when sequencing/state is needed.
   3. Keep domain-specific visualizations in the module's `sections/` folder
      until 3+ modules graduate them to a primitive or shared section.
6. Verify scroll-reveal, keyboard nav, and `prefers-reduced-motion`.
7. Run `/clean` on the changed files.

## When to read this file

You are creating a new module, fixing a registration issue, or touching the
manifest type. If the question is about how the wiki page itself fetches the
module list, hand off to `/graph`. If the question is about styling the shell
chrome, hand off to `/aesthetic`.
