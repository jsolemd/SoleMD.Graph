// Best-effort pointer capture used by every orb interaction handler
// (rect selection, mouse camera). Synthetic tests and some browser
// edge cases throw when capturing a non-capturable pointerId — the
// gesture still works without capture as long as events stay on the
// surface, so the failure is swallowed instead of aborting input.

export function trySetPointerCapture(
  target: EventTarget | null | undefined,
  pointerId: number,
): void {
  try {
    (target as HTMLElement | null | undefined)?.setPointerCapture?.(pointerId);
  } catch {
    /* see file header */
  }
}

export function tryReleasePointerCapture(
  target: EventTarget | null | undefined,
  pointerId: number,
): void {
  try {
    (target as HTMLElement | null | undefined)?.releasePointerCapture?.(
      pointerId,
    );
  } catch {
    /* see file header */
  }
}
