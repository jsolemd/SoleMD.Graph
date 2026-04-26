# 15 — Accessibility and low-power

## Modes that suppress motion

Three orthogonal motion-suppression modes. Each independently
disables physics motion while preserving state and panel sync:

| Mode | Trigger | What's suppressed |
|---|---|---|
| **prefers-reduced-motion** | OS / browser flag | rotation paused; baked positions only; force wake disabled; camera slerps replaced with cuts; orbit drag still permitted (user-initiated motion is permitted per WCAG) |
| **Pause-motion** (UI control) | toggle in orb chrome, persists per session | rotation paused; sim cannot wake; same surface as reduced-motion but user-controlled |
| **Low-power profile** | auto-detect (mobile thermal, low-end GPU) OR manual toggle | force wake disabled; rotation may continue only while frame budget is healthy; ambient noise can drop to zero; reduced edge tiers; smaller resident budget (≤ 8K vs 16K) |

All three suppress **positional motion**. None suppress:

- Selection state updates.
- Filter / scope / timeline updates (visual dim is instant; physics
  reheat is the part suppressed).
- Search results landing in the panel + ranked list.
- `evidenceMark` color/halo/badge (overlay-class effects survive).
- Camera orbit drag.
- Edge highlights on hover/select.

## Low-power profile detection

Auto-detect heuristic (initial cut; refine with telemetry):

```
function detectLowPower(): boolean {
  const conn = navigator.connection;
  const effectiveType = conn?.effectiveType;
  const downlink = conn?.downlink;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;
  const deviceMemory = (navigator as any).deviceMemory ?? 8;

  if (isMobile && deviceMemory < 4) return true;
  if (hardwareConcurrency < 4) return true;
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;
  return false;
}
```

User-visible toggle in chrome overrides the auto-detect. State
persists in `view-slice`.

## Reduced-motion contract details

Per WCAG 2.1 SC 2.3.3 and canonical correction 20:

- **System-driven motion** (auto-rotate, sim wake-driven flow,
  camera slerp on click-focus) — fully suppressed.
- **User-initiated motion** (orbit drag, dolly, manual rotation) —
  permitted. The user controls the motion; reduced-motion is about
  not surprising or causing vestibular discomfort.

Reduced-motion users still get:
- Click-select (instant, no slerp).
- Lasso/rect/brush selection (instant; drag preview is JS-only
  and doesn't perturb the orb).
- Search (results land in panel; orb dims to baked positions
  intersected with results — no coalescence motion).
- Filter (galaxy dims to scope; no motion).

## Mobile considerations

- Resident budget defaults to 8K on mobile (canonical M2).
- Ambient shader noise defaults to conservative on mobile and can be
  disabled after idle or after sustained frame misses. The galaxy
  should preserve color/halo/list state before spending thermal budget
  on motion.
- Touch-specific gesture set per [16-gesture-arbitration.md](16-gesture-arbitration.md).
- Panel renders as bottom sheet (slides up).
- Long-press = desktop hover (500ms threshold).
- Two-finger pinch = dolly; rotate gesture unused in v1.
- `<Html>` labels minimized (cluster centroids only).

## Single state-authority for accessibility

Per canonical correction 23, all of:
- `prefersReducedMotion: boolean`
- `pauseMotion: boolean`
- `lowPowerProfile: boolean | 'auto'`

Live in `useDashboardStore.view-slice`. Renderer reads only from
the store. Force kernel reads via uniform.

## Owns / doesn't own

Owns: motion-suppression modes, detection heuristic, reduced-motion
contract, mobile defaults.

Doesn't own:
- Specific touch gestures → [16-gesture-arbitration.md](16-gesture-arbitration.md).
- Camera implementation → [06-camera-and-rotation.md](06-camera-and-rotation.md).
- Force-effect mechanics → [10-force-vocabulary.md](10-force-vocabulary.md).

## Prerequisites

[03-physics-model.md](03-physics-model.md), [10-force-vocabulary.md](10-force-vocabulary.md).

## Consumers

All milestones; verification step in M5a verifies these modes work
end-to-end.

## Invalidation

- Different motion-sensitivity flag (e.g. `prefers-no-motion` if
  CSS spec extends) → add to detection.
- Mobile WebGPU adoption changes performance ceiling → low-power
  profile thresholds shift.
