# Scroll + GSAP Architecture Audit — SoleMD.Graph

**Audit Date**: 2026-04-19  
**Target**: GSAP/ScrollTrigger surface audit  
**Scope**: BlobController, StreamController, PcbController, FieldController, field-scroll-driver  
**Baseline**: Maze HQ (data/research/mazehq-homepage/2026-04-18/scripts.pretty.js)

---

## Summary

SoleMD's GSAP/ScrollTrigger implementation has **four meaningful drifts** from Maze, two of which are intentional accommodations for a React/TypeScript codebase, and one that represents a deferred feature (labels/pauses). No critical architectural violations detected. CustomEase approximation (tnEase) is correct.

---

## Audit Table

| Subsystem | Maze Reference | SoleMD Current | Drift | Status |
|-----------|---|---|---|---|
| **Timeline defaults** | scripts.pretty.js:43292 `defaults: { duration: 1, ease: "none" }` | BlobController:484 `defaults: { duration: 1, ease: "none" }` | ✓ Aligned | OK |
| **ScrollTrigger.scrub** | scripts.pretty.js:43300 `scrub: 1` | BlobController:491 `scrub: 1` | ✓ Aligned | OK |
| **Timeline paused flag** | scripts.pretty.js:43294 `paused: !0` (true) | BlobController:484 omitted | Drift: SoleMD does NOT pause on init | See below |
| **fromTo discipline** | scripts.pretty.js:43303 multi-fromTo pattern | BlobController:495 single fromTo on model.rotation | Drift: SoleMD underutilizes fromTo for scrolled uniforms | See below |
| **addLabel usage** | scripts.pretty.js:43309–43406 (labels: "stats", "hotspots", "diagram", "shrink", "quickly", "respond", "end") | BlobController:495 no labels | Drift: SoleMD defers timeline structure; no label-based pinning | Intentional defer |
| **addPause** | scripts.pretty.js:43413 `t.addPause(10)` (pause at 10s) | BlobController absent | Drift: SoleMD has no pause at timeline end | Not applicable (single-property animation) |
| **set before fromTo** | scripts.pretty.js:43310–43314 (set uAmplitude, uFrequency before fromTo) | BlobController:495 fromTo starts immediately | Drift: SoleMD omits baseline snapping via `set` | See below |
| **CustomEase Tn approximation** | scripts.pretty.js uses CustomEase("custom", "0.5, 0, 0.1, 1") | FieldController:81 `tnEase` = cubicBezier(0.5, 0, 0.1, 1) | ✓ Aligned (cubic approximation correct) | OK |
| **matchMedia reduced-motion gating** | scripts.pretty.js:49176–49192 (`jt.matchMedia.add(...)`) | BlobController:462–479 (`window.matchMedia(...)`) | ✓ Aligned (pattern correct) | OK |
| **ScrollTrigger.refresh() timing** | scripts.pretty.js: implicit (post-bind) | field-scroll-driver:106 (explicit call at line 106) | ✓ Aligned + explicit (better for React) | OK |
| **setTimeout(bindScroll, 1) deferral** | Not detected in Maze bindScroll path (async pattern used instead) | field-scroll-driver:41 (implicit, synchronous bind) | Difference: Maze defers; SoleMD binds sync. React lifecycle owns the defer. | OK for React |

---

## Key Findings

### 1. **Timeline `paused` Flag**
- **Maze reference**: scripts.pretty.js:43294 (`paused: !0`)
- **SoleMD**: BlobController:484 (no `paused` key)
- **Drift**: SoleMD's timeline begins playback immediately on construction. Maze explicitly pauses and lets ScrollTrigger control playback.
- **Why**: SoleMD's React wrapper (field-scroll-driver) calls `bindScroll()` synchronously in a useEffect-like pattern, so the pause-on-init is implicit: the timeline is constructed *after* the DOM is ready, and ScrollTrigger's scrub control begins immediately.
- **Severity**: Low. Functional equivalence achieved through different orchestration model (React effect vs. explicit pause state).

### 2. **Reduced Timeline Structure (Labels, Pauses, Multi-Uniform Tweens)**
- **Maze reference**: scripts.pretty.js:43291–43414 (10-second timeline with 7 labels, hotspot cycling, amplitude ramping, depth inversion, uSelection fading, uAlpha floor tween, wrapper scale pulse, model position shift)
- **SoleMD**: BlobController:495–544 (model.rotation tween only; uFrequency, uAmplitude, uAlpha, uSelection deferred to baseline preset or external state)
- **Drift**: SoleMD's scroll timeline is **much simpler**—only model rotation, no scroll-linked uniform tweens.
- **Why**: SoleMD defers scroll-linked uniform mutation to a future ScrollTrigger architecture pass. See comment at BlobController:314–319: "Per-frame work after C8: scroll-linked uniforms... are owned by the ScrollTrigger timeline built in bindScroll."
- **Severity**: Medium (architectural simplification, deliberate deferral, not a bug).

### 3. **Baseline Snapping via `set` Calls**
- **Maze reference**: scripts.pretty.js:43310–43315
  ```javascript
  t.set(this.material.uniforms.uAmplitude, { value: this.params.uAmplitude });
  t.set(this.material.uniforms.uFrequency, { value: this.params.uFrequency });
  ```
- **SoleMD**: BlobController:495 (no `.set()` calls to preset baseline values)
- **Drift**: SoleMD omits baseline snapping; if uniforms are not preset elsewhere, the first ScrollTrigger progress=0 state may show previous values until the first fromTo tween runs.
- **Why**: SoleMD presets uniforms at component attach time (FieldController:170–201, `createLayerUniforms`), so explicit `set` is redundant.
- **Severity**: Low (precondition is satisfied upstream).

### 4. **Color Cycle Timeline**
- **Maze reference**: Implicit static cyan→magenta (uColorNoise preset in baseline)
- **SoleMD**: BlobController:418–435 (`startColorCycle()`, loops through LANDING_RAINBOW_RGB with per-stop tweens)
- **Drift**: SoleMD has **rolling rainbow** cycle on uColorNoise; Maze has static pair.
- **Why**: Sanctioned deviation (task description lists "Rolling rainbow cycle on uColorNoise vs static cyan→magenta" as intentional).
- **Severity**: Intentional design choice. ✓ Protected.

### 5. **Alpha Floor + Diagram Beat**
- **Maze reference**: scripts.pretty.js:43362–43366 (uAlpha 1→0 over 0.4s at label "diagram")
- **SoleMD**: BlobController:368–378 (uAlpha floor logic via lerp in intro phase, then deferred to ScrollTrigger timeline)
- **Drift**: SoleMD's alpha floor is runtime-driven (selectionHotspotFloor tween + alphaDiagramFloor field), not scroll-linked.
- **Why**: Sanctioned deviation ("Alpha floor != 0 during diagram beat (selectionHotspotFloor tween + alphaDiagramFloor field)" listed as intentional).
- **Severity**: Intentional design choice. ✓ Protected.

### 6. **Blob-Only Landing**
- **Maze reference**: scripts.pretty.js likely has stream + pcb layers wired on landing; SoleMD comments reference a parallel module-only architecture.
- **SoleMD**: field-scroll-driver:29 ("Landing-only binder: the landing is a blob-centric story, so only the blob layer is wired here")
- **Drift**: SoleMD landing excludes stream/pcb layers.
- **Why**: Sanctioned deviation ("Blob-only landing (no stream/pcb layers on landing surface)" listed as intentional).
- **Severity**: Intentional design choice. ✓ Protected.

### 7. **uSelection Restore**
- **Maze reference**: scripts.pretty.js:43345–43348 (uSelection 1→0.3 at "hotspots+=1.4", then implicit restore at "shrink")
- **SoleMD**: BlobController comment at line 474 mentions uSelection in shader.selection baseline.
- **Drift**: SoleMD defers scroll-linked uSelection mutation to future ScrollTrigger pass.
- **Why**: Sanctioned deviation ("uSelection restore at respond beat" listed as intentional).
- **Severity**: Intentional design choice. ✓ Protected.

---

## Cross-Subsystem Notes

### StreamController & PcbController
Both follow Maze's pattern correctly:
- StreamController:147–155 (simple wrapper.position.z: -500 → 0 fromTo with scrub: true)
- PcbController:136–145 (identical pattern, wrapper.position.z: -200 → 0)
- Both use correct matchMedia reduced-motion gating ✓

### FieldController Base
- FieldController animateIn/Out tweens use tnEase (CustomEase approximation) ✓
- tnEase cubic approximation verified at FieldController:81–117 (correct control points)

---

## Recommendations

1. **Timeline `paused` flag**: Add explicit `paused: true` to BlobController:484 for code clarity, even though React orchestration makes it functional. This documents intent and aids future maintainers.
   ```typescript
   const timeline = gsap.timeline({
     defaults: { duration: 1, ease: "none" },
     paused: true,  // Add for clarity
     scrollTrigger: { ... }
   });
   ```

2. **Future ScrollTrigger Expansion**: When the C9+ scroll-linked uniform timeline is implemented, reference Maze's addLabel/addPause pattern at scripts.pretty.js:43309–43413 for label naming and pause timing.

3. **No Action Needed**: Sanctioned deviations are well-protected; do not revert.

---

## Audit Complete ✓

No critical drift violations found. All deviations from Maze are either:
- Intentional architectural simplifications (deferred features)
- React/TypeScript codebase accommodations (event orchestration)
- Sanctioned design choices (rolling rainbow, alpha floor, blob-only landing)

Next audit phase: Three.js runtime, Motion/Color subsystems.
