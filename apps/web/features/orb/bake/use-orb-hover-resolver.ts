"use client";

import { useEffect, useRef } from "react";

import {
  PARTICLE_STATE_CAPACITY,
  writeLane,
} from "@/features/field/renderer/field-particle-state-texture";
import { useOrbScopeMutationStore } from "../stores/scope-mutation-store";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

const HOVER_INTENSITY = 128;
const SELECTION_INTENSITY = 192;
const SCOPE_INTENSITY = 192;
const FOCUS_INTENSITY = 255;
const NEIGHBOR_INTENSITY = 96;

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
 * Writes the G lane for the current focus + selection + hover +
 * neighbor-highlight state. Focus wins by intensity
 * (255 > 192 > 128 > 96); no full-lane clear runs on pointer
 * movement, only previous/current touched indices are reset.
 */
export function useOrbHoverResolver(
  options: UseOrbHoverResolverOptions,
): void {
  const { enabled = true, particleCount } = options;
  const revision = useOrbFocusVisualStore((s) => s.revision);
  const previousRef = useRef<{
    focusIndex: number | null;
    hoverIndex: number | null;
    selectionIndices: number[];
    scopeIndices: number[];
    neighborIndices: number[];
    selectionRevision: number;
    scopeRevision: number;
    neighborRevision: number;
  }>({
    focusIndex: null,
    hoverIndex: null,
    selectionIndices: [],
    scopeIndices: [],
    neighborIndices: [],
    selectionRevision: 0,
    scopeRevision: 0,
    neighborRevision: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;

      const previous = previousRef.current;
      const {
        focusIndex,
        hoverIndex,
        selectionIndices,
        scopeIndices,
        neighborIndices,
        selectionRevision,
        scopeRevision,
        neighborRevision,
      } = useOrbFocusVisualStore.getState();
      const selectionChanged =
        previous.selectionRevision !== selectionRevision;
      const scopeChanged = previous.scopeRevision !== scopeRevision;
      const neighborChanged = previous.neighborRevision !== neighborRevision;
      const currentSelection = new Set(selectionIndices);
      const currentScope = new Set(scopeIndices);
      const currentNeighbors = new Set(neighborIndices);
      const touched = new Set<number>();

      if (isValidIndex(previous.hoverIndex, particleCount)) {
        touched.add(previous.hoverIndex);
      }
      if (isValidIndex(previous.focusIndex, particleCount)) {
        touched.add(previous.focusIndex);
      }
      if (isValidIndex(hoverIndex, particleCount)) touched.add(hoverIndex);
      if (isValidIndex(focusIndex, particleCount)) touched.add(focusIndex);
      if (neighborChanged) {
        for (const index of previous.neighborIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
        for (const index of neighborIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
      }
      if (selectionChanged) {
        for (const index of previous.selectionIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
        for (const index of selectionIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
      }
      if (scopeChanged) {
        for (const index of previous.scopeIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
        for (const index of scopeIndices) {
          if (isValidIndex(index, particleCount)) touched.add(index);
        }
      }

      for (const index of touched) {
        let intensity = currentNeighbors.has(index) ? NEIGHBOR_INTENSITY : 0;
        if (currentScope.has(index)) {
          intensity = Math.max(intensity, SCOPE_INTENSITY);
        }
        if (currentSelection.has(index)) {
          intensity = Math.max(intensity, SELECTION_INTENSITY);
        }
        if (index === hoverIndex) {
          intensity = Math.max(intensity, HOVER_INTENSITY);
        }
        if (index === focusIndex) {
          intensity = Math.max(intensity, FOCUS_INTENSITY);
        }
        writeLane("G", index, intensity);
      }

      previousRef.current = {
        focusIndex,
        hoverIndex,
        selectionIndices,
        scopeIndices,
        neighborIndices,
        selectionRevision,
        scopeRevision,
        neighborRevision,
      };
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
