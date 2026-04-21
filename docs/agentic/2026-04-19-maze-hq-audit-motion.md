# Motion + Color + Parallax Audit Report
**Date**: 2026-04-19  
**Scope**: SoleMD.Graph field motion, color cycling, and parallax subsystems vs. Maze HQ reference  
**Status**: Read-only audit with cross-system findings

---

## Executive Summary

SoleMD's field motion diverges from Maze in three material ways: **(1)** idle blob rotation spins **2× faster** than Maze's frame increment, **(2)** intro depth ramp duration **shortened to 0.9s** (from Maze's 1.4s in animateIn), and **(3)** animation architecture shifted from updateVisibility frame-by-frame gates to ScrollTrigger scroll-scrubbed timeline ownership. Color cycle and mouse-parallax mechanics are structurally sound. Findings below flagged for intentional deviation (rolling rainbow) or misalignment (spin velocity).

---

## Detailed Drift Analysis

| Subsystem | Maze Reference | SoleMD Current | Drift | Proposed Fix |
|-----------|----------------|----------------|-------|--------------|
| **Idle wrapper rotation** | `loop()` at scripts.pretty.js:43048: `wrapper.rotation.y += 0.001` (fixed 0.001 rad per frame) | `BlobController.tick()` line 404: `wrapper.rotation.y = elapsedSec * rotationVelocity[1] * motionScale` where `rotationVelocity[1] = 0.12` (visual-presets.ts:121) → at 60 FPS = 0.002 rad/frame | **Rotation velocity 2× faster**. Estimated 0.12 rad/sec / 60 fps ≈ 0.002 rad/frame vs Maze's constant 0.001 increment. Blob spins full revolution in ~52s (SoleMD) vs ~104s (Maze). | Reduce `rotationVelocity[1]` from 0.12 to 0.06 in blob preset, OR cap frame velocity to 0.001 in tick(). Verify visual expectation with design before applying. |
| **Intro depth boost duration** | `animateIn()` at scripts.pretty.js:43129-43130: 1.4s timeline with Tn ease | `BlobController` lines 373–377: `INTRO_DURATION_SECONDS = 0.9` with quadratic intro ease (1-(1-progress)²). Depth decays from boosted value via lerp. | **Duration 36% shorter** (0.9s vs 1.4s). Intro ramp mechanics differ: Maze tweens from preset depthOut to depth; SoleMD applies multiplier boost (2.6×) over intro and decays via per-frame lerp. Perceptual impact: particles converge faster in SoleMD. | Align intro duration to 1.4s for parity with Maze animateIn timeline, OR document this as intentional acceleration for landing rhythm. Cross-check with gsap-audit on scroll timeline start timing. |
| **Mouse-parallax lifecycle** | `onMouseMove()` at scripts.pretty.js:43189-43196: GSAP tween `sine.out` 1s on dx/dy deltas | `attachMouseParallax()` in mouse-parallax-wrapper.ts lines 37–48: GSAP tween `sine.out` 1s on mousemove deltas, `overwrite: "auto"`, passive listener | **No material drift**. Both use identical tween curve, duration, and rotation-per-pixel factors (-5e-4 Y, -3e-4 X). SoleMD's overwrite mode is safe. ✓ Structurally aligned. | None. |
| **Rainbow color cycle** | Not directly in excerpt; Maze uses static cyan→magenta pair per scripts.pretty.js:42564-42569 | `BlobController.startColorCycle()` lines 418–435: Runtime timeline tweens `uColorNoise` through `LANDING_RAINBOW_RGB` (8 stops) one stop per 2s, ease: "none", repeat -1. Total cycle = 16s. | **Rolling 8-stop rainbow vs Maze's static 2-color pair**. **INTENTIONAL DEVIATION** — sanctioned per task brief. SoleMD's dynamic cycle (orange → gold → green → teal → sky → violet → magenta → pink, ~85-100% saturation) replaces Maze's fixed binary lerp aesthetic. | Mark as tunable visual knob. Cycle duration `BLOB_COLOR_CYCLE_PER_STOP_SECONDS = 2` and palette `LANDING_RAINBOW_RGB` are intentional; no reversion needed. Cross-link to accent-palette.ts design rationale. |
| **animateIn/animateOut easing** | `animateIn()` uses `Tn` custom ease (scripts.pretty.js:43130), `animateOut()` uses same (scripts.pretty.js:43161). Tn ≈ cubic-bezier(0.5, 0, 0.1, 1). | `FieldController.animateIn/Out()` lines 247–293: Both use `tnEase` function (FieldController.ts lines 81–117) approximating Maze's Tn via cubic-bezier(0.5, 0, 0.1, 1). | **No drift**. Easing function is correctly ported. ✓ Exact parity. | None. |
| **animateIn/animateOut duration** | `animateIn()`: 1.4s default (scripts.pretty.js:43130). `animateOut()`: 1s or 0 (instant) depending on `t` param (scripts.pretty.js:43161). | `FieldController.animateIn()`: 1.4s (line 255). `FieldController.animateOut()`: 1s normal, 0 instant (line 273). | **Exact parity** on base FieldController. BUT: `BlobController` defers uAlpha/uDepth/uAmplitude tweening to scroll timeline (lines 549–591), so frame-by-frame `animateIn/Out` in FieldController is bypassed for blob. EntryFactor/exitFactor carry window no longer gates visibility in BlobController's scroll context. | Clarify ownership: FieldController's animateIn/Out are fallback for non-blob layers (stream, pcb). Blob's scroll timeline owns alpha/depth/amplitude across the full beat. Document this architectural split in comments. |
| **updateVisibility carry window** | `updateVisibility()` at scripts.pretty.js:43057–43067: entryFactor/exitFactor gates `animateIn/Out` per frame. EntryFactor=0.5, exitFactor=0.5 (defaults). | `FieldController.updateVisibility()` lines 226–245 mirrors Maze logic with same defaults. BUT: `BlobController` scroll timeline (line 448+) bypasses frame-by-frame visibility gating once bound. Visibility is now timeline-scrubbed rather than scroll-position-checked. | **Architecture shift**: Maze uses per-frame visibility polling to trigger animateIn/Out tweens within the frame loop. SoleMD pins animation ownership to a 10-second scroll timeline scrubbed by ScrollTrigger (line 491: `scrub: 1`), decoupling animation from frame-time visibility. Per-layer entryFactor/exitFactor still applied in FieldController but not used by blob's scroll path. | Document that blob's scroll timeline is the source of truth; updateVisibility/animateIn/Out in BlobController are inert during scroll. For stream/pcb, frame-by-frame visibility gates remain active. Consider unifying by exposing entryFactor/exitFactor bounds to the scroll timeline if timeline-scrubbed visibility is the new pattern. |
| **Per-layer time-factor constants** | Maze timeline playhead runs 1:1 real-time (uTime = timeline.progress() * totalDuration). No per-layer scaling. | `FieldController.getTimeFactor()` (lines 123–135): blob 0.25 / pcb 0.6 / stream 0.12 (motion), 0.1 / 0.2 / 0.04 (reduced). Applied per-frame: `uniforms.uTime.value = elapsedSec * timeFactor`. | **Hand-tuned divergence**. SoleMD runs on a module-level `elapsedSec` clock, not GSAP timeline progress, so per-layer scaling is necessary to match Maze's visual rhythm. Multipliers are chosen to keep particle motion readable at landing scale/speed presets. | These are justified by the architecture (module clock vs GSAP timeline). Document rationale in FieldController or visual-presets.ts. No reversion needed unless the module clock itself should sync to GSAP timeline playhead. |

---

## Cross-Subsystem Findings

1. **Scroll timeline start timing + intro boost window**: BlobController's scroll timeline is triggered via `bindScroll()`, which is invoked after the blob renders. The intro depth boost (0.9s) may overlap or race the scroll timeline's first keyframe if the user scrolls quickly during initial load. **Cross-system**: Verify with **gsap-audit** that the scroll timeline's trigger and start label timing don't clip the intro boost window.

2. **Three.js wrapper hierarchy + rotation velocity**: The wrapper → mouseWrapper → model hierarchy is unchanged, but the idle rotation on wrapper (now 2× faster) compounds with any Three.js euler updates in the scene graph. **Cross-system**: Confirm with **threejs-audit** that world-matrix updates and nested rotation don't show cumulative spin artifacts at the new velocity.

---

## Sanctioned Deviations (Do Not Revert)

- ✓ **Rolling rainbow cycle**: 8-stop LANDING_RAINBOW_RGB replaces Maze's static cyan→magenta pair. This is a design choice that improves the landing's visual impact. Cycle timing (2s per stop = 16s total) and ease ("none") are tunable visual parameters, not bugs.

---

## Recommendations

1. **Idle rotation velocity (🔴 HIGH PRIORITY)**: Reduce blob `rotationVelocity[1]` from 0.12 to 0.06 to match Maze's 0.001 rad/frame increment, unless the 2× spin is intentional for the landing rhythm. Current state makes the blob feel "jittery" on close inspection.

2. **Intro duration alignment (🟡 MEDIUM)**: Extend INTRO_DURATION_SECONDS from 0.9 to 1.4 to align with Maze's animateIn timeline, providing a longer particle convergence ramp. Test with design review before applying.

3. **Scroll timeline + intro race condition (🟡 MEDIUM)**: Verify with **gsap-audit** that the scroll timeline's start timing doesn't clip the intro depth boost during fast page loads. Consider a short delay or state gate if needed.

4. **Documentation**: Add comments to FieldController and BlobController clarifying animation ownership (frame-by-frame vs scroll-timeline-owned) to prevent future regressions.

---

## Test Checklist

- [ ] Blob rotation velocity matches visual expectation at 0.12 or reduced to 0.06
- [ ] Intro depth boost completes before first scroll-timeline tween (verify timing with gsap-audit)
- [ ] Mouse-parallax feels responsive and matches Maze's live parallax
- [ ] Rainbow cycle timing matches 16-second total period; no jank between color stops
- [ ] Per-layer uTime scaling keeps particle motion readable across all three presets
- [ ] Reduced-motion mode still renders blob and suppresses color cycle (line 469 check)

---

## Summary for Team Lead

**Top 5 Findings** (under 200 words, plain text):

1. **Blob idle rotation spins 2× faster than Maze** (0.12 rad/sec ÷ 60fps = 0.002 rad/frame vs Maze's 0.001). Likely unintentional. Reduce rotationVelocity[1] from 0.12 to 0.06 unless landing design calls for faster spin.

2. **Intro depth boost duration shortened to 0.9s** (from Maze's 1.4s animateIn). Particles converge faster. Consider alignment to 1.4s for parity, or document as intentional acceleration.

3. **Animation architecture shifted from frame-polling to scroll-timeline ownership**. Blob's alpha/depth/amplitude are no longer gated by updateVisibility; they're scrubbed by ScrollTrigger. This is a major architectural divergence but appears intentional. Document ownership boundaries.

4. **Rolling rainbow cycle is intentional deviation**. 8-stop palette replaces Maze's static pair. Timing (2s per stop = 16s total) is tunable. No reversion needed.

5. **Mouse-parallax is structurally sound**. Lifecycle, easing, and pointer handling match Maze exactly. Per-layer uTime scaling (blob 0.25, pcb 0.6, stream 0.12) is justified by module-clock architecture.

**Cross-subsystem**: Verify scroll-timeline start timing doesn't clip intro boost (with gsap-audit) and that wrapper rotation velocity doesn't compound with Three.js scene updates (with threejs-audit).
