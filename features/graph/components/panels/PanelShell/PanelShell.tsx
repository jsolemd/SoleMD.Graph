"use client";

import { type ReactNode, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { APP_CHROME_PX, DEFAULT_PANEL_WIDTH_PX } from "@/lib/density";
import { panelReveal } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";
import { selectPanelLeftOffset, selectBottomClearance } from "@/features/graph/stores/dashboard-store";
import {
  PANEL_SCALE_DEFAULT,
  PANEL_SCALE_MAX,
  PANEL_SCALE_MIN,
  PANEL_SCALE_STEP,
} from "@/features/graph/stores/slices/panel-slice";
import { PanelChrome } from "../PanelChrome";
import { useFloatingPanel } from "../use-floating-panel";
import { createPanelScaleStyle, panelSurfaceStyle } from "./panel-styles";

interface PanelShellProps {
  children: ReactNode;
  /** Panel identifier — used for auto-stacking offset and floating obstacle tracking. */
  id: string;
  title: string;
  side?: "left" | "right";
  /** Default docked width (overridden by resize). */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  headerNavigation?: ReactNode;
  headerActions?: ReactNode;
  /** Docked-mode X offset — animates panel away from dock position (centering). */
  anchorXOffset?: number;
  /** Docked-mode Y offset — animates panel vertically (expanded positioning). */
  anchorYOffset?: number;
  contentScaleMode?: "reading" | "none";
  onClose: () => void;
}

/** Top offset so panels float below the Wordmark + panel icon row. */
export const PANEL_TOP = APP_CHROME_PX.panelTop;

export function PanelShell({
  children,
  id,
  title,
  side = "left",
  defaultWidth = DEFAULT_PANEL_WIDTH_PX,
  minWidth,
  maxWidth,
  defaultHeight,
  minHeight,
  maxHeight,
  headerNavigation,
  headerActions,
  anchorXOffset,
  anchorYOffset,
  contentScaleMode = "reading",
  onClose,
}: PanelShellProps) {
  // Bottom clearance so docked panels don't overlap bottom toolbar/timeline/table
  const bottomClearance = useDashboardStore(selectBottomClearance);

  const {
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
  } = useFloatingPanel({
    id,
    side,
    defaultWidth,
    minWidth,
    maxWidth,
    defaultHeight,
    minHeight,
    maxHeight,
    anchorXOffset,
    anchorYOffset,
    bottomClearance,
  });

  const contentScaleEnabled = contentScaleMode === "reading";
  const togglePanelPinned = useDashboardStore((state) => state.togglePanelPinned);
  const stepPanelScale = useDashboardStore((state) => state.stepPanelScale);
  const resetPanelScale = useDashboardStore((state) => state.resetPanelScale);
  const panelScale = useDashboardStore((state) => state.panelScales[id] ?? PANEL_SCALE_DEFAULT);
  const canDecreaseScale = panelScale > PANEL_SCALE_MIN;
  const canIncreaseScale = panelScale < PANEL_SCALE_MAX;

  const handleTogglePin = useCallback(() => {
    togglePanelPinned(id);
  }, [id, togglePanelPinned]);

  const handleDecreaseScale = useCallback(() => {
    stepPanelScale(id, -PANEL_SCALE_STEP);
  }, [id, stepPanelScale]);

  const handleIncreaseScale = useCallback(() => {
    stepPanelScale(id, PANEL_SCALE_STEP);
  }, [id, stepPanelScale]);

  const handleResetScale = useCallback(() => {
    resetPanelScale(id);
  }, [id, resetPanelScale]);

  const handlePanelKeyDownCapture = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!contentScaleEnabled || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      stepPanelScale(id, PANEL_SCALE_STEP);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      stepPanelScale(id, -PANEL_SCALE_STEP);
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      resetPanelScale(id);
    }
  }, [contentScaleEnabled, id, resetPanelScale, stepPanelScale]);

  const handlePanelPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = panelRef.current;
    if (!element) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      element.focus({ preventScroll: true });
      return;
    }

    if (target.closest('[data-panel-drag-handle="true"]')) {
      return;
    }

    const interactive = target.closest('button, input, textarea, select, a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])');
    if (interactive && element.contains(interactive) && interactive !== element) {
      return;
    }

    element.focus({ preventScroll: true });
  }, [panelRef]);

  // Auto-stacking offset from panels docked before this one
  const leftOffset = useDashboardStore((state) => selectPanelLeftOffset(state, id));

  // Report panelBottomY when docked so the prompt position system knows the panel's height.
  const setPanelBottomY = useDashboardStore((state) => state.setPanelBottomY);
  useEffect(() => {
    const element = panelRef.current;
    if (!element || !isDocked) {
      setPanelBottomY(side, 0);
      return;
    }

    let raf = 0;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPanelBottomY(side, PANEL_TOP + element.offsetHeight);
      });
    };

    report();
    const resizeObserver = new ResizeObserver(report);
    resizeObserver.observe(element);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      setPanelBottomY(side, 0);
    };
  }, [isDocked, panelRef, setPanelBottomY, side]);

  const reveal = panelReveal[side];

  return (
    <motion.div
      ref={panelRef}
      initial={reveal.initial}
      animate={reveal.animate}
      exit={reveal.exit}
      transition={reveal.transition}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      tabIndex={0}
      onDragEnd={onDragEnd}
      onKeyDownCapture={handlePanelKeyDownCapture}
      onPointerDownCapture={handlePanelPointerDownCapture}
      style={{
        ...reveal.style,
        ...createPanelScaleStyle(contentScaleEnabled ? panelScale : PANEL_SCALE_DEFAULT),
        x: dragX,
        y: dragY,
        top: PANEL_TOP,
        ...(side === "left"
          ? { left: APP_CHROME_PX.edgeMargin + leftOffset }
          : { right: APP_CHROME_PX.edgeMargin }),
        width,
        height: height ?? undefined,
        maxHeight: height
          ? undefined
          : isDocked
            ? `calc(100vh - ${PANEL_TOP + bottomClearance + APP_CHROME_PX.edgeMargin}px)`
            : `calc(100vh - ${PANEL_TOP + APP_CHROME_PX.floatingViewportInset}px)`,
        ...panelSurfaceStyle,
      }}
      className="absolute z-30 flex flex-col rounded-xl"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
        <PanelChrome
          title={title}
          headerNavigation={headerNavigation}
          headerActions={headerActions}
          onClose={onClose}
          onTitlePointerDown={onTitlePointerDown}
          onTitleDoubleClick={onTitleDoubleClick}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          panelScale={contentScaleEnabled ? panelScale : undefined}
          canIncreaseScale={contentScaleEnabled ? canIncreaseScale : undefined}
          canDecreaseScale={contentScaleEnabled ? canDecreaseScale : undefined}
          onIncreaseScale={contentScaleEnabled ? handleIncreaseScale : undefined}
          onDecreaseScale={contentScaleEnabled ? handleDecreaseScale : undefined}
          onResetScale={contentScaleEnabled ? handleResetScale : undefined}
        >
          {children}
        </PanelChrome>
      </div>

      <div
        className="absolute top-0 h-full w-2 cursor-col-resize"
        style={{ [side === "left" ? "right" : "left"]: 0 }}
        onMouseDown={onResizeMouseDown}
      />
      <div
        className="absolute bottom-0 left-0 h-2 w-full cursor-row-resize"
        onMouseDown={onResizeVerticalMouseDown}
      />
      <div
        className="absolute bottom-0 z-10 h-4 w-4 cursor-nwse-resize"
        style={{ [side === "left" ? "right" : "left"]: 0 }}
        onMouseDown={onResizeCornerMouseDown}
      />
      {side === "left" && (
        <>
          <div
            className="absolute left-0 top-0 h-full w-2 cursor-col-resize"
            onMouseDown={onResizeLeftMouseDown}
          />
          <div
            className="absolute bottom-0 left-0 z-10 h-4 w-4 cursor-nesw-resize"
            onMouseDown={onResizeCornerLeftMouseDown}
          />
        </>
      )}
    </motion.div>
  );
}

export type { PanelShellProps };
