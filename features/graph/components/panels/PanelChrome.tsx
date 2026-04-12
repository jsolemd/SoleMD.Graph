"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Text, ActionIcon, Tooltip } from "@mantine/core";
import { Pin, PinOff, X } from "lucide-react";
import { iconBtnStyles, panelTextMutedStyle, panelChromeStyle } from "./PanelShell";

const panelChromeTextClassName = "uppercase tracking-[0.08em]";

interface PanelChromeProps {
  children: ReactNode;
  title: string;
  headerActions?: ReactNode;
  onClose: () => void;
  /** Make title bar draggable via framer-motion dragControls */
  onTitlePointerDown?: (e: React.PointerEvent) => void;
  /** Double-click title bar to dock */
  onTitleDoubleClick?: () => void;
  /** Whether the panel position is pinned/locked. */
  isPinned?: boolean;
  /** Toggle pin state. */
  onTogglePin?: () => void;
}

export function PanelChrome({
  children,
  title,
  headerActions,
  onClose,
  onTitlePointerDown,
  onTitleDoubleClick,
  isPinned,
  onTogglePin,
}: PanelChromeProps) {
  // Dismiss on Escape — ref avoids re-registering on every onClose identity change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <div
        className="flex items-center justify-between px-2.5 py-1"
      >
        <div
          className="min-w-0 flex-1"
          onPointerDown={onTitlePointerDown}
          onDoubleClick={onTitleDoubleClick}
          style={onTitlePointerDown ? { cursor: isPinned ? "default" : "grab" } : undefined}
        >
          <Text
            fw={600}
            className={panelChromeTextClassName}
            style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
          >
            {title}
          </Text>
        </div>
        <div className="ml-2 flex items-center gap-1">
          {headerActions}
          {onTogglePin && (
            <Tooltip
              label={isPinned ? "Unpin panel" : "Pin panel"}
              position="bottom"
              withArrow
            >
              <ActionIcon
                variant="transparent"
                size={24}
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={onTogglePin}
                aria-label={isPinned ? "Unpin panel" : "Pin panel"}
                aria-pressed={isPinned}
              >
                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip
            label={`Close ${title.toLowerCase()}`}
            position="bottom"
            withArrow
          >
            <ActionIcon
              variant="transparent"
              size={24}
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()} panel`}
            >
              <X size={12} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
      {children}
    </>
  );
}
