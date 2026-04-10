"use client";

import { useEffect, useRef, useState } from "react";
import { useGraphInstance } from "@/features/graph/cosmograph";
import type { PromptAvoidRect } from "./avoidance";
import {
  createFocusedAvoidanceFsm,
  getFocusedPointText,
} from "./focused-avoidance-fsm";

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

    const fsm = createFocusedAvoidanceFsm({
      cosmograph,
      focusedPointIndex,
      getLabelText: () => resolvedLabelTextRef.current,
      onRectsChanged: setAvoidRects,
    });

    const trigger = focusChanged
      ? "focus-changed"
      : cameraSettledChanged
        ? "camera-settled"
        : "steady";
    fsm.start(trigger);

    const handleResize = () => fsm.handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      fsm.dispose();
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
