"use client";

import { useEffect, useRef } from "react";

import { useDashboardStore } from "@/features/graph/stores";
import type { VisibilityScopeClause } from "@/features/graph/stores/slices/selection-slice";
import { useOrbPickerStore } from "./orb-picker-store";

/**
 * Selection commit gate.
 *
 * Centralizes the "are commits allowed right now?" decision that the
 * orb interaction hooks repeated inline. Today the only blocker is
 * `selectionLocked`; future blockers (read-only mode, snapshot replay)
 * land here too, so call sites stay one line.
 *
 * Hover does NOT use this gate — locked = commits frozen, the picker
 * stays responsive for inspection.
 */
export interface SelectionCommitGate {
  canCommit: boolean;
  reason: "locked" | null;
}

export function useSelectionCommitGate(): SelectionCommitGate {
  const selectionLocked = useDashboardStore((state) => state.selectionLocked);
  return selectionLocked
    ? { canCommit: false, reason: "locked" }
    : { canCommit: true, reason: null };
}

const TOAST_THROTTLE_MS = 800;
let lastToastAtMs = 0;

function emitLockedToast(): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastToastAtMs < TOAST_THROTTLE_MS) return;
  lastToastAtMs = now;
  // No central notifications surface in /orb today; route through
  // console.warn so the throttled message is observable in dev/QA
  // without violating the project's no-console rule for `info`/`log`.
  // Wave 3+ wires this to a real toast surface (search:
  // ORB_LOCKED_TOAST_SURFACE) — keep this throttle in sync there.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn("[orb] Selection locked — unlock to modify");
  }
}

/**
 * Run `action` if the gate allows commits; otherwise emit a throttled
 * "selection locked" toast. The action runs synchronously when allowed
 * (callers can pass an async function and return its promise themselves
 * if they need to await it).
 */
export function attemptCommitOrToast(
  gate: SelectionCommitGate,
  action: () => void,
): boolean {
  if (gate.canCommit) {
    action();
    return true;
  }
  emitLockedToast();
  return false;
}

// --- Pick-generation invalidation triggers ---------------------------------
//
// `bumpPickGeneration()` invalidates in-flight picks whose readback
// would arrive after a state-changing event. Per the Wave 1B/2B
// contract it must NOT fire on every revision tick — only on:
//   1) filter-value commits (`visibilityScopeClauses` content change),
//   2) selection-clear (`selectedPointCount` going to 0),
//   3) renderer-toggle (`rendererMode` change).
// All three predicates are derived from the dashboard store.

// `clause.sql` is derived from the clause kind + column + value, so a
// content equality on the sql field is sufficient to detect any change
// the user can make to filter values; this avoids a deep dive into the
// discriminated union and matches the existing equality contract in
// `hasSameVisibilityScopeClause`.
function visibilityClausesEqual(
  a: Record<string, VisibilityScopeClause>,
  b: Record<string, VisibilityScopeClause>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const ca = a[key];
    const cb = b[key];
    if (!cb || !ca) return false;
    if (ca.sql !== cb.sql) return false;
  }
  return true;
}

/**
 * Subscribes to the three invalidation triggers and calls
 * `bumpPickGeneration()` on the live picker handle. Mount this once
 * from the orb interactions root (currently `useOrbClick`, since it
 * renders once per OrbSurface).
 *
 * The bumper is intentionally tied to dashboard-store transitions, not
 * to revisions — a revision tick alone is not an invalidation event.
 */
export function useOrbPickGenerationBumper(): void {
  const lastClausesRef = useRef<Record<string, VisibilityScopeClause>>(
    useDashboardStore.getState().visibilityScopeClauses,
  );
  const lastSelectedCountRef = useRef<number>(
    useDashboardStore.getState().selectedPointCount,
  );
  const lastRendererModeRef = useRef<string>(
    useDashboardStore.getState().rendererMode,
  );

  useEffect(() => {
    const unsubscribe = useDashboardStore.subscribe((state) => {
      let shouldBump = false;

      // (1) Filter values: deep-compare clause values, ignore revision.
      if (
        !visibilityClausesEqual(
          state.visibilityScopeClauses,
          lastClausesRef.current,
        )
      ) {
        lastClausesRef.current = state.visibilityScopeClauses;
        shouldBump = true;
      }

      // (2) Selection-clear: count transition → 0.
      if (
        state.selectedPointCount === 0 &&
        lastSelectedCountRef.current > 0
      ) {
        shouldBump = true;
      }
      if (state.selectedPointCount !== lastSelectedCountRef.current) {
        lastSelectedCountRef.current = state.selectedPointCount;
      }

      // (3) Renderer toggle.
      if (state.rendererMode !== lastRendererModeRef.current) {
        lastRendererModeRef.current = state.rendererMode;
        shouldBump = true;
      }

      if (shouldBump) {
        const handle = useOrbPickerStore.getState().handle;
        handle?.bumpPickGeneration();
      }
    });
    return unsubscribe;
  }, []);
}
