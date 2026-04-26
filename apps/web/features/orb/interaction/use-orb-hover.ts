"use client";

import { useCallback, useEffect, useRef } from "react";

import { PICK_NO_HIT } from "@/features/field/renderer/field-picking";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { useOrbPickerStore } from "./orb-picker-store";

export interface UseOrbHoverOptions {
  particleCount: number;
  enabled?: boolean;
}

export function useOrbHover(options: UseOrbHoverOptions) {
  const { particleCount, enabled = true } = options;
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const setHoverIndex = useOrbFocusVisualStore((s) => s.setHoverIndex);

  const clearHover = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoverIndex(null);
  }, [setHoverIndex]);

  const flushHover = useCallback(() => {
    rafRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || !enabled || particleCount <= 0) return;

    const handle = useOrbPickerStore.getState().handle;
    if (!handle) {
      setHoverIndex(null);
      return;
    }

    const index = handle.pickSync(pending.x, pending.y);
    if (index === PICK_NO_HIT || index < 0 || index >= particleCount) {
      setHoverIndex(null);
      return;
    }

    setHoverIndex(index);
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
