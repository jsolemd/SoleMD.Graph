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
  /** When set, animate dragX to this value while docked (used for centering). */
  anchorXOffset?: number;
  /** When set, animate dragY to this value while docked (used for expanded panel positioning). */
  anchorYOffset?: number;
  /** Bottom clearance in px — used as resize ceiling when docked. */
  bottomClearance?: number;
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
  anchorXOffset,
  anchorYOffset,
  bottomClearance = 0,
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
  const isPinned = savedPosition?.pinned ?? false;
  const setFloatingObstacle = useDashboardStore((s) => s.setFloatingObstacle);
  const clearFloatingObstacle = useDashboardStore((s) => s.clearFloatingObstacle);

  useEffect(() => {
    if (!isDocked || isPinned) return;
    setWidth((currentWidth) => (
      currentWidth === defaultWidth ? currentWidth : defaultWidth
    ));
  }, [defaultWidth, isDocked, isPinned]);

  useEffect(() => {
    if (!isDocked || isPinned || defaultHeight === undefined) return;
    setHeight((currentHeight) => (
      currentHeight === defaultHeight ? currentHeight : defaultHeight
    ));
  }, [defaultHeight, isDocked, isPinned]);

  // Animate to anchor offset when docked (e.g. centering expanded wiki panel)
  const prevAnchorXRef = useRef(anchorXOffset);
  const prevAnchorYRef = useRef(anchorYOffset);
  useEffect(() => {
    const prevX = prevAnchorXRef.current;
    const prevY = prevAnchorYRef.current;
    prevAnchorXRef.current = anchorXOffset;
    prevAnchorYRef.current = anchorYOffset;
    if (!isDocked || isPinned) return;
    if (anchorXOffset !== undefined) {
      animate(dragX, anchorXOffset, smooth);
    } else if (prevX !== undefined) {
      animate(dragX, 0, smooth);
    }
    if (anchorYOffset !== undefined) {
      animate(dragY, anchorYOffset, smooth);
    } else if (prevY !== undefined) {
      animate(dragY, 0, smooth);
    }
  }, [anchorXOffset, anchorYOffset, isDocked, isPinned, dragX, dragY]);

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
      if (isPinned) return;
      dragControls.start(e);
      setIsDocked(false);
    },
    [dragControls, isPinned],
  );

  const onDragEnd = useCallback(() => {
    reportRect();
    persistPosition();
  }, [reportRect, persistPosition]);

  const onTitleDoubleClick = useCallback(() => {
    if (isPinned) return;
    animate(dragX, 0, smooth);
    animate(dragY, 0, smooth);
    setIsDocked(true);
    clearFloatingObstacle(id);
    savePanelPosition(id, { x: 0, y: 0, width, height, docked: true });
  }, [dragX, dragY, id, clearFloatingObstacle, savePanelPosition, width, height, isPinned]);

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
      const dockedMax = window.innerHeight - 116 - bottomClearance - 12;
      const maxH = maxHeightOpt ?? (isDocked ? dockedMax : window.innerHeight - 120);

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
    [height, minHeight, maxHeightOpt, isDocked, bottomClearance, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
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
      const dockedMaxH = window.innerHeight - 116 - bottomClearance - 12;
      const maxH = maxHeightOpt ?? (isDocked ? dockedMaxH : window.innerHeight - 120);

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
      isDocked,
      bottomClearance,
      reportRect,
      persistPosition,
      scheduleSizeUpdate,
      flushPendingSize,
    ],
  );

  // Left-edge resize: inverted delta, compensates dragX so right edge stays fixed
  const onResizeLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const startDragX = dragX.get();

      const handleMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        const actualDelta = newWidth - startWidth;
        scheduleSizeUpdate(newWidth, null);
        dragX.set(startDragX - actualDelta);
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
    [width, minWidth, maxWidth, dragX, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  // Bottom-left corner resize: left-edge width + vertical height
  const onResizeCornerLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = width;
      const startDragX = dragX.get();
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const dockedMaxH = window.innerHeight - 116 - bottomClearance - 12;
      const maxH = maxHeightOpt ?? (isDocked ? dockedMaxH : window.innerHeight - 120);

      const handleMove = (ev: MouseEvent) => {
        const dx = startX - ev.clientX;
        const dy = ev.clientY - startY;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
        const actualDx = newWidth - startWidth;
        scheduleSizeUpdate(newWidth, Math.max(minHeight, Math.min(maxH, startHeight + dy)));
        dragX.set(startDragX - actualDx);
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
    [width, height, minWidth, maxWidth, minHeight, maxHeightOpt, isDocked, bottomClearance, dragX, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  return {
    panelRef,
    dragControls,
    dragX,
    dragY,
    width,
    height,
    isDocked,
    isPinned,
    onTitlePointerDown,
    onTitleDoubleClick,
    onDragEnd,
    onResizeMouseDown,
    onResizeVerticalMouseDown,
    onResizeCornerMouseDown,
    onResizeLeftMouseDown,
    onResizeCornerLeftMouseDown,
  };
}
