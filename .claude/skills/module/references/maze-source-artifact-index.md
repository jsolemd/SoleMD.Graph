# Maze Source Artifact Index

Use this file when you need to reopen the raw Maze homepage snapshot
instead of the distilled architectural references.

## Canonical Cross-References

- **Round 12 ledger**:
  `docs/map/field-maze-baseline-ledger-round-12.md` —
  authoritative phase log + Source Ground Truth distillation. Read it
  before opening the raw archive; most line-level questions are already
  answered there.
- **Snapshot archive**:
  `data/research/mazehq-homepage/2026-04-18/` — repo-local mirror, the
  stable local copy the ledger cites. Gitignored under `data/`, so do
  **not** treat it as committed product documentation.
- **Disposable working mirror**: `/tmp/maze/` — convenient when ripping
  patterns; never authoritative.

If a future re-download disagrees with `sha256sum.txt`, assume the
upstream site changed and re-validate every parity-sensitive conclusion.

## Reproducibility Files

Inside `data/research/mazehq-homepage/2026-04-18/`:

- `downloaded-at.txt` — UTC download timestamp.
- `source-urls.txt` — canonical source URL list for the snapshot.
- `sha256sum.txt` — checksums for the mirrored files.

## Core Files

- `index.html` — stage shell, hotspot markup, stream marker markup,
  inline particle shaders, responsive stream SVG rails.
- `scripts.min.js` — shipped runtime bundle.
- `scripts.pretty.js` — pretty-printed copy used for line-level
  reverse-engineering. Every citation below points here unless noted.
- `styles.css` — breakpoint contract, fixed-stage CSS, hotspot/popup
  classes, reduced-motion rules.
- `flow-diagram-main.svg` / `flow-diagram-main-mobile.svg` — desktop +
  non-desktop stream backdrops.
- `particle.png` — point sprite texture used in the fragment shader.
- `pcb.png` — bitmap source for the PCB point cloud.
- `logo.png` — present in the registry but not active on the live
  homepage.
- `models/*.glb` — model assets converted into point clouds for
  non-homepage scene slugs.

## Citations By Topic

Every line range below was verified during Round 12; the matching
distillation lives in the Round 12 ledger §1–§18.

### Shader + material

- Particle vertex shader — `index.html:2132-2393`.
- Particle fragment shader — `index.html:2119-2131`.
- Shared particle material factory `gd.getMaterial` —
  `scripts.pretty.js:42545-42595`.
- Color-pair defaults (cyan base / magenta noise) — `:42564-42569`.
- 5-color decoration palette (baked into `color`, never read by shader)
  — `:42641-42664`.
- `?blending` URL toggle (additive vs. normal) — `:42580`.

### Geometry + attribute baker

- Per-slug scene presets (`cs.default | cs.blob | cs.stream | cs.pcb`)
  — `scripts.pretty.js:42412-42466`.
- Semantic CVE bucket table (`urgentFix`/`patchInSLA`/`ignore`/
  `notExploitable` weights + `aStreamFreq`/`aFunnel*` ranges) —
  `:42807-42878`.
- Shared attribute writer `jo.addParams` (per-point random + buckets) —
  `:42784-42893`.
- Geometry generators (`jo.generate("sphere"|"blob"|"stream")`) —
  `:42666-42675`, `:42894-42917`.
- Bitmap-to-points (`jo.fromTexture`) — `:42676-42722`.
- Model-to-points (`jo.fromVertices`) — `:42723-42745`.

### Asset pipeline + registry

- Asset registry `vd` (slug → file map) — `:42941-42948`.
- Loader `Ws.load(slug)` (PNG → fromTexture, GLB → fromVertices) —
  `:42950-43011`.
- Procedural variant `Ws.generate(slug)` — same block.
- `[data-gfx]` activation anchors on the homepage —
  `index.html:235` (blob), `:564` (stream), `:1067` (pcb).

### Controller base + lifecycle

- Base controller `yr` (wrapper/mouseWrapper/model + animateIn/Out +
  toScreenPosition) — `:43013-43254`.
- Idle frame loop (`+0.001` rad wrapper, `+0.002` uTime) — `:43047-43049`.
- `animateIn` (1.4 s `Tn` ease) — `:43125-43154`.
- `animateOut` (1 s, ±π wrapper rotation) — `:43156-43187`.
- Mouse parallax (1 s sine.out, ±5e-4/±3e-4 rad/px) — `:43189-43196`.
- `toScreenPosition` projection — `:43213-43227`.

### Blob choreography

- Blob controller `mm` (extends `yr`, owns hotspots) — `:43257-43526`.
- Hotspot pool + `animationend` reseed wiring — `:43421-43457`.
- `setRandomHotspotPosition` rejection rules (z>0, vh window, x bound)
  — `:43470-43499`.
- Per-frame hotspot projection + `is-animating` toggle — `:43501-43524`.
- Blob scroll timeline (`scrub: 1`, ease "none", 10-unit duration) —
  `:43291-43414`.

### Stream + PCB + stars

- Stream controller `ug` (`updateScale = 250 * aspect / (1512/748)`) —
  `:49326-49345`.
- Stream DOM/SVG adapter `KS` (8 `.js-stream-point` nodes,
  `motionPath`, `toggleActions: "play pause resume reset"`) —
  `:48911-49035`.
- Stream wrapper z-scrub (`-200 → 0`) — `:43629`.
- PCB controller `_m` (z-scrub variant of `yr`) — `:43615-43630`.
- PCB preset (x=-80° tilt, scaleFactor 0.5) — `:42453-42466`.
- Stars `hg` (gated by `?stars`, 6000 points, 5× foreground uTime) —
  `:49359-49426`.

### Stage runtime + bootstrap

- Stage runtime `Os/xi` (single canvas, `storeItems`, render loop) —
  `:49427-49587`.
- App bootstrap `by` (`Tn = CustomEase("custom","0.5,0,0.1,1")`,
  `us = min(2, devicePixelRatio||1)`) — `:55880-55957`.

### Scroll adapters + DOM choreography

- Scroll adapter registry (`welcome`, `cta`, `moveNew`, `clients`,
  `stream`, `graphRibbon`, `events`) — `:49102-49113`.
- Adapter setup `jt.setup()` + scroll root `Jr` — `:49115-49325`.
- Progress bar `gg` (DOM-only, `--progress-N` custom property) —
  `:50178-50255`.

### Hotspot DOM + CSS

- ~30 `<div class="js-hotspot">` markup nodes (with
  `style="--delay: Xms"` and alternating `hotspot--red`) —
  `index.html:87-149`.
- Keyframes (`hotspot-inner`, `hotspot--outer`), base styles,
  `has-only-reds` and `has-only-single` phase gates, and the static
  `.hotspot__ui` card offset — `styles.css` (extracted in Round 12
  ledger §13).

## Highest-Value Search Entry Points

Open these first when re-opening the archive:

- `index.html:2119` — fragment shader.
- `index.html:2132` — vertex shader.
- `scripts.pretty.js:42545` — shared particle material factory.
- `scripts.pretty.js:42807` — semantic bucket tables.
- `scripts.pretty.js:42879` — shared attribute injection.
- `scripts.pretty.js:42950` — asset loader (`Ws`).
- `scripts.pretty.js:43013` — base controller `yr`.
- `scripts.pretty.js:43291` — blob scroll timeline.
- `scripts.pretty.js:48911` — stream DOM/SVG choreography.
- `scripts.pretty.js:49427` — stage runtime + preload.
- `scripts.pretty.js:50181` — progress bar DOM logic.
- `scripts.pretty.js:55880` — bootstrap, DPR cap, `Tn` ease.

## Useful Grep Patterns

When reopening the archive, these are the fastest high-signal searches:

- `rg -n "particles-vertex-shader|particles-fragment-shader" data/research/mazehq-homepage/2026-04-18/index.html`
- `rg -n "aMove|aSpeed|aRandomness|aSelection|aStreamFreq|uFunnel|uScreen" data/research/mazehq-homepage/2026-04-18/index.html data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`
- `rg -n "data-gfx|data-gfx-sticky|js-hotspot|js-stream-point|js-progress" data/research/mazehq-homepage/2026-04-18/index.html`
- `rg -n "getSphere|fromTexture|fromVertices|addParams|loadAll" data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`
- `rg -n "prefers-reduced-motion|body::before|desktop-only|phone-only|tablet-only" data/research/mazehq-homepage/2026-04-18/styles.css`

## How To Use This Archive

Default order:

1. Read the Round 12 ledger + the focused skill references in this
   folder for the distilled contract.
2. Drop into the raw archive only when you need line-level confirmation
   or to answer a new question not yet encoded in the references.

Do not start by diffing raw files if a focused reference already
answers the question.
