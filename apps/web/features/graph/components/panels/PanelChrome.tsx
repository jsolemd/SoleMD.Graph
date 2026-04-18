"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Text } from "@mantine/core";
import {
  PanelHeaderDivider,
  PanelScaleControl,
  PanelWindowActions,
} from "./PanelShell/panel-header-actions";
import { panelChromeStyle, panelTextMutedStyle } from "./PanelShell/panel-styles";

const panelChromeTextClassName = "uppercase tracking-[0.08em]";

const INTERACTIVE_SELECTOR = 'button, input, textarea, select, a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * Check if the event target is an interactive element WITHIN the given container.
 * Prevents `closest()` from matching ancestors above the container (e.g. a
 * parent panel with tabIndex={0}).
 */
function isInteractiveDescendant(target: Element, container: Element): boolean {
  const interactive = target.closest(INTERACTIVE_SELECTOR);
  return !!interactive && container.contains(interactive);
}

interface PanelChromeProps {
  children: ReactNode;
  title: string;
  headerNavigation?: ReactNode;
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
  panelScale?: number;
  canIncreaseScale?: boolean;
  canDecreaseScale?: boolean;
  onIncreaseScale?: () => void;
  onDecreaseScale?: () => void;
  onResetScale?: () => void;
}

export function PanelChrome({
  children,
  title,
  headerNavigation,
  headerActions,
  onClose,
  onTitlePointerDown,
  onTitleDoubleClick,
  isPinned,
  onTogglePin,
  panelScale,
  canIncreaseScale,
  canDecreaseScale,
  onIncreaseScale,
  onDecreaseScale,
  onResetScale,
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

  const handleHeaderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      onTitlePointerDown?.(event);
      return;
    }

    if (isInteractiveDescendant(target, event.currentTarget)) {
      return;
    }

    onTitlePointerDown?.(event);
  }, [onTitlePointerDown]);

  const handleHeaderDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      onTitleDoubleClick?.();
      return;
    }

    if (isInteractiveDescendant(target, event.currentTarget)) {
      return;
    }

    onTitleDoubleClick?.();
  }, [onTitleDoubleClick]);

  const headerSections = useMemo(
    () =>
      [
        headerActions,
        typeof panelScale === "number" && onIncreaseScale && onDecreaseScale ? (
          <PanelScaleControl
            key="scale"
            panelScale={panelScale}
            canIncreaseScale={canIncreaseScale}
            canDecreaseScale={canDecreaseScale}
            onIncreaseScale={onIncreaseScale}
            onDecreaseScale={onDecreaseScale}
            onResetScale={onResetScale}
          />
        ) : null,
        <PanelWindowActions
          key="window"
          title={title}
          onClose={onClose}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
        />,
      ].filter((section): section is ReactNode => section != null),
    [
      canDecreaseScale,
      canIncreaseScale,
      headerActions,
      isPinned,
      onClose,
      onDecreaseScale,
      onIncreaseScale,
      onResetScale,
      onTogglePin,
      panelScale,
      title,
    ],
  );

  return (
    <>
      <div
        className="flex items-center justify-between px-2.5 py-1"
      >
        <div
          className="min-w-0 flex flex-1 touch-none select-none items-center gap-1"
          data-panel-drag-handle="true"
          onPointerDown={handleHeaderPointerDown}
          onDoubleClick={handleHeaderDoubleClick}
          style={onTitlePointerDown ? { cursor: isPinned ? "default" : "grab" } : undefined}
        >
          <div
            className="min-w-0"
          >
            <Text
              fw={600}
              className={panelChromeTextClassName}
              style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
            >
              {title}
            </Text>
          </div>
          {headerNavigation && (
            <>
              <PanelHeaderDivider />
              {headerNavigation}
            </>
          )}
        </div>
        <div className="inline-flex items-center">
          {headerSections.map((section, index) => (
            <Fragment key={`section-${index}`}>
              {index > 0 && <PanelHeaderDivider />}
              {section}
            </Fragment>
          ))}
        </div>
      </div>
      {children}
    </>
  );
}
