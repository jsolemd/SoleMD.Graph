"use client";

import {
  AMBIENT_FIELD_STAGE_ITEM_IDS,
  createAmbientFieldSceneState,
  type AmbientFieldSceneState,
  type AmbientFieldStageItemId,
  type AmbientFieldVisualPreset,
} from "../scene/visual-presets";

export interface AmbientFieldScrollStop {
  id: string;
  preset: AmbientFieldVisualPreset;
  start: number;
}

interface AmbientFieldScrollAnchor {
  offsetViewport: number;
  sectionId: string;
}

interface AmbientFieldScrollWindow {
  end: AmbientFieldScrollAnchor;
  start: AmbientFieldScrollAnchor;
}

interface AmbientFieldStageVisibilityWindow {
  enter: AmbientFieldScrollWindow;
  exit?: AmbientFieldScrollWindow;
}

interface AmbientFieldStageEmphasisConfig {
  base: number;
  metric: "localProgress" | "processProgress" | "visibility";
  range: number;
}

interface AmbientFieldStageScrollManifest {
  emphasis: AmbientFieldStageEmphasisConfig;
  localProgress: AmbientFieldScrollWindow;
  visibility: AmbientFieldStageVisibilityWindow;
}

export interface AmbientFieldScrollManifest {
  activationViewportRatio: number;
  focusViewportRatio: number;
  processProgress: AmbientFieldScrollWindow;
  stages: Record<AmbientFieldStageItemId, AmbientFieldStageScrollManifest>;
}

export interface ResolvedAmbientFieldScrollState {
  activeSectionId: string;
  processProgress: number;
  scrollProgress: number;
  items: AmbientFieldSceneState["items"];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function windowWeight(
  fadeInStart: number,
  fadeInEnd: number,
  fadeOutStart: number,
  fadeOutEnd: number,
  value: number,
): number {
  const enter = smoothstep(fadeInStart, fadeInEnd, value);
  const exit = 1 - smoothstep(fadeOutStart, fadeOutEnd, value);
  return clamp01(enter * exit);
}

function rangeProgress(start: number, end: number, value: number): number {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

function measureStageWindowWeight(
  start: number,
  full: number,
  fadeStart: number,
  end: number,
  focusTop: number,
): number {
  return windowWeight(start, full, fadeStart, end, focusTop);
}

function findActiveSectionIndex(
  scrollTop: number,
  viewportHeight: number,
  stops: AmbientFieldScrollStop[],
  activationViewportRatio: number,
): number {
  if (stops.length <= 1) return 0;

  const activationTop = scrollTop + viewportHeight * activationViewportRatio;
  let activeIndex = 0;

  for (let index = 0; index < stops.length; index += 1) {
    if (activationTop >= stops[index].start) {
      activeIndex = index;
      continue;
    }
    break;
  }

  return activeIndex;
}

function createStopMap(stops: AmbientFieldScrollStop[]) {
  return new Map(stops.map((stop) => [stop.id, stop.start]));
}

function resolveAnchorPosition(
  anchor: AmbientFieldScrollAnchor,
  stopMap: Map<string, number>,
  viewportHeight: number,
  fallback: number,
) {
  return (
    (stopMap.get(anchor.sectionId) ?? fallback) + viewportHeight * anchor.offsetViewport
  );
}

function resolveProgressWindow(
  window: AmbientFieldScrollWindow,
  focusTop: number,
  stopMap: Map<string, number>,
  viewportHeight: number,
  fallback: number,
) {
  return rangeProgress(
    resolveAnchorPosition(window.start, stopMap, viewportHeight, fallback),
    resolveAnchorPosition(window.end, stopMap, viewportHeight, fallback),
    focusTop,
  );
}

function resolveVisibilityWindow(
  window: AmbientFieldStageVisibilityWindow,
  focusTop: number,
  stopMap: Map<string, number>,
  viewportHeight: number,
  fallback: number,
) {
  const enterStart = resolveAnchorPosition(
    window.enter.start,
    stopMap,
    viewportHeight,
    fallback,
  );
  const enterEnd = resolveAnchorPosition(
    window.enter.end,
    stopMap,
    viewportHeight,
    fallback,
  );

  if (!window.exit) {
    return smoothstep(enterStart, enterEnd, focusTop);
  }

  return measureStageWindowWeight(
    enterStart,
    enterEnd,
    resolveAnchorPosition(window.exit.start, stopMap, viewportHeight, fallback),
    resolveAnchorPosition(window.exit.end, stopMap, viewportHeight, fallback),
    focusTop,
  );
}

export function resolveAmbientFieldScrollState({
  manifest,
  scrollTop,
  scrollMax,
  viewportHeight,
  stops,
}: {
  manifest: AmbientFieldScrollManifest;
  scrollTop: number;
  scrollMax: number;
  viewportHeight: number;
  stops: AmbientFieldScrollStop[];
}): ResolvedAmbientFieldScrollState {
  if (stops.length === 0) {
    const fallback = createAmbientFieldSceneState();
    return {
      activeSectionId: fallback.activeSectionId,
      processProgress: 0,
      scrollProgress: 0,
      items: fallback.items,
    };
  }

  const scrollProgress = scrollMax > 0 ? clamp01(scrollTop / scrollMax) : 0;
  const activeIndex = findActiveSectionIndex(
    scrollTop,
    viewportHeight,
    stops,
    manifest.activationViewportRatio,
  );
  const activeSectionId = stops[activeIndex]?.id ?? "section-welcome";
  const focusTop = scrollTop + viewportHeight * manifest.focusViewportRatio;
  const fallback = 0;
  const stopMap = createStopMap(stops);

  const processProgress = resolveProgressWindow(
    manifest.processProgress,
    focusTop,
    stopMap,
    viewportHeight,
    fallback,
  );
  const items = {} as AmbientFieldSceneState["items"];

  for (const stageItemId of AMBIENT_FIELD_STAGE_ITEM_IDS) {
    const stageManifest = manifest.stages[stageItemId];
    const visibility = resolveVisibilityWindow(
      stageManifest.visibility,
      focusTop,
      stopMap,
      viewportHeight,
      fallback,
    );
    const localProgress = resolveProgressWindow(
      stageManifest.localProgress,
      focusTop,
      stopMap,
      viewportHeight,
      fallback,
    );
    const emphasisMetric =
      stageManifest.emphasis.metric === "processProgress"
        ? processProgress
        : stageManifest.emphasis.metric === "localProgress"
          ? localProgress
          : visibility;

    items[stageItemId] = {
      visibility: clamp01(visibility),
      localProgress: clamp01(localProgress),
      emphasis: clamp01(
        stageManifest.emphasis.base +
          emphasisMetric * stageManifest.emphasis.range,
      ),
    };
  }

  return {
    activeSectionId,
    processProgress,
    scrollProgress,
    items,
  };
}
