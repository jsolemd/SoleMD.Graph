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
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function useFloatingPanel({
  id,
  side,
  defaultWidth,
  minWidth = 280,
  maxWidth = 800,
  defaultHeight,
  minHeight = 200,
  maxHeight: maxHeightOpt,
}: UseFloatingPanelOptions) {
  // Restore remembered position if available
  const savedPosition = useDashboardStore((s) => s.panelPositions[id]);
  const savePanelPosition = useDashboardStore((s) => s.savePanelPosition);

  const dragControls = useDragControls();
  const dragX = useMotionValue(savedPosition && !savedPosition.docked ? savedPosition.x : 0);
  const dragY = useMotionValue(savedPosition && !savedPosition.docked ? savedPosition.y : 0);
  const [width, setWidth] = useState(savedPosition?.width ?? defaultWidth);
  const [height, setHeight] = useState<number | undefined>(savedPosition?.height ?? defaultHeight);
  const [isDocked, setIsDocked] = useState(savedPosition ? savedPosition.docked : true);
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;
  const resizeFrameRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const setFloatingObstacle = useDashboardStore((s) => s.setFloatingObstacle);
  const clearFloatingObstacle = useDashboardStore((s) => s.clearFloatingObstacle);

  useEffect(() => {
    if (!isDocked) return;
    setWidth((currentWidth) => (
      currentWidth === defaultWidth ? currentWidth : defaultWidth
    ));
  }, [defaultWidth, isDocked]);

  const flushPendingSize = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }

    const nextWidth = pendingWidthRef.current;
    const nextHeight = pendingHeightRef.current;
    pendingWidthRef.current = null;
    pendingHeightRef.current = null;

    if (nextWidth !== null) {
      setWidth(nextWidth);
    }
    if (nextHeight !== null) {
      setHeight(nextHeight);
    }
  }, []);

  const clearPendingSize = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
    pendingWidthRef.current = null;
    pendingHeightRef.current = null;
  }, []);

  const scheduleSizeUpdate = useCallback((nextWidth: number | null, nextHeight: number | null) => {
    pendingWidthRef.current = nextWidth;
    pendingHeightRef.current = nextHeight;

    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const widthToApply = pendingWidthRef.current;
      const heightToApply = pendingHeightRef.current;
      pendingWidthRef.current = null;
      pendingHeightRef.current = null;

      if (widthToApply !== null) {
        setWidth(widthToApply);
      }
      if (heightToApply !== null) {
        setHeight(heightToApply);
      }
    });
  }, []);

  // Persist position for close/reopen — uses refs for current size
  const persistPosition = useCallback(() => {
    savePanelPosition(id, {
      x: dragX.get(),
      y: dragY.get(),
      width: widthRef.current,
      height: heightRef.current,
      docked: false,
    });
  }, [id, savePanelPosition, dragX, dragY]);

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

  // Restore floating obstacle for undocked panels on mount
  useEffect(() => {
    if (!isDocked) {
      requestAnimationFrame(reportRect);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  // Clear obstacle on unmount or dock
  useEffect(() => {
    return () => {
      clearPendingSize();
      clearFloatingObstacle(id);
    };
  }, [id, clearFloatingObstacle, clearPendingSize]);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragControls.start(e);
      setIsDocked(false);
    },
    [dragControls],
  );

  const onDragEnd = useCallback(() => {
    reportRect();
    persistPosition();
  }, [reportRect, persistPosition]);

  const onTitleDoubleClick = useCallback(() => {
    animate(dragX, 0, smooth);
    animate(dragY, 0, smooth);
    setIsDocked(true);
    clearFloatingObstacle(id);
    savePanelPosition(id, { x: 0, y: 0, width, height, docked: true });
  }, [dragX, dragY, id, clearFloatingObstacle, savePanelPosition, width, height]);

  // Horizontal resize via mouse events
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMove = (ev: MouseEvent) => {
        const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        scheduleSizeUpdate(
          Math.max(minWidth, Math.min(maxWidth, startWidth + delta)),
          null,
        );
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        flushPendingSize();
        requestAnimationFrame(() => { reportRect(); persistPosition(); });
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, side, minWidth, maxWidth, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  // Vertical resize via mouse events
  const onResizeVerticalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const maxH = maxHeightOpt ?? window.innerHeight - 120;

      const handleMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY;
        scheduleSizeUpdate(
          null,
          Math.max(minHeight, Math.min(maxH, startHeight + delta)),
        );
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        flushPendingSize();
        requestAnimationFrame(() => { reportRect(); persistPosition(); });
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [height, minHeight, maxHeightOpt, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  // Corner resize (both dimensions)
  const onResizeCornerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = width;
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const maxH = maxHeightOpt ?? window.innerHeight - 120;

      const handleMove = (ev: MouseEvent) => {
        const dx = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        const dy = ev.clientY - startY;
        scheduleSizeUpdate(
          Math.max(minWidth, Math.min(maxWidth, startWidth + dx)),
          Math.max(minHeight, Math.min(maxH, startHeight + dy)),
        );
      };

      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        flushPendingSize();
        requestAnimationFrame(() => { reportRect(); persistPosition(); });
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [
      width,
      height,
      side,
      minWidth,
      maxWidth,
      minHeight,
      maxHeightOpt,
      reportRect,
      persistPosition,
      scheduleSizeUpdate,
      flushPendingSize,
    ],
  );

  return {
    panelRef,
    dragControls,
    dragX,
    dragY,
    width,
    height,
    isDocked,
    onTitlePointerDown,
    onTitleDoubleClick,
    onDragEnd,
    onResizeMouseDown,
    onResizeVerticalMouseDown,
    onResizeCornerMouseDown,
  };
}
