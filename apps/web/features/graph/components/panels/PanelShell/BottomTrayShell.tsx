"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { motion } from "framer-motion";
import { crisp, smooth } from "@/lib/motion";
import { panelSurfaceStyle } from "./panel-styles";

interface BottomTrayShellProps {
  children: ReactNode;
  height: number;
  bottomOffset?: number;
  toolbar?: ReactNode;
  onResizeMouseDown?: MouseEventHandler<HTMLDivElement>;
  className?: string;
  bodyClassName?: string;
}

export function BottomTrayShell({
  children,
  height,
  bottomOffset = 0,
  toolbar,
  onResizeMouseDown,
  className,
  bodyClassName,
}: BottomTrayShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, bottom: bottomOffset }}
      animate={{ opacity: 1, y: 0, bottom: bottomOffset }}
      exit={{ opacity: 0, y: 40, bottom: bottomOffset }}
      transition={{
        y: smooth,
        bottom: crisp,
        opacity: { duration: 0.1, ease: "easeOut" },
      }}
      className={["absolute left-0 right-0 z-20 flex flex-col rounded-t-surface", className].filter(Boolean).join(" ")}
      style={{
        height,
        ...panelSurfaceStyle,
      }}
    >
      {onResizeMouseDown && (
        <div
          className="flex h-1.5 cursor-row-resize items-center justify-center transition-colors hover:bg-[var(--interactive-hover)]"
          onMouseDown={onResizeMouseDown}
        >
          <div
            className="h-px w-6 rounded-full"
            style={{ backgroundColor: "var(--graph-panel-text-dim)" }}
          />
        </div>
      )}

      {toolbar}

      <div className={["flex-1 overflow-auto", bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </motion.div>
  );
}
