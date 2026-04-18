import { clamp } from "@/lib/helpers";
import { densityPx } from "@/lib/density";
import type { GraphLoadingConstellation } from "./graph-loading-constellations";

export const LOADING_CONSTELLATION_GROUP_GAP = densityPx(24);

const VIEWPORT_PADDING = densityPx(32);
const TOP_CHROME_CLEARANCE = densityPx(56);

export type LoadingBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type LoadingConstellationFrame = LoadingBounds & {
  width: number;
  height: number;
};

export function getLoadingPanelAvoidBounds(
  viewportWidth: number,
  viewportHeight: number,
): LoadingBounds {
  const panelWidth = Math.min(360, viewportWidth * 0.88) + 64;
  const panelHeight = 280;

  return {
    left: viewportWidth / 2 - panelWidth / 2,
    top: viewportHeight / 2 - panelHeight / 2,
    right: viewportWidth / 2 + panelWidth / 2,
    bottom: viewportHeight / 2 + panelHeight / 2,
  };
}

export function boundsOverlap(
  first: LoadingBounds,
  second: LoadingBounds,
  gap = 0,
): boolean {
  return (
    first.left < second.right + gap &&
    first.right > second.left - gap &&
    first.top < second.bottom + gap &&
    first.bottom > second.top - gap
  );
}

/**
 * Hand-tuned scatter positions as viewport percentages.
 * Each entry is [xPercent, yPercent] — the center of the constellation frame.
 * Spread organically across the viewport, avoiding the center loading card.
 */
const SCATTER_POSITIONS: Record<string, [number, number]> = {
  depression:            [12, 18],
  "synaptic-plasticity": [6,  56],
  "locus-coeruleus":     [38, 10],
  ketamine:              [72, 10],
  bdnf:                  [18, 82],
  "5ht2a":               [55, 86],
  "default-mode-network":[88, 75],
  "mus-musculus":        [92, 42],
};

export function resolveConstellationLayoutMap(
  constellations: readonly Pick<GraphLoadingConstellation, "id">[],
  viewportWidth: number,
  viewportHeight: number,
): Record<string, LoadingConstellationFrame> {
  const frameSize = getScatterFrameSize(viewportWidth, viewportHeight);
  const frames: Record<string, LoadingConstellationFrame> = {};

  for (const constellation of constellations) {
    const scatter = SCATTER_POSITIONS[constellation.id];
    if (!scatter) continue;

    const [xPct, yPct] = scatter;
    const centerX = (xPct / 100) * viewportWidth;
    const centerY = (yPct / 100) * viewportHeight;

    const left = clamp(
      centerX - frameSize.width / 2,
      VIEWPORT_PADDING,
      viewportWidth - frameSize.width - VIEWPORT_PADDING,
    );
    const top = clamp(
      centerY - frameSize.height / 2,
      TOP_CHROME_CLEARANCE,
      viewportHeight - frameSize.height - VIEWPORT_PADDING,
    );

    frames[constellation.id] = makeFrame(left, top, frameSize.width, frameSize.height);
  }

  return frames;
}

function getScatterFrameSize(
  viewportWidth: number,
  viewportHeight: number,
) {
  // Larger frames than the old grid — each constellation fills more space.
  const width = clamp(viewportWidth * 0.18, 200, 320);
  const height = clamp(viewportHeight * 0.22, 160, 260);
  return { width, height };
}

function makeFrame(
  left: number,
  top: number,
  width: number,
  height: number,
): LoadingConstellationFrame {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
