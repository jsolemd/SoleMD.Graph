# Philosophy Page Doc Search Review Playbook

Use these lookups first when reopening the archive.

## Fast Entry Questions

- which section owns the intro scene?
  - open `index.html:235-247`
- which story card maps to which scene slug?
  - open `index.html:297-346`
- where is the CTA scene handoff?
  - open `index.html:893-926`
- where are the particle shaders?
  - open `index.html:1017-1048`
- where are the scene presets and asset loaders?
  - search `scripts.pretty.js:4458`

## High-Signal Grep Patterns

- `rg -n \"data-gfx|data-scroll|js-progress|our-philosophy-[1-5]\" index.html`
- `rg -n \"particles-vertex-shader|particles-fragment-shader\" index.html`
- `rg -n \"sphere:|pcb:|hex:|shield:|cubes:|users:|globe:\" scripts.pretty.js`
- `rg -n \"loadModel|fromTexture|fromVertices|pointTexture|uSelection|uStream\" scripts.pretty.js`
- `rg -n \"body::before|desktop-only|phone-only|tablet-only|s-progress|s-gfx\" styles.css`

## Practical Rebuild Questions

- for overall animation flavor:
  - open `overview.md`
  - then `runtime-architecture-map.md`
- for section ownership and scroll sequencing:
  - open `chapter-selector-map.md`
- for asset sourcing:
  - open `asset-pipeline-map.md`
- for heavier scene/model work:
  - open `model-inspection.md`
