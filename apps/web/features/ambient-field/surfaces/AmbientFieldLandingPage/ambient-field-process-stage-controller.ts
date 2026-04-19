"use client";

import {
  ambientFieldProcessStageManifest,
} from "./ambient-field-landing-content";
import {
  createMeasuredProcessPath,
  interpolateMeasuredProcessPath,
  type MeasuredProcessPath,
} from "./ambient-field-process-geometry";
import type { AmbientFieldScrollOverlayController } from "../../scroll/ambient-field-scroll-driver";

interface CreateAmbientFieldProcessStageControllerOptions {
  isMobile: boolean;
  markers: Array<HTMLDivElement | null>;
  panel: HTMLDivElement | null;
  popups: Array<HTMLDivElement | null>;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, mix: number): number {
  return from + (to - from) * mix;
}

function fract(value: number) {
  return value - Math.floor(value);
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

const measuredDesktopProcessPath = createMeasuredProcessPath(
  ambientFieldProcessStageManifest.desktopPath,
);
const measuredMobileProcessPath = createMeasuredProcessPath(
  ambientFieldProcessStageManifest.mobilePath,
);

function resolveMeasuredProcessPath(isMobile: boolean): MeasuredProcessPath {
  return isMobile ? measuredMobileProcessPath : measuredDesktopProcessPath;
}

export function createAmbientFieldProcessStageController({
  isMobile,
  markers,
  panel,
  popups,
}: CreateAmbientFieldProcessStageControllerOptions): AmbientFieldScrollOverlayController {
  return {
    syncFrame({ processProgress, reducedMotion, streamVisibility, timestamp }) {
      if (!panel) return;

      const measuredPath = resolveMeasuredProcessPath(isMobile);
      const activeWeight = reducedMotion
        ? streamVisibility
        : Math.max(streamVisibility, smoothstep(0.02, 0.16, processProgress));

      panel.style.setProperty(
        "--ambient-process-progress",
        processProgress.toFixed(4),
      );

      markers.forEach((marker, index) => {
        if (!marker) return;

        const lane = ambientFieldProcessStageManifest.markerLanes[index];
        if (!lane) return;

        const loopProgress = reducedMotion
          ? processProgress
          : fract(timestamp * 0.000075 + lane.phase + processProgress * 0.16);
        const point = interpolateMeasuredProcessPath(measuredPath, loopProgress);
        const x = panel.clientWidth * point.x;
        const y = panel.clientHeight * point.y;
        const opacity = activeWeight * (index === 0 ? 1 : 0.74 - index * 0.1);
        const scale = lane.scale * (0.96 + activeWeight * 0.08);

        marker.style.opacity = opacity.toFixed(4);
        marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;
      });

      ambientFieldProcessStageManifest.popups.forEach((popup, index) => {
        const popupNode = popups[index];
        if (!popupNode) return;

        const opacity =
          windowWeight(...popup.window, processProgress) * activeWeight;
        const rise = lerp(18, 0, opacity);
        const scale = lerp(0.985, 1, opacity);

        popupNode.style.opacity = opacity.toFixed(4);
        popupNode.style.transform = `translate3d(0, ${rise}px, 0) scale(${scale})`;
      });
    },
  };
}
