# Maze HQ Audit — Synthesis: Ranked Drift List + Implementation Plan

**Date**: 2026-04-19
**Synthesizer**: synthesis (Plan)
**Inputs**:
- `docs/agentic/2026-04-19-maze-hq-audit-threejs.md`
- `docs/agentic/2026-04-19-maze-hq-audit-motion.md`
- `docs/agentic/2026-04-19-maze-hq-audit-gsap-blob.md`
- `docs/agentic/2026-04-19-maze-hq-audit-gsap-stream-pcb.md`
- `docs/agentic/2026-04-19-maze-hq-audit-gsap-infra.md`

**Pass type**: Read-only synthesis. No code edits in this document. Implementation is a separate, user-approved pass.

---

## 1. Severity-Ranked Drift List

### Must-fix

| # | Drift | Source audit | Maze reference | SoleMD location | Proposed fix (1 line) |
|---|-------|--------------|----------------|-----------------|------------------------|
| M1 | Blob idle wrapper rotation runs ~2× Maze's speed (~0.002 rad/frame vs 0.001 at 60 fps) | motion | scripts.pretty.js:43048 `wrapper.rotation.y += 0.001` | `BlobController.tick` around rotation apply; `visual-presets.ts:121` `rotationVelocity[1] = 0.12` | Halve `rotationVelocity[1]` to 0.06 (pending design sign-off); document the rad/sec → rad/frame conversion in the preset. |
| M2 | Blob master timeline omits `paused: true`; ScrollTrigger scrubbing begins against an auto-advancing timeline | gsap-blob | scripts.pretty.js:43292–43302 | `BlobController.ts:484–493` | Add `paused: true` to the `gsap.timeline({...})` config and rely on ScrollTrigger's scrub for playhead. |
| M3 | `scrollDisposer` teardown not guaranteed in `BlobController.destroy()` (calls `super.destroy()` without invoking disposer) | gsap-blob | scripts.pretty.js:43288–43289 (`unbindScroll` in destroy) | `BlobController.ts:437–441` | Call `this.scrollDisposer?.()` and null it before `super.destroy()`; mirrors the functional-disposer contract used on bind. |
| M4 | `StreamController` accepts `endAnchor` but discards it (`void _endAnchor;`), diverging from `PcbController` which wires it to `scrollTrigger.endTrigger` | gsap-stream-pcb | scripts.pretty.js:43623 (Pcb endTrigger pattern) | `StreamController.ts:162` | Either remove the param from the signature or wire it into the ScrollTrigger config identically to `PcbController.ts:139`. |

### Should-fix

| # | Drift | Source audit | Maze reference | SoleMD location | Proposed fix (1 line) |
|---|-------|--------------|----------------|-----------------|------------------------|
| S1 | Intro depth-boost duration is 0.9s vs Maze's 1.4s `animateIn`; particles converge ~36% faster and can race the scroll timeline on fast initial scroll | motion + gsap-infra cross-ref | scripts.pretty.js:43129–43130 | `BlobController.ts:373–377` (`INTRO_DURATION_SECONDS = 0.9`) | Align `INTRO_DURATION_SECONDS` to 1.4 *or* add a short gate so the scroll timeline does not start scrubbing alpha/depth/amplitude before the intro completes. |
| S2 | `shaderMaterial` omits `vertexColors` flag; Maze sets it explicitly | threejs | scripts.pretty.js:42579 `vertexColors: !0` | `FieldScene.tsx:91–100` | Add `vertexColors` to the R3F `<shaderMaterial>` for Maze parity even though the shader no longer reads `color` after C9. |
| S3 | `pointTexture` singleton has no disposal path; GPU memory risk if the cache is ever replaced or hot-swapped | threejs | (not applicable — Maze reloads per call) | `field-point-texture.ts:16–23` | Add a `disposePointTexture()` exit hatch and a TSDoc note documenting that the singleton is intentionally never torn down at mount/unmount boundaries. |
| S4 | `immediateRender: false` on the shrink `fromTo` uAlpha is a SoleMD-only safety net; no test asserts the regression it prevents | gsap-blob | not in Maze | `BlobController.ts` shrink tween (≈585) | Add a regression test that binds the timeline and asserts uAlpha at `progress=0` is not clobbered on second-tween construction. |

### Nice-to-have

| # | Drift / opportunity | Source audit | Maze reference | SoleMD location | Proposed fix (1 line) |
|---|---------------------|--------------|----------------|-----------------|------------------------|
| N1 | `depthWrite={false}` is an intentional extra; currently uncommented | threejs | not set in Maze (defaults to true) | `FieldScene.tsx:95` | Add a one-line comment tagging it as a SoleMD-only transparent-layer optimization. |
| N2 | `Math.min(gl.getPixelRatio(), 2)` clamp rationale not documented | threejs | inferred uncapped in Maze | `FieldScene.tsx:192` | Add one-line comment: "clamp to 2 — ultra-high-DPI cost > fidelity gain for point field." |
| N3 | Per-layer `uTime` factors (blob 0.25, pcb 0.6, stream 0.12) and the module-clock vs GSAP-playhead decision aren't explained at the call-site | motion + threejs | scripts.pretty.js uses 1:1 timeline playhead | `FieldController.getTimeFactor()` (lines 123–135), `visual-presets.ts` | Add a short block comment in `FieldController.getTimeFactor` explaining the module-clock rationale and the reduced-motion pair. |
| N4 | Reduced-motion guards live per-controller (blob 462–479, stream 139–145, pcb 128–134) with no shared entry point | gsap-infra + gsap-stream-pcb + gsap-blob | not in Maze | Blob / Stream / Pcb controllers | Extract a `shouldSkipScrollAnimation(reducedMotion)` helper or pass the flag through a single wrapper used by all three. |
| N5 | `ensureGsapScrollTriggerRegistered` pattern repeats across controllers | gsap-infra | implicit in Maze | `FieldController.ts:16–21` + controllers | Centralize the registration once at module load, or expose a single idempotent util imported by every controller. |
| N6 | Stream `uWave` uniform from Maze (1 → 0.2) not ported | gsap-stream-pcb | scripts.pretty.js:43572–43577 | `StreamController.ts` (comment at ≈127) | Defer; only revisit if/when the stream shader adds `uWave`. Currently sanctioned as a port gap. |

### False positives from audit — confirmed clean

| # | Flagged drift | Source audit | Verification |
|---|---------------|--------------|--------------|
| F1 | "CRITICAL: `FieldController.animateIn()` kills `uAlpha` tweens without restarting them, so `uAlpha` keeps the previous (likely 0) value" — gsap-infra key finding #1 | gsap-infra | Team-lead verified against `apps/web/features/ambient-field/controller/FieldController.ts:247–268`. `animateIn` **does** tween `uAlpha` to `this.params.shader.alpha` via `gsap.to` immediately after the `killTweensOf` calls (line ~253). Auditor stopped reading too early. **Not a must-fix. Do not implement.** |

---

## 2. Implementation Plan — Must-fix items

**Ordering rationale**: fix ScrollTrigger/timeline correctness before visual-rhythm tuning, because M2 (paused flag) and M3 (disposer) can mask or distort any visual measurement taken against M1 and M4.

### Suggested commit sequence

1. **Commit A — "blob: pin timeline playhead to ScrollTrigger scrub" (M2 + M3)**
   - Touchpoint: `BlobController.ts:437–454, 484–493, 629–634`.
   - Change 1: add `paused: true` to the master `gsap.timeline` config at ≈484.
   - Change 2: in `destroy()` (437–441), invoke `this.scrollDisposer?.(); this.scrollDisposer = null;` before `super.destroy()`.
   - Validation: re-bind/unmount the landing surface twice; confirm no orphan `ScrollTrigger` instances via `ScrollTrigger.getAll().length` logging in dev; confirm the timeline does not visibly advance before first scroll.

2. **Commit B — "stream: honor endAnchor for scroll end boundary" (M4)**
   - Touchpoint: `StreamController.ts:162` plus `scrollTrigger` config block.
   - Decide with gsap/scroll owner: wire `endAnchor → scrollTrigger.endTrigger` exactly as `PcbController.ts:139`, or remove the parameter entirely from the public signature. Default to **wire it through** so Stream can later be parameterized like Pcb without a signature change.
   - Validation: add a quick unit or integration test that the stream timeline spans from `startAnchor` to `endAnchor` when both are provided.

3. **Commit C — "blob: align idle rotation with Maze rad/sec" (M1)**
   - Touchpoint: `visual-presets.ts:121` (`rotationVelocity[1]`).
   - Change: `0.12 → 0.06`. Add a one-line comment converting Maze's `+= 0.001 rad/frame @ 60 fps` to `0.06 rad/sec` so future tuners don't reintroduce the double-speed.
   - Open question (below) — confirm with design before shipping.
   - Validation: visual regression pass; measure one full rotation in dev and confirm ≈104s.

### Shared touchpoints across commits
- `BlobController.ts` is touched by A and (indirectly) by C (if C is applied via the preset, it won't touch this file). Keep A and C split so each bisects cleanly.
- `visual-presets.ts` is touched only by C. Isolate it.
- `StreamController.ts` is touched only by B. Isolate it.

No cross-file coupling requires a single commit. Keep the three commits independent so any can be reverted without unwinding the others.

---

## 3. Intentional — Do Not Revert

These are sanctioned deviations from Maze. Any future audit or refactor must treat them as the target state, not as drift.

1. **`alphaDiagramFloor` != 0 during the diagram beat** — `BlobController.ts` uAlpha sequence (557–587). Replaces Maze's `1 → 0 → 1` with `1 → alphaDiagramFloor → 1`. Protected by `gsap-blob` audit.
2. **`selectionHotspotFloor` != 0.3 at `hotspots+=1.4` + `uSelection` restore at the `respond` beat** — `BlobController.ts:535–617`. Maze stops at the hotspot floor with no restore; SoleMD restores to 1 at `respond`. Protected.
3. **Blob-only landing (no stream/pcb on the hero surface)** — `StreamController` / `PcbController` exist for their own sections; the landing surface intentionally only binds the blob.
4. **Rolling rainbow color cycle on `uColorNoise`** — `BlobController.startColorCycle()` (418–435) tweens through `LANDING_RAINBOW_RGB` (8 stops, 2s each, `ease: "none"`, `repeat: -1`). Replaces Maze's static cyan→magenta pair. Design choice — do **not** re-flatten to two colors.
5. **`aBucket` attribute baked but unused in the shader** — `field-attribute-baker.ts:144, 206`. Reserved for hotspot semantic bucketing. Do not remove even though the current shader ignores it.
6. **`uColorBase` / `uColorNoise` vec3 consolidation** — `FieldController.ts:198–199` and `field-shaders.ts:1–11`. Replaces Maze's six separate RGB floats. C9 refactor; removes the typo class (`uBnoise` vs `uGcolor` family) Maze inherited.
7. **CustomEase `Tn` → Bézier approximation via Newton–Raphson** — `FieldController.ts:81–117`. Deliberate workaround to avoid the Club GSAP `CustomEase` plugin; numerically accurate within tolerances.
8. **Per-layer `uTime` scaling (blob 0.25 / pcb 0.6 / stream 0.12 desktop, 0.1 / 0.2 / 0.04 reduced)** — `FieldController.getTimeFactor()` (123–135). Driven by the module-clock architecture; without it, ratios drift from Maze's GSAP-playhead-derived rhythm.
9. **Scroll-timeline-owned animation for the blob (not frame-polled `updateVisibility`)** — `BlobController` scroll timeline at ≈448+, `scrub: 1`. Intentional architecture shift from Maze's per-frame visibility gate. `updateVisibility` / `animateIn` / `animateOut` remain the source of truth for stream/pcb only.
10. **Reduced-motion guards in all three controllers** — not in Maze; SoleMD-only accessibility hardening. Keep.
11. **Synchronous `ScrollTrigger.refresh()` in the scroll-driver** — `ambient-field-scroll-driver.ts:97–106`. Differs from Maze's `setTimeout(1)` deferral; deliberate because multiple `fromTo` tweens on the same uniform require the timeline reverted to progress 0 before the next tween's `from` is captured.
12. **`pointTexture` module-scope singleton** — `field-point-texture.ts`. Maze reloads per material build; SoleMD caches once. Keep (but add the disposal exit hatch in S3).

---

## 4. Standardization Opportunities

These patterns recur across two or more audits. They are not must-fixes; they are worth a dedicated follow-up pass rather than being folded into the Must-fix commits.

1. **Unified animation-ownership doc / contract** *(motion + gsap-blob + gsap-infra)*
   The blob's alpha / depth / amplitude live on a scroll-scrubbed timeline; stream / pcb still use frame-polled `updateVisibility`. This split is intentional but undocumented, and already caused audit confusion (e.g., the false-positive F1 above and the cross-system "intro race" flag S1). **Suggested follow-up**: a short `ambient-field-animation-ownership.md` in `docs/map/` that names each uniform and who (timeline vs frame loop) owns it per controller.

2. **Shared ScrollTrigger + reduced-motion bootstrap** *(gsap-infra + gsap-stream-pcb + gsap-blob)*
   `ensureGsapScrollTriggerRegistered` plus per-controller `prefers-reduced-motion` branches appear in all three controllers. Ripe for a tiny `ambient-field-scroll-init.ts` util that registers the plugin idempotently and returns a normalized `{ reducedMotion, pluginReady }` snapshot.

3. **`scrollDisposer` functional-teardown contract** *(gsap-blob + gsap-stream-pcb)*
   All three controllers use a functional disposer that kills both the trigger and the timeline. M3 shows the blob's `destroy()` does not call it. A shared `bindScrollTimeline(...) → disposer` helper with a typed contract would make the "parent class calls disposer in `destroy`" invariant enforceable (or at least lintable) across controllers.

4. **Preset-level motion-speed normalization** *(motion + threejs)*
   Motion flagged rotation velocity at 2× Maze (M1); threejs noted the per-layer `uTime` scaling (N3). Both trace back to `visual-presets.ts`. A small doc block or type refinement in that file — explicitly labeling which fields are rad/sec vs rad/frame vs multiplier — would have prevented M1 and would make future tuning auditable.

### Agent spawn recommendation

None of these standardization items is large enough to justify a fresh Explore agent; they are all one-to-two-file refactors once the Must-fixes land. Recommendation: keep them in this synthesis and fold them into the implementation pass as a second-tier "standardization" commit after the three Must-fix commits. If the user wants one of them broken out (esp. #1 animation-ownership doc), a single `Plan`-class agent is sufficient — I am not creating a task for that speculatively.

---

## 5. Open Questions for User

Each question is load-bearing for at least one must-fix or should-fix item. The implementation pass should not proceed on these without a decision.

1. **M1 — Is the blob's 2× idle rotation intentional for landing feel?**
   Halving `rotationVelocity[1]` to 0.06 matches Maze exactly (one revolution / ~104s). Keeping 0.12 gives one revolution / ~52s. Design call, not an engineering call. If Maze parity is not the goal here, mark M1 **Intentional — Do Not Revert** and I will move it in a follow-up.

2. **S1 — Is the 0.9s intro duration intentional for landing rhythm, or should it align to Maze's 1.4s?**
   If 0.9s is deliberate, the fix shifts from "extend to 1.4s" to "gate the scroll timeline from scrubbing alpha/depth/amplitude until the intro completes" — different scope, different risk surface.

3. **M4 — `StreamController.endAnchor`: wire through or remove?**
   Wire-through keeps the signature parity with `PcbController` and lets future stream sections use a split end boundary. Removing it is cleaner right now but is a breaking change for callers. Default recommendation: wire through.

4. **Standardization #1 — Do you want the animation-ownership doc written now, or only once implementation lands?**
   Writing it now protects future audits from repeating the F1 false-positive; writing it later lets the doc describe the post-fix state directly.

---

**End of synthesis.** No code files were modified. Implementation is gated on user approval of the Must-fix ordering and resolution of the four open questions above.
