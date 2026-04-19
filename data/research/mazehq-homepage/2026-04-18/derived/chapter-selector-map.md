# MazeHQ Homepage Chapter And Selector Map

This file maps chapter ownership, important selectors, and the DOM-side motion
handlers that sit around the shared stage.

## 1. Chapter Ownership In `index.html`

### Welcome / hero

- `#section-welcome` owns `data-gfx="blob"` and carries to `#section-story-2`:
  `index.html:235`
- The hero copy uses `data-scroll="welcome"`: `index.html:251`
- The clients rail uses `data-scroll="moveNew"` with nested
  `data-scroll="clients"`: `index.html:269-270`

### Story 1

- `#section-story-1` starts after the hero: `index.html:320`
- The first sticky progress component is `.s-progress.js-progress`:
  `index.html:323-348`

### Graph / stream chapter

- `#section-graph` starts at `index.html:538`
- The hybrid stream shell is the only element here that also owns a stage
  controller: `index.html:564`
- The rail backdrops are inline SVG paths in the DOM:
  `index.html:571-593`
- Each stream point is a `.js-stream-point` with one or more
  `.js-stream-point-popup` children: `index.html:597-711`

### Story 2

- `#section-story-2` starts at `index.html:715`
- The second progress component appears at `index.html:718-740`
- The explanatory ribbon DOM beat uses `data-scroll="graphRibbon"`:
  `index.html:754`
- The event DOM beat uses `data-scroll="events"`: `index.html:890`

### CTA

- `#section-cta` owns `data-gfx="pcb"` and carries to `#footer`:
  `index.html:1067`
- The CTA shell uses `data-scroll="cta"`: `index.html:1068`

Derived rule:

- only the welcome, stream, and CTA anchors own stage controllers; the story
  chapters are narrative DOM chapters layered around the shared stage

## 2. `data-scroll` Handler Registry

The scroll adapter registry lives in `scripts.pretty.js:49102-49112`.

Homepage-relevant adapters:

- `welcome` -> `JS`: `scripts.pretty.js:49037-49066`
- `clients` -> `HS`: `scripts.pretty.js:48597-48614`
- `moveNew` -> `QS`: `scripts.pretty.js:49069-49100`
- `stream` -> `KS`: `scripts.pretty.js:48911-49035`
- `graphRibbon` -> `qS`: `scripts.pretty.js:48732-48808`
- `events` -> `WS`: `scripts.pretty.js:48665-48731`
- `cta` -> `GS`: `scripts.pretty.js:48639-48664`

The adapter loader scans all `[data-scroll]` nodes in
`scripts.pretty.js:49176-49191`.

Derived rule:

- chapter polish is not buried inside the WebGL scene controller; it is split
  across named DOM adapters that bind to explicit `data-scroll` hooks

## 3. Stream Chapter Ownership

The stream chapter proves the homepage is hybrid, not shader-only.

DOM ownership:

- `.svg-flow-diagram-paths` and `.svg-flow-diagram-paths-mobile` define desktop
  and mobile motion rails: `index.html:571-593`
- `.js-stream-point` nodes carry the visible markers and popups:
  `index.html:597-711`

Motion ownership:

- `KS` binds a `ScrollTrigger`, creates looped GSAP timelines, and animates
  DOM nodes along the SVG rails with `motionPath`: `scripts.pretty.js:48911-49035`
- popup visibility is toggled by class changes on `.js-stream-point-popup`, not
  by particle shader state: `scripts.pretty.js:48950-49020`

Derived rule:

- the stream scene is WebGL plus DOM plus SVG; rebuilding it as just a point
  shader misses the actual chapter behavior

## 4. Progress Ownership

- Story progress DOM exists in `index.html:323-348` and `index.html:718-740`
- Progress behavior is implemented by `gg` in
  `scripts.pretty.js:50178-50252`

What `gg` does:

- measures `.js-progress-bar`: `scripts.pretty.js:50210-50219`
- maps segments to content sections by `data-id`: `scripts.pretty.js:50212-50217`
- computes section progress on scroll and writes CSS custom properties:
  `scripts.pretty.js:50186-50208`
- sets `data-current-visible` on the progress root so CSS can style the active
  segment: `scripts.pretty.js:50203-50208`

Derived rule:

- progress is DOM-native and independent from the stage controller; keep it out
  of the heavy renderer path

## 5. Selector Notes From `styles.css`

The archived stylesheet is a single-line bundle, but several selectors encode
important ownership boundaries:

- `body::before` is used as a breakpoint probe with `phone`, `tablet`, and
  `desktop` content values
- `.desktop-only`, `.phone-only`, and `.tablet-only` gate chapter variants
- `.s-progress` is sticky, DOM-native progress UI
- `.s-gfx` is the fixed stage shell
- `.has-only-reds` and `.has-only-single` are hotspot state classes toggled by
  the blob controller
- `.is-visible` is used for stream point and popup choreography

Derived rule:

- several layout and choreography decisions are enforced in CSS selectors, not
  only in JavaScript timelines
