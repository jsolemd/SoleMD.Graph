# Audit B7 — Controller registry (`jx`) + `data-gfx` scan

**Auditor**: agent-3 (Phase 3)
**Priority**: P0
**Date**: 2026-04-19
**SoleMD counterpart**: Missing — architectural port

## Summary

Maze's `jx` is a ~10-line static object literal that maps `[data-gfx]` slug
strings to controller class constructors (`blob → mm`, `stream → ug`,
`pcb → _m`, plus `hex`, `shield`, `cubes`, `users`, `stars`), with
`jx.default = yr` catching any unmapped slug. The stage runtime `Os`/`xi`
consumes the registry at `scripts.pretty.js:49546–49559` by running
`document.querySelectorAll('[data-gfx]')` and instantiating
`jx[n] || jx.default` per matched node.

SoleMD has no such registry. `apps/web/features/ambient-field/renderer/FieldScene.tsx:133`
directly instantiates `new BlobController({ id: "blob", preset: visualPresets.blob })`
inside a `useMemo` — one controller, one surface, one explicit React call.
`StreamController` and `PcbController` exist as classes under
`apps/web/features/ambient-field/controller/` but are not imported anywhere
in production paths; the landing surface is deliberately blob-only per the
comment at `FieldScene.tsx:108–113`.

The B7 gap is architectural, not a parity defect. Recommendation below:
**Option A (keep React-native) — no port.** Document the deviation in the
build spec. Revisit only if a concrete future surface (wiki module,
expanded-module, graph-bridge) needs to register a controller against a
DOM-scanned slug without touching `FieldScene.tsx`.

## Maze pattern

`scripts.pretty.js:49347–49357` defines `jx`:

```text
jx = {
  blob:   mm,
  stream: ug,
  pcb:    _m,
  hex:    ..., shield: ..., cubes: ...,
  users:  bm, stars: Sm
};
jx.default = yr;
```

`Os`/`xi` stage runtime `storeItems()` at `scripts.pretty.js:49546–49559`:

1. `document.querySelectorAll('[data-gfx]')` returns N anchor nodes.
2. For each node, read `n = node.dataset.gfx` (the slug string).
3. Resolve constructor: `Ctor = jx[n] || jx.default`.
4. Instantiate: `item = new Ctor({ view: node, params: cs[n], model: ku.get(n).model, ... })`.
5. Push to `Os.items[]`; per-frame `render()` loop calls
   `updatePosition()` + `updateVisibility()` on each.

How new controllers get added (Maze):
- Define class extending base `yr` (or `Ei` for non-GFX stage items).
- Add one key to the `jx` object literal: `jx.newSlug = NewController`.
- Tag any DOM node `<div data-gfx="newSlug">`.
- The stage scan picks it up on the next `storeItems()` pass. No JSX
  edit, no React tree change, no stage runtime edit.

The `jx.default = yr` fallback means an unmapped `data-gfx` slug still
produces a usable base controller — Maze's registry degrades gracefully
rather than erroring.

## SoleMD current pattern

Direct React-tree instantiation, no registry, no DOM scan:

- `apps/web/features/ambient-field/renderer/FieldScene.tsx:133–136`:
  ```tsx
  const blobController = useMemo(
    () => new BlobController({ id: "blob", preset: visualPresets.blob }),
    [],
  );
  ```
- `FieldScene.tsx:29` imports `BlobController` directly.
- The component is mounted by the landing surface at
  `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx:36`.
- `StreamController` and `PcbController` source files exist in
  `apps/web/features/ambient-field/controller/` but are not imported by
  any production code. Grep confirms only test files and `FieldScene.tsx`
  reference `BlobController`; `Stream`/`Pcb` have zero production
  instantiation sites (landing is blob-only per `FieldScene.tsx:108–113`).

Attachment is explicit and typed rather than DOM-derived:
`FieldScene.tsx:174–187` calls
`blobController.attach({ view: null, wrapper, mouseWrapper, model, material })`
with Three.js `Group` refs handed in by R3F reconciliation. `view` is
explicitly `null` because there is no DOM anchor equivalent of Maze's
`data-gfx` node.

How a new controller would be added today (SoleMD):
- Create a new `NewController.ts` extending `FieldController`.
- Edit `FieldScene.tsx` (or a peer scene component): add `import`,
  `useMemo(() => new NewController(...))`, attach wiring, `useFrame` tick
  call, JSX child.
- Mount the scene component in the surface that needs it.

## Architectural comparison

| Dimension | Maze (`jx`) | SoleMD (current) |
|---|---|---|
| Source of truth | DOM `[data-gfx]` attributes | React JSX tree |
| Runtime registration | Static registry object | Component imports + `useMemo` |
| Extensibility | Add key to `jx` object literal | Add import + JSX child + attach wiring |
| Default fallback | `jx.default = yr` (base class) | N/A — missing import is a compile error |
| Ownership | Single `Os`/`xi` stage owns scan and lifecycle | Each scene component owns its own controllers |
| Lifecycle | `storeItems()` at init, manual re-scan on change | React `useMemo` identity + `useEffect` cleanup |
| Instantiation input | `node`, `params = cs[slug]`, `model = ku.get(slug)` | Explicit `{ id, preset }` literal |
| Error surface | Runtime (unknown slug → `yr` default) | Build-time (unknown import → TS error) |
| Discoverability | Must read HTML + `jx` to know what runs | Component tree is the answer |
| Parallel surfaces | N `data-gfx` nodes → N controllers in one stage | Each surface mounts its own scene component |

## Port recommendation

### Option A — Keep React-native (no port needed)

**Case**: React's component tree already solves Maze's problem. `jx` is
a registry because Maze has no component system — it scans the DOM to
discover what to instantiate. React already discovers components through
JSX. The value `jx` provides (decoupled authoring, fallback, per-surface
scene composition) is provided natively by React imports, JSX children,
and TypeScript's type system.

What to document in the build spec:

1. **Sanctioned architectural deviation**. Record that SoleMD uses React
   composition where Maze uses DOM-scan-plus-registry. Reference this
   audit.
2. **Equivalence mapping**. Maze's `data-gfx="X"` attribute maps to
   SoleMD's `<SceneX />` component. The string slug is not a runtime
   identifier in SoleMD — it survives only as `FieldControllerInit.id`
   (e.g. `"blob"`), which is used for time-factor branching and
   preset lookup (`visualPresets[id]`), not for registry dispatch.
3. **Authoring contract**. New controllers are authored by:
   (a) creating a controller class extending `FieldController`,
   (b) creating a scene component that instantiates it, and
   (c) mounting the scene component on the target surface. No global
   registry edit.
4. **No `jx.default` equivalent needed**. Static imports make missing
   controllers a compile-time error, which is strictly safer than
   Maze's silent fallback to base `yr`.

### Option B — Add a lightweight registry abstraction

**Case**: If multiple non-landing surfaces (wiki modules, expanded-module
views, graph-bridge entry) each want to mount a controller against a
DOM-scanned anchor without editing `FieldScene.tsx` or each surface's
scene file, a registry lets them register by key. The authoring contract
becomes: *"tag a DOM node `data-ambient-scene="shield"`, publish a
controller factory under `"shield"`, the shared stage picks it up"*.

Shape:

```ts
// apps/web/features/ambient-field/controller/controller-registry.ts
type ControllerFactory = (init: FieldControllerInit) => FieldController;

const REGISTRY = new Map<string, ControllerFactory>();

export function registerFieldController(slug: string, factory: ControllerFactory): void;
export function resolveFieldController(slug: string): ControllerFactory | null;
export function listRegisteredControllers(): string[];
```

Consumer side — either:

- **Scan mode**: a shared stage component runs
  `document.querySelectorAll('[data-ambient-scene]')` in a layout effect,
  resolves each slug, instantiates, attaches. This most closely mirrors
  Maze.
- **Declarative mode**: surfaces render `<AmbientFieldScene slug="shield" />`,
  which internally looks up the factory and instantiates — still React,
  but the controller class is registered rather than imported.

Trade-offs:

- Loses TypeScript's static "is this controller wired?" guarantee. A
  typo in `slug=""` becomes a runtime miss rather than a build error.
- Adds a second authoring pattern (`register` vs. `import`). This
  doubles the mental model without a concrete consumer today.
- If Scan mode: imports React's rendering model back into Maze's
  DOM-scan idiom. Fighting the platform.
- If Declarative mode: the registry adds a layer of indirection that
  buys nothing unless controllers are loaded from separately bundled
  code (e.g. lazy-loaded wiki module chunks that don't statically
  import controller classes).

### Recommendation

**Option A — keep React-native. No port.**

Rationale:

1. **SKILL.md "Canonical Layer Ownership" § 3 (Scene-controller layer)**
   prescribes "one controller per scene anchor" owned by the
   scene-controller layer. It says nothing about how controllers are
   discovered. React composition satisfies the ownership rule.
2. **SKILL.md "Canonical Anti-Patterns"** warns against "tying scene
   meaning directly to a preset string" and "using React state as the
   animation transport". A registry indirection tied to a slug string
   moves in the direction of string-keyed scene identity that SKILL.md
   explicitly warns away from.
3. **SKILL.md "Required Runtime Pieces" / "Authoring Workflow"**
   specifies `FieldSectionManifest` as the semantic authoring layer, with
   a `SceneResolver` owning point-source + camera + overlay resolution.
   That chain (Manifest → ResolvedFieldScene → SceneController) is the
   abstraction that replaces `jx` semantically — it resolves *what scene
   plays here* from manifest data, not from a slug-keyed registry. B7 is
   therefore already planned-for, just at a higher level of abstraction.
4. **Feedback memory** (`feedback_preserve_reusable_mechanisms.md`): when
   removing or declining to port a mechanism, document *how to rebuild
   it* so future authors don't forget. This audit is that documentation.
   If a future surface needs DOM-scan dispatch, the Option B sketch
   above is the rebuild recipe.
5. **Zero current consumers**. Nothing in SoleMD today wants to register
   a controller from a non-authoring code path. The only production
   controller instantiation is the landing blob. Port-without-consumer
   is speculative abstraction.
6. **Compile-time safety > runtime fallback**. Losing `jx.default = yr`
   is a *feature* — missing imports become TS errors, not silent base
   controllers with wrong visual presets.

Ship Option A by writing a single build-spec paragraph recording the
deviation and pointing future registry-shaped needs at the
`FieldSectionManifest → SceneResolver` chain (SKILL.md "Required Runtime
Pieces", lines ~1044–1073). Keep the Option B sketch in this audit as
the rebuild recipe.

## Drift items (if any)

None in the strict sense. One doc-only observation:

### Doc-only D1 — `FieldControllerInit.id` slug vs. `jx` key parity

- **Maze reference**: `jx` keys (`blob`, `stream`, `pcb`, ...) are
  `data-gfx` slug strings. Same strings are keys into `cs` (scene
  params) and `ku` (asset registry).
- **SoleMD location**: `AmbientFieldStageItemId` type in
  `scene/visual-presets.ts` + `FieldControllerInit.id` field consumed by
  `FieldController` base (`controller/FieldController.ts:137–155`) +
  `getTimeFactor(id, motionEnabled)` at `FieldController.ts:123–135`.
- **Observation**: SoleMD already carries Maze's slug vocabulary as a
  runtime string (`id: "blob" | "stream" | "pcb"`), just without the
  registry dispatch step. `visualPresets[id]` and `getTimeFactor(id, ...)`
  are string-keyed registries in spirit. If Option B is ever
  reconsidered, the `id` type is already the right primary key — a
  `ControllerRegistry` would key on the same strings.
- **Severity**: Doc-only. The build spec should note that `id` is the
  semantic equivalent of `data-gfx` at the data layer, even though
  dispatch happens through JSX rather than a registry lookup.

## Open questions

1. **Wiki-module-scoped controllers**. Does the plan's dependency matrix
   actually require wiki modules to mount their own ambient-field
   controllers? If yes, Option A still holds — each wiki module can
   compose its own scene component. If the requirement is specifically
   *"wiki modules register controllers against DOM anchors they don't
   author"* (e.g. third-party content blocks with `data-ambient-scene`
   attributes), Option B becomes a live candidate. Phase 4 decision.
2. **`FieldSectionManifest → SceneResolver` timing**. SKILL.md treats
   this as the intended authoring abstraction but it is not yet
   implemented. If it lands before any second surface needs a controller,
   the registry question is moot: the manifest *is* the registry-at-a-
   higher-level. If a second surface lands first, the interim is
   component imports + explicit `useMemo` (the current pattern
   generalized).
3. **Stars / starfield `hg`**. Maze's `jx` includes a `stars` key gated
   by `?stars`. The catalog marks stars/starfield as sanctioned
   omissions. Confirm that remains the case — if stars ever become
   active, the Option A pattern still works (`<StarfieldScene />` with a
   query-param gate).
4. **`jx.default = yr` fallback**. Confirm that the build spec does not
   require a runtime "unknown scene → base controller" path. Compile-
   time failure on unknown controller imports is the safer default.
   Phase 4 endorsement needed.
5. **Cross-bucket with Agent 9 (stage runtime `Os`/`xi`)**. The stage
   runtime's `storeItems()` DOM-scan hot path (`scripts.pretty.js:49546–49559`)
   disappears entirely under Option A — SoleMD's `FieldScene.tsx` has no
   equivalent, because R3F reconciliation replaces "scan DOM, instantiate
   controllers" with "render children, wire refs, `attach()` when refs
   resolve". Agent 9 should audit whether the *preload chain*
   (`ku.loadAll()` before render-loop start, `scripts.pretty.js:49469–49474`)
   survives the missing scan step in some equivalent form. That is Agent
   9's concern, not B7's — flag here for cross-bucket continuity.
