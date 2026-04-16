"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, useDragControls, useMotionValue } from "framer-motion";
import { useViewportSize } from "@mantine/hooks";
import { APP_CHROME_PX, densityPx } from "@/lib/density";
import { smooth } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";
import { selectPanelAvailableWidth, selectPanelLeftOffset } from "@/features/graph/stores/dashboard-store";

// Mantine's `useViewportSize` returns {0, 0} on first render and updates after a
// ResizeObserver fires. Fall back to a synchronous `window.inner*` read so
// mount-critical layout math sees the real viewport on frame 1.
export function useResolvedViewport(): { width: number; height: number } {
  const { width, height } = useViewportSize();
  if (width && height) return { width, height };
  if (typeof window !== "undefined") {
    return {
      width: width || window.innerWidth,
      height: height || window.innerHeight,
    };
  }
  return { width: width || 1920, height: height || 900 };
}

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

export interface DragConstraintsRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function useFloatingPanel({
  id,
  side,
  defaultWidth,
  minWidth = densityPx(280),
  maxWidth = densityPx(800),
  defaultHeight,
  minHeight = densityPx(200),
  maxHeight: maxHeightOpt,
  anchorXOffset,
  anchorYOffset,
  bottomClearance = 0,
}: UseFloatingPanelOptions) {
  // Restore remembered position if available
  const savedPosition = useDashboardStore((s) => s.panelPositions[id]);
  const savePanelPosition = useDashboardStore((s) => s.savePanelPosition);

  const { width: viewportWidth, height: viewportHeight } = useResolvedViewport();

  const availableWidth = useDashboardStore(
    (s) => selectPanelAvailableWidth(s, id, viewportWidth),
  );
  const leftOffset = useDashboardStore(
    (s) => selectPanelLeftOffset(s, id, viewportWidth),
  );
  const floatingRect = useDashboardStore((s) => s.floatingObstacles[id]);

  const dragControls = useDragControls();
  const dragX = useMotionValue(savedPosition && !savedPosition.docked ? savedPosition.x : 0);
  const dragY = useMotionValue(savedPosition && !savedPosition.docked ? savedPosition.y : 0);
  // preferredWidth is user intent; rendered width is clamped by availableWidth/maxWidth.
  // `||` on the inner fallback so a sentinel `width: 0` (togglePanelPinned's seed for
  // never-dragged panels) falls through to defaultWidth instead of sticking at 0.
  const [preferredWidth, setPreferredWidth] = useState<number>(
    savedPosition?.preferredWidth ?? (savedPosition?.width || defaultWidth),
  );
  const [height, setHeight] = useState<number | undefined>(savedPosition?.height ?? defaultHeight);
  const [isDocked, setIsDocked] = useState(savedPosition ? savedPosition.docked : true);
  const panelRef = useRef<HTMLDivElement>(null);

  const widthCeiling = Math.max(minWidth, Math.min(maxWidth, availableWidth || maxWidth));
  const width = Math.max(minWidth, Math.min(preferredWidth, widthCeiling));

  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const preferredWidthRef = useRef(preferredWidth);
  widthRef.current = width;
  heightRef.current = height;
  preferredWidthRef.current = preferredWidth;
  const resizeFrameRef = useRef<number | null>(null);
  const pendingPreferredWidthRef = useRef<number | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const isPinned = savedPosition?.pinned ?? false;
  const setFloatingObstacle = useDashboardStore((s) => s.setFloatingObstacle);
  const clearFloatingObstacle = useDashboardStore((s) => s.clearFloatingObstacle);

  useEffect(() => {
    if (!isDocked || isPinned) return;
    setPreferredWidth((current) => (
      current === defaultWidth ? current : defaultWidth
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

    const nextPreferred = pendingPreferredWidthRef.current;
    const nextHeight = pendingHeightRef.current;
    pendingPreferredWidthRef.current = null;
    pendingHeightRef.current = null;

    if (nextPreferred !== null) {
      setPreferredWidth(nextPreferred);
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
    pendingPreferredWidthRef.current = null;
    pendingHeightRef.current = null;
  }, []);

  const scheduleSizeUpdate = useCallback((nextPreferred: number | null, nextHeight: number | null) => {
    pendingPreferredWidthRef.current = nextPreferred;
    pendingHeightRef.current = nextHeight;

    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const preferredToApply = pendingPreferredWidthRef.current;
      const heightToApply = pendingHeightRef.current;
      pendingPreferredWidthRef.current = null;
      pendingHeightRef.current = null;

      if (preferredToApply !== null) {
        setPreferredWidth(preferredToApply);
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
      preferredWidth: preferredWidthRef.current,
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

  // Viewport-safe drag constraints — recomputed from current viewport, width,
  // height, and dock position. Prevents title-drag from pushing the panel
  // off-screen; onDragEnd also re-clamps in case the viewport shrank mid-drag.
  const estimatedHeight = height ?? floatingRect?.height ?? 400;
  const dragConstraints = useMemo<DragConstraintsRect>(() => {
    const edgeMargin = APP_CHROME_PX.edgeMargin;
    const panelTop = APP_CHROME_PX.panelTop;
    const heightBound = Math.max(0, viewportHeight - bottomClearance - estimatedHeight - panelTop);

    if (side === "left") {
      const right = Math.max(-leftOffset, viewportWidth - 2 * edgeMargin - width - leftOffset);
      return {
        left: -leftOffset,
        right,
        top: 0,
        bottom: heightBound,
      };
    }

    const leftBound = Math.min(0, 2 * edgeMargin + width - viewportWidth);
    return {
      left: leftBound,
      right: 0,
      top: 0,
      bottom: heightBound,
    };
  }, [side, viewportWidth, viewportHeight, width, estimatedHeight, leftOffset, bottomClearance]);

  const dragConstraintsRef = useRef(dragConstraints);
  dragConstraintsRef.current = dragConstraints;

  const clampDragIntoConstraints = useCallback(
    (constraints: DragConstraintsRect) => {
      const x = dragX.get();
      const y = dragY.get();
      const clampedX = Math.min(constraints.right, Math.max(constraints.left, x));
      const clampedY = Math.min(constraints.bottom, Math.max(constraints.top, y));
      if (clampedX !== x) animate(dragX, clampedX, smooth);
      if (clampedY !== y) animate(dragY, clampedY, smooth);
    },
    [dragX, dragY],
  );

  // Re-clamp after viewport changes so a floating panel can't slip off-screen
  // when the window shrinks.
  useEffect(() => {
    if (isDocked) return;
    clampDragIntoConstraints(dragConstraintsRef.current);
  }, [viewportWidth, viewportHeight, isDocked, clampDragIntoConstraints]);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isPinned) return;
      // Snap state height to the currently painted (CSS-clamped) height
      // BEFORE flipping isDocked. PanelShell's docked-mode maxHeight clamps
      // a stale defaultHeight, but the unclamped floating branch would
      // otherwise paint the pre-clamp state height for one frame. This is a
      // belt-and-braces guard against any future regression in geometry
      // clamping.
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect && rect.height > 0) setHeight(rect.height);
      dragControls.start(e);
      setIsDocked(false);
    },
    [dragControls, isPinned],
  );

  const onDragEnd = useCallback(() => {
    clampDragIntoConstraints(dragConstraintsRef.current);
    reportRect();
    persistPosition();
  }, [clampDragIntoConstraints, reportRect, persistPosition]);

  const onTitleDoubleClick = useCallback(() => {
    if (isPinned) return;
    animate(dragX, 0, smooth);
    animate(dragY, 0, smooth);
    setIsDocked(true);
    clearFloatingObstacle(id);
    savePanelPosition(id, {
      x: 0,
      y: 0,
      width,
      preferredWidth,
      height,
      docked: true,
    });
  }, [dragX, dragY, id, clearFloatingObstacle, savePanelPosition, width, preferredWidth, height, isPinned]);

  // Horizontal resize via mouse events
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startPreferred = preferredWidthRef.current;

      const handleMove = (ev: MouseEvent) => {
        const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        scheduleSizeUpdate(
          Math.max(minWidth, Math.min(maxWidth, startPreferred + delta)),
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
    [side, minWidth, maxWidth, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  // Vertical resize via mouse events
  const onResizeVerticalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const dockedMax = window.innerHeight - APP_CHROME_PX.panelTop - bottomClearance - APP_CHROME_PX.edgeMargin;
      const maxH = maxHeightOpt ?? (
        isDocked
          ? dockedMax
          : window.innerHeight - APP_CHROME_PX.floatingHeightInset
      );

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
      const startPreferred = preferredWidthRef.current;
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const dockedMaxH = window.innerHeight - APP_CHROME_PX.panelTop - bottomClearance - APP_CHROME_PX.edgeMargin;
      const maxH = maxHeightOpt ?? (
        isDocked
          ? dockedMaxH
          : window.innerHeight - APP_CHROME_PX.floatingHeightInset
      );

      const handleMove = (ev: MouseEvent) => {
        const dx = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        const dy = ev.clientY - startY;
        scheduleSizeUpdate(
          Math.max(minWidth, Math.min(maxWidth, startPreferred + dx)),
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
      const startPreferred = preferredWidthRef.current;
      const startRendered = widthRef.current;
      const startDragX = dragX.get();

      const handleMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const nextPreferred = Math.max(minWidth, Math.min(maxWidth, startPreferred + delta));
        const ceiling = Math.max(minWidth, Math.min(maxWidth, availableWidth || maxWidth));
        const nextRendered = Math.max(minWidth, Math.min(nextPreferred, ceiling));
        const actualDelta = nextRendered - startRendered;
        scheduleSizeUpdate(nextPreferred, null);
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
    [minWidth, maxWidth, availableWidth, dragX, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  // Bottom-left corner resize: left-edge width + vertical height
  const onResizeCornerLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPreferred = preferredWidthRef.current;
      const startRendered = widthRef.current;
      const startDragX = dragX.get();
      const el = panelRef.current;
      const startHeight = height ?? el?.offsetHeight ?? 400;
      const dockedMaxH = window.innerHeight - APP_CHROME_PX.panelTop - bottomClearance - APP_CHROME_PX.edgeMargin;
      const maxH = maxHeightOpt ?? (
        isDocked
          ? dockedMaxH
          : window.innerHeight - APP_CHROME_PX.floatingHeightInset
      );

      const handleMove = (ev: MouseEvent) => {
        const dx = startX - ev.clientX;
        const dy = ev.clientY - startY;
        const nextPreferred = Math.max(minWidth, Math.min(maxWidth, startPreferred + dx));
        const ceiling = Math.max(minWidth, Math.min(maxWidth, availableWidth || maxWidth));
        const nextRendered = Math.max(minWidth, Math.min(nextPreferred, ceiling));
        const actualDx = nextRendered - startRendered;
        scheduleSizeUpdate(nextPreferred, Math.max(minHeight, Math.min(maxH, startHeight + dy)));
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
    [height, minWidth, maxWidth, minHeight, maxHeightOpt, isDocked, bottomClearance, availableWidth, dragX, reportRect, persistPosition, scheduleSizeUpdate, flushPendingSize],
  );

  return {
    panelRef,
    dragControls,
    dragX,
    dragY,
    width,
    height,
    leftOffset,
    isDocked,
    isPinned,
    dragConstraints,
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
