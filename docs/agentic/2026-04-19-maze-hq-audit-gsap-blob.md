# GSAP Blob Timeline + Color Cycle — Maze HQ Audit

**Audit Date**: 2026-04-19  
**Scope**: `BlobController.ts` (bindScroll, startColorCycle, destroy, intro boost) vs. Maze `mm` blob controller (scripts.pretty.js:43257–43526)  
**Sanctioned Deviations Protected**: ✓ alphaDiagramFloor, selectionHotspotFloor, rolling rainbow cycle

---

## Drift Summary

| Subsystem | Maze Line | SoleMD Current | Drift | Status |
|-----------|-----------|----------------|-------|--------|
| **Timeline init** | 43292–43302 | 484–493 | `paused: true` in Maze config; SoleMD omits | ⚠️ Behavioral difference |
| **Label positions** | 43309, 43326, 43355, 43379, 43391, 43404, 43406 | 503, 512, 547, 575, 594, 608, 619 | All positions match (stats=1, hotspots=2, diagram=4.9, shrink=6.3, quickly=7.2, respond=7.9, end=9) | ✓ Match |
| **uAlpha restore discipline** | 43362–43385 | 557–587 | Maze: 1→0→1; SoleMD: 1→alphaDiagramFloor→1 + `immediateRender: false` on shrink | ✓ Protected (alphaDiagramFloor) + Fix |
| **uSelection restore** | 43344–43348 (no restore) | 535–617 (restore at 7.9) | Maze stops at hotspot floor; SoleMD restores to 1 at respond beat | ✓ Protected (selectionHotspotFloor + respond restore) |
| **Reduced-motion snap** | None visible in bindScroll | 462–479 | SoleMD explicitly snaps uniforms + hotspot state on prefers-reduced-motion; Maze pattern unknown | ✓ Enhancement |
| **Rainbow color cycle** | Not in bindScroll | 481, 418–435 | SoleMD calls startColorCycle(); per-stop duration from BLOB_COLOR_CYCLE_PER_STOP_SECONDS (2s) | ✓ Protected (sanctioned deviation) |
| **Color cycle timeline** | N/A | 424–434 | `timeline({ repeat: -1, ease: "none" })`; tweens uColorNoise through LANDING_RAINBOW_RGB | ✓ Protected |
| **addPause(10)** | 43413 | 627 | Both present at end=9 beat | ✓ Match |
| **scrollDisposer lifecycle** | 43291, 43416–43419 | 448–454, 629–634 | Maze: store timeline, unbindScroll kills it; SoleMD: functional disposer pattern with scrollTrigger.kill() + timeline.kill() | ⚠️ Pattern difference |
| **destroy cleanup** | 43288–43289 (unbindScroll) | 437–441 | Maze: destroy calls unbindScroll then super; SoleMD: destroy kills colorCycleTimeline then calls super (no scrollDisposer cleanup) | ⚠️ Missing scrollDisposer teardown |

---

## Key Findings

### 1. **Timeline Paused Flag** (Maze 43294)
Maze initializes the timeline with `paused: true`, meaning ScrollTrigger takes over playback control. SoleMD omits this, which could affect how ScrollTrigger scrubbing interacts with the timeline's initial state.

**Risk**: Timeline may auto-play or exhibit unexpected initial state before first scroll.

---

### 2. **Reduced-Motion Handling** (SoleMD 462–479, no Maze equivalent)
SoleMD explicitly checks `prefers-reduced-motion` and snaps all uniforms to baseline + zeroes hotspot state. Maze's pattern is unknown in the audit scope; this may be an enhancement or omission in Maze.

**Status**: Correct pattern; matches accessibility best practice.

---

### 3. **immediateRender: false on Shrink uAlpha** (SoleMD 585)
SoleMD adds `immediateRender: false` to the shrink `fromTo` on uAlpha. Maze doesn't have this flag. The SoleMD comment (576–581) cites a GSAP timing issue where the second `fromTo` on the same property would clobber the live uniform at construction time without this flag.

**Risk in Maze**: Possible blob disappear-on-bind bug if this pattern applies to Maze.

---

### 4. **scrollDisposer Functional Pattern** (SoleMD 448–454, 629–634 vs. Maze 43416–43419)
SoleMD uses a functional disposer that both kills the scrollTrigger AND the timeline. Maze stores the timeline directly and kills only the timeline in `unbindScroll`. SoleMD's pattern is safer (kills the scroll trigger subscription explicitly) but raises a question:

**Concern**: SoleMD's `destroy()` method (437–441) calls `this.scrollDisposer?.()` only if explicitly invoked by `tick()` or another method—but the parent class `FieldController.destroy()` is called next. Check that `super.destroy()` also calls `this.scrollDisposer?.()` or that manual cleanup is guaranteed elsewhere.

**Action**: Verify scrollDisposer cleanup is guaranteed on destroy via parent class or explicit pattern.

---

### 5. **Color Cycle Not in Maze bindScroll Scope**
Maze's bindScroll doesn't include color cycle setup. SoleMD starts the cycle at line 481. This is a sanctioned deviation (rolling rainbow via startColorCycle), confirmed by task spec.

**Status**: ✓ Protected.

---

### 6. **Label Position Alignment**
All seven labels (stats, hotspots, diagram, shrink, quickly, respond, end) match Maze positions exactly. No drift.

---

## Recommended Actions

1. **Clarify timeline paused flag**: Confirm whether SoleMD intentionally omits `paused: true` or if it should be added for ScrollTrigger consistency.
2. **Verify scrollDisposer cleanup**: Ensure parent class or another path guarantees `this.scrollDisposer?.()` call during destroy.
3. **Test immediateRender: false**: Confirm the uAlpha multi-fromTo pattern doesn't exhibit Maze's potential clobber bug (if it exists).
4. **Document reduced-motion baseline snap values**: These should match shader preset defaults to ensure accessibility path is visually stable.

---

## Sanctioned Deviations — All Protected ✓

- **alphaDiagramFloor**: uAlpha endpoint at diagram beat (protected)
- **selectionHotspotFloor**: uSelection endpoint at hotspot beat + respond restore (protected)
- **Rolling rainbow cycle**: startColorCycle on uColorNoise with 2s per-stop duration (protected)

