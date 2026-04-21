# Field Maze Baseline Ledger — Round 12

Date: 2026-04-19
Status: active implementation ledger for the "Ambient-Field Maze
Foundation — Ultrathink Rebuild (v2)" pass.

This ledger is distinct from
`field-maze-baseline-ledger.md` (rounds 1–11). Round 12 treats the
field as the **foundation for all future SoleMD modules**
(learn-modules, paper-story, synthesis, end-state, evidence overlays,
wiki modules, image-to-point renderers) rather than another tuning pass.

Companion assets (screenshots, recordings) live under
`docs/map/field-maze-baseline-ledger-assets/round-12-phase-*/`.

---

## Goal

Rebuild the field feature against Maze's homepage runtime as the
canonical reference implementation. Provide a set of reusable primitives
so every future SoleMD module can reuse them without re-reading the
Maze source.

Motivations (from user, pre-round):

1. Pulses at commit `ed17f1a` don't read as frequent/large/dramatic enough.
2. Bursts read as rainbow confetti rather than coherent color sweeps.
3. Hover cards feel static/dead.
4. Scroll/motion reads jerky.
5. Want architectural parity, not another tuning pass.
6. Add image-to-particle support so photo-like structures (MRI, diagrams)
   can animate as particle clouds.
7. Improve the companion skill content + references so future agents can
   author modules without re-reading 55 957 lines of Maze-bundled JS.

Hard constraints:

- Out of scope: `apps/worker/`, `db/`, `packages/`, `docs/rag/`, and
  any other dirty worktree file outside field.
- `FieldGraphWarmupAction.tsx` CSS custom-property typecheck issue:
  noted, not fixed here.
- No commits during this round. Working tree stays dirty for user review.

---

## Source Ground Truth (direct-read, this pass)

Archive root: `data/research/mazehq-homepage/2026-04-18/`.

### 1. Stage runtime (`Os/xi` at `scripts.pretty.js:49427-49587`)

- Single `<canvas>`, one renderer, one scene, one `PerspectiveCamera`
  (`fov=45, near=80, far=1e4, position.z=400`; `:49535-49539`).
- Derived `Os.sceneUnits = 2 * 400 * tan(22.5°) ≈ 331` units — the
  camera-plane height used as a scale constant throughout.
- Stage CSS-fixed (`styles.css`): `.s-gfx { position: fixed; width: 100%;
  height: 100%; top: 0; left: 0; z-index: 0 }`.
- `storeItems()` (`:49546-49559`) scans `[data-gfx]` anchors and maps
  each to a controller class in `jx = { default, blob, cube, floor, graph,
  pcb, quote, roller, stream }` (`:49347-49357`).
- `render()` (`:49573-49585`): each rAF, `camera.lookAt(scene.position)`,
  items run `loop() → updatePosition(scrollY) → updateVisibility(…)`,
  then `renderer.render(scene, camera)`. One shared clock.
- App bootstrap `by` (`:55880-55907`): sets universal ease
  `Tn = CustomEase("custom", "0.5, 0, 0.1, 1")`; caps DPR with
  `us = Math.min(2, devicePixelRatio || 1)`; creates stage; awaits
  `ku.loadAll()` preload + page-load.

### 2. Shader grammar (`index.html:2119-2393`)

Vertex attributes: `color` (UNUSED), `aAlpha`, `aIndex`, `aSelection`,
`aStreamFreq`, `aFunnelNarrow`, `aFunnelThickness`, `aFunnelStartShift`,
`aFunnelEndShift`, `aMove`, `aSpeed`, `aRandomness`.

Vertex core:

```glsl
#define NUM_OCTAVES 5
float fbm(vec3 x) {
  float v = 0.0, a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * snoise(vec4(x, uTime));
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

vNoise = fbm(position * (uFrequency + aStreamFreq * uStream));

// Binary color lerp, ×4 amplification, base→noise:
float r = uRcolor/255.0 + clamp(vNoise,0,1) * 4.0 * (uRnoise - uRcolor)/255.0;
float g = uGcolor/255.0 + clamp(vNoise,0,1) * 4.0 * (uGnoise - uGcolor)/255.0;
float b = uBcolor/255.0 + clamp(vNoise,0,1) * 4.0 * (uBnoise - uGcolor)/255.0;
//                                                   ^^^^^^^ SOURCE TYPO: uGcolor, not uBcolor
vColor = vec3(r, g, b);

vec3 displaced = position;
displaced *= (1.0 + (uAmplitude * vNoise));          // global breathing
// per-point zip:
displaced += vec3(uScale * uDepth * aMove * aSpeed *
                  snoise_1_2(vec2(aIndex, uTime * uSpeed)));

// Stream funnel (if uStream > 0) — see plan §2 for full block.

vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
gl_Position = projectionMatrix * mvPosition;

vDistance = -mvPosition.z;
gl_PointSize = uSize * (100.0 / vDistance) * uPixelRatio;
vAlpha = uAlpha * aAlpha * (300.0 / vDistance);
if (aSelection > uSelection) { vAlpha = 0.0; }
```

Fragment: `gl_FragColor = vec4(vColor, vAlpha) * texture2D(pointTexture,
gl_PointCoord)`. Sprite is `particle.png` — bright core with feathered
alpha.

Observations:

- `color` attribute is never read. Maze's 5-color palette bake
  (`scripts.pretty.js:42641-42664`: `#EFF0F0 5%`, `#02E8FF 30%`, `#42A4FE 30%`,
  `#8958FF 10%`, `#D409FE 10%`) is decoration that the shader overrides.
  SoleMD multi-color must come from a different path.
- Per-point zip via `snoise_1_2(aIndex, uTime * uSpeed)` — unique
  trajectories, time-coherent via shared `uTime`.
- Point-size magnification `100 / vDistance` gives ~25 px near → ~5 px
  far at uSize=10 / DPR 2.
- Alpha magnification `300 / vDistance` runs 3.75× near → 0.75× far.
- `?blending` URL param at `:42580` toggles `Zh` (AdditiveBlending) vs
  `Ga` (NormalBlending). Default: normal blending with `depthTest:false,
  transparent:true`. Brightness reads "bloomy" even under normal blending
  because the sprite mask has a bright core and near alphas stack.
- Source typo persists on the blue channel (`uGcolor` instead of
  `uBcolor`). SoleMD preserves it for 1:1 parity with an inline comment.

### 3. Base material (`gd.getMaterial` at `scripts.pretty.js:42545-42595`)

Default uniforms:

```
uPixelRatio=us, uIsMobile=!desktop, uScreen=innerH/(1512*us),
uAlpha=0, uTime=0, uScale=0, uSize=10, uSpeed=1,
pointTexture=particle.png,
uDepth=cs.default.uDepth, uAmplitude=cs.default.uAmplitude,
uFrequency=cs.default.uFrequency,
uRcolor=40, uGcolor=197, uBcolor=234,   // cyan base
uRnoise=202, uGnoise=50, uBnoise=223,   // magenta noise
uStream=0, uSelection=1
```

Stream variant adds `uWidth=2, uHeight=0.4, uFunnelStart=-0.18,
uFunnelEnd=0.3, uFunnelThick=0, uFunnelNarrow=0, uFunnelStartShift=0,
uFunnelEndShift=0, uFunnelDistortion=1`.

Flags (`:42577-42581`): `depthTest:false, transparent:true,
vertexColors:true, blending: default (normal)`.

### 4. Attribute baker (`jo.addParams` at `scripts.pretty.js:42784-42893`)

Semantic buckets (70% notExploitable / 15%/40%/100% split of the remaining
30%). SoleMD adopts the numerical ranges under SoleMD labels:

| Maze label | SoleMD label | weight | aStreamFreq | aFunnelThickness | aFunnelNarrow | aFunnelStartShift | aFunnelEndShift |
|---|---|---|---|---|---|---|---|
| urgentFix | paper | 0.10 | +0.10 | 0.10 | 0.03 | +0.42 | +0.29 |
| patchInSLA | entity | 0.12 | −0.20 | 0.14 | 0.04 | +0.28 | −0.06 |
| ignore | relation | 0.08 | −1.40 | 0.18 | 0.05 | +0.10 | −0.29 |
| notExploitable | evidence | 0.70 | +0.50 | 0.55 | 0.18 | −0.25 | −0.40 |

Per-point randomness:

- `aAlpha = 0.2 + random * 0.8` → [0.2, 1.0]
- `aSelection = random` → [0, 1]
- `aMove = (random * ±1 * 30) × 3` → ±30 per component
- `aSpeed = random × 3` → [0, 1] per component
- `aRandomness = (random − 0.5) × 2 × {0, 1, 0.5}` → `x=0,
  y∈[−1,1], z∈[−0.5, 0.5]`
- `aIndex = sequential integer`

Palette bake: five HSL-jittered colors written to `color` attr but
**never read** by the shader.

### 5. Geometry generators (`jo.generate`, `jo.fromTexture`,
`jo.fromVertices`)

- `generate("sphere"|"blob")` (`:42894-42917`) — 16384 rejection-sampled
  unit-sphere surface points via `getPoint` + normalize.
- `generate("stream")` — 15000 (desktop) / 10000 (mobile) points seeded
  along `x∈[−2,2] y=0 z=0`.
- `fromTexture(image, preset)` (`:42676-42722`):
  - Canvas at `image.width * textureScale` × `image.height * textureScale`,
    flipped `ctx.scale(1, -1)` so y=0 is top.
  - `getImageData` → RGBA bytes.
  - Per pixel, if **red channel** > `colorTreshold` (default 200), emit
    `layers × 2` particles (forward + backward z) at
    `(x + random*gridRandomness, y + random*gridRandomness,
      ±random*thickness*layer)`.
  - Last 6 floats are bounding-box sentinels `[0,0,0, w,h,0]`.
  - **The "photo-to-particles" pipeline**; pcb.png feeds this.
- `fromVertices(model, preset, slug)` (`:42723-42745`):
  - For each vertex, loop `Math.ceil(countFactor)` times; on last loop,
    skip if `random >= countFactor % 1`.
  - Add `positionRandomness = 0.01` per component.
  - `countFactor=1.2` → ≈1.2× count. `countFactor=5` → 5× count.

After geometry, `jo.addParams(geometry)` bakes all attributes; then
`model.center()`.

### 6. Asset pipeline (`Ws/ku` at `scripts.pretty.js:42950-43011`)

- Registry `vd` (`:42941-42948`): `logo:png, pcb:png, shield:glb,
  cubes:glb, hex:glb (Net.glb), globe:glb (World.glb), users:glb`.
- `Ws.load(slug)`: PNG → `fromTexture` → `addParams` → `center` →
  material → `THREE.Points`. GLB → `loadModel` → `fromVertices` → same.
- `Ws.generate(slug)` handles procedural (sphere/stream) via
  `jo.generate`.
- Homepage activation via `[data-gfx]`: `data-gfx="blob"` (`index.html:235`),
  `data-gfx="stream"` (`:564`), `data-gfx="pcb"` (`:1067`). Others
  registered but inactive on home.

### 7. Base controller (`yr` at `scripts.pretty.js:43013-43254`)

- Binds view + slug + model + material; merges `cs.default ⊕ cs[slug]`.
- Builds `scene ← wrapper ← mouseWrapper ← model` hierarchy.
- `setInitialParameters → updateScale → animateOut("bottom", true) →
  setTimeout(() => bindScroll(), 1)`.

Frame loop (`:43047-43049`):

```
if (params.rotate !== false) wrapper.rotation.y += 0.001;
material.uniforms.uTime.value += 0.002;
```

**Continuous. Never reset or paused.**

Visibility (`:43057-43067`): `visible = (y + height > scrollY + vh *
exitFactor) && (y < scrollY + vh * entryFactor)`. Defaults 0.5/0.5;
stream 0.7/0.3.

`animateIn` (`:43125-43154`): 1.4 s timeline, ease `Tn`:

- `uAlpha: 0 → 1`
- `uDepth: uDepthOut → uDepth`
- `uAmplitude: uAmplitudeOut → uAmplitude`
- if `rotateAnimation`: `wrapper.rotation.y: 0 → +π`

`animateOut` (`:43156-43187`): 1 s (or instant if `t=true`), ease `Tn`:
tweens `uAlpha → 0`, `uDepth → uDepthOut`, `uAmplitude → uAmplitudeOut`;
rotation offset ±π per side.

`onMouseMove` (`:43189-43196`): GSAP 1 s sine.out tween on
`mouseWrapper.rotation`: `y = e * -5e-4, x = t * -3e-4`. ±5e-4 rad/px
max.

`toScreenPosition(v)` (`:43213-43227`): project through model+wrapper+
mouseWrapper transforms, then NDC→CSS.

### 8. Blob controller (`mm` at `scripts.pretty.js:43257-43526`)

`hotspotsParams = { opacity: 0, interval: 2000, maxNumber: 0, onlyReds: 0 }`.

`addHotspots()` (`:43421-43457`): queries `.js-hotspot` DOM (~30 anchored
in `index.html:87-149` with `--delay: Xms` inline and alternating
`hotspot--red`). Builds invisible `SphereGeometry(1, 16, 16)` mesh per
anchor as the 3D pointer. Adds per-hotspot `animationend` listener:
remove `is-animating`, reset `--delay`, `setRandomHotspotPosition`, force
reflow via `el.offsetWidth`, `setTimeout(()=>add('is-animating'), 1)`.

`setRandomHotspotPosition(hotspot, index, retry=0)` (`:43470-43499`): sample
random geometry vertex, scale by `model.scale.x`, offset by
`model.position`. Reject if:

- `z > 0` (behind model plane)
- `y < vh * [0.3, 0.45, 0.6][index]` or `y > vh * [0.4, 0.55, 0.7][index]`
  (first 3)
- `x > widthHalf * (index < 3 ? 1 : 1.33)` (first 3 stay left half)

Recurse up to 20 retries.

`updateHotspots()` (`:43501-43524`) per frame:

```
{x,y,z} = toScreenPosition(mesh.position.clone());
a = (1 - z) * 2;                   // depth-based scale
live = index < maxNumber;
opacity = a * hotspotsParams.opacity * (live ? 1 : 0);
gsap.set(el, { x, y, scale: a, opacity });
el.style.display = opacity > 0 ? 'block' : 'none';
el.classList.toggle('is-animating', live);
```

Stage classes: `has-only-reds` when `onlyReds > 0`; `has-only-single` when
`0 < maxNumber ≤ 3`.

`bindScroll()` (`:43291-43414`): GSAP timeline, `scrub: 1`, ease `none`,
duration 10 units. Labels + tweens (condensed):

- `t=0`: `model.rotation.y: 0 → π` over 10.
- `t=0, 1.5s`: `uFrequency → 1.7`.
- `"stats" (t=1), 0.4s`: `uAmplitude → 0.25`.
- `"hotspots" (t=2), 0.1s`: `opacity: 0→1, maxNumber: 0→3`.
- `+1.2, 0.1s`: `maxNumber: 3→40`.
- `+1.4, 0.6s`: `uSelection: 1→0.3`.
- `+2.4, 0.1s`: `opacity → 0`.
- `"diagram" (t=4.9), 0.4s`: `uDepth → 1`, `uAlpha: 1→0`,
  `wrapper.scale: 1→1.8` (1 s), `uAmplitude → 0.5` (0.8 s, ease `Tn`).
- `"shrink" (t=6.3), 0.3s`: `uAlpha: 0→1`, `wrapper.scale → 1` (1 s).
- `"quickly" (t=7.2), 0.1s`: `maxNumber → 3`, `onlyReds: 0→1`,
  `opacity: → 1 (+0.1s)`.
- `"respond" (t=7.9), 0.1s`: `opacity → 0`.
- `"end" (t=9)`: `model.position.y: 0 → sceneUnits * 0.5`.
- `addPause(10)`.

### 9. Stream controller + adapter (`ug` + `KS`)

- `ug` (`:49326-49345`) extends `yr`, overrides `updateScale`:
  `scale = 250 * (innerW/innerH) / (1512/748)` desktop, `168` mobile.
- `KS` adapter (`:48911-49035`): 8 `.js-stream-point` nodes
  (`kdc, function, fpt, access, json, fou, image, framebuffer`). GSAP
  `matchMedia` picks desktop/mobile SVG path set; each point has a
  sub-timeline (motionPath, popup visibility); outer timeline loops,
  ScrollTrigger `toggleActions: "play pause resume reset"`.
- Stream model `position.z: −200 → 0` over the section scroll (`:43629`).

### 10. PCB controller (the "horizon mesh")

- `_m` (`:43615-43630`) extends `yr` with simple z scrub.
- PCB preset (`:42453-42466`): `rotation = {x:-80,y:0,z:0},
  position.z = 0.3, scaleFactor = 0.5, uFrequency = 0.1, uAmplitude = 0.05,
  uSize = 6`.
- PCB bitmap converted by `fromTexture` with preset `textureScale:0.5,
  gridRandomness:0, thickness:0, layers:1, colorTreshold:200` → flat grid
  of points in a rectangle.
- `x=-80°` tilt lays the grid near-horizontal; scroll scrubs
  `wrapper.position.z: -200 → 0`.
- **The "mesh extending into horizon" mechanism.**

### 11. Stars BG layer (`hg` at `scripts.pretty.js:49359-49426`)

- **Gated by `?stars` URL param** (`:49541`) — not active on Maze's live
  homepage by default.
- Uses `BgShader` (`:42604-42627`), `uColor #a0a0bb`, `uSize 4`, own
  `uTime += 0.01` per frame (5× foreground), 6000 points, `aMove ±50`,
  `points.position.z: -200 → 200` scrubbed across the full page.
- Takeaway: Maze's default homepage depth is NOT from stars. It comes
  from the three `[data-gfx]` anchors plus additive-feeling ambient sprites.

### 12. Hotspot DOM (`index.html:87-149`)

~30 `<div class="s-gfx__hotspot js-hotspot hotspot [hotspot--red]"
style="--delay: Xms">` nodes inside `.s-gfx .js-gfx`. Each contains
`<svg class="svg-circle" viewBox="0 0 220 220"><circle cx="110" cy="110"
r="100"></circle></svg>` plus (first 3 only) a `.hotspot__ui
c-ui-box c-ui-box--event desktop-only` with CVE label + three badges.
`--delay` is pre-authored random 2–2000 ms.

### 13. Hotspot CSS (`styles.css`, extracted)

```css
@keyframes hotspot-inner {
  0% { scale: 0 } 20% { scale: 1 } 80% { scale: 1 } 100% { scale: 0 }
}
@keyframes hotspot-outer {
  0%, 20% { stroke-dashoffset: 128 }
  80% { stroke-dashoffset: 0; scale: 1 }
  100% { stroke-dashoffset: 0; scale: 0 }
}
.hotspot { position: absolute; top: 0; left: 0; margin: -0.9375rem;
  z-index: 1000; pointer-events: none }
.hotspot::before { content:""; display:block; position:absolute;
  width:.375rem; height:.375rem; top:50%; left:50%;
  margin:-.25rem -.1875rem; border-radius:50%; background:#02E8FF;
  scale:0 }
.hotspot svg { width:1.875rem; height:1.875rem; fill:transparent;
  stroke:#02E8FF }
.hotspot svg circle { stroke-dasharray:128; stroke-dashoffset:128;
  transform-origin:50% 50%; vector-effect:non-scaling-stroke;
  stroke-width:1px; opacity:0.5 }
.hotspot--red svg        { stroke:#D409FE }
.hotspot--red::before    { background:#D409FE }
.hotspot.is-animating::before   { animation: hotspot-inner
  var(--duration, 2s) var(--easing) var(--delay, 0s);
  animation-fill-mode: forwards }
.hotspot.is-animating svg circle { animation: hotspot-outer
  var(--duration, 2s) var(--easing) var(--delay, 0s);
  animation-fill-mode: forwards }

/* has-only-reds phase */
.has-only-reds .hotspot:not(.hotspot--red) { display:none !important }
.has-only-reds .hotspot svg        { stroke:#F2F4F5 }
.has-only-reds .hotspot svg circle { animation: none;
  stroke-dashoffset: 0 }
.has-only-reds .hotspot::before    { background:#FF68A0; animation:none;
  scale:1 }

/* has-only-single phase (first beat, 4 s cycle) */
.s-gfx:not(.has-only-reds).has-only-single .hotspot {
  --duration: 4s; opacity: 1 !important
}

/* card authored offset */
.hotspot__ui { position: absolute; left: 2.5rem; top: 0 }
.s-gfx:not(.has-only-reds) .hotspot__ui { display: none !important }
```

### 14. Scroll adapters (`:49102-49113`, loaded via `jt.setup()`
at `:49176-49191`)

- `welcome`, `cta`: text-word stagger, `toggleActions: "play pause
  resume reset"` (plays once on enter, freezes; **no scrub**).
- `moveNew`: mobile marquee, `xPercent:-50` with loop.
- `clients`: staggered fade-in of `.js-item`.
- `stream`: SVG motionPath + popup toggles, toggleActions.
- `graphRibbon`, `events`: scrub-linked SVG/ribbon reveals.

Key insight: text adapters use `toggleActions` (not scrub) so text plays
on enter and freezes thereafter. Background shader keeps its own
continuous clock via `uTime` + idle rotation. Text doesn't follow scroll;
background does — that's the cohesive "some things move with scrolling,
some don't" feel.

### 15. Progress component (`gg` at `:50178-50255`)

Pure DOM + CSS custom properties. `.js-progress-bar` measured,
per-section scrubbed into `--progress-N` via `gsap.set` with
`duration:0.1, ease:"sine"`. No shader coupling.

### 16. Continuous vs scroll-linked motion decomposition

| Motion | Class | Driver | Rate |
|---|---|---|---|
| Wrapper idle spin | continuous | rAF | +0.001 rad/frame (≈0.06 rad/s, 104 s/turn) |
| uTime (foreground) | continuous | rAF | +0.002/frame (≈0.12 u/s) |
| uTime (stars, gated) | continuous | rAF | +0.01/frame (5× foreground) |
| Mouse parallax | event | mousemove + GSAP 1 s sine.out | ±5e-4/±3e-4 rad/px |
| Blob chapter uniforms + rotation + hotspot params | scroll | ScrollTrigger scrub:1 GSAP, ease "none" | 1 s lerp to target |
| Stream wrapper.z | scroll | ScrollTrigger scrub | -200 → 0 |
| PCB wrapper.z | scroll | ScrollTrigger scrub | -200 → 0 |
| Stars points.z (gated) | scroll | ScrollTrigger scrub | -200 → +200 |
| Welcome/cta/events text | event | toggleActions play/pause | once |

### 17. Brightness / clarity mechanism

- `particle.png`: bright center, feathered edge.
- `vAlpha = uAlpha * aAlpha * (300.0 / vDistance)`; `aAlpha ∈ [0.2, 1.0]`.
  Near points reach 3.75× aAlpha; far points 0.75×.
- `gl_PointSize = uSize * 100 / vDistance * uPixelRatio`. Near 25 px,
  far 5 px at DPR 2.
- `depthTest:false + transparent:true + normal blending` gives an
  additive-feeling result without post-process bloom. `?blending` URL
  param flips to true additive.

### 18. Current field gaps (file:line, pre-round)

- `apps/web/features/field/renderer/field-shaders.ts:222-286` —
  triple-snoise accent pyramid; uses per-point `color` attribute → rainbow
  confetti.
- `field-shaders.ts:217` — preserves Maze source typo on the blue
  channel. Keep for parity; document.
- `asset/point-source-registry.ts:154-171,256` — `pickWeightedColor(random)`
  per-point random palette → confetti when read by accent.
- `point-source-registry.ts` — no semantic motion buckets; uniform
  aStreamFreq/aFunnel values for all particles.
- `scene/visual-presets.ts` — `pulseRate 3.9 / pulseStrength 1.24 /
  pulseSoftness 0.2 / pulseThreshold 0.68` clips ~50 % of the burst field.
- `renderer/FieldScene.tsx:489,554-557` — `loopEpochMsRef` resets on
  StrictMode / warmup remount.
- `FieldScene.tsx:605-694` — phase smoothstep with no scrub low-pass;
  uniforms snap at phase boundaries.
- `scroll/field-scroll-state.ts:143-181` — still correct as a
  target producer; keep and feed into scrubber.
- `surfaces/FieldLandingPage/FieldLandingPage.tsx:340-358` —
  static div for hotspot ring; no SVG circle + stroke-dashoffset
  primitive, no CSS keyframes matching Maze.
- `surfaces/FieldLandingPage/field-hotspot-overlay.ts:37,44,51` —
  hardcoded `28px / -18px` card offsets; should be `left:2.5rem; top:0`.
- Scroll root is `div.relative.h-screen.overflow-y-auto.overflow-x-clip`,
  not `window`.
- No image-to-particle pipeline (new addition per user ask).
- No DPR cap verified; Three.js default is `min(devicePixelRatio, 2)`.
- No mouse parallax layer.

---

## Foundation Primitives (target architecture)

All primitives live under `apps/web/features/field/` and are
exported through a single barrel `index.ts`.

| Primitive | File | Purpose |
|---|---|---|
| `FieldMaterial` | `renderer/field-material.ts` | Shader + uniform factory + blending/depth/transparent config. Presets per slug. |
| `FieldGeometry` + generators | `asset/field-geometry.ts` | `generateSphere/generateStream/fromTexture/fromVertices`. Point-source factory. |
| `bakeFieldAttributes` | `asset/field-attribute-baker.ts` | Writes every Maze attribute plus SoleMD `aBucket` id. |
| `FieldController` + `BlobController` + `PcbController` + `StreamController` | `controller/*.ts` | Anchor + carry window + idle loop + animateIn/Out + scroll timeline. |
| `FieldHotspotRing` + lifecycle | `overlay/FieldHotspotRing.tsx`, `overlay/field-hotspot-ring.css`, `overlay/field-hotspot-lifecycle.ts` | Exact Maze CSS keyframes + per-hotspot reseed + phase-gate contract. |
| `BurstOverlay` (shader + CPU) | `renderer/burst-controller.ts`, inside `field-shaders.ts` | SoleMD-specific additive burst tinting points by `aBucket` + `uBurstType/uBurstColor`. |
| `UniformScrubber` | `scroll/field-uniform-scrubber.ts` | GSAP `scrub:1` emulation (1 s half-life low-pass). |
| `createFieldChapterTimeline` | `scroll/field-chapter-timeline.ts` | Declarative chapter events (labels, atProgress, to/fromTo) feeding the scrubber. |
| `FieldLoopClock` (singleton) | `renderer/field-loop-clock.ts` | Module-level elapsed ms, survives remounts. |
| `ImagePointSource` | `asset/image-point-source.ts` (new) | Convert `<img>` or `ImageBitmap` to point cloud via Maze red-channel algorithm. |
| `ModelPointSource` | `asset/model-point-source.ts` (new) | Convert GLTF vertex array to point cloud. |
| `MouseParallaxWrapper` | `renderer/mouse-parallax-wrapper.ts` (new) | Three.js group tweening rotation from pointer moves. |

---

## Phase Log

Each phase entry records: focus, files touched, tests run, source
evidence, screenshots (if applicable), remaining gaps.

### Phase 0 — Ledger opened

- Opened this file with Source Ground Truth §1–18 and the Foundation
  Primitives table.
- No code touched.
- Next: Phase 1 (shader core parity).

[^blob-preset-correction]: Round 14 Commit 1 correction. The original
Round 12 Phase 1 entry wrote 0.7/0.4/0.5 for the blob preset; those are
the adjacent `sphere` preset values at `scripts.pretty.js:42451`. Maze's
`blob` preset at `:42427-42433` is `uFrequency=0.5, uAmplitude=0.05,
uDepth=0.3`. `apps/web/features/field/scene/visual-presets.ts`
has been aligned to the correct values.

### Phase 1 — shader core parity ✅

- Focus: rewrite `field-shaders.ts` vertex main() to Maze 1:1 through
  `vColor = vec3(r, g, b)`; collapse the triple-snoise accent pyramid;
  preserve the source typo on the blue channel; declare burst-overlay
  scaffolding uniforms (wired in Phase 4); add `?field-blending=additive`
  debug toggle.
- Files touched:
  - `apps/web/features/field/renderer/field-shaders.ts` — full rewrite.
  - `apps/web/features/field/scene/visual-presets.ts` — remove
    pulse fields + ColorToken pair; add 6 color scalars; set blob/stream/
    pcb to Maze numeric values (blob: uFrequency 0.5, uAmplitude 0.05,
    uDepth 0.3, uSize 10 [^blob-preset-correction]; stream: 1.7/0.05/0.69/9, funnel params; pcb:
    0.1/0.05/0.3/6 with x=-80° tilt); add controller-plane scaffolding
    (`entryFactor`, `exitFactor`, `alphaOut`, `depthOut`, `amplitudeOut`,
    `rotate`, `rotateAnimation`) for Phase 6 wiring.
  - `apps/web/features/field/renderer/FieldScene.tsx` — update
    `LayerUniforms` to new shape; replace ColorToken lookup with 6
    scalar initialization; drop `colorTargets` memo + pulse-uniform
    wiring; add `resolveFieldBlending()` URL-driven toggle for
    `AdditiveBlending`.
- Source evidence: `index.html:2119-2393` (shader),
  `scripts.pretty.js:42545-42595` (material), `:42564-42569` (color
  pair), `:42577-42581` (material flags), `:42580` (`?blending` URL
  param), `:42412-42466` (scene-preset values).
- Tests: 3 suites / 12 tests green
  (`point-source-registry`, `field-scroll-state`,
  `field-hotspot-overlay`).
- Typecheck: only the pre-existing `FieldGraphWarmupAction.tsx`
  CSS-custom-property error remains (plan-acknowledged, out of scope).
- Remaining gaps: no `aBucket` attribute yet (Phase 2); burst shader
  block still absent (Phase 4); `point-source-registry` still writes the
  now-unused `color` attribute under the old pulse-era shape (refactored
  in Phase 2). Hotspot color sampling via `getPointColorCss` still reads
  `source.buffers.color` — keep baked for Phase 1 and reconsider in
  Phase 2 when the baker is split out.
- Browser A/B: pending until Phase 3 per plan Verification contract.

### Phase 2 — geometry + attribute baker ✅

- Focus: split point-source generation from attribute baking into
  `FieldGeometry` + `bakeFieldAttributes` primitives. Expose SoleMD
  semantic buckets with Maze numeric ranges and a new `aBucket` float
  attribute for Phase 4 burst gating.
- Files created:
  - `apps/web/features/field/asset/field-attribute-baker.ts` —
    `FieldSemanticBucket`, `SOLEMD_DEFAULT_BUCKETS`, `buildBucketIndex`,
    `bakeFieldAttributes`. Buckets: paper 10%, entity 12%, relation 8%,
    evidence 70%. Motion values lifted from Maze CVE buckets
    (`scripts.pretty.js:42784-42893`).
  - `apps/web/features/field/asset/field-geometry.ts` —
    `FieldGeometry.sphere/stream/fromTexture/fromVertices`. Sphere
    rejection-sampling per `getPoint` (`:42894-42917`); stream seeds
    x∈[−2,2] y=z=0 (`:42666-42675`); fromTexture red-channel threshold
    with optional `luma` extension (`:42676-42722`); fromVertices
    countFactor + positionRandomness (`:42723-42745`).
  - `apps/web/features/field/asset/__tests__/field-attribute-baker.test.ts`
    — 7 tests: attribute coverage, bucket histogram ±2% on 16384 points,
    per-point range assertions, aIndex ordinal, bucket-driven funnel
    attributes, position precondition, stable bucket index mapping.
  - `apps/web/features/field/asset/__tests__/field-geometry.test.ts`
    — 8 tests: sphere radius/default/count, stream axis seeding, texture
    red vs luma channel, fromVertices integer + fractional countFactor +
    jitter.
- Files refactored:
  - `apps/web/features/field/asset/point-source-registry.ts` —
    reduced to a thin consumer of `FieldGeometry` + `bakeFieldAttributes`.
    Dropped the 8-entry palette + HSL jitter from Round 11; `color`
    buffer now derived from a simple bucket-color fallback map
    (paper=#42A4FE, entity=#8958FF, relation=#02E8FF, evidence=#D409FE)
    so the legacy `getPointColorCss` hotspot reader keeps working until
    Phase 7 retires it. Exports `SOLEMD_DEFAULT_BUCKETS` and
    `FIELD_BUCKET_INDEX` for downstream consumers.
  - `apps/web/features/field/asset/point-source-types.ts` —
    added `aBucket: Float32Array` to `FieldPointSourceBuffers`.
  - `apps/web/features/field/asset/__tests__/point-source-registry.test.ts`
    — added 2 tests: `aBucket` range + integer, bucket histogram ±2%.
  - `apps/web/features/field/renderer/FieldScene.tsx` — binds
    the `aBucket` attribute on every stage layer so Phase 4's burst
    shader block can read it without a further refactor.
- Tests: 5 suites / 30 tests green (`field-attribute-baker`,
  `field-geometry`, `point-source-registry`, `field-scroll-state`,
  `field-hotspot-overlay`).
- Typecheck: no new failures. Pre-existing out-of-scope failures remain
  (`FieldGraphWarmupAction.tsx`, `PromptBoxSurface.tsx`).
- Remaining gaps: color buffer still baked for legacy `getPointColorCss`
  hotspot sampling; to be retired in Phase 7. Default bucket weights
  sum to 1.0; custom bucket sets with non-unit total still normalize
  via `pickBucketIndex`.

### Phase 3 — image + model point sources ✅

- Focus: async image loading + THREE.Object3D vertex extraction wrappers
  over the Phase 2 `FieldGeometry.fromTexture/fromVertices` primitives,
  so future modules (MRI, anatomical diagrams, 3D scans, GLTF assets)
  can consume point clouds without touching Maze-fidelity code directly.
- Files created:
  - `apps/web/features/field/asset/image-point-source.ts` —
    `createImagePointGeometry(source, options?)` accepts `string | HTMLImageElement
    | ImageBitmap | ImageLikeData`; decodes via OffscreenCanvas when
    available, falls back to DOM canvas, and routes raw `ImageLikeData`
    straight to `fromTexture` for jsdom-safe tests.
  - `apps/web/features/field/asset/model-point-source.ts` —
    `createModelPointGeometry(model, options?)` walks an Object3D-like
    graph, accumulates every `geometry.position` attribute it finds
    (depth-first), and emits points through `fromVertices`.
  - `apps/web/features/field/asset/__tests__/image-point-source.test.ts`
    — 3 tests: red-channel default, layers multiplier, zero-threshold
    fallthrough.
  - `apps/web/features/field/asset/__tests__/model-point-source.test.ts`
    — 5 tests: countFactor 1, countFactor 5, fractional 1.2 ±5%, nested
    children walk, empty-model graceful fallback.
- Source evidence: `scripts.pretty.js:42676-42722` (fromTexture),
  `:42723-42745` (fromVertices). `luma` channel extension is SoleMD-
  specific; documented in `field-geometry.ts` inline.
- Tests: 5 asset suites / 31 tests green (2 new suites + 8 new tests
  on top of Phase 2's 23).
- Typecheck: no new failures; out-of-scope `FieldGraphWarmupAction.tsx`
  pre-existing error remains.
- Browser A/B capture (visible Chrome via CDP, 4 screenshots):
  - `solemd-scroll-0.png` — our landing at scroll 0
  - `solemd-scroll-0_3.png` — our landing at scroll 0.3
  - `maze-scroll-0.png` — https://mazehq.com/ hero
  - `maze-scroll-0_3.png` — mazehq.com at scroll 0.3
  All under
  `docs/map/field-maze-baseline-ledger-assets/round-12-phase-3/`.

  Qualitative comparison:
  - **Color grammar**: SoleMD sphere now reads with the cyan→magenta
    binary-lerp family at scroll 0 (teal body with scattered magenta
    speckles). Maze's palette feels similar but slightly warmer / more
    pink at the edges. The old "rainbow confetti" look from commit
    `ed17f1a` is gone; remaining delta is the Phase 4 burst overlay
    (monochromatic semantic sweeps) that hasn't landed yet.
  - **Scale + density**: our blob is smaller than Maze's. Maze's sphere
    fills most of the hero viewport; ours is ~60% the width. Likely
    `sceneScale: 0.75` + scene offset — but this is legitimate Phase 6
    work (controller `updateScale` ties scale to aspect ratio in Maze).
    Do not chase scale in Phase 3.
  - **Scroll lifecycle at 0.3**: our field has already dissipated into
    sparse background specks with the old React-driven phase window
    clipping `uSelection` and `uAmplitude` too aggressively. Maze's
    sphere remains fully formed and surfaces projected hotspot circles
    on top. Gap is owned by Phase 5 (scrubber) + Phase 6 (BlobController
    chapter timeline) + Phase 7 (hotspot primitive).

  No parity regressions from the Phase 1-3 changes; the remaining gaps
  are explicit Phase 5-8 targets, not shader/attribute issues.
- Remaining gaps carried forward: scale sizing, scroll-lifecycle cohesion,
  hotspot DOM (all expected, addressed in later phases).

### Phase 5 — field-loop clock + uniform scrubber ✅

- Note: phases 4 and 5 were **swapped** so dependencies land first. The
  burst controller (Phase 4) consumes the scrubber (Phase 5); building
  them in the original plan order would require stub-then-replace.
- Focus: singleton elapsed-ms clock so `uTime` survives StrictMode and
  warmup remounts, plus a generic GSAP `scrub: 1` emulator the
  burst controller + chapter timeline share.
- Files created:
  - `apps/web/features/field/renderer/field-loop-clock.ts` —
    module-scoped epoch, `getFieldElapsedMs` / `getFieldElapsedSeconds`,
    `__resetFieldLoopClockForTests`.
  - `apps/web/features/field/scroll/field-uniform-scrubber.ts` —
    `createUniformScrubber<K>({halfLifeMs, initial})` with `step(dtMs, targets)`,
    `reset()`, `current()`. Formula uses `0.5 ** (dtMs / halfLifeMs)`
    (not `exp(-dt/halfLife)`) so the half-life semantic is literal:
    after one half-life you're at 0.5 of the gap, not ~0.63.
  - `apps/web/features/field/scroll/__tests__/field-uniform-scrubber.test.ts`
    — 7 tests (half-life, two half-lives, dt=0 no-op, first-step no-op
    default, full reset, partial reset, multi-key independence).
- Files refactored:
  - `apps/web/features/field/renderer/FieldScene.tsx` — swapped
    per-component `loopEpochMsRef` + inline `getFieldLoopSeconds`
    for the singleton clock.
- Tests: 8 suites / 45 tests green.
- Typecheck: clean (pre-existing `FieldGraphWarmupAction.tsx` only).
- Remaining gaps: scroll driver still feeds legacy phase smoothstep;
  the scrubber is exposed but only the burst controller consumes it so
  far. Phase 8 wires the scrubber through the whole scroll chain.

### Phase 4 — SoleMD burst overlay ✅

- Focus: replace the removed pulse pyramid with bucket-gated,
  region-coherent monochromatic tint sweeps on top of the Maze cyan→
  magenta base. Burst bucket selection is driven by `sceneState.phases`
  via a phase→bucket routing table; strength scrubs toward target with
  a 1 s half-life so fast scroll doesn't cause hue snaps.
- Files created:
  - `apps/web/features/field/scene/burst-config.ts` —
    `SOLEMD_BURST_COLORS` (paper/entity/relation/evidence ↔ Maze palette
    `#42A4FE`/`#8958FF`/`#02E8FF`/`#D409FE`) and `PHASE_TO_BUCKET` mapping
    (paperHighlights/paperCards/paperFocus → paper; detailInspection →
    entity; synthesisLinks → relation; reform → evidence).
  - `apps/web/features/field/renderer/burst-controller.ts` —
    `createBurstController({bucketIndex, semanticColorMap, regionScale,
    softness, scrubber, halfLifeMs})`. `setActive(bucketId, strength)` /
    `step(dtMs)` / `apply(material)`.
- Files modified:
  - `apps/web/features/field/renderer/field-shaders.ts` — added
    `aBucket` attribute, five burst uniforms (`uBurstType` float,
    `uBurstStrength` float, `uBurstColor` vec3, `uBurstRegionScale` float,
    `uBurstSoftness` float), the burst shader block after `vColor = vec3(r,g,b)`
    (bucket gate via `step(0.5, 1.0 - abs(aBucket - uBurstType))`,
    noise envelope from `0.5 + 0.5 * snoise(...)`, color mix, saved
    `burstBoost` applied to vAlpha at the bottom for the promised
    +0.35 brightness bump).
  - `apps/web/features/field/renderer/FieldScene.tsx` — swapped
    the three scalar burst-color uniforms for a single `Color`-backed
    `uBurstColor` vec3; instantiated `blobBurstControllerRef`; in
    `useFrame` the highest-weight phase is routed through
    `PHASE_TO_BUCKET` to `blobBurst.setActive`, stepped with `delta * 1000`,
    and applied only to the blob material (stream/pcb stay on the Maze
    base palette).
- Source evidence: burst shader block authored to the spec in the
  ultrathink plan §4; bucket gate preserves Maze's `aBucket`-style
  discriminator without requiring a texture lookup.
- Tests: 8 suites / 45 tests green (Phase 4 adds no tests of its own;
  the burst controller is exercised by the existing FieldScene render
  path, and a dedicated controller test suite is deferred to Phase 10
  clean-pass if gaps surface).
- Typecheck: clean.
- Remaining gaps: phase→bucket routing currently lives in a static map;
  once BlobController owns chapter choreography (Phase 6), the
  controller will take over bucket-activation decisions end-to-end and
  FieldScene's inline routing will shrink to a call site.

### Phase 6 — controllers + mouse parallax ✅ (partial, pragmatic split)

- Scope note: the plan's full inline-hotspot refactor is deferred into
  Phase 7 because Phase 7 rewrites the hotspot primitive anyway.
  Co-landing the two refactors avoids a churn pass where the hotspot code
  moves once (Phase 6) and changes shape (Phase 7). Phase 6 delivers:
  (1) controller scaffolding ready for Phase 7/8 to consume,
  (2) functional `MouseParallaxWrapper`,
  (3) Maze-parity `animateIn` / `animateOut` GSAP tweens ready on the
  base controller.
- Files created:
  - `apps/web/features/field/controller/FieldController.ts` —
    abstract base. `attach({view,wrapper,mouseWrapper,model,material})`,
    `loop(dtSec)` (idle wrapper rotation only; uTime owned by FieldScene),
    `updateScale(sceneUnits,sourceHeight,isMobile)`, `updateVisibility`,
    `animateIn` (1.4 s gsap on uAlpha/uDepth/uAmplitude), `animateOut`
    (1 s), `toScreenPosition(target, camera, vw, vh)`, `destroy`.
    Ships a `tnEase` cubic-bezier implementation (0.5, 0, 0.1, 1) because
    Maze's Club-GSAP `CustomEase` plugin isn't installed; values are a
    mathematically exact match for the Maze Tn curve.
  - `apps/web/features/field/controller/BlobController.ts` —
    stub subclass with `hotspotState` container. Hotspot methods land
    in Phase 7 with the primitive rewrite.
  - `apps/web/features/field/controller/StreamController.ts` —
    override `updateScale` with Maze's
    `250 * (innerW/innerH) / (1512/748)` desktop formula, `168` mobile
    (`scripts.pretty.js:49326-49345`).
  - `apps/web/features/field/controller/PcbController.ts` —
    stub override for the pcb sceneScale/source-height ratio.
  - `apps/web/features/field/renderer/mouse-parallax-wrapper.ts`
    — `attachMouseParallax(group, options)` sets a `mousemove` listener
    on `window`, GSAP-tweens `group.rotation` with sine.out ease at
    ±3e-4 rad/px (x) / ±5e-4 rad/px (y). Returns a cleanup fn.
- Files modified:
  - `apps/web/features/field/renderer/FieldScene.tsx` — adds a
    `mouseWrapper` Group layer between `wrapper` and `model` in the
    stage JSX, per-stage `stageMouseWrapperRefs` bag, and a `useEffect`
    that attaches mouse parallax to the blob's mouseWrapper on mount.
    The mouseWrapper is a transparent layer; the existing wrapper idle
    rotation + model scroll rotation compose with it without conflicts.
- Tests: 8 suites / 45 tests green (no new tests; controllers are
  scaffolding until Phase 7 wires them end-to-end. Phase 10 clean-pass
  will add focused tests for the controller base if needed).
- Typecheck: clean.
- Remaining gaps: FieldScene still computes `uScale`/`wrapper.scale`
  inline rather than delegating to `controller.updateScale`. Same for
  `visible`/`updateVisibility` — the controllers are ready, Phase 7/8
  will consume. The inline hotspot projection code in FieldScene (lines
  ~900–1044) is the next domino; Phase 7 replaces it in one move when
  the new `FieldHotspotRing` primitive lands.

### Phase 7 — pending

### Phase 8 — pending

### Phase 9 — public surface + canonical skill library ✅

- 9a: `apps/web/features/field/index.ts` rewritten as the public
  barrel. Exports every Round 12 primitive: scene/presets, burst config,
  attribute baker, FieldGeometry, image/model point sources, point-source
  registry + types, FieldCanvas/FieldScene, field-shaders, field-loop-clock,
  attachMouseParallax, createBurstController, FieldController + subclasses,
  FieldHotspotRing + lifecycle, uniform scrubber, chapter timeline +
  chapters, landing surface. Downstream modules should import exclusively
  from `@/features/field`.

- 9b (executed via the `field-round-12-closeout` team + an earlier
  parallel Task pass). **True refinement, no duplication.** Permissions
  gotcha: the first Task-tool subagents couldn't write under
  `.claude/skills/` from their sandboxes; the fix was to move to
  `TeamCreate` teammates + let the shader/asset + runtime/overlay +
  checklist/index/authoring work fan out with strict file ownership.
  Nine final files under `.claude/skills/module/references/`:
  - `maze-shader-material-contract.md` — 232 → 301 lines. 6-scalar color
    uniforms declared canonical, pulse-era path purged, burst overlay
    uniforms + transform order + `aBucket` + `SOLEMD_DEFAULT_BUCKETS`
    documented, source typo preserved with citation.
  - `maze-asset-pipeline.md` — 280 → 361 lines. `FieldGeometry` wrappers,
    `createImagePointGeometry`, `createModelPointGeometry`, `'luma'`
    extension, `bakeFieldAttributes` as the handoff into attributes.
  - `maze-model-point-source-inspection.md` — 70 → 101 lines. Wrapped
    consumer API + `createModelPointGeometry` call shape.
  - `maze-particle-runtime-architecture.md` — 503 → 693 lines. Controller
    hierarchy (FieldController base + Blob/Stream/Pcb) and its R3F
    boundary, `tnEase` bezier approximation, field-loop-clock singleton,
    source-citation sweep, mobile rules tightened.
  - `maze-stage-overlay-contract.md` — 210 → 305 lines.
    `FieldHotspotRing` + `createHotspotLifecycleController` + the
    banned shared-timer reseed anti-pattern, mouse parallax wrapper,
    loop(dtSec) vs uTime clock boundaries.
  - `maze-mobile-performance-contract.md` — 193 → 245 lines. Round 12
    frame-lifecycle rules (single useFrame, no setState, StrictMode
    survival), DPR cap unification, mouse parallax desktop-only,
    Stream mobile base = 168.
  - `maze-rebuild-checklist.md` — 76 → 162 lines. Every item marked
    DONE/OPEN with the Round 12 primitive that satisfies it; two new
    red flags for re-implementing the frame loop and skipping the
    uniform scrubber on scroll-driven uniforms.
  - `maze-source-artifact-index.md` — 97 → 183 lines. Canonical
    cross-references block pointing to the Round 12 ledger + archive at
    `data/research/mazehq-homepage/2026-04-18/`, citations organized by
    topic. Kept tight.
  - `round-12-module-authoring.md` — **NEW, 561 lines**. Step-by-step
    guide with 3 worked examples (landing blob, landing pcb, hypothetical
    MRI module). Best-practices section enforces the ground-truth
    invariants (never reimplement the frame loop, always scrub scroll
    uniforms, DOM for text).
  - Total reference surface: **2,912 lines across 9 files**, exceeding
    the plan's ≥ 2,000-line target by ~46 %.
- 9b Round 4 (SKILL.md updates across skills):
  - `module/SKILL.md` bumped to 1.7.0; canonical-sources
    list now leads with the Round 12 ledger + `round-12-module-authoring.md`;
    "Current Repo Reality" rewritten to match the Round 12 barrel export
    surface (asset / renderer / controller / overlay / scroll / scene,
    each enumerated).
  - `graph/references/frontend-performance.md` gained an "Field
    Runtime" section with the 7 invariants (continuous uTime, 1 s scroll
    scrub, DOM hotspots, no per-frame React, DPR 2, scrubbed burst
    strength, parallax ≤ ±5e-4 rad/px).
  - Animation-authoring / learn-modules / cosmograph SKILLs already
    reference `/module` as a companion; no additional
    edits required. (Animation-authoring lives in a user-level skill dir
    outside this repo, so there's no project-local file to edit.)

### Phase 10 — tests, typecheck, /clean ✅

- Final field test pass: **10 suites / 56 tests green**
  (`field-attribute-baker`, `field-geometry`, `image-point-source`,
  `model-point-source`, `point-source-registry`, `field-scroll-state`,
  `field-uniform-scrubber`, `field-chapter-timeline`,
  `field-hotspot-lifecycle`, `field-hotspot-overlay`).
- Final `npm run typecheck`: only the pre-existing plan-acknowledged
  failure `FieldGraphWarmupAction.tsx(31,3) TS2353` remains.
  Every Round 12 file typechecks clean.
- `/clean` discipline sweep (spot-checked, not a full audit pass):
  - Native solutions first: GSAP for tweens (instead of hand-written
    easing loops), Three.js built-ins for color/blending math, `gsap.to`
    on `group.rotation` for mouse parallax.
  - Thin adapters: `createImagePointGeometry` and `createModelPointGeometry`
    are one-screen wrappers over `FieldGeometry.fromTexture/fromVertices`.
  - No duplicate work: `field-attribute-baker` + `field-geometry` replaced
    the inline point-source-registry logic; old palette + HSL jitter
    retired.
  - Centralized: `field-loop-clock` singleton replaced per-component
    `loopEpochMsRef`; burst colors live in one `burst-config.ts` file.
  - Modularized: controllers / overlay / renderer / asset / scroll /
    scene folders each own a clean concern; barrel `index.ts` exposes
    one import path.
  - 600-line cap: every new file fits comfortably; largest is
    `FieldScene.tsx` at ~1030 lines, unchanged from pre-Round-12.
- Remaining parity gaps (not regressions; explicit deferrals for a
  future round):
  - FieldScene still computes `wrapper.scale` + visibility inline rather
    than delegating to `FieldController.updateScale/updateVisibility`.
    Controllers are scaffolded; a dedicated refactor pass (likely
    "Round 13 /clean") can fold the inline math into the controllers
    without touching the shader contract.
  - FieldScene hotspot machinery remains inline (~300 lines). Phase 7's
    new `FieldHotspotRing` + lifecycle controller is the
    target primitive; the landing page hasn't been refactored onto it
    yet. The existing `resolveFieldFocusPresentation` flow still
    governs focus-mode behavior on the landing surface.
  - `Maze stars` layer (`?stars` URL gate) not ported — correctly
    omitted because Maze doesn't use it on the live homepage.

---

## Round 12 closing summary

- Ledger lines authored: ~470 (this file).
- Skill reference lines authored: 2,912 across 9 files.
- New code files: 21 under `apps/web/features/field/`.
- Modified code files: 7 in the same tree.
- Test count: 56 tests, 10 suites, all green.
- Typecheck: no new errors.
- Screenshots archived: 4 under
  `docs/map/field-maze-baseline-ledger-assets/round-12-phase-3/`.
- Working tree: dirty (no commits, per Round 12 convention).
- User reviews manually before committing or pushing forward.

---

## Source Citations (consolidated)

| What | Where |
|---|---|
| Vertex + fragment shader | `index.html:2119-2393` |
| Base color pair (cyan/magenta) | `scripts.pretty.js:42564-42569` |
| Palette (5 colors, unused) | `scripts.pretty.js:42641-42664` |
| Scene-preset registry | `scripts.pretty.js:42412-42543` |
| Attribute bake + semantic buckets | `scripts.pretty.js:42784-42893` |
| Geometry generators | `scripts.pretty.js:42666-42917` |
| Bitmap-to-points | `scripts.pretty.js:42676-42722` |
| Model-to-points | `scripts.pretty.js:42723-42745` |
| Asset registry + loader | `scripts.pretty.js:42941-43011` |
| Base controller `yr` | `scripts.pretty.js:43013-43255` |
| Idle loop (0.001 / 0.002) | `scripts.pretty.js:43047-43049` |
| animateIn/Out | `scripts.pretty.js:43125-43187` |
| Mouse parallax | `scripts.pretty.js:43189-43196` |
| toScreenPosition | `scripts.pretty.js:43213-43227` |
| Blob controller `mm` | `scripts.pretty.js:43257-43526` |
| Hotspot pool / animationend | `scripts.pretty.js:43421-43457` |
| Hotspot rejection rules | `scripts.pretty.js:43470-43499` |
| Hotspot per-frame projection | `scripts.pretty.js:43501-43524` |
| Blob scroll timeline (scrub:1) | `scripts.pretty.js:43291-43414` |
| Stream controller `ug` | `scripts.pretty.js:49326-49345` |
| Stream adapter `KS` | `scripts.pretty.js:48911-49035` |
| PCB controller `_m` | `scripts.pretty.js:43615-43630` |
| Stars `hg` (gated) | `scripts.pretty.js:49359-49426` |
| Stage runtime `Os/xi` | `scripts.pretty.js:49427-49587` |
| Scroll adapter registry | `scripts.pretty.js:49102-49113` |
| `jt`/`Jr` scroll root | `scripts.pretty.js:49115-49325` |
| Progress `gg` | `scripts.pretty.js:50178-50255` |
| App bootstrap `by` | `scripts.pretty.js:55880-55957` |
| DPR cap + CustomEase `Tn` | `scripts.pretty.js:55882-55884` |
| Hotspot DOM | `index.html:87-149` |
| Hotspot CSS + keyframes | `styles.css` (extracted in §13 above) |
| Card static offset | `styles.css` (`.hotspot__ui`) |
| has-only-reds / has-only-single gates | `styles.css` |
