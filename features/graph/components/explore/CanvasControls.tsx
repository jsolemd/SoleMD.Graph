"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Lock, Unlock, X } from "lucide-react";
import { useGraphSelection } from "@/features/graph/cosmograph";
import {
  buildActivePointSelectionScopeSql,
  buildCurrentPointScopeSql,
} from "@/features/graph/lib/cosmograph-selection";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { SelectionToolbar, type SelectionToolbarHandle } from "@/features/graph/cosmograph";
import type { GraphBundleQueries } from "@/features/graph/types";
import { iconBtnStyles } from "../panels/PanelShell";
import { pop } from "@/lib/motion";

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
 * + `selectedPointCount` track state (2).  The button is highlighted for
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

function CanvasControlsComponent({ queries }: { queries: GraphBundleQueries }) {
  const portalTarget = usePortalTarget("[data-wordmark-toolbar]");
  const toolbarRef = useRef<SelectionToolbarHandle>(null);
  const toolActivatedRef = useRef(false);
  const hasSelection = useDashboardStore((s) => s.selectedPointCount > 0);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const hasCurrentScope = useDashboardStore(
    (s) => s.currentPointScopeSql !== null,
  );
  const activeSourceId = useDashboardStore((s) => s.activeSelectionSourceId);
  const isLocked = useDashboardStore((s) => s.selectionLocked);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const lockSelection = useDashboardStore((s) => s.lockSelection);
  const unlockSelection = useDashboardStore((s) => s.unlockSelection);
  const canLockSelection = hasSelection || hasCurrentScope;
  const hasResettableScope =
    hasSelection || hasCurrentScope || timelineSelection !== undefined;

  const selectNode = useGraphStore((s) => s.selectNode);
  const setCurrentPointScopeSql = useDashboardStore(
    (s) => s.setCurrentPointScopeSql
  );
  const setSelectedPointCount = useDashboardStore((s) => s.setSelectedPointCount);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const {
    clearFocusedPoint,
    getPointsSelection,
    getSelectedPointIndices,
  } = useGraphSelection();

  const handleToolActivate = useCallback(() => {
    toolActivatedRef.current = true;
  }, []);

  const handleStoreClear = useCallback(() => {
    selectNode(null);
    clearFocusedPoint();
    clearVisibilityFocus();
    setCurrentPointScopeSql(null);
    setSelectedPointCount(0);
    setActiveSelectionSourceId(null);
    setTimelineSelection(undefined);
    setTableView("dataset");
    unlockSelection();
    toolActivatedRef.current = false;
  }, [
    clearFocusedPoint,
    clearVisibilityFocus,
    selectNode,
    setActiveSelectionSourceId,
    setCurrentPointScopeSql,
    setSelectedPointCount,
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

  const handleLockSelection = useCallback(async () => {
    if (!canLockSelection || isLocked) {
      return;
    }

    const pointsSelection = getPointsSelection();
    const activeScopeSql = buildActivePointSelectionScopeSql(pointsSelection);
    const nextSelectedPointCount = getSelectedPointIndices().length;

    if (hasCurrentPointScopeSql(activeScopeSql)) {
      try {
        await queries.setSelectedPointScopeSql(activeScopeSql);
      } catch {
        return;
      }
    }

    setSelectedPointCount(nextSelectedPointCount);
    setActiveSelectionSourceId(null);
    lockSelection();
    setCurrentPointScopeSql(
      buildCurrentPointScopeSql({
        selection: pointsSelection,
        selectionLocked: true,
        hasSelectedBaseline: nextSelectedPointCount > 0,
      }),
    );
  }, [
    canLockSelection,
    getPointsSelection,
    getSelectedPointIndices,
    isLocked,
    lockSelection,
    queries,
    setActiveSelectionSourceId,
    setCurrentPointScopeSql,
    setSelectedPointCount,
  ]);

  const handleUnlockSelection = useCallback(() => {
    const pointsSelection = getPointsSelection();

    unlockSelection();
    setCurrentPointScopeSql(
      buildCurrentPointScopeSql({
        selection: pointsSelection,
        selectionLocked: false,
        hasSelectedBaseline: selectedPointCount > 0,
      }),
    );
  }, [
    getPointsSelection,
    selectedPointCount,
    setCurrentPointScopeSql,
    unlockSelection,
  ]);

  // Auto-switch table to "Selection" when a tool-based selection produces results.
  // toolActivatedRef is set when the user clicks a selection tool (rect/poly); the
  // subscription fires once the selection count increases, then resets the flag so
  // subsequent click-based selections don't re-trigger the switch.
  useEffect(() => {
    const unsubscribe = useDashboardStore.subscribe((state, prevState) => {
      if (
        toolActivatedRef.current &&
        state.selectedPointCount > 0 &&
        state.selectedPointCount !== prevState.selectedPointCount
      ) {
        toolActivatedRef.current = false;
        state.setTableView("selection");
      }
    });
    return unsubscribe;
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {hasResettableScope && (
          <motion.div
            key="clear-selection"
            {...pop}
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
        onActivate={handleToolActivate}
        onClear={handleStoreClear}
      />
      <Tooltip label={isLocked ? "Unlock selection" : "Lock selection"} position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={() => void (isLocked ? handleUnlockSelection() : handleLockSelection())}
          style={!canLockSelection && !isLocked ? { opacity: 0.35, pointerEvents: "none" } : undefined}
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

export const CanvasControls = memo(CanvasControlsComponent);
CanvasControls.displayName = "CanvasControls";
