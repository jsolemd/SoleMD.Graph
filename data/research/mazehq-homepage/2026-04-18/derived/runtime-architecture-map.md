# MazeHQ Homepage Runtime Architecture Map

This map translates the archived source into runtime ownership and controller
responsibilities. It is the first file to use when rebuilding the choreography
in another system.

## 0. Page Runtime Shell

The shared stage sits inside a broader page-runtime shell.

- App bootstrap is `by`, which is created on `window.load` in
  `scripts.pretty.js:55954-55955` and initialized in
  `scripts.pretty.js:55888-55907`.
- AJAX/navigation ownership is `Dn` / `Fs` in
  `scripts.pretty.js:49876-50091`.
- Scroll ownership is `jt` / `Jr` in `scripts.pretty.js:49115-49325`.
- `[data-component]` ownership is `Rg` via the component registry in
  `scripts.pretty.js:55180-55283`.

Derived rule:

- the homepage choreography is not a loose collection of timelines; it lives
  inside a full runtime shell that manages page swaps, scroll handlers,
  components, and the shared stage together

## 1. Boot And Preload

- The application creates one stage runtime with
  `new xi(document.querySelector(".js-gfx"))` in
  `scripts.pretty.js:55895-55897`.
- Page load waits on both the page surface and `this.gfx.preload` before
  `onPageLoaded()` runs in `scripts.pretty.js:55898-55906`.
- The stage runtime preloads point assets through `ku.loadAll()` in
  `scripts.pretty.js:49469-49474`.

Derived rule:

- there is one fixed stage that survives across chapters; controllers are
  swapped or carried within it

## 2. Stage Runtime

`Os` / `xi` is the fixed-stage owner in `scripts.pretty.js:49464-49587`.

Key responsibilities:

- create the WebGL renderer, scene, and camera:
  `scripts.pretty.js:49518-49541`
- calculate viewport-derived scene units:
  `scripts.pretty.js:49464-49468`
- scan the DOM for `[data-gfx]` anchors:
  `scripts.pretty.js:49546-49559`
- instantiate one controller per anchor using a controller registry:
  `scripts.pretty.js:49547-49555`
- run the render loop and per-frame controller updates:
  `scripts.pretty.js:49573-49585`

Derived rule:

- the correct abstraction is controller-per-anchor inside one singleton stage,
  not separate canvases per section

## 3. Scene Parameter Registry

The scene-parameter registry lives in `scripts.pretty.js:42467-42543`.

High-value entries:

- `stream` parameters: `scripts.pretty.js:42467-42482`
- `pcb` parameters: `scripts.pretty.js:42458-42466`

Derived rule:

- motion parity is partly encoded in per-scene parameter presets, not only in
  scroll timelines

## 4. Material And Geometry Pipeline

### Shader material

- Base particle material is created in `scripts.pretty.js:42545-42595`.
- The stream scene gets additional funnel uniforms in
  `scripts.pretty.js:42583-42593`.

### Geometry generation

- Procedural sphere/blob generation: `scripts.pretty.js:42894-42917`
- Bitmap-to-points conversion: `scripts.pretty.js:42676-42722`
- Model-vertex conversion: `scripts.pretty.js:42723-42745`
- Shared particle attributes such as `aStreamFreq`, `aSelection`, `aMove`,
  `aSpeed`, and `aRandomness`: `scripts.pretty.js:42784-42893`

Derived rule:

- parity depends on source-specific point generation and shader attributes, not
  one universal fallback cloud

## 5. Asset Registry

The point-source asset registry lives in `scripts.pretty.js:42941-43009`.

Registry-backed assets:

- bitmap sources: `logo`, `pcb`
- model sources: `shield`, `cubes`, `hex`, `globe`, `users`
- procedural sources are generated through `jo.generate()`

Derived rule:

- not every registered asset is active on the homepage; registry presence is
  broader than homepage usage

## 6. Base Controller Contract

The base controller is `yr` in `scripts.pretty.js:43013-43254`.

What it owns:

- one DOM anchor (`this.view`) and one scene slug (`this.slug`)
- `data-gfx-sticky` handling: `scripts.pretty.js:43024`
- `data-gfx-end-trigger` carry windows: `scripts.pretty.js:43025-43026`
- anchor-based layout, scale, and visibility:
  `scripts.pretty.js:43057-43124`
- animate-in and animate-out transitions:
  `scripts.pretty.js:43125-43187`
- overlay projection to screen coordinates:
  `scripts.pretty.js:43213-43227`

Derived rule:

- carry and overlap are first-class controller behavior because each controller
  computes its own height and end trigger

## 7. Concrete Homepage Controllers

### `blob` controller

- `blob` maps to `mm` via `scripts.pretty.js:49347-49356`
- hotspot-capable blob controller implementation:
  `scripts.pretty.js:43257-43525`

What it adds:

- hotspot pool creation from `.js-hotspot`: `43421-43458`
- scroll choreography labels such as `stats`, `hotspots`, `diagram`,
  `shrink`, `quickly`, `respond`, and `end`: `43291-43414`
- per-frame hotspot projection and DOM visibility updates: `43501-43524`

### `stream` controller

- `stream` maps to `ug` via `scripts.pretty.js:49347-49356`
- `ug` customizes scale only: `scripts.pretty.js:49326-49345`

Derived rule:

- the stream WebGL object is only one part of the chapter; the popup and rail
  choreography is handled elsewhere in DOM scroll adapters

### `pcb` controller

- `pcb` maps to `_m` via `scripts.pretty.js:49347-49356`
- pcb scroll behavior is a simple z-position timeline:
  `scripts.pretty.js:43615-43630`

Derived rule:

- CTA parity comes from a light controller plus DOM-native text and button
  choreography, not a heavy custom scene system
