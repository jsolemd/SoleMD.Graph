"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useDragControls, useMotionValue } from "framer-motion";
import { smooth } from "@/lib/motion";
import {
  BOTTOM_BASE,
  VIEWPORT_MARGIN,
  WRITE_TOP_CLEARANCE,
  WRITE_TOP_BASE,
  MAX_CARD_W,
  MIN_CARD_W_CREATE,
  PILL_H,
  PILL_LEFT,
  cardWidth,
} from "./constants";

export function usePromptPosition({
  isCreate,
  isCollapsed,
  promptMaximized,
  panelsVisible,
  bottomClearance,
  leftClearance,
  rightClearance,
  leftPanelBottom,
  rightPanelBottom,
  vw,
  vh,
  cardRef,
}: {
  isCreate: boolean;
  isCollapsed: boolean;
  promptMaximized: boolean;
  panelsVisible: boolean;
  bottomClearance: number;
  leftClearance: number;
  rightClearance: number;
  leftPanelBottom: number;
  rightPanelBottom: number;
  vw: number;
  vh: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isDragging = useRef(false);
  const userDragX = useRef(0);
  const userDragY = useRef(0);
  const autoTargetXRef = useRef(0);
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  // Animated card height for full-height modes.
  const cardHeight = useMotionValue(0);
  const [heightOverride, setHeightOverride] = useState(false);

  const isFullHeightMode = isCreate || promptMaximized;
  const isFullHeight = isFullHeightMode || heightOverride;

  const [isOffset, setIsOffset] = useState(false);

  const targetY = Math.min(0, BOTTOM_BASE - bottomClearance);

  // Unified positioning — clear precedence: write > collapsed > obstacle avoidance.
  const posAnim = useRef<{ x?: ReturnType<typeof animate>; y?: ReturnType<typeof animate>; h?: ReturnType<typeof animate> }>({});
  const fullHeightEnteredRef = useRef(false);
  const heightAnimatingRef = useRef(false);
  const heightGenRef = useRef(0);
  const pendingFlipRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const prevPosMode = useRef<"create" | "maximized" | "collapsed" | "normal">("normal");

  const startHeightAnim = useCallback((target: number, onDone?: () => void) => {
    const gen = ++heightGenRef.current;
    heightAnimatingRef.current = true;
    posAnim.current.h = animate(cardHeight, target, smooth);
    posAnim.current.h.then(() => {
      if (gen !== heightGenRef.current) return;
      heightAnimatingRef.current = false;
      onDone?.();
    });
  }, [cardHeight]);

  useEffect(() => {
    if (vw === 0) return;

    posAnim.current.x?.stop();
    posAnim.current.y?.stop();
    if (!heightAnimatingRef.current) posAnim.current.h?.stop();

    const posMode = isCollapsed ? "collapsed" : isCreate ? "create" : promptMaximized ? "maximized" : "normal";
    const modeChanged = prevPosMode.current !== posMode;
    prevPosMode.current = posMode;
    if (posMode === "create" || posMode === "maximized") {
      const targetX = posMode === "create"
        ? 24 + leftClearance + Math.min(MAX_CARD_W, Math.max(MIN_CARD_W_CREATE, vw * 0.5)) / 2 - vw / 2
        : (leftClearance - rightClearance) / 2;
      const topClearance = panelsVisible ? WRITE_TOP_CLEARANCE : WRITE_TOP_BASE;
      const targetH = vh - topClearance - Math.max(bottomClearance, 24);

      heightGenRef.current++;
      heightAnimatingRef.current = false;

      if (!fullHeightEnteredRef.current) {
        cardHeight.set(cardRef.current?.offsetHeight ?? 60);
        setHeightOverride(true);
        fullHeightEnteredRef.current = true;
      }
      autoTargetXRef.current = targetX;
      posAnim.current.x = animate(dragX, targetX, smooth);
      posAnim.current.y = animate(dragY, targetY, smooth);
      posAnim.current.h = animate(cardHeight, targetH, smooth);
      userDragY.current = targetY;
    } else {
      pendingFlipRef.current = null;

      if (fullHeightEnteredRef.current) {
        if (posMode === "collapsed") {
          startHeightAnim(PILL_H, () => {
            if (!mountedRef.current) return;
            setHeightOverride(false);
            fullHeightEnteredRef.current = false;
          });
        } else {
          pendingFlipRef.current = cardHeight.get();
          setHeightOverride(false);
        }
      }

      if (posMode === "collapsed") {
        const targetX = PILL_LEFT - vw / 2;
        autoTargetXRef.current = targetX;
        if (modeChanged) { userDragX.current = targetX; userDragY.current = targetY; }
        posAnim.current.x = animate(dragX, userDragX.current || targetX, smooth);
        posAnim.current.y = animate(dragY, Math.min(userDragY.current, targetY), smooth);
      } else {
        const cardW = cardWidth(vw, leftClearance, rightClearance);
        const cardH = cardRef.current?.offsetHeight ?? 100;
        const promptTop = vh - BOTTOM_BASE - cardH + targetY;
        const centeredLeft = vw / 2 - cardW / 2;
        const centeredRight = centeredLeft + cardW;
        let minX = VIEWPORT_MARGIN - centeredLeft;
        let maxX = (vw - VIEWPORT_MARGIN) - centeredRight;

        if (leftClearance > 0 && leftPanelBottom > promptTop && centeredLeft < leftClearance) {
          minX = leftClearance - centeredLeft;
        }
        if (rightClearance > 0 && rightPanelBottom > promptTop && centeredRight > vw - rightClearance) {
          maxX = (vw - rightClearance) - centeredRight;
        }

        const targetX = minX <= maxX
          ? Math.max(minX, Math.min(0, maxX))
          : Math.max(Math.min(0, minX), maxX);

        if (modeChanged) { userDragX.current = 0; userDragY.current = 0; }
        if (autoTargetXRef.current !== targetX) {
          userDragX.current = 0;
          setIsOffset(userDragY.current !== 0);
        }
        autoTargetXRef.current = targetX;
        posAnim.current.x = animate(dragX, userDragX.current || targetX, smooth);
        const target = Math.min(userDragY.current, targetY);
        posAnim.current.y = animate(dragY, target, smooth);
      }
    }

    return () => {
      posAnim.current.x?.stop();
      posAnim.current.y?.stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!heightAnimatingRef.current) posAnim.current.h?.stop();
    };
  }, [isCreate, isCollapsed, promptMaximized, panelsVisible, bottomClearance, leftClearance, rightClearance, leftPanelBottom, rightPanelBottom, targetY, vw, vh, dragX, dragY, cardHeight, startHeightAnim, cardRef]);

  // FLIP measurement
  useLayoutEffect(() => {
    const fromH = pendingFlipRef.current;
    if (fromH === null) return;
    pendingFlipRef.current = null;

    const toH = cardRef.current?.offsetHeight ?? fromH;
    cardHeight.set(fromH);
    setHeightOverride(true);

    startHeightAnim(toH, () => {
      if (!mountedRef.current) return;
      setHeightOverride(false);
      fullHeightEnteredRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and motion values are stable
  }, [heightOverride]);

  return {
    isDragging,
    userDragX,
    userDragY,
    autoTargetXRef,
    dragControls,
    dragX,
    dragY,
    cardHeight,
    heightOverride,
    setHeightOverride,
    isFullHeightMode,
    isFullHeight,
    isOffset,
    setIsOffset,
    targetY,
    pendingFlipRef,
    fullHeightEnteredRef,
    heightAnimatingRef,
  };
}
