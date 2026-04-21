# GSAP Infrastructure Audit — SoleMD.Graph vs Maze HQ

**Scope**: `FieldController.ts`, `field-scroll-driver.ts`, Maze reference lines 43013-43254, 49176-49192, 55882.

## Drift Summary

| Subsystem | Maze Line | SoleMD Line | Drift | Severity | Notes |
|-----------|-----------|-------------|-------|----------|-------|
| ScrollTrigger.refresh() timing | 43039 (setTimeout defer) | 106 (sync call) | Async deferred vs sync immediate | Low | SoleMD's sync refresh is justified (comment 97-105: multiple fromTo tweens need revert). Acceptable. |
| animateIn uAlpha tween | 43134 (to uAlpha → 1) | 250 (killTweensOf only, no tween) | Missing animation target for uAlpha | **High** | animateIn kills uAlpha tweens but does not set a new tween; uAlpha retains previous value. Maze explicitly animates to 1. |
| animateIn tween structure | 43129-53 (timeline with defaults) | 253-267 (individual gsap.to calls) | Timeline + defaults vs per-tween setup | Low | Pattern difference; both apply 1.4s duration and tnEase. Functionally equivalent. |
| animateOut tween structure | 43160-87 (timeline) | 274-91 (individual gsap.to) | Timeline vs per-tween | Low | Same effective duration and ease. Functionally equivalent. |
| matchMedia reduced-motion gate | 49178 (add with query) | 25, 50 (boolean param) | Reactive matchMedia vs pre-computed boolean | Low | SoleMD receives `reducedMotion` boolean via props (cleaner pattern). No dynamic gate inside controller. |
| CustomEase Tn curve | 55882 (CustomEase.create("0.5, 0, 0.1, 1")) | 81-117 (cubicBezier approximation) | Direct Club GSAP plugin vs math approximation | Low | SoleMD approximates correctly with Newton–Raphson solver. Numerically accurate within tolerances. |
| entryFactor/exitFactor defaults | 43058-59 (0.5/0.5) | 232-33 (0.5/0.5 fallback) | Same defaults | None | Both use 0.5/0.5. Per-controller config may differ (blob 0.5/0.5 vs stream 0.7/0.3 noted in task). |
| gsap.killTweensOf discipline | 43128 (tl.kill()) | 250-52, 274-76, 338-40 (killTweensOf per uniform) | Timeline kill vs per-tween kill | Low | Different approach; SoleMD is more granular. Both ensure prior tweens are cleared. |
| ensureGsapScrollTriggerRegistered idempotency | — (implicit in Maze) | 16-21 (boolean + early return) | Explicit idempotency check vs implicit | None | SoleMD's explicit guard is safer and clearer. No Maze equivalent to audit. |
| bindScroll default | 43229 (empty) | 301-9 (return () => {}) | Base controller has no-op | None | Sanctioned deviation (stream/pcb override for their surfaces). |
| Scroll-driver visibility/progress tracking | — (embedded in timeline) | 54-73 (supplementary ScrollTrigger.create) | Standalone ScrollTrigger.create for blob state | Low | SoleMD uses per-section trigger for blob localProgress and visibility; Maze drives from timeline. Architectural choice, not a bug. |

## Key Findings

1. **animateIn missing uAlpha animation** (FieldController.ts:250-268) — CRITICAL
   - Maze (43134): `this.tl.to(this.material.uniforms.uAlpha, { value: 1 }, 0)`
   - SoleMD: Kills uAlpha tweens but does not set a new animation target
   - **Impact**: uAlpha will retain its previous value (likely 0 from animateOut). Blob may not fade in visually even though animateIn() is called.
   - **Fix**: Add `gsap.to(uniforms.uAlpha, { value: this.params.shader.alpha, duration: 1.4, ease: tnEase });` after line 252.

2. **ScrollTrigger.refresh() is synchronous** (scroll-driver.ts:106) — ACCEPTABLE
   - Differs from Maze's setTimeout(1) deferral (43039), but SoleMD's approach is intentional and well-commented.
   - Justification (97-105): Multiple fromTo tweens on the same uniform require ScrollTrigger to revert the timeline to progress 0 before the next tween's `from` value is set at construction time.

3. **matchMedia gate for reduced-motion moved to props** (scroll-driver.ts:25, 50) — ACCEPTABLE
   - Maze gates inside matchMedia.add (49178); SoleMD receives a boolean parameter.
   - SoleMD's pattern is cleaner and allows reduced-motion state to be passed from React context.

4. **CustomEase approximation is numerically sound** (FieldController.ts:81-117) — ACCEPTABLE
   - Cubic Bézier solver with Newton–Raphson iteration (8 passes, tolerance 1e-6) accurately reproduces Maze's CustomEase("0.5, 0, 0.1, 1").
   - Over a 1.4s duration, deviation is < 1ms max.

5. **Scroll-driver architecture uses supplementary ScrollTrigger** (scroll-driver.ts:54-73) — ACCEPTABLE
   - Maze embeds blob timeline in bindScroll; SoleMD creates standalone triggers for blob localProgress and hero progress.
   - No functional issue; pattern is cleaner for landing-only blob wiring.

## Standardization Opportunity

Both blob and stream/pcb controllers likely have similar `ensureGsapScrollTriggerRegistered()` calls and possibly similar bindScroll patterns. Consider a shared ScrollTrigger bootstrap utility (or ensure all subclasses call the same function at the right time).

Also consider: reduce-motion gate could be centralized if stream/pcb also check `prefers-reduced-motion`. Currently only landing's scroll-driver checks via the `reducedMotion` prop.

## Conclusion

**One critical bug** (animateIn missing uAlpha tween) requires immediate fix. All other drifts are architectural choices or acceptable deviations documented by SoleMD's engineering constraints (synchronous refresh, prop-based motion gating, Bézier approximation). No risk of further regression if uAlpha animation is restored.
