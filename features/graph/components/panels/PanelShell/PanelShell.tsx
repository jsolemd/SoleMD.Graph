"use client";

import { type ReactNode, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { APP_CHROME_PX, DEFAULT_PANEL_WIDTH_PX, densityCssPx } from "@/lib/density";
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
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";

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

/** Top offset so panels float just below the brand wordmark.
 *  Panel-opener icons moved to the top-right pill, so panels reclaim the
 *  vertical space previously consumed by the panel-icon row. See
 *  APP_CHROME_BASE_PX.panelTop in lib/density.ts for the derivation. */
export const PANEL_TOP = APP_CHROME_PX.panelTop;

/** Symmetric inset for mobile panels — same gap on top/right/bottom/left so the
 *  floating card reads as a uniform edge margin. Panel overlays the wordmark
 *  on mobile since space is tight; brand reappears when the panel closes. */
const mobilePanelInset = densityCssPx(8);

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
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
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
  const setPanelScale = useDashboardStore((state) => state.setPanelScale);
  const storedPanelScale = useDashboardStore((state) => state.panelScales[id]);
  // First-mount mobile default: scale up to 1.25× so touch reading is
  // comfortable without forcing a floor the user can't escape. Once the
  // user steps the scale, their choice is honored verbatim.
  const mobileDefaultScale = 1.25;
  const panelScale =
    storedPanelScale ?? (isMobile && contentScaleEnabled ? mobileDefaultScale : PANEL_SCALE_DEFAULT);
  useEffect(() => {
    if (isMobile && contentScaleEnabled && storedPanelScale === undefined) {
      setPanelScale(id, mobileDefaultScale);
    }
  }, [contentScaleEnabled, id, isMobile, setPanelScale, storedPanelScale]);
  const effectivePanelScale = contentScaleEnabled ? panelScale : PANEL_SCALE_DEFAULT;
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
    if (isMobile) {
      setPanelBottomY(side, 0);
      return;
    }

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
  }, [isDocked, isMobile, panelRef, setPanelBottomY, side]);

  const reveal = panelReveal[side];

  if (isMobile) {
    return (
      <>
        <motion.button
          type="button"
          className="fixed inset-0 z-40 border-0 bg-black/30 p-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()} panel`}
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          data-panel-id={id}
          data-panel-shell="mobile"
          style={{
            ...createPanelScaleStyle(effectivePanelScale),
            ...panelSurfaceStyle,
            top: `calc(env(safe-area-inset-top, 0px) + ${mobilePanelInset})`,
            right: mobilePanelInset,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + ${mobilePanelInset})`,
            left: mobilePanelInset,
          }}
          className="fixed z-50 flex min-h-0 flex-col overflow-hidden rounded-[1.25rem]"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
            <PanelChrome
              title={title}
              headerNavigation={headerNavigation}
              headerActions={headerActions}
              onClose={onClose}
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
        </motion.div>
      </>
    );
  }

  return (
    <motion.div
      ref={panelRef}
      data-panel-id={id}
      data-panel-shell="desktop"
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
        ...createPanelScaleStyle(effectivePanelScale),
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
