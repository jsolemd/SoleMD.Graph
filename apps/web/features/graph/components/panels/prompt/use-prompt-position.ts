"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue } from "framer-motion";
import { densityViewportWidth } from "@/lib/density";
import { smooth } from "@/lib/motion";
import { type PromptMode } from "@/features/graph/stores";
import {
  BOTTOM_BASE,
  CREATE_CARD_RATIO,
  WRITE_TOP_CLEARANCE,
  WRITE_TOP_BASE,
  PILL_H,
  PROMPT_CREATE_SIDE_INSET,
  PROMPT_FALLBACK_NORMAL_HEIGHT,
  PROMPT_MIN_BOTTOM_CLEARANCE,
} from "./constants";
import type { PromptAvoidRect } from "./avoidance";
import {
  resolveCollapsedTarget,
  resolveNormalTarget,
} from "./prompt-layout";

export function usePromptPosition({
  isCreate,
  normalCardWidth,
  promptMode,
  panelsVisible,
  bottomClearance,
  avoidRects,
  vw,
  vh,
  cardRef,
}: {
  isCreate: boolean;
  normalCardWidth: number;
  promptMode: PromptMode;
  panelsVisible: boolean;
  bottomClearance: number;
  avoidRects?: PromptAvoidRect[];
  vw: number;
  vh: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const cardHeightRef = useRef(100);

  const cardHeight = useMotionValue(0);
  const [heightOverride, setHeightOverride] = useState(false);
  const [isShellTransitioning, setIsShellTransitioning] = useState(false);

  const layoutMode =
    promptMode === "collapsed"
      ? "collapsed"
      : promptMode === "maximized"
        ? (isCreate ? "create" : "maximized")
        : "normal";
  const isFullHeightMode = layoutMode === "create" || layoutMode === "maximized";

  const targetY = Math.min(0, BOTTOM_BASE - bottomClearance);

  const posAnim = useRef<{ x?: ReturnType<typeof animate>; y?: ReturnType<typeof animate>; h?: ReturnType<typeof animate> }>({});
  const fullHeightEnteredRef = useRef(false);
  const heightAnimatingRef = useRef(false);
  const heightGenRef = useRef(0);
  const pendingExitRef = useRef<{ fromHeight: number; targetMode: "collapsed" | "normal" } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const prevLayoutModeRef = useRef<"create" | "maximized" | "collapsed" | "normal">(layoutMode);

  const startHeightAnim = useCallback((target: number, onDone?: () => void) => {
    const gen = ++heightGenRef.current;
    heightAnimatingRef.current = true;
    posAnim.current.h?.stop();
    posAnim.current.h = animate(cardHeight, target, smooth);
    posAnim.current.h.then(() => {
      if (gen !== heightGenRef.current) return;
      heightAnimatingRef.current = false;
      onDone?.();
    });
  }, [cardHeight]);

  const cancelAnimations = useCallback(() => {
    posAnim.current.x?.stop();
    posAnim.current.y?.stop();
    posAnim.current.h?.stop();
    heightGenRef.current += 1;
    heightAnimatingRef.current = false;
  }, []);

  // Effect 1: Full-height mode transitions (create/maximized enter/exit)
  useEffect(() => {
    if (vw === 0) return;

    const previousLayoutMode = prevLayoutModeRef.current;
    const modeChanged = previousLayoutMode !== layoutMode;
    prevLayoutModeRef.current = layoutMode;

    if (layoutMode === "create" || layoutMode === "maximized") {
      cancelAnimations();
      setIsShellTransitioning(true);

      const targetX = layoutMode === "create"
        ? PROMPT_CREATE_SIDE_INSET
          + densityViewportWidth(vw, CREATE_CARD_RATIO, { minBase: 530, maxBase: 560 }) / 2
          - vw / 2
        : 0;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, PROMPT_MIN_BOTTOM_CLEARANCE);

      if (!fullHeightEnteredRef.current) {
        cardHeight.set(cardRef.current?.offsetHeight ?? 60);
        setHeightOverride(true);
        fullHeightEnteredRef.current = true;
      }

      pendingExitRef.current = null;
      posAnim.current.x = animate(dragX, targetX, smooth);
      posAnim.current.y = animate(dragY, targetY, smooth);
      startHeightAnim(targetH, () => {
        if (!mountedRef.current) return;
        setIsShellTransitioning(false);
      });
      return () => { cancelAnimations(); };
    }

    if ((previousLayoutMode === "create" || previousLayoutMode === "maximized") && modeChanged) {
      pendingExitRef.current = {
        fromHeight: cardRef.current?.offsetHeight ?? cardHeight.get() ?? 60,
        targetMode: layoutMode === "collapsed" ? "collapsed" : "normal",
      };
      fullHeightEnteredRef.current = false;
      setIsShellTransitioning(true);
      setHeightOverride(false);
      return;
    }

    if (modeChanged) {
      cancelAnimations();
      setHeightOverride(false);
      setIsShellTransitioning(false);
    }
  }, [
    bottomClearance,
    cancelAnimations,
    cardHeight,
    cardRef,
    dragX,
    dragY,
    isCreate,
    layoutMode,
    panelsVisible,
    startHeightAnim,
    targetY,
    vh,
    vw,
  ]);

  // Effect 2: Pending exit animation (layout effect for synchronous measurement)
  useLayoutEffect(() => {
    const pendingExit = pendingExitRef.current;
    if (!pendingExit || heightOverride || vw === 0) return;

    pendingExitRef.current = null;

    const measuredH = cardRef.current?.offsetHeight;
    if (measuredH != null) cardHeightRef.current = measuredH;
    const targetH = measuredH ?? (
      pendingExit.targetMode === "collapsed"
        ? PILL_H
        : PROMPT_FALLBACK_NORMAL_HEIGHT
    );
    const targetPosition =
      pendingExit.targetMode === "collapsed"
        ? resolveCollapsedTarget(vw, targetY)
        : resolveNormalTarget(vw, vh, targetY, normalCardWidth, targetH, avoidRects);

    cancelAnimations();
    cardHeight.set(pendingExit.fromHeight);
    setHeightOverride(true);
    posAnim.current.x = animate(dragX, targetPosition.x, smooth);
    posAnim.current.y = animate(dragY, targetPosition.y, smooth);
    startHeightAnim(targetH, () => {
      if (!mountedRef.current) return;
      setHeightOverride(false);
      setIsShellTransitioning(false);
    });
  }, [
    avoidRects,
    cancelAnimations,
    cardHeight,
    cardRef,
    dragX,
    dragY,
    heightOverride,
    normalCardWidth,
    startHeightAnim,
    targetY,
    vh,
    vw,
  ]);

  // Effect 3: Normal/collapsed positioning + obstacle avoidance
  useEffect(() => {
    if (vw === 0 || isFullHeightMode || isShellTransitioning) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();

    const target = layoutMode === "collapsed"
      ? resolveCollapsedTarget(vw, targetY)
      : resolveNormalTarget(
          vw,
          vh,
          targetY,
          normalCardWidth,
          cardRef.current?.offsetHeight ?? cardHeightRef.current,
          avoidRects,
        );

    posAnim.current.x = animate(dragX, target.x, smooth);
    posAnim.current.y = animate(dragY, target.y, smooth);

    const currentPosAnim = posAnim.current;
    return () => {
      currentPosAnim.x?.stop();
      currentPosAnim.y?.stop();
    };
  }, [
    avoidRects,
    cardRef,
    dragX,
    dragY,
    isFullHeightMode,
    isShellTransitioning,
    layoutMode,
    normalCardWidth,
    targetY,
    vh,
    vw,
  ]);

  return {
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    isFullHeightMode,
  };
}
