"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, useDragControls, useMotionValue } from "framer-motion";
import { smooth } from "@/lib/motion";
import { useDashboardStore, type PromptMode } from "@/features/graph/stores";
import {
  BOTTOM_BASE,
  WRITE_TOP_CLEARANCE,
  WRITE_TOP_BASE,
  MAX_CARD_W,
  MIN_CARD_W_CREATE,
  PILL_H,
} from "./constants";
import type { PromptAvoidRect } from "./avoidance";
import {
  resolveCollapsedTarget,
  resolveNormalTarget,
  type LayoutClearances,
} from "./prompt-layout";

export function usePromptPosition({
  isCreate,
  promptMode,
  panelsVisible,
  bottomClearance,
  leftClearance,
  rightClearance,
  leftPanelBottom,
  rightPanelBottom,
  avoidRects,
  vw,
  vh,
  cardRef,
}: {
  isCreate: boolean;
  promptMode: PromptMode;
  panelsVisible: boolean;
  bottomClearance: number;
  leftClearance: number;
  rightClearance: number;
  leftPanelBottom: number;
  rightPanelBottom: number;
  avoidRects?: PromptAvoidRect[];
  vw: number;
  vh: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isDragging = useRef(false);
  const userDragX = useRef(0);
  const userDragY = useRef(0);
  const autoTargetXRef = useRef(0);
  const autoTargetYRef = useRef(0);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const cardHeightRef = useRef(100);

  const cardHeight = useMotionValue(0);
  const [heightOverride, setHeightOverride] = useState(false);
  const [isShellTransitioning, setIsShellTransitioning] = useState(false);
  const setPromptShellFullHeight = useDashboardStore((s) => s.setPromptShellFullHeight);

  const layoutMode =
    promptMode === "collapsed"
      ? "collapsed"
      : promptMode === "maximized"
        ? (isCreate ? "create" : "maximized")
        : "normal";
  const isFullHeightMode = layoutMode === "create" || layoutMode === "maximized";

  const [isOffset, setIsOffset] = useState(false);

  const targetY = Math.min(0, BOTTOM_BASE - bottomClearance);
  const clearances: LayoutClearances = useMemo(
    () => ({ leftClearance, rightClearance, leftPanelBottom, rightPanelBottom }),
    [leftClearance, rightClearance, leftPanelBottom, rightPanelBottom],
  );

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
      setPromptShellFullHeight(false);
    };
  }, [setPromptShellFullHeight]);
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
      setPromptShellFullHeight(true);

      const targetX = layoutMode === "create"
        ? 24 + leftClearance + Math.min(MAX_CARD_W, Math.max(MIN_CARD_W_CREATE, vw * 0.5)) / 2 - vw / 2
        : (leftClearance - rightClearance) / 2;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, 24);

      if (!fullHeightEnteredRef.current) {
        cardHeight.set(cardRef.current?.offsetHeight ?? 60);
        setHeightOverride(true);
        fullHeightEnteredRef.current = true;
      }

      pendingExitRef.current = null;
      autoTargetXRef.current = targetX;
      autoTargetYRef.current = targetY;
      userDragX.current = 0;
      userDragY.current = targetY;
      setIsOffset(false);
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
      setPromptShellFullHeight(true);
      setHeightOverride(false);
      userDragX.current = 0;
      userDragY.current = 0;
      setIsOffset(false);
      return;
    }

    if (modeChanged) {
      cancelAnimations();
      setHeightOverride(false);
      userDragX.current = 0;
      userDragY.current = 0;
      setIsOffset(false);
      setIsShellTransitioning(false);
      setPromptShellFullHeight(false);
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
    leftClearance,
    panelsVisible,
    rightClearance,
    startHeightAnim,
    setPromptShellFullHeight,
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
    const targetH = measuredH ?? (pendingExit.targetMode === "collapsed" ? PILL_H : 100);
    const targetPosition =
      pendingExit.targetMode === "collapsed"
        ? resolveCollapsedTarget(vw, targetY)
        : resolveNormalTarget(vw, vh, targetY, targetH, clearances, avoidRects);

    cancelAnimations();
    cardHeight.set(pendingExit.fromHeight);
    setHeightOverride(true);
    autoTargetXRef.current = targetPosition.x;
    autoTargetYRef.current = targetPosition.y;
    posAnim.current.x = animate(dragX, targetPosition.x, smooth);
    posAnim.current.y = animate(dragY, targetPosition.y, smooth);
    startHeightAnim(targetH, () => {
      if (!mountedRef.current) return;
      setHeightOverride(false);
      setIsShellTransitioning(false);
      setPromptShellFullHeight(false);
    });
  }, [
    avoidRects,
    cancelAnimations,
    cardHeight,
    cardRef,
    clearances,
    dragX,
    dragY,
    heightOverride,
    startHeightAnim,
    setPromptShellFullHeight,
    targetY,
    vh,
    vw,
  ]);

  // Effect 3: Normal/collapsed positioning + obstacle avoidance
  useEffect(() => {
    if (vw === 0 || isFullHeightMode || isShellTransitioning) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();

    if (layoutMode === "collapsed") {
      const target = resolveCollapsedTarget(vw, targetY);
      autoTargetXRef.current = target.x;
      autoTargetYRef.current = target.y;
      posAnim.current.x = animate(dragX, userDragX.current || target.x, smooth);
      posAnim.current.y = animate(dragY, Math.min(userDragY.current || target.y, targetY), smooth);
    } else {
      const cardH = cardRef.current?.offsetHeight ?? cardHeightRef.current;
      const target = resolveNormalTarget(vw, vh, targetY, cardH, clearances, avoidRects);

      if (autoTargetXRef.current !== target.x) {
        userDragX.current = 0;
        setIsOffset(userDragY.current !== 0);
      }
      if (autoTargetYRef.current !== target.y) {
        userDragY.current = 0;
        setIsOffset(userDragX.current !== 0);
      }

      autoTargetXRef.current = target.x;
      autoTargetYRef.current = target.y;
      posAnim.current.x = animate(dragX, userDragX.current || target.x, smooth);
      posAnim.current.y = animate(
        dragY,
        userDragY.current !== 0 ? Math.min(userDragY.current, targetY) : target.y,
        smooth,
      );
    }

    const currentPosAnim = posAnim.current;
    return () => {
      currentPosAnim.x?.stop();
      currentPosAnim.y?.stop();
    };
  }, [
    avoidRects,
    cardRef,
    clearances,
    dragX,
    dragY,
    isFullHeightMode,
    isShellTransitioning,
    layoutMode,
    targetY,
    vh,
    vw,
  ]);

  return {
    isDragging,
    userDragX,
    userDragY,
    autoTargetXRef,
    autoTargetYRef,
    dragControls,
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    isFullHeightMode,
    isOffset,
    setIsOffset,
    targetY,
  };
}
