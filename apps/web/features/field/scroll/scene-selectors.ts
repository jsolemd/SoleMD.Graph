"use client";

import type { FieldChapterState, FieldSceneState } from "../scene/visual-presets";

export function getFieldChapterProgress(
  sceneState: FieldSceneState,
  sectionId: string,
): number {
  return sceneState.chapters[sectionId]?.progress ?? 0;
}

export function isFieldChapterActive(
  sceneState: FieldSceneState,
  sectionId: string,
): boolean {
  return sceneState.chapters[sectionId]?.isActive ?? false;
}

export function getFieldChapterVisibility(
  sceneState: FieldSceneState,
  sectionId: string,
): number {
  return sceneState.chapters[sectionId]?.visibility ?? 0;
}

export function getFieldChapterState(
  sceneState: FieldSceneState,
  sectionId: string,
): FieldChapterState | undefined {
  return sceneState.chapters[sectionId];
}

// Quantize chapter progress to the reveal-curve breakpoints used by the
// connection overlay (smoothstep(0.24, 0.5) * (1 - smoothstep(0.66, 0.9))).
// Subscribers compare this bucket to decide whether to React-re-render.
export function getFieldChapterProgressBucket(progress: number): number {
  if (progress < 0.24) return 0;
  if (progress < 0.5) return 1;
  if (progress < 0.66) return 2;
  if (progress < 0.9) return 3;
  return 4;
}
