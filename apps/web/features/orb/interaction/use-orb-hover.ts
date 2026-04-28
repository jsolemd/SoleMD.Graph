"use client";

import { useCallback, useEffect, useRef } from "react";

import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { ORB_PICK_NO_HIT, useOrbPickerStore } from "./orb-picker-store";

export interface UseOrbHoverOptions {
  particleCount: number;
  enabled?: boolean;
}

export function useOrbHover(options: UseOrbHoverOptions) {
  const { particleCount, enabled = true } = options;
  const rafRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const setHoverIndex = useOrbFocusVisualStore((s) => s.setHoverIndex);

  const clearHover = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    requestIdRef.current += 1;
    setHoverIndex(null);
  }, [setHoverIndex]);

  const flushHover = useCallback(() => {
    rafRef.current = null;
    const requestId = ++requestIdRef.current;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || !enabled || particleCount <= 0) return;

    const handle = useOrbPickerStore.getState().handle;
    if (!handle) {
      setHoverIndex(null);
      return;
    }

    void handle
      .pickAsync(pending.x, pending.y)
      .then((index) => {
        if (requestId !== requestIdRef.current) return;
        if (index === ORB_PICK_NO_HIT || index < 0 || index >= particleCount) {
          setHoverIndex(null);
          return;
        }
        setHoverIndex(index);
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setHoverIndex(null);
      });
  }, [enabled, particleCount, setHoverIndex]);

  const handleHoverMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;
      pendingRef.current = { x: clientX, y: clientY };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(flushHover);
    },
    [enabled, flushHover],
  );

  useEffect(() => clearHover, [clearHover]);

  return { handleHoverMove, clearHover };
}
