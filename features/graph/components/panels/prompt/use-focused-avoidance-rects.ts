"use client";

import { useEffect, useMemo, useState } from "react";
import { useCosmograph } from "@cosmograph/react";
import {
  FOCUSED_LABEL_ESTIMATED_CHAR_WIDTH,
  FOCUSED_LABEL_HEIGHT,
  FOCUSED_LABEL_MAX_WIDTH,
  FOCUSED_LABEL_MIN_WIDTH,
  FOCUSED_POINT_AVOIDANCE_PADDING,
  FOCUSED_POINT_LABEL_GAP,
} from "./constants";
import {
  unionPromptAvoidRects,
  type PromptAvoidRect,
} from "./avoidance";

const CSS_LABELS_CONTAINER_CLASS = "css-label--labels-container";

function getFocusedPointText(labelText: string | null): string {
  const trimmed = labelText?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Focused paper";
}

function estimateLabelWidth(labelText: string): number {
  return Math.max(
    FOCUSED_LABEL_MIN_WIDTH,
    Math.min(
      FOCUSED_LABEL_MAX_WIDTH,
      Math.round(labelText.length * FOCUSED_LABEL_ESTIMATED_CHAR_WIDTH + 28),
    ),
  );
}

function getActualFocusedLabelRect({
  container,
  viewportX,
  viewportY,
  labelText,
}: {
  container: HTMLElement;
  viewportX: number;
  viewportY: number;
  labelText: string;
}): PromptAvoidRect | null {
  const labelsContainer = container.querySelector(
    `.${CSS_LABELS_CONTAINER_CLASS}`,
  ) as HTMLElement | null;
  if (!labelsContainer) {
    return null;
  }

  const labelElements = Array.from(labelsContainer.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  if (labelElements.length === 0) {
    return null;
  }

  const normalizedLabelText = labelText.trim().toLowerCase();
  const scoredCandidates = labelElements.map((element) => {
    const rect = element.getBoundingClientRect();
    const text = (element.textContent ?? "").trim().toLowerCase();
    const matchesText = text === normalizedLabelText;
    const horizontalDistance = Math.abs(rect.left + rect.width / 2 - viewportX);
    const verticalDistance = Math.abs(rect.bottom - viewportY);
    const distanceScore = horizontalDistance + verticalDistance * 1.25;

    return {
      element,
      rect,
      matchesText,
      distanceScore,
    };
  });

  scoredCandidates.sort((a, b) => {
    if (a.matchesText !== b.matchesText) {
      return a.matchesText ? -1 : 1;
    }
    return a.distanceScore - b.distanceScore;
  });

  const best = scoredCandidates[0];
  if (!best) {
    return null;
  }

  const textMatched = best.matchesText;
  const nearFocusedPoint =
    Math.abs(best.rect.left + best.rect.width / 2 - viewportX) < 120 &&
    best.rect.bottom <= viewportY + 24 &&
    best.rect.bottom >= viewportY - 120;

  if (!textMatched && !nearFocusedPoint) {
    return null;
  }

  return {
    left: best.rect.left,
    top: best.rect.top,
    right: best.rect.right,
    bottom: best.rect.bottom,
  };
}

function rectsEqual(a: PromptAvoidRect[], b: PromptAvoidRect[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((rect, index) => {
    const other = b[index];
    if (!other) {
      return false;
    }

    return (
      Math.round(rect.left) === Math.round(other.left) &&
      Math.round(rect.top) === Math.round(other.top) &&
      Math.round(rect.right) === Math.round(other.right) &&
      Math.round(rect.bottom) === Math.round(other.bottom)
    );
  });
}

interface CosmographEventSource {
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

export function useFocusedAvoidanceRects({
  enabled,
  focusedPointIndex,
  labelText,
}: {
  enabled: boolean;
  focusedPointIndex: number | null;
  labelText: string | null;
}) {
  const { cosmograph } = useCosmograph();
  const [avoidRects, setAvoidRects] = useState<PromptAvoidRect[]>([]);
  const resolvedLabelText = useMemo(
    () => getFocusedPointText(labelText),
    [labelText],
  );

  useEffect(() => {
    if (!enabled || focusedPointIndex == null || !cosmograph) {
      setAvoidRects([]);
      return;
    }

    let rafHandle: number | null = null;
    let burstRafHandle: number | null = null;
    const timeoutHandles: number[] = [];
    let burstActive = false;
    let burstStart = 0;

    const computeRect = (): PromptAvoidRect[] => {
      const labelsContainer = document.querySelector(
        `.${CSS_LABELS_CONTAINER_CLASS}`,
      ) as HTMLElement | null;
      const container =
        labelsContainer?.parentElement ??
        (document.querySelector("canvas") as HTMLCanvasElement | null);
      const pointPosition = cosmograph.getPointPositionByIndex(focusedPointIndex);
      if (!container || !pointPosition) {
        return [];
      }

      const screenPosition = cosmograph.spaceToScreenPosition(pointPosition);
      if (!screenPosition) {
        return [];
      }

      const [screenX, screenY] = screenPosition;
      const containerRect = container.getBoundingClientRect();
      const viewportX = containerRect.left + screenX;
      const viewportY = containerRect.top + screenY;
      const pointRadius = Math.max(
        cosmograph.getPointScreenRadiusByIndex(focusedPointIndex) || 0,
        6,
      );
      const paddedRadius = pointRadius + FOCUSED_POINT_AVOIDANCE_PADDING;

      const pointRect: PromptAvoidRect = {
        left: viewportX - paddedRadius,
        right: viewportX + paddedRadius,
        top: viewportY - paddedRadius,
        bottom: viewportY + paddedRadius,
      };

      const labelWidth = estimateLabelWidth(resolvedLabelText);
      const estimatedLabelRect: PromptAvoidRect = {
        left: viewportX - labelWidth / 2,
        right: viewportX + labelWidth / 2,
        bottom: viewportY - pointRadius - FOCUSED_POINT_LABEL_GAP,
        top:
          viewportY -
          pointRadius -
          FOCUSED_POINT_LABEL_GAP -
          FOCUSED_LABEL_HEIGHT,
      };
      const actualLabelRect = labelsContainer
        ? getActualFocusedLabelRect({
            container,
            viewportX,
            viewportY,
            labelText: resolvedLabelText,
          })
        : null;
      const labelRect = actualLabelRect ?? estimatedLabelRect;

      const union = unionPromptAvoidRects([pointRect, labelRect]);
      return union ? [union] : [pointRect];
    };

    const applyRect = () => {
      const next = computeRect();
      setAvoidRects((current) => (rectsEqual(current, next) ? current : next));
    };

    const cancelBurst = () => {
      if (burstRafHandle != null) {
        cancelAnimationFrame(burstRafHandle);
        burstRafHandle = null;
      }
      burstActive = false;
    };

    const startBurst = () => {
      burstStart = performance.now();
      if (burstActive) {
        return;
      }
      burstActive = true;

      const tick = (now: number) => {
        applyRect();
        if (now - burstStart < 500) {
          burstRafHandle = requestAnimationFrame(tick);
          return;
        }
        burstActive = false;
        burstRafHandle = null;
      };

      burstRafHandle = requestAnimationFrame(tick);
    };

    const scheduleUpdate = () => {
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle);
      }
      rafHandle = requestAnimationFrame(() => {
        applyRect();
      });
    };

    const handleGeometryChange = () => {
      scheduleUpdate();
      startBurst();
    };

    applyRect();
    startBurst();

    timeoutHandles.push(
      window.setTimeout(handleGeometryChange, 120),
      window.setTimeout(handleGeometryChange, 260),
      window.setTimeout(handleGeometryChange, 420),
    );

    const eventSource = cosmograph as unknown as CosmographEventSource;
    const eventNames = [
      "onZoom",
      "zoomEnded",
      "onDrag",
      "pointSizeScaleUpdated",
    ];

    for (const eventName of eventNames) {
      eventSource.addEventListener?.(eventName, handleGeometryChange);
    }
    window.addEventListener("resize", handleGeometryChange);

    return () => {
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle);
      }
      cancelBurst();
      for (const timeoutHandle of timeoutHandles) {
        window.clearTimeout(timeoutHandle);
      }
      for (const eventName of eventNames) {
        eventSource.removeEventListener?.(eventName, handleGeometryChange);
      }
      window.removeEventListener("resize", handleGeometryChange);
    };
  }, [cosmograph, enabled, focusedPointIndex, resolvedLabelText]);

  return avoidRects;
}
