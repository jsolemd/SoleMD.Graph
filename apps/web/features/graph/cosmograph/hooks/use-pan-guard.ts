"use client";

import { useCallback, useRef } from "react";
import type { D3ZoomEvent } from "d3-zoom";
import {
  createPanLatch,
  exceededTapTravel,
  type PanLatch,
} from "@/features/graph/lib/pointer-gesture";

type ZoomEvent = D3ZoomEvent<HTMLCanvasElement, undefined>;

export interface PanGuard {
  /** Feed from Cosmograph's `onZoomStart` callback. */
  onZoomStart: (event: ZoomEvent, userDriven: boolean) => void;
  /** Feed from Cosmograph's `onZoom` callback. */
  onZoom: (event: ZoomEvent, userDriven: boolean) => void;
  /** Feed from Cosmograph's `onZoomEnd` callback. */
  onZoomEnd: (event: ZoomEvent, userDriven: boolean) => void;
  /**
   * Returns true if the most recent user-driven gesture moved beyond the
   * tap-travel threshold (a real pan/zoom, not a tap). Consumes the flag:
   * subsequent calls return false until another gesture completes.
   */
  consumeJustPan: () => boolean;
}

/**
 * Distinguishes a tap from a pan/zoom on the Cosmograph canvas using the
 * library's native zoom lifecycle (onZoomStart / onZoom / onZoomEnd).
 *
 * On desktop mouse, d3-zoom's default `clickDistance` already suppresses the
 * synthesized click after a drag, so `onBackgroundClick` doesn't fire — this
 * guard is a no-op.
 *
 * On touch, a one-finger pan ends with Cosmograph firing `onBackgroundClick`
 * anyway, which combined with `resetSelectionOnEmptyCanvasClick` would clear
 * the selection. Consuming this flag in the background-click handler
 * preserves selection through pan gestures without touching Cosmograph
 * internals or re-implementing d3-zoom gesture detection.
 */
export function usePanGuard(): PanGuard {
  const startRef = useRef<{ x: number; y: number; k: number } | null>(null);
  const traveledRef = useRef(false);
  const latchRef = useRef<PanLatch | null>(null);
  if (latchRef.current === null) {
    latchRef.current = createPanLatch();
  }
  const latch = latchRef.current;

  const onZoomStart = useCallback(
    (event: ZoomEvent, userDriven: boolean) => {
      if (!userDriven) return;
      startRef.current = {
        x: event.transform.x,
        y: event.transform.y,
        k: event.transform.k,
      };
      traveledRef.current = false;
      latch.setPanning(true);
    },
    [latch],
  );

  const onZoom = useCallback(
    (event: ZoomEvent, userDriven: boolean) => {
      if (!userDriven || !startRef.current || traveledRef.current) return;
      if (event.transform.k !== startRef.current.k) {
        traveledRef.current = true;
        return;
      }
      traveledRef.current = exceededTapTravel({
        startX: startRef.current.x,
        startY: startRef.current.y,
        endX: event.transform.x,
        endY: event.transform.y,
      });
    },
    [],
  );

  const onZoomEnd = useCallback(
    (_event: ZoomEvent, userDriven: boolean) => {
      if (userDriven && traveledRef.current) {
        latch.markPanned();
      }
      startRef.current = null;
      traveledRef.current = false;
      latch.setPanning(false);
    },
    [latch],
  );

  const consumeJustPan = useCallback(() => latch.consumeJustPan(), [latch]);

  return { onZoomStart, onZoom, onZoomEnd, consumeJustPan };
}
