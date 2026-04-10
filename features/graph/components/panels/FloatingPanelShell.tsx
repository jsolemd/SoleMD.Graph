"use client";

import { type ReactNode, useEffect } from "react";
import { motion } from "framer-motion";
import { panelReveal } from "@/lib/motion";
import { useDashboardStore } from "@/features/graph/stores";
import { PanelChrome } from "./PanelChrome";
import { PANEL_TOP } from "./PanelShell";
import { useFloatingPanel } from "./use-floating-panel";

interface FloatingPanelShellProps {
  children: ReactNode;
  id: string;
  title: string;
  side?: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  headerActions?: ReactNode;
  onClose: () => void;
}

export function FloatingPanelShell({
  children,
  id,
  title,
  side = "left",
  defaultWidth = 420,
  minWidth,
  maxWidth,
  headerActions,
  onClose,
}: FloatingPanelShellProps) {
  const {
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
  } = useFloatingPanel({ id, side, defaultWidth, minWidth, maxWidth });

  // Report panelBottomY when docked so the prompt position system
  // knows the panel's height — same contract as PanelShell.
  const setPanelBottomY = useDashboardStore((s) => s.setPanelBottomY);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !isDocked) {
      setPanelBottomY(side, 0);
      return;
    }

    let raf = 0;
    const report = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPanelBottomY(side, PANEL_TOP + el.offsetHeight);
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      setPanelBottomY(side, 0);
    };
  }, [side, setPanelBottomY, isDocked, panelRef]);

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
      onDragEnd={onDragEnd}
      style={{
        ...reveal.style,
        x: dragX,
        y: dragY,
        top: PANEL_TOP,
        ...(side === "left" ? { left: 12 } : { right: 12 }),
        width,
        maxHeight: `calc(100vh - ${PANEL_TOP + 100}px)`,
        backgroundColor: "var(--graph-panel-bg)",
        border: "1px solid var(--graph-panel-border)",
        boxShadow: "var(--graph-panel-shadow)",
      }}
      className="absolute z-30 flex flex-col overflow-hidden rounded-xl"
    >
      <PanelChrome
        title={title}
        headerActions={headerActions}
        onClose={onClose}
        onTitlePointerDown={onTitlePointerDown}
        onTitleDoubleClick={onTitleDoubleClick}
      >
        {children}
      </PanelChrome>

      {/* Horizontal resize handle */}
      <div
        className="absolute top-0 h-full w-1 cursor-col-resize"
        style={{ [side === "left" ? "right" : "left"]: -2 }}
        onMouseDown={onResizeMouseDown}
      />
    </motion.div>
  );
}
