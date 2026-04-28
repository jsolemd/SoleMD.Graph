"use client";

import { useEffect, useRef } from "react";

import { isGraphKeyboardEditableTarget } from "@/features/graph/lib/graph-keyboard-guards";

export const ORB_ESCAPE_DOUBLE_TAP_MS = 500;

interface UseOrbSelectionEscapeOptions {
  enabled?: boolean;
  onClearSelection: () => void;
  onClearAllSelection: () => void;
}

function getKeyboardEventTime(event: KeyboardEvent): number {
  return event.timeStamp > 0 && Number.isFinite(event.timeStamp)
    ? event.timeStamp
    : performance.now();
}

/**
 * Orb-owned Escape semantics.
 *
 * Camera shortcuts own movement keys; graph selection owns Escape because
 * clearing a selection must also clear the DuckDB `selected_point_indices`
 * table. A fast second Escape is the intentional "back to neutral graph"
 * gesture. Key repeat is ignored so holding Escape does not accidentally
 * promote a single clear into clear-all.
 */
export function useOrbSelectionEscape({
  enabled = true,
  onClearSelection,
  onClearAllSelection,
}: UseOrbSelectionEscapeOptions): void {
  const clearSelectionRef = useRef(onClearSelection);
  const clearAllSelectionRef = useRef(onClearAllSelection);
  const lastEscapeAtRef = useRef<number | null>(null);

  useEffect(() => {
    clearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  useEffect(() => {
    clearAllSelectionRef.current = onClearAllSelection;
  }, [onClearAllSelection]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isGraphKeyboardEditableTarget(document.activeElement)) return;

      event.preventDefault();
      const now = getKeyboardEventTime(event);
      const last = lastEscapeAtRef.current;
      const isDoubleTap =
        last != null && now - last <= ORB_ESCAPE_DOUBLE_TAP_MS;

      if (isDoubleTap) {
        lastEscapeAtRef.current = null;
        clearAllSelectionRef.current();
        return;
      }

      lastEscapeAtRef.current = now;
      clearSelectionRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
