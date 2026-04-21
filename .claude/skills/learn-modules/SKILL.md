---
name: learn-modules
description: |
  Interactive learn module authoring for SoleMD.Graph. Three-tier architecture
  (primitives, interaction shells, module sections), visualization tools, content
  organization, and SHOW-don't-TELL design. Use when creating or improving learn
  modules, building interaction primitives/shells, working on features/learn/,
  or when the user mentions "learn", "module", "interactive lesson", "SHOW don't
  TELL", "interaction shell", "compound component", or specific modules like
  "ai-for-mds". Companions: /module (shared stage/background
  runtime), /clean (engineering review), /animation-authoring (motion details).
  Do NOT use for: animation syntax (use /animation-authoring), graph panels
  (use /graph), styling (use /aesthetic).
version: 1.1.0
---

# Learn Module Authoring

> Interactive educational modules for SoleMD.Graph at `/learn/[slug]`.
> Every section SHOWS a concept through interaction - text-only sections are a design failure.

## Ambient Module Contract

If a learn module uses a persistent stage layer, ambient background, scroll
chapters, GSAP choreography, or R3F/Three.js rendering, pair this skill with
`/module`.

Do not treat ambient motion as a decorative afterthought attached at the end of
module work. In SoleMD.Graph, module surfaces and the ambient runtime are meant
to converge on one shared presentation system.

Required recon before implementation when a module touches GSAP or Three.js:

1. Use CodeAtlas `search_docs` with `/greensock/GSAP` for timeline,
   `ScrollTrigger`, cleanup, and reduced-motion questions.
2. Use CodeAtlas `search_docs` with `/mrdoob/three.js` for renderer,
   shader, material, camera, geometry, and lifecycle questions.
3. Use `search_docs_multi` across both when the behavior spans scroll state and
   WebGL state together.
4. Use the GSAP skills repo and Three.js `llms*.txt` docs as official
   supplements, not as a replacement for CodeAtlas retrieval inside this repo.

Recommended query shapes:

- `ScrollTrigger React cleanup`
- `GSAP matchMedia reduced motion`
- `ShaderMaterial uniforms update`
- `PointsMaterial vs ShaderMaterial`
- `WebGLRenderer setPixelRatio performance`

Hard rule: do not invent GSAP or Three.js patterns from memory when the docs
are already indexed and current.

## The Three-Tier Architecture

This architecture is modeled after Mathigon (interactive textbooks) and PhET (science
simulations) - the two platforms that solve our exact problem at scale. The composition
pattern follows Radix UI's compound component model.

The key insight: **interaction mechanics** (how the user interacts) are reusable across
hundreds of modules. **Domain content** (what they interact with) is not. Separate them.

### Tier 1: Primitives (`features/learn/primitives/`)

Pure UI atoms. No content opinions. Each renders one thing.

| Primitive | Purpose |
|-----------|---------|
| `SceneSection` | Section wrapper with scroll-triggered `sectionReveal` animation, title, subtitle, accent color |
| `ProseBlock` | Readable text block with max-width prose constraint |
| `RevealCard` | Click-to-reveal card with accent border, typing-reveal animation |
| `ChatBubble` | Single message bubble (user or AI role), avatar, content slot |
| `AnimationStage` | Embeds a named animation from the animation registry (`manifest.json`) |
| `GlossaryHover` | Term tooltip that pulls definitions from the module glossary |
| `ManimPlayer` | Manim `.mp4` video playback |
| `ModelViewerStage` | `<model-viewer>` wrapper for 3D GLB display |
| `ScrollyPin` | Scroll-pinning (GSAP ScrollTrigger under the hood) |
| `CitationFootnote` | Citation reference linked to module citations |
| `ObjectiveList` | Learning objectives display |

**Rule:** Primitives accept `children` or simple props. They never accept typed content
arrays (no `items: SomeDataType[]`). They are building blocks, not renderers.

### Tier 2: Interaction Shells (`features/learn/interactions/`)

Compound components following the headless hook + context pattern. Each shell provides
an **interaction pattern** - the animated behavioral structure - with content **slots**
that modules fill with whatever they need.

Each shell has three parts:

```
interactions/ChatThread/
  useChatThread.ts     # Behavior hook: state, sequencing, keyboard nav
  ChatThread.tsx       # Compound component: Root + sub-components via context
  index.ts             # Barrel export
```

**The compound component pattern:**

```tsx
// The hook owns all behavior (testable in isolation)
function useChatThread(config: { messageCount: number }) {
  const [visibleCount, setVisibleCount] = useState(1);
  const advance = () => setVisibleCount(c => Math.min(c + 1, config.messageCount));
  return { visibleCount, advance };
}

// The compound component owns structure + animation
// Content is a slot (children: ReactNode), not a typed data prop
function ChatThread({ children, ...config }) {
  const state = useChatThread(config);
  return (
    <ChatThreadContext.Provider value={state}>
      <div className="chat-thread">{children}</div>
    </ChatThreadContext.Provider>
  );
}

ChatThread.Message = function Message({ index, role, children }) {
  const { visibleCount } = useContext(ChatThreadContext);
  if (index >= visibleCount) return null;
  return (
    <motion.div variants={cardReveal}>
      <ChatBubble role={role}>{children}</ChatBubble>
    </motion.div>
  );
};

// Module-specific usage - content is completely free
<ChatThread>
  <ChatThread.Message index={0} role="user">
    Summarize catatonia for the team.
  </ChatThread.Message>
  <ChatThread.Message index={1} role="ai">
    <TokenViz text="anti-NMDAR encephalitis" />  {/* any component */}
  </ChatThread.Message>
</ChatThread>
```

**Why this matters:** Data-driven renderers like `MechanismSection({ stages })` lock the
content shape - every stage renders as title + description text. Compound components
let each step contain anything: a custom visualization, a slider, an embedded animation,
a 3D model. The shell handles sequencing and animation; the module handles content.

#### Current / Planned Shells

| Shell | Interaction Pattern | Reuse Across Modules |
|-------|--------------------|-----------------------|
| `ChatThread` | Message flow, typing animation, swappable AI responses | AI teaching, prompt craft, clinical reasoning |
| `StepThrough` | Sequential stages with animated handoff, keyboard nav | Mechanisms, workflows, diagnostic algorithms, treatment protocols |
| `ToggleCompare` | A control (segment/slider/toggle) drives a visual state change | Drug comparison, model comparison, before/after, dose-response |
| `DemoStage` | Control panel area + visualization area, linked reactively | Any "adjust parameter, see result" demonstration |
| `ProgressiveReveal` | Layered content revealed in sequence, each building on prior | Case vignettes, differential diagnosis, evidence evaluation |
| `Checklist` | Animated checkmark progression through items | Safety frameworks, protocols, assessment tools |

**Build shells when the interaction pattern appears in 2+ modules.** Don't pre-build
shells speculatively - extract them from working module sections.

### Tier 3: Module Sections (`features/learn/modules/{slug}/sections/`)

Content-specific compositions. This is where domain knowledge meets interaction shells.

```tsx
// modules/ai-for-mds/sections/TemperatureDemo.tsx
function TemperatureDemo() {
  const [temp, setTemp] = useState(0.7);
  return (
    <DemoStage>
      <DemoStage.Controls>
        <Slider value={temp} onChange={setTemp} min={0} max={2} step={0.1} />
      </DemoStage.Controls>
      <DemoStage.Visualization>
        <ProbabilityDistribution temperature={temp} />  {/* module-specific viz */}
        <ChatBubble role="ai">{RESPONSES[getTempBand(temp)]}</ChatBubble>
      </DemoStage.Visualization>
    </DemoStage>
  );
}
```

**The graduation rule:** Domain-specific visualizations (e.g., `ProbabilityDistribution`,
`TokenViz`) live in the module's `sections/` folder. When a third module needs the same
visualization, it graduates to `features/learn/primitives/` or a shared location. Don't
promote prematurely.

## Module File Structure

```
features/learn/modules/{slug}/
  manifest.ts         # Metadata: title, accent, sections, objectives, citations
  content.tsx         # Main content orchestrator (composes sections)
  page.tsx            # Route wrapper (ModuleShell)
  register.ts         # Registers module in global registry
  sections/           # Module-specific interactive sections
    ModelSizeDemo.tsx  # One concept = one component
    TokenDemo.tsx
    index.tsx          # Barrel export
  data/               # Content text/data separated from UI
    index.ts
    intro.ts           # { label, description } arrays
    prompting.ts       # Stage descriptions
    ...
```

**Routing:** The Next.js app router at `app/learn/[slug]/page.tsx` dynamically loads
modules by slug from the registry.

**Wiki integration:** Every module's `manifest.ts` specifies a `wikiSlug` that links
to a corresponding wiki page. The wiki provides the knowledge graph entry point.

### Module Manifest

```typescript
interface ModuleManifest {
  slug: string;                    // URL slug: "ai-for-mds"
  title: string;                   // Display title: "AI for MDs"
  accent: ModuleAccent;            // Color theme for the module
  audience: string;                // "Practicing physicians"
  estimatedMinutes: number;
  version: string;
  lastUpdated: string;             // ISO date
  authors: string[];
  objectives: string[];            // 3-5 learning objectives
  sections: ModuleSection[];       // Ordered section list with id, title, accent
  citations: ModuleCitation[];     // Referenced sources
  glossaryTerms: string[];         // Terms with GlossaryHover definitions
  animations: string[];            // Names from animation registry
  wikiSlug?: string;               // Corresponding wiki page
}
```

**Accent colors:** `soft-blue` | `muted-indigo` | `golden-yellow` | `fresh-green` |
`warm-coral` | `soft-pink` | `soft-lavender` | `paper`. Defined in `features/learn/tokens.ts`.

## SHOW Don't TELL

This is the foundational design principle. Every concept section demonstrates through
interaction, not description. Text supports the demo; the demo teaches the concept.

**The test:** If you removed all the prose text from a section, would the interactive
demo still teach something? If yes, the section passes. If the demo is just a "tap to
reveal more text" card, it fails.

### Interaction Patterns (from Nicky Case's Explorable Explanations)

| Pattern | When to Use | Shell |
|---------|-------------|-------|
| **Manipulate & observe** | "Change X, see Y change" - parameters, settings, configurations | `DemoStage`, `ToggleCompare` |
| **Step through** | "First this happens, then this" - processes, algorithms, reasoning chains | `StepThrough`, `ProgressiveReveal` |
| **Simulate the experience** | "This is what it feels like to use X" - AI interaction, clinical tools | `ChatThread` |
| **Compare alternatives** | "A vs B, why B is better" - before/after, novice vs expert | `ToggleCompare` |
| **Apply and test** | "Try this yourself in a scenario" - case studies, frameworks | `ProgressiveReveal`, `Checklist` |

### Examples: TELL vs SHOW

| Concept | TELL (bad) | SHOW (good) |
|---------|-----------|-------------|
| Token probability | "Each output token is sampled from a probability distribution" | `DemoStage` with slider controlling temperature, `visx` bar chart showing probability distribution shifting in real-time |
| Context window | "Older content outside the window is invisible to the model" | `ToggleCompare` with Small/Medium/Large context, EMR note with visible/grayed regions, AI response changing based on what it can "see" |
| Chain of thought | "The model shows its reasoning steps" | `ChatThread` where each step types out sequentially, building a visible reasoning chain with the user watching it unfold |
| Prompt engineering | "Assign a persona, provide context, state a goal..." | Interactive prompt builder - click each stage to add a layer to a growing prompt in a `ChatThread`, see the AI response improve with each addition |

## Animation & Visualization Tools

The `/animation-authoring` skill has the full details on each tool. This is the
decision matrix for learn modules specifically.

### When to use what

| You need... | Reach for | Why |
|-------------|-----------|-----|
| UI animation (reveal, stagger, transition) | **Framer Motion** | Native React, spring presets in `lib/motion.ts` |
| Educational data visualization | **visx** (PRIMARY) | Headless SVG primitives, composes with `motion.rect`/`motion.path` |
| Scroll-pinned demonstrations | **GSAP ScrollTrigger** | Scrub/pin/timeline for scroll-driven teaching |
| Animated SVG diagrams | **SVG + Framer Motion** | `motion.path`, `motion.circle` for inline diagram animation |
| Complex path morphing | **GSAP MorphSVG** | Shape A to shape B transitions |
| 3D molecular/anatomical models | **React Three Fiber + drei** or **model-viewer** | R3F for interactive scenes, model-viewer for simple display |
| Math/science derivation video | **Manim CE** | LaTeX-heavy, precise curves, outputs .mp4 via ManimPlayer |
| Lottie animations | **lottie-react** | Pre-made animations from LottieFiles |
| Copy-paste animated components | **Magic UI / Aceternity UI** | AnimatedBeam, TextReveal, etc. Adapt to our spring presets |

### Data Visualization: visx over Recharts/ECharts

**visx** (Airbnb) is the primary charting tool for learn modules because:
- Headless SVG primitives that compose with Framer Motion (`motion.rect`, `motion.path`)
- Tree-shakeable: import only what you need (~50-100KB vs ~450KB for Recharts)
- No animation opinions of its own - our spring presets apply uniformly
- Educational visualizations are custom by nature (not standard dashboards)

**Do NOT use Recharts** - it fights Framer Motion with its own animation system and is
less powerful than both visx (composability) and ECharts (features).

**Apache ECharts** is available as an escape hatch for complex interactive dashboards
with 10k+ data points or built-in zoom/pan/brush. It does not compose with Framer Motion.

### Motion Rules for Learn Modules

1. Learn presets live in `features/learn/motion.ts`, re-exported from `lib/motion.ts`
2. Section containers: `useInView({ once: true, margin: "-10%" })` for scroll reveal
3. Stagger children at `0.06s` intervals via `staggerChildren` transition
4. Cards: `scale(0.95) -> 1` + `opacity 0 -> 1` entrance (`cardReveal` variant)
5. Sections: `y(24) -> 0` + `opacity` entrance (`sectionReveal` variant)
6. Scene handoffs: `x(40) -> 0` lateral transition (`sceneHandoff` variant)
7. Reduced motion variants exist for everything (opacity-only, no transforms)
8. **Parent orchestrates, children declare.** Parent uses `animate="visible"` + `staggerChildren`.
   Children use only `variants` - never their own `animate` prop (breaks propagation).

### Icons & Illustrations

- **BioIcons** (CC0) - Biomedical illustrations, brand-remappable colors
- **Noto Emoji** (Apache 2.0) - Emoji as SVG paths, Jon's preferred source
- **Lucide** - UI icons (never as brand marks - see brand feedback)
- Always research existing open-licensed assets before hand-authoring SVG

## Engineering Discipline

**After building or modifying any module, run `/clean` on the changed files.** The `/clean`
skill enforces SoleMD.Graph's core engineering principles: native solutions over custom code,
adapter boundaries, zero redundant work, no hydration penalties, modularization (600-line cap),
centralization (single source of truth), and performance test coverage.

Learn modules are particularly prone to:
- **Redundant motion setup** - repeating `useRef` + `useInView` + `motion.div` + `staggerChildren`
  in every section instead of using interaction shells that handle this once
- **Inline style objects** - hardcoded colors, spacing, backgrounds instead of Mantine props,
  Tailwind utilities, or CSS custom properties from `tokens.ts`
- **Data-driven renderer trap** - building `FooSection({ items: FooItem[] })` instead of
  compound components with content slots (see Tier 2 above)
- **Missing `prefers-reduced-motion`** - every animation must have a reduced variant
- **Over-sized files** - a single `foundations.tsx` with 7 concept demos inline is a
  modularization failure; one concept = one component file

| Rule | Why |
|------|-----|
| No source file over 600 lines | Modularization - split along stable boundaries |
| One concept demo per component file | Each demo is independently developable and testable |
| Interaction hooks testable in isolation | `useChatThread` works without rendering - pure state logic |
| Content data in `data/`, UI in `sections/` | Content updates don't require touching UI code |
| Domain viz stays in module until 3 consumers | Prevents premature abstraction (Josh Comeau's `post-helpers/` pattern) |
| All controls keyboard accessible | Educational content must be accessible |
| `prefers-reduced-motion` honored | Every animation has a reduced-motion variant |
| Run `/clean` after changes | Catches violations before they accumulate |

### Existing Infrastructure to Use

Before building anything new, check what exists:

- **Animation registry:** `features/animations/manifest.json` lists all named animations.
  Use `AnimationStage` to embed them. Don't create standalone animation components when
  the registry already has what you need.
- **Motion presets:** `lib/motion.ts` (global) and `features/learn/motion.ts` (learn-specific).
  Never write inline spring configs - use the named presets.
- **Learn types:** `features/learn/types.ts` has all shared interfaces.
- **Module registry:** `features/learn/registry.ts` handles module discovery.
- **Token system:** `features/learn/tokens.ts` maps accent names to CSS custom properties.

### Adding a New Module Checklist

1. Create `features/learn/modules/{slug}/` with manifest, content, page, register, data/
2. Register in the module registry via `register.ts`
3. Create wiki page at the `wikiSlug`
4. For each concept section:
   a. Choose the interaction pattern (see SHOW Don't TELL table above)
   b. Check if an interaction shell exists in `interactions/`; build if needed
   c. Create a section component in `sections/` composing the shell with content
   d. Keep domain-specific visualizations in the section file
5. Wire sections into `content.tsx`
6. Test with dev server, verify scroll animations and keyboard nav
7. Check `prefers-reduced-motion` behavior

For detailed animation tool usage, syntax, and examples, consult the
`/animation-authoring` skill. For the broader Graph architecture, consult `/graph`.
