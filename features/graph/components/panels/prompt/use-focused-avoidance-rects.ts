"use client";

import { useEffect, useRef, useState } from "react";
import { useGraphInstance } from "@/features/graph/cosmograph";
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
const FOCUSED_MOTION_EPSILON_PX = 1.5;
const FOCUSED_MOTION_IDLE_MS = 72;
const FOCUSED_MOTION_DETECTION_MS = 180;
const FOCUSED_LABEL_QUIET_MS = 96;
const FOCUSED_LABEL_SETTLE_TIMEOUT_MS = 260;
const FOCUSED_LABEL_FALLBACK_MIN_WIDTH = 220;

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
  labelText?: string | null;
}): PromptAvoidRect | null {
  const labelsContainer = container.querySelector(
    `.${CSS_LABELS_CONTAINER_CLASS}`,
  ) as HTMLElement | null;
  if (!labelsContainer) {
    return null;
  }

  const normalizedLabelText = labelText?.trim().toLowerCase() ?? null;
  const measured = Array.from(labelsContainer.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map((el) => ({ el, rect: el.getBoundingClientRect() }));
  const visible = measured.filter(({ rect }) => rect.width > 0 && rect.height > 0);

  if (visible.length === 0) {
    return null;
  }

  const scoredCandidates = visible.map(({ el, rect }) => {
    const text = (el.textContent ?? "").trim().toLowerCase();
    const matchesText =
      normalizedLabelText != null && text === normalizedLabelText;
    const horizontalDistance = Math.abs(rect.left + rect.width / 2 - viewportX);
    const verticalDistance = Math.abs(rect.bottom - viewportY);
    const distanceScore = horizontalDistance + verticalDistance * 1.25;

    return {
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
    Math.abs(best.rect.left + best.rect.width / 2 - viewportX) < 140 &&
    best.rect.bottom <= viewportY + 24 &&
    best.rect.bottom >= viewportY - 144;

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

interface ScreenPointGeometry {
  container: HTMLElement;
  viewportX: number;
  viewportY: number;
  pointRadius: number;
}

export function useFocusedAvoidanceRects({
  enabled,
  focusedPointIndex,
  focusSessionRevision,
  cameraSettledRevision,
  labelText,
}: {
  enabled: boolean;
  focusedPointIndex: number | null;
  focusSessionRevision: number;
  cameraSettledRevision: number;
  labelText: string | null;
}) {
  const cosmograph = useGraphInstance();
  const [avoidRects, setAvoidRects] = useState<PromptAvoidRect[]>([]);
  const resolvedLabelTextRef = useRef(getFocusedPointText(labelText));
  const lastFocusedPointIndexRef = useRef<number | null>(null);
  const lastFocusSessionRevisionRef = useRef<number | null>(null);
  const lastCameraSettledRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    resolvedLabelTextRef.current = getFocusedPointText(labelText);
  }, [labelText]);

  useEffect(() => {
    if (!enabled || focusedPointIndex == null || !cosmograph) {
      setAvoidRects([]);
      lastFocusedPointIndexRef.current = focusedPointIndex;
      lastFocusSessionRevisionRef.current = focusSessionRevision;
      lastCameraSettledRevisionRef.current = cameraSettledRevision;
      return;
    }
    const focusChanged =
      lastFocusedPointIndexRef.current !== focusedPointIndex ||
      lastFocusSessionRevisionRef.current !== focusSessionRevision;
    const cameraSettledChanged =
      lastCameraSettledRevisionRef.current !== cameraSettledRevision;

    lastFocusedPointIndexRef.current = focusedPointIndex;
    lastFocusSessionRevisionRef.current = focusSessionRevision;
    lastCameraSettledRevisionRef.current = cameraSettledRevision;

    let motionRaf: number | null = null;
    let settleRafOne: number | null = null;
    let settleRafTwo: number | null = null;
    let labelVerificationRaf: number | null = null;
    let labelMutationObserver: MutationObserver | null = null;
    let disposed = false;
    let sessionSettled = false;
    let sawGeometryMotion = false;
    let lastScreenPosition: { x: number; y: number } | null = null;
    let lastMotionAt = performance.now();
    let motionDetectionStartedAt = performance.now();
    let lastLabelMutationAt = performance.now();
    let labelVerificationStartedAt = 0;
    let labelsContainerCache: HTMLElement | null = null;
    let geometryContainerCache: HTMLElement | null = null;

    const getLabelsContainer = () => {
      if (labelsContainerCache?.isConnected) {
        return labelsContainerCache;
      }

      labelsContainerCache = document.querySelector(
        `.${CSS_LABELS_CONTAINER_CLASS}`,
      ) as HTMLElement | null;
      return labelsContainerCache;
    };

    const getGeometryContainer = () => {
      const labelsContainer = getLabelsContainer();
      const labelsParent = labelsContainer?.parentElement;
      if (labelsParent instanceof HTMLElement) {
        geometryContainerCache = labelsParent;
        return labelsParent;
      }

      if (geometryContainerCache?.isConnected) {
        return geometryContainerCache;
      }

      geometryContainerCache = document.querySelector("canvas") as HTMLElement | null;
      return geometryContainerCache;
    };

    const getScreenGeometry = (): ScreenPointGeometry | null => {
      const container = getGeometryContainer();
      const pointPosition = cosmograph.getPointPositionByIndex(focusedPointIndex);
      if (!container || !pointPosition) {
        return null;
      }

      const screenPosition = cosmograph.spaceToScreenPosition(pointPosition);
      if (!screenPosition) {
        return null;
      }

      const [screenX, screenY] = screenPosition;
      const containerRect = container.getBoundingClientRect();

      return {
        container,
        viewportX: containerRect.left + screenX,
        viewportY: containerRect.top + screenY,
        pointRadius: Math.max(
          cosmograph.getPointScreenRadiusByIndex(focusedPointIndex) || 0,
          6,
        ),
      };
    };

    const computeAvoidanceGeometry = (): {
      rects: PromptAvoidRect[];
      hasActualLabelRect: boolean;
    } => {
      const geometry = getScreenGeometry();
      if (!geometry) {
        return { rects: [], hasActualLabelRect: false };
      }

      const {
        container,
        viewportX,
        viewportY,
        pointRadius,
      } = geometry;
      const paddedRadius = pointRadius + FOCUSED_POINT_AVOIDANCE_PADDING;
      const pointRect: PromptAvoidRect = {
        left: viewportX - paddedRadius,
        right: viewportX + paddedRadius,
        top: viewportY - paddedRadius,
        bottom: viewportY + paddedRadius,
      };

      const labelTextForRect = resolvedLabelTextRef.current;
      const labelWidth = Math.max(
        estimateLabelWidth(labelTextForRect),
        FOCUSED_LABEL_FALLBACK_MIN_WIDTH,
      );
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
      const actualLabelRect = getActualFocusedLabelRect({
        container,
        viewportX,
        viewportY,
        labelText: labelTextForRect,
      });
      const union = unionPromptAvoidRects(
        actualLabelRect
          ? [pointRect, actualLabelRect]
          : [pointRect, estimatedLabelRect],
      );

      return {
        rects: union ? [union] : [pointRect],
        hasActualLabelRect: actualLabelRect != null,
      };
    };

    const applyRect = () => {
      const { rects: next } = computeAvoidanceGeometry();
      setAvoidRects((current) => (rectsEqual(current, next) ? current : next));
    };

    const clearScheduledWork = () => {
      if (motionRaf != null) {
        cancelAnimationFrame(motionRaf);
        motionRaf = null;
      }
      if (settleRafOne != null) {
        cancelAnimationFrame(settleRafOne);
        settleRafOne = null;
      }
      if (settleRafTwo != null) {
        cancelAnimationFrame(settleRafTwo);
        settleRafTwo = null;
      }
      if (labelVerificationRaf != null) {
        cancelAnimationFrame(labelVerificationRaf);
        labelVerificationRaf = null;
      }
    };

    const clearVerificationWindow = () => {
      if (labelVerificationRaf != null) {
        cancelAnimationFrame(labelVerificationRaf);
        labelVerificationRaf = null;
      }
      if (labelMutationObserver) {
        labelMutationObserver.disconnect();
        labelMutationObserver = null;
      }
    };

    const scheduleSettledApply = () => {
      clearScheduledWork();
      settleRafOne = requestAnimationFrame(() => {
        settleRafTwo = requestAnimationFrame(() => {
          applyRect();
        });
      });
    };

    const finalizeFocusPlacement = () => {
      if (disposed || sessionSettled) {
        return;
      }

      sessionSettled = true;
      scheduleSettledApply();
    };

    const sampleLabelVerification = () => {
      if (sessionSettled) {
        return;
      }

      const now = performance.now();
      const { hasActualLabelRect } = computeAvoidanceGeometry();
      const quietFor = now - lastLabelMutationAt;
      const verificationElapsed = now - labelVerificationStartedAt;

      if (
        (hasActualLabelRect && quietFor >= FOCUSED_LABEL_QUIET_MS) ||
        verificationElapsed >= FOCUSED_LABEL_SETTLE_TIMEOUT_MS
      ) {
        clearVerificationWindow();
        finalizeFocusPlacement();
        return;
      }

      labelVerificationRaf = requestAnimationFrame(sampleLabelVerification);
    };

    const startLabelVerificationWindow = () => {
      if (disposed || sessionSettled) {
        return;
      }

      clearVerificationWindow();
      labelVerificationStartedAt = performance.now();
      lastLabelMutationAt = labelVerificationStartedAt;

      const labelsContainer = getLabelsContainer();
      if (labelsContainer instanceof Node) {
        labelMutationObserver = new MutationObserver(() => {
          lastLabelMutationAt = performance.now();
        });
        labelMutationObserver.observe(labelsContainer, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      labelVerificationRaf = requestAnimationFrame(sampleLabelVerification);
    };

    const queueMotionSample = () => {
      if (motionRaf != null || disposed) {
        return;
      }

      motionRaf = requestAnimationFrame(sampleMotion);
    };

    const startMotionTracking = () => {
      clearScheduledWork();
      clearVerificationWindow();
      sessionSettled = false;
      sawGeometryMotion = false;
      lastMotionAt = performance.now();
      motionDetectionStartedAt = lastMotionAt;
      lastScreenPosition = null;
      queueMotionSample();
    };

    const sampleMotion = () => {
      motionRaf = null;

      if (disposed || sessionSettled) {
        return;
      }

      const now = performance.now();
      const geometry = getScreenGeometry();

      if (geometry) {
        const next = {
          x: geometry.viewportX,
          y: geometry.viewportY,
        };

        if (lastScreenPosition) {
          const movement = Math.hypot(
            next.x - lastScreenPosition.x,
            next.y - lastScreenPosition.y,
          );
          if (movement > FOCUSED_MOTION_EPSILON_PX) {
            sawGeometryMotion = true;
            lastMotionAt = now;
          }
        }

        lastScreenPosition = next;
      }

      const motionDetectionElapsed = now - motionDetectionStartedAt;
      const quietFor = now - lastMotionAt;
      const motionSettled =
        sawGeometryMotion && quietFor >= FOCUSED_MOTION_IDLE_MS;
      const noMotionDetected =
        !sawGeometryMotion &&
        motionDetectionElapsed >= FOCUSED_MOTION_DETECTION_MS;

      if (motionSettled || noMotionDetected) {
        startLabelVerificationWindow();
        return;
      }

      queueMotionSample();
    };

    const handleResize = () => {
      if (disposed) {
        return;
      }

      startLabelVerificationWindow();
    };

    if (focusChanged) {
      startMotionTracking();
    } else if (cameraSettledChanged) {
      startLabelVerificationWindow();
    } else {
      applyRect();
    }

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      clearScheduledWork();
      clearVerificationWindow();
      window.removeEventListener("resize", handleResize);
    };
  }, [
    cameraSettledRevision,
    cosmograph,
    enabled,
    focusedPointIndex,
    focusSessionRevision,
  ]);

  return avoidRects;
}
