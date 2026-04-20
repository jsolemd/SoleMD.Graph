"use client";

import { type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { motion, type MotionStyle } from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Target,
  Type,
} from "lucide-react";
import { ModeToggleBar } from "../../chrome/ModeToggleBar";
import { PromptIconBtn } from "./PromptIconBtn";
import { promptSurfaceStyle } from "../PanelShell";
import { densityCssSpace, densityPx } from "@/lib/density";

export interface PromptBoxCardProps {
  children: ReactNode;
  isCollapsed: boolean;
  isMobile: boolean;
  isFullHeightMode: boolean;
  isMaximized: boolean;
  showFormattingTools: boolean;
  selectionOnlyEnabled: boolean;
  selectionScopeAvailable: boolean;
  selectionScopeToggleLabel: string;
  isSubmitDisabled: boolean;
  onToggleFormattingTools: () => void;
  onToggleSelectionScope: () => void;
  onStepUp: () => void;
  onStepDown: () => void;
  onSubmit: () => void;
  onPillClick?: () => void;
  onPillKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  cardRef?: RefObject<HTMLDivElement | null>;
  /** Accepts framer-motion MotionValues (e.g. for live height interpolation). */
  style?: MotionStyle;
}

/**
 * Presentational prompt card — the shared visual standard used by the live
 * `PromptBoxSurface` and the surface-lab. No store reads, no positioning.
 * Consumers pass the editor (or any placeholder) as children and wire the
 * control-row handlers from their own state.
 */
export function PromptBoxCard({
  children,
  isCollapsed,
  isMobile,
  isFullHeightMode,
  isMaximized,
  showFormattingTools,
  selectionOnlyEnabled,
  selectionScopeAvailable,
  selectionScopeToggleLabel,
  isSubmitDisabled,
  onToggleFormattingTools,
  onToggleSelectionScope,
  onStepUp,
  onStepDown,
  onSubmit,
  onPillClick,
  onPillKeyDown,
  cardRef,
  style,
}: PromptBoxCardProps) {
  const padding = isCollapsed
    ? densityCssSpace(10, isMobile ? 14 : 12)
    : densityCssSpace(12, isMobile ? 14 : 12, 4);

  const pillBehavior = isCollapsed && onPillClick
    ? ({
        onClick: onPillClick,
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: onPillKeyDown,
        "aria-label": "Expand prompt box",
      } as const)
    : undefined;

  return (
    <motion.div
      ref={cardRef}
      className="rounded-3xl flex flex-col"
      style={{
        padding,
        ...promptSurfaceStyle,
        cursor: "default",
        ...style,
      }}
      {...pillBehavior}
    >
      <div
        onPointerDown={(event) => event.stopPropagation()}
        aria-hidden={isCollapsed}
        style={{
          display: "grid",
          gridTemplateRows: isCollapsed ? "0fr" : "1fr",
          opacity: isCollapsed ? 0 : 1,
          flex: isFullHeightMode ? 1 : undefined,
          minHeight: isFullHeightMode ? 0 : undefined,
          cursor: "default",
          transition:
            "grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
        }}
      >
        <div
          style={{
            overflow: isCollapsed ? "hidden" : "visible",
            minHeight: 0,
            height: isFullHeightMode ? "100%" : undefined,
          }}
        >
          {children}
        </div>
      </div>

      <div
        className="flex items-center"
        style={{
          userSelect: "none",
          cursor: "default",
          justifyContent: isCollapsed ? "center" : "space-between",
          paddingTop: isCollapsed ? 0 : densityPx(6),
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ModeToggleBar compact={isCollapsed && !isMobile} />
        </div>

        {!isCollapsed && (
          <div
            className="flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {!isMobile && (
              <div className="flex items-center -space-x-1">
                {!isFullHeightMode && (
                  <PromptIconBtn icon={ChevronUp} label="Expand" onClick={onStepUp} />
                )}
                <PromptIconBtn
                  icon={ChevronDown}
                  label={isMaximized ? "Shrink" : "Collapse"}
                  onClick={onStepDown}
                />
              </div>
            )}

            <PromptIconBtn
              icon={Type}
              label={showFormattingTools ? "Hide formatting tools" : "Show formatting tools"}
              onClick={onToggleFormattingTools}
              active={showFormattingTools}
            />

            <PromptIconBtn
              icon={Target}
              label={selectionScopeToggleLabel}
              onClick={onToggleSelectionScope}
              active={selectionOnlyEnabled}
              disabled={!selectionScopeAvailable}
            />

            <PromptIconBtn
              icon={ArrowUp}
              label="Submit prompt"
              onClick={onSubmit}
              size="md"
              variant="primary"
              disabled={isSubmitDisabled}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
