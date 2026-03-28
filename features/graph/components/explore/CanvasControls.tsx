"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Lock, Unlock, X } from "lucide-react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { SelectionToolbar, type SelectionToolbarHandle } from "@/features/graph/cosmograph";
import { iconBtnStyles } from "../panels/PanelShell";
import { snappy } from "@/lib/motion";

/**
 * Selection tools portaled into the Wordmark toolbar.
 *
 * ## Highlight state machine
 *
 * A selection button is "on" (accent background via `aria-pressed`) when:
 *   1. The user just clicked it (tool activated, awaiting draw), OR
 *   2. A canvas selection exists that was created by this tool.
 *
 * It turns "off" when:
 *   - The selection is cleared (click empty canvas)
 *   - The user presses Escape (cancels tool without selecting)
 *   - The user clicks the OTHER selection tool (switches active tool)
 *
 * `activatedToolId` tracks state (1).  The store's `activeSelectionSourceId`
 * + `selectedPointIndices` track state (2).  The button is highlighted for
 * the union of both.
 */

/* ── Hooks ─────────────────────────────────────────────────────── */

function usePortalTarget(selector: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let wrapper: HTMLDivElement | null = null;

    const native = document.querySelector<HTMLElement>(selector);
    if (native) {
      wrapper = document.createElement("div");
      wrapper.style.display = "contents";
      native.insertBefore(wrapper, native.firstChild);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Portal target must trigger re-render after DOM insertion
      setTarget(wrapper);
      return () => { wrapper?.remove(); };
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        observer.disconnect();
        wrapper = document.createElement("div");
        wrapper.style.display = "contents";
        found.insertBefore(wrapper, found.firstChild);
        setTarget(wrapper);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      wrapper?.remove();
    };
  }, [selector]);

  return target;
}

/* ── Component ─────────────────────────────────────────────────── */

export function CanvasControls() {
  const portalTarget = usePortalTarget("[data-wordmark-toolbar]");
  const toolbarRef = useRef<SelectionToolbarHandle>(null);
  const hasSelection = useDashboardStore((s) => s.selectedPointIndices.length > 0);
  const hasCurrentScope = useDashboardStore(
    (s) => s.currentPointIndices !== null || s.currentPointScopeSql !== null,
  );
  const activeSourceId = useDashboardStore((s) => s.activeSelectionSourceId);
  const lockedSelection = useDashboardStore((s) => s.lockedSelection);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const lockSelection = useDashboardStore((s) => s.lockSelection);
  const unlockSelection = useDashboardStore((s) => s.unlockSelection);
  const isLocked = lockedSelection !== null;
  const hasResettableScope =
    hasSelection || hasCurrentScope || timelineSelection !== undefined;

  const selectNode = useGraphStore((s) => s.selectNode);
  const setCurrentPointIndices = useDashboardStore(
    (s) => s.setCurrentPointIndices
  );
  const setCurrentPointScopeSql = useDashboardStore(
    (s) => s.setCurrentPointScopeSql
  );
  const setHighlightedPointIndices = useDashboardStore(
    (s) => s.setHighlightedPointIndices
  );
  const setSelectedPointIndices = useDashboardStore((s) => s.setSelectedPointIndices);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const setInfoScopeMode = useDashboardStore((s) => s.setInfoScopeMode);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);

  const handleStoreClear = useCallback(() => {
    selectNode(null);
    clearVisibilityFocus();
    setCurrentPointIndices(null);
    setCurrentPointScopeSql(null);
    setHighlightedPointIndices([]);
    setSelectedPointIndices([]);
    setActiveSelectionSourceId(null);
    setTimelineSelection(undefined);
    setTableView("current");
    setInfoScopeMode("current");
    unlockSelection();
  }, [
    clearVisibilityFocus,
    selectNode,
    setActiveSelectionSourceId,
    setCurrentPointIndices,
    setCurrentPointScopeSql,
    setHighlightedPointIndices,
    setInfoScopeMode,
    setSelectedPointIndices,
    setTableView,
    setTimelineSelection,
    unlockSelection,
  ]);

  const clearSelection = useCallback(() => {
    if (toolbarRef.current) {
      toolbarRef.current.clearSelections();
    } else {
      handleStoreClear();
    }
  }, [handleStoreClear]);

  if (!portalTarget) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {hasResettableScope && (
          <motion.div
            key="clear-selection"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={snappy}
          >
            <Tooltip label="Clear selection and filters" position="bottom" withArrow>
              <ActionIcon
                variant="transparent"
                size="lg"
                radius="xl"
                className="graph-icon-btn"
                styles={iconBtnStyles}
                onClick={clearSelection}
                aria-label="Clear selection and filters"
              >
                <X size={14} />
              </ActionIcon>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
      <SelectionToolbar
        ref={toolbarRef}
        isLocked={isLocked}
        activeSourceId={activeSourceId}
        hasSelection={hasSelection}
        onActivate={() => {}}
        onClear={handleStoreClear}
      />
      <Tooltip label={isLocked ? "Unlock selection" : "Lock selection"} position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => isLocked ? unlockSelection() : lockSelection()}
          style={!hasSelection && !isLocked ? { opacity: 0.35, pointerEvents: "none" } : undefined}
          aria-label={isLocked ? "Unlock selection" : "Lock selection"}
          aria-pressed={isLocked}
        >
          {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </ActionIcon>
      </Tooltip>
      <div
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: "var(--border-subtle)" }}
      />
    </>,
    portalTarget
  );
}
