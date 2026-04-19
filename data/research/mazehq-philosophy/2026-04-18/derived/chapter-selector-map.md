# Philosophy Page Chapter Selector Map

Use this file when you need the page structure and scene ownership before
opening raw source.

## Primary Page Spine

- `index.html:233-247`
  - article shell and intro chapter
  - `data-gfx="sphere"`
  - `data-scroll="intro"`
- `index.html:248-349`
  - philosophy story chapter with desktop progress rail
  - five `our-philosophy-*` anchors
- `index.html:350-443`
  - investor strip
  - `data-scroll="clients"`
- `index.html:444-892`
  - follow-on logo/content block
  - `data-scroll="moveNew"`
- `index.html:893-926`
  - CTA chapter
  - `data-gfx="pcb"`
  - `data-scroll="cta"`
  - `data-gfx-end-trigger="#footer"`
- `index.html:1017-1048`
  - inline particle fragment and vertex shader blocks

## Story Card To Scene Map

- `index.html:297-306`
  - `#our-philosophy-1`
  - title: `Obsess about product`
  - local scene: `data-gfx="cubes"`
- `index.html:307-316`
  - `#our-philosophy-2`
  - title: `Push boundaries with AI`
  - local scene: `data-gfx="hex"`
- `index.html:317-326`
  - `#our-philosophy-3`
  - title: `Put security teams first`
  - local scene: `data-gfx="shield"`
- `index.html:327-336`
  - `#our-philosophy-4`
  - title: `Contribute to the community`
  - local scene: `data-gfx="users"`
- `index.html:337-346`
  - `#our-philosophy-5`
  - title: `Build an exceptional team`
  - local scene: `data-gfx="globe"`

## Progress Rail Contract

- `index.html:252-293`
  - sticky desktop-only progress rail
  - `js-progress`
  - one segment per story card
  - `data-id` values match the five story card ids

## Global Stage Shell

- `index.html:87-148`
  - fixed hotspot pool in the top-level `.s-gfx` shell
  - repeating `.js-hotspot` nodes with red and neutral variants
- implication:
  - the page is not a set of isolated canvases
  - sections hand off scene ownership inside one shared visual substrate
