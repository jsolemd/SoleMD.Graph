"use client";

import {
  ambientFieldProcessStageManifest,
} from "./ambient-field-landing-content";
import type { AmbientFieldScrollOverlayController } from "../../scroll/ambient-field-scroll-driver";

interface CreateAmbientFieldProcessStageControllerOptions {
  isMobile: boolean;
  panel: HTMLDivElement | null;
  pathNodes: Array<SVGPathElement | null>;
  points: Array<HTMLDivElement | null>;
}

const DESKTOP_VIEWBOX = { width: 1204, height: 535 } as const;
const MOBILE_VIEWBOX = { width: 345, height: 653 } as const;
const STREAM_BEAT_MS = 3200;
const STREAM_LOOP_MS = 9600;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (max <= min) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function fract(value: number) {
  return value - Math.floor(value);
}

function lerp(from: number, to: number, mix: number) {
  return from + (to - from) * mix;
}

export function createAmbientFieldProcessStageController({
  isMobile,
  panel,
  pathNodes,
  points,
}: CreateAmbientFieldProcessStageControllerOptions): AmbientFieldScrollOverlayController {
  return {
    syncFrame({ processProgress, reducedMotion, streamVisibility, timestamp }) {
      if (!panel) return;

      const activeWeight = reducedMotion
        ? streamVisibility
        : Math.max(streamVisibility, smoothstep(0.02, 0.16, processProgress));
      const viewBox = isMobile ? MOBILE_VIEWBOX : DESKTOP_VIEWBOX;

      panel.style.setProperty(
        "--ambient-process-progress",
        processProgress.toFixed(4),
      );

      ambientFieldProcessStageManifest.points.forEach((point, index) => {
        const pointNode = points[index];
        const pathNode = pathNodes[point.pathIndex];
        if (!pointNode || !pathNode) return;

        const totalLength = pathNode.getTotalLength();
        const loopProgress = reducedMotion
          ? processProgress
          : fract(timestamp / STREAM_LOOP_MS + index * 0.11 + processProgress * 0.06);
        const popupPhase = reducedMotion
          ? processProgress
          : fract(timestamp / STREAM_BEAT_MS + index * 0.19);
        const activePopupIndex = Math.floor(
          popupPhase * point.popups.length,
        ) % point.popups.length;
        const pathPoint = pathNode.getPointAtLength(totalLength * loopProgress);
        const x = (pathPoint.x / viewBox.width) * panel.clientWidth;
        const y = (pathPoint.y / viewBox.height) * panel.clientHeight;
        const scale = point.tone === "danger"
          ? lerp(0.94, 1.04, activeWeight)
          : lerp(0.9, 0.98, activeWeight);
        const opacity = activeWeight * (point.tone === "danger" ? 1 : 0.84);

        pointNode.style.opacity = opacity.toFixed(4);
        pointNode.style.transform =
          `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

        pointNode.querySelectorAll<HTMLElement>("[data-stream-popup]").forEach(
          (popupNode, popupIndex) => {
            const isActive = popupIndex === activePopupIndex && activeWeight > 0.12;
            const popupOpacity = isActive ? activeWeight : 0;
            const rise = lerp(10, 0, popupOpacity);
            const popupScale = lerp(0.985, 1, popupOpacity);

            popupNode.style.opacity = popupOpacity.toFixed(4);
            popupNode.style.transform =
              `translate3d(0, ${rise}px, 0) scale(${popupScale})`;
          },
        );
      });
    },
  };
}
