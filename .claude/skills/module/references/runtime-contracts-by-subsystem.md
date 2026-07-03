# Runtime Contracts By Subsystem

The durable module-building contract decomposed by subsystem. Use this when
working on a single layer (shell, stage, presets, controllers, chapter
adapters, scroll, progress, chrome) without re-reading the full module
contract.

## 1. Shell And Bootstrap Contract

React + Next.js replace any page-global AJAX shell, but the ownership split
still matters.

Rules:

- one shell-level mount owns global body/document classes and global DOM
  observers
- app-shell state such as `is-loaded`, `is-resizing`, `is-scrolled`,
  `is-scrolling-down`, `is-scrolled-vh-*`, `is-scrolled-header-height`,
  `is-rendering`, and `is-not-ready` belongs to shell utilities, not to a
  scene controller
- viewport-height handling should prefer modern `svh`/`dvh` units; do not
  rebuild old `100vh` compensation unless a surface explicitly needs a CSS
  var
- preload-before-animate is still the rule even though the transport is
  React: the first intended hero frame should appear only after the active
  stage assets and controllers are ready
- pathname-level scroll restoration and caching belong to router/shell
  ownership, not to a scene controller or chapter adapter

Implication: do not put body-class toggling, generic intersection observers,
or page-ready lifecycle glue inside `field-scroll-driver.ts` or a specific
chapter adapter.

## 2. Stage Runtime Contract

The stage remains a singleton-style shared runtime even though R3F owns the
renderer internals.

Rules:

- one fixed stage per surface family
- R3F owns `WebGLRenderer`, `Scene`, `Camera`, resize, and final render
- SoleMD code owns stage readiness, controller attachment, frame policy,
  and projection/overlay fan-out
- the stage must support an explicit readiness gate:
  - point-source preload
  - texture/material readiness
  - any controller `whenReady()` promises
- controller ticks may be short-circuited until readiness resolves; do not
  let async point-source families pop in mid-flight as an accidental second
  first paint
- frame policy is architectural:
  - `always` for active hero/transition states
  - `transitions` or `demand` for settled module states
  - `suspended` for hidden surfaces

Sanctioned deviation:

- the React/R3F stage is the canonical SoleMD implementation. Do not port a
  legacy DOM-scan or raw three.js singleton literally

## 3. Scene Preset Contract

`scene/visual-presets.ts` is a low-level numeric/style registry, not the
main authoring surface.

Rules:

- presets encode renderer-facing numbers:
  - scale
  - rotation
  - offsets
  - shader uniforms
  - funnel tuning
  - mobile overrides
- presets should be self-complete entries rather than a hidden prototype-
  merge game spread across multiple files
- asset-generation knobs that belong to point-source creation should live
  in the asset layer, not be smuggled into chapter JSX
- module meaning must not be authored through preset names alone
- if a preset intentionally diverges from canonical parity for product
  reasons, document the rationale inline and in the module contract

Currently sanctioned global deviations to preserve until product scope
changes:

- blob stays visible through the detail story
- no end-state particle object-formation surface yet for `stream`/
  `objectFormation`

## 4. Controller And Resolver Contract

Scene ownership flows from authored surface data, not from DOM discovery.

Preferred chain:

```text
FieldSectionManifest
  ->
surface/stage resolver
  ->
controller selection
  ->
controller attach
  ->
tick / projection / overlay updates
```

Rules:

- controller-per-anchor is the core rule
- controllers own:
  - scene-local motion grammar
  - carry windows
  - visibility thresholds
  - uniform choreography
- controllers should expose `whenReady()` when async resources exist
- `updateVisibility()` may remain a documented no-op in the base class when
  a surface intentionally preserves persistent visibility; subclasses opt
  into fade/cull behavior explicitly

Do not:

- reintroduce a page-global DOM `querySelectorAll('[data-gfx]')` scan as
  the default pattern
- add a string-keyed controller registry unless a real lazy-loaded or
  separately-authored consumer requires it

## 5. Chapter Adapter Contract

Scroll-linked chapter choreography maps to named, runtime-owned chapter
adapters.

Rules:

- treat chapter adapters as first-class runtime surfaces
- each adapter should have:
  - a stable chapter key
  - a single mount point
  - reduced-motion behavior
  - cleanup/dispose semantics
- adapters own DOM/SVG reveal choreography only
- adapters do not own point lookup, controller semantics, or shell
  lifecycle
- adapters should be registered centrally and consumed through a hook or
  thin adapter mount, not scattered through page-local ad hoc GSAP effects

Important chapter-specific rule:

- stream/process chapters should be assumed hybrid by default
- motion-path markers, popups, and explainer beats live in DOM/SVG layered
  over the field, not as shader-only substitutes
- if the DOM shell is deferred, say so explicitly in the module contract
  rather than implying parity exists

## 6. Scroll Ownership Contract

Scroll ownership is split across three places:

- shell utilities own global body/document scroll classes and generic
  observers
- the field scroll driver (`scroll/field-scroll-driver.ts`) owns surface/
  runtime progress intake and controller timelines
- chapter adapters own chapter-local DOM choreography

Rules:

- do not collapse these back into one all-knowing page script
- do not make a chapter adapter responsible for generic shell state
- if a feature needs panel-local scroll later, extend the runtime scroll
  abstraction rather than hard-coding window-only assumptions

SoleMD-native patterns that are valid and should not be "cleaned up" away:

- synchronous `ScrollTrigger.refresh()` after binding when multiple uniform
  tweens stack and React mount timing requires explicit refresh
- reduced-motion short-circuit branches that skip chapter/adapter binding
- shared ref-based scene state bridges when controllers or overlays need a
  stable cross-runtime state channel without per-frame React re-rendering

## 7. Progress Component Contract

Progress rails are a DOM/runtime component, not a shell decoration and not
a canvas feature.

Rules:

- each narrative progress group gets its own mounted progress instance
- progress state should be written as root-scoped CSS variables
- the canonical variable family is `--progress-1`, `--progress-2`, ... on
  the progress root
- publish `--bar-width` when the visual contract depends on measured rail
  width
- section activation math should be based on the viewport midline and any
  active header offset, not arbitrary per-section magic numbers
- smoothing belongs to the choreography lane:
  - GSAP tweening is the preferred parity path
  - throttling alone is not smoothing
- desktop-only progress should also be runtime-gated, not merely hidden
  with CSS
- if the rail uses an active-state hook, toggle it on the root, not per
  segment

Generalizable lesson:

- a progress rail is a reusable chapter primitive for any module with named
  beats; it should remain a standalone DOM contract that reads authored
  beat ids and never couples itself to renderer internals

## 8. Chrome And Component Composition Contract

Legacy DOM component registries do not port 1:1 to SoleMD, and they should
not.

Rules:

- React composition owns chrome and DOM components
- component props replace `data-component` + `data-options` registries
- the field runtime may project overlays into DOM, but it does not own the
  broader shell chrome
- graph/product chrome remains a SoleMD system, not a clone of any
  reference shell

Implication:

- progress can be parity-close as a runtime-owned DOM primitive
- header/nav/carousel/blog/product-listing components from any reference
  source are not the architecture to port for SoleMD modules

## 9. What A Future Module Should Actually Author

When building a new module, the authoring burden should usually be:

- define chapter names and order
- assign chapter keys and wire chapter adapters where needed
- declare which stage owner and carry rows run through which sections
- choose particle behavior intent in human/product language
- choose whether DOM/SVG overlays are:
  - shipped now
  - deferred
  - permanently out of scope
- declare reduced-motion behavior
- declare graph-bridge actions if they exist

The author should not have to decide:

- shader transform order
- point-source loading strategy
- how projection math works
- how the shell toggles `is-scrolled-vh-50`
- whether a controller tick runs before or after camera render

If a module request forces those decisions at authoring time, the runtime
is not abstracted enough yet.
