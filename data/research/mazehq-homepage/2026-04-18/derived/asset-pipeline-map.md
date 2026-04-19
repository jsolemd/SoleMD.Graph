# MazeHQ Homepage Asset Pipeline Map

This file separates active homepage assets from registry-only assets so parity
work does not overfit to whatever happens to be present in the snapshot.

## 1. Active Homepage Assets

### Shared point sprite

- `particle.png` is the particle sprite loaded by the shader material in
  `scripts.pretty.js:42560` and referenced by `gd.PARTICLE_TEXTURE` in
  `scripts.pretty.js:42632`

### CTA bitmap source

- `pcb.png` is a bitmap-backed point source in the asset registry:
  `scripts.pretty.js:42941-42948`
- the homepage activates it through `data-gfx="pcb"` at `index.html:1067`

### Stream rail assets

- `flow-diagram-main.svg` is the desktop stream rail backdrop:
  `index.html:565-581`
- `flow-diagram-main-mobile.svg` is the mobile stream rail backdrop:
  `index.html:565-593`

Derived rule:

- homepage parity depends on both point-cloud assets and DOM/SVG rail assets

## 2. Registry Assets Not Clearly Active On The Homepage

The registry in `scripts.pretty.js:42941-42948` also includes:

- `logo.png`
- `Shield.glb`
- `Cubes.glb`
- `Net.glb`
- `World.glb`
- `Users.glb`

These are available to the runtime, but the captured homepage structure does not
prove they are mounted on the visible landing-page chapters.

Derived rule:

- do not assume every registry asset participates in the homepage flow just
  because it exists in the source tree
- use `derived/model-inspection.md` when the question is raw model bounds,
  uploaded vertex counts, or which mesh attributes survive in the archived
  binaries

## 3. Source Conversion Paths

Three point-source paths are implemented:

- procedural generation via `jo.generate()`: `scripts.pretty.js:42894-42917`
- bitmap-to-points via `jo.fromTexture()`: `scripts.pretty.js:42676-42722`
- model-vertices-to-points via `jo.fromVertices()`: `scripts.pretty.js:42723-42745`

All paths flow through shared particle-attribute enrichment in
`scripts.pretty.js:42784-42893`.

Derived rule:

- future parity work should preserve source-specific conversion, because the
  shader behavior expects those enriched attributes

## 4. Stream-Specific Shader State

The stream material extends the base particle shader with funnel and width
uniforms in `scripts.pretty.js:42583-42593`.

Derived rule:

- the stream chapter is not only a motion-path DOM chapter; the point shader is
  also specialized for the stream source

## 5. Practical Parity Guidance

- preserve bitmap-backed sources for flat chapter silhouettes such as `pcb`
- preserve procedural generation for blob-like fields
- preserve model-backed sources for future non-homepage scenes
- preserve the SVG rail layer for stream-style explanatory chapters
- do not collapse all scenes into one procedural particle source
