"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useDragControls, useMotionValue } from "framer-motion";
import { smooth } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";

interface UseFloatingPanelOptions {
  id: string;
  side: "left" | "right";
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
}

export function useFloatingPanel({
  id,
  side,
  defaultWidth,
  minWidth = 280,
  maxWidth = 800,
}: UseFloatingPanelOptions) {
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [width, setWidth] = useState(defaultWidth);
  const [isDocked, setIsDocked] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const setFloatingObstacle = useDashboardStore((s) => s.setFloatingObstacle);
  const clearFloatingObstacle = useDashboardStore((s) => s.clearFloatingObstacle);

  useEffect(() => {
    if (!isDocked) return;
    setWidth((currentWidth) => (
      currentWidth === defaultWidth ? currentWidth : defaultWidth
    ));
  }, [defaultWidth, isDocked]);

  // Report rect to store after drag/resize
  const reportRect = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFloatingObstacle(id, {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, [id, setFloatingObstacle]);

  // Clear obstacle on unmount or dock
  useEffect(() => {
    return () => {
      clearFloatingObstacle(id);
    };
  }, [id, clearFloatingObstacle]);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragControls.start(e);
      setIsDocked(false);
    },
    [dragControls],
  );

  const onDragEnd = useCallback(() => {
    reportRect();
  }, [reportRect]);

  const onTitleDoubleClick = useCallback(() => {
    animate(dragX, 0, smooth);
    animate(dragY, 0, smooth);
    setIsDocked(true);
    clearFloatingObstacle(id);
  }, [dragX, dragY, id, clearFloatingObstacle]);

  // Horizontal resize via mouse events
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMove = (ev: MouseEvent) => {
        const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + delta)));
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        reportRect();
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, side, minWidth, maxWidth, reportRect],
  );

  return {
    panelRef,
    dragControls,
    dragX,
    dragY,
    width,
    isDocked,
    onTitlePointerDown,
    onTitleDoubleClick,
    onDragEnd,
    onResizeMouseDown,
  };
}
