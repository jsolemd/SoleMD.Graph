"use client";

import { useEffect, useRef } from "react";

import {
  PARTICLE_STATE_CAPACITY,
  writeLane,
} from "@/features/field/renderer/field-particle-state-texture";
import { useOrbScopeMutationStore } from "../stores/scope-mutation-store";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

const HOVER_INTENSITY = 128;
const FOCUS_INTENSITY = 255;

export interface UseOrbHoverResolverOptions {
  particleCount: number;
  enabled?: boolean;
}

function isValidIndex(index: number | null, particleCount: number): index is number {
  return (
    index != null &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < particleCount &&
    index < PARTICLE_STATE_CAPACITY
  );
}

/**
 * Writes the G lane for the current focus + hover pair. Focus wins over
 * hover by intensity (255 vs 128); no full-lane clear runs on pointer
 * movement, only previous/current touched indices are reset.
 */
export function useOrbHoverResolver(
  options: UseOrbHoverResolverOptions,
): void {
  const { enabled = true, particleCount } = options;
  const revision = useOrbFocusVisualStore((s) => s.revision);
  const previousRef = useRef<{ focusIndex: number | null; hoverIndex: number | null }>({
    focusIndex: null,
    hoverIndex: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;

      const previous = previousRef.current;
      const { focusIndex, hoverIndex } = useOrbFocusVisualStore.getState();
      const touched = new Set<number>();

      if (isValidIndex(previous.hoverIndex, particleCount)) {
        touched.add(previous.hoverIndex);
      }
      if (isValidIndex(previous.focusIndex, particleCount)) {
        touched.add(previous.focusIndex);
      }
      if (isValidIndex(hoverIndex, particleCount)) touched.add(hoverIndex);
      if (isValidIndex(focusIndex, particleCount)) touched.add(focusIndex);

      for (const index of touched) writeLane("G", index, 0);
      if (isValidIndex(hoverIndex, particleCount)) {
        writeLane("G", hoverIndex, HOVER_INTENSITY);
      }
      if (isValidIndex(focusIndex, particleCount)) {
        writeLane("G", focusIndex, FOCUS_INTENSITY);
      }

      previousRef.current = { focusIndex, hoverIndex };
      if (touched.size > 0) {
        useOrbScopeMutationStore.getState().bumpScopeRevision();
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [enabled, particleCount, revision]);
}
