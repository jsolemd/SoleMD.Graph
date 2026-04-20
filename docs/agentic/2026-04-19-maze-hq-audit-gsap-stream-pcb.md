# Maze HQ Audit — GSAP Stream + PCB Timeline Controllers

**Audit Date**: 2026-04-19  
**Scope**: StreamController.ts, PcbController.ts  
**Reference**: Maze scripts.pretty.js lines 43560–43640

## Summary

StreamController and PcbController implement timeline-driven z-depth scrubbing across scroll sections, mirroring Maze's ug (stream) and _m (pcb) classes. Both controllers match the core animation contract with one notable deviation: StreamController ignores the `endAnchor` parameter while PcbController uses it correctly.

---

## Drift Table

| Subsystem | Maze Line | SoleMD Line | Drift | Proposed Fix |
|-----------|-----------|-------------|-------|--------------|
| **Stream wrapper.z timeline** | 43571 | 155 | ✓ Correct: `-500 → 0` with `scrub:true` | None |
| **Stream uWave uniform** | 43572–43577 | 127 (comment) | Port gap: Maze tweens `uWave: 1 → 0.2`, SoleMD shader lacks uniform. Documented but unimplemented. | Deferred—shader doesn't have uWave; flag for shader enhancement if re-ported. |
| **Stream reduced-motion** | N/A (not visible) | 139–145 | Enhancement: SoleMD adds `prefers-reduced-motion: reduce` check, Maze code not visible. | Keep as defensive guard—no drift. |
| **Stream endAnchor usage** | N/A (single trigger) | 162 | Drift: Parameter passed but ignored (`void _endAnchor;`). PcbController uses it correctly; Stream should too. | Remove unused param or implement `endTrigger` in scrollTrigger config like PcbController:139. |
| **PCB wrapper.z timeline** | 43629 | 145 | ✓ Correct: `-200 → 0` with `scrub:true` | None |
| **PCB endTrigger usage** | 43623 | 139 | ✓ Correct: Passed to scrollTrigger config. | None |
| **PCB reduced-motion** | N/A (not visible) | 128–134 | Enhancement: SoleMD adds check; Maze code not visible. | Keep as defensive guard. |
| **PCB rotation.x = -80deg** | (implied by class name `_m`) | 89–90 | ✓ Correct: Read from `preset.sceneRotation[0]` + scroll blend, not hardcoded. Preset supplies the -80deg value. | None |
| **Timeline scrollDisposer lifecycle** | N/A (Maze minified) | Stream: 157–161, PCB: 147–150 | ✓ Correct: Both follow pattern—kill scrollTrigger, then kill timeline. Matches Blob pattern. | None |
| **Aspect-driven scale (Stream only)** | ref: 49326–49345 (outside scope) | 10–32 | Drift context: Comment says Stream "mirrors Maze's `ug`" but Maze reference outside audit scope. Implementation uses MAZE_REFERENCE_ASPECT (1512/748), MAZE_DESKTOP_BASE (250), MAZE_MOBILE_BASE (168). Cannot verify without lines 49326–49345. | Cross-reference with Stream Maze class at 49326–49345 to confirm aspect ratio matches. |

---

## Key Findings

1. **Minor: Stream ignores endAnchor**  
   StreamController receives `endAnchor` but never uses it (line 162). PcbController correctly passes it to scrollTrigger.endTrigger (line 139). If Stream sections later require a distinct end boundary, this parameter needs wiring.

2. **Port gap noted: uWave uniform missing**  
   Maze stream (line 43572–43577) tweens a `uWave` uniform from 1 → 0.2 with easing. SoleMD shader doesn't export this uniform (documented in line 127 comment). This is a known gap, not a bug. If shader enhancements are planned, uWave interpolation should be added.

3. **PCB endTrigger correctly implemented**  
   PcbController properly uses endAnchor as a separate scroll-end boundary, allowing the animation to span from one anchor to another.

4. **Reduced-motion guards are SoleMD enhancements**  
   Both controllers check `prefers-reduced-motion: reduce` before running scroll timelines (Stream: 139–145, PCB: 128–134). Maze code doesn't show this in the reference range. Treat as defensive wins, not drifts.

5. **Lifecycle patterns are sound**  
   Both dispose timeline + scrollTrigger correctly, matching the Blob cleanup pattern. No ordering issues detected.

---

## Recommendations

- **Immediate**: Remove unused `_endAnchor` param from StreamController line 162, or wire it into scrollTrigger config if future sections need a split-anchor behavior.
- **Future**: If shader enhancements include uWave uniform, add the Maze interpolation (value: 1 → 0.2, ease: power3.in) to StreamController.bindScroll.
- **Cross-check**: Verify Stream aspect scaling (lines 10–32) against Maze ug class (scripts.pretty.js:49326–49345, outside current scope).

---

**Status**: Read-only audit complete. No code changes made.
