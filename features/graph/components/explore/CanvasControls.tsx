"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
  useCosmograph,
} from "@cosmograph/react";
import { AnimatePresence, motion } from "framer-motion";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Lock, Unlock, X } from "lucide-react";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
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
const SELECTION_SIZE = 34;

const wrapperStyle: React.CSSProperties = {
  width: SELECTION_SIZE,
  height: SELECTION_SIZE,
  borderRadius: 9999,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/**
 * Inner style applied to the Cosmograph-rendered `<div>`.
 * Overrides Cosmograph's default margin (3px), filter (brightness/contrast),
 * and border-radius (8px) so the inner div fills the circular wrapper cleanly.
 * Padding 9px gives a 16x16 render area matching lucide icon sizes.
 */
const innerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 9,
  margin: 0,
  background: "transparent",
  border: "none",
  borderRadius: "inherit",
  color: "inherit",
  cursor: "pointer",
  filter: "none",
};

/* ── Hooks ─────────────────────────────────────────────────────── */

function usePortalTarget(selector: string) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const native = document.querySelector<HTMLElement>(selector);
    if (native) {
      const wrapper = document.createElement("div");
      wrapper.style.display = "contents";
      native.insertBefore(wrapper, native.firstChild);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Portal target must trigger re-render after DOM insertion
      setTarget(wrapper);
      return () => { wrapper.remove(); };
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        observer.disconnect();
        const wrapper = document.createElement("div");
        wrapper.style.display = "contents";
        found.insertBefore(wrapper, found.firstChild);
        setTarget(wrapper);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, [selector]);

  return target;
}

/**
 * Read the Cosmograph-assigned `id` from the rendered button `<div>`.
 * IDs are auto-generated (e.g. "c", "n") so we discover them at mount
 * via ref callback + MutationObserver fallback for async rendering.
 */
function useCosmographButtonId() {
  const [id, setId] = useState<string | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const inner = el.querySelector<HTMLElement>("[id]");
      if (inner?.id) { setId(inner.id); return; }
      const obs = new MutationObserver(() => {
        const found = el.querySelector<HTMLElement>("[id]");
        if (found?.id) { setId(found.id); obs.disconnect(); }
      });
      obs.observe(el, { childList: true, subtree: true });
    }
  }, []);

  return { ref, id };
}

/* ── Component ─────────────────────────────────────────────────── */

export function CanvasControls() {
  const portalTarget = usePortalTarget("[data-wordmark-toolbar]");
  const hasSelection = useDashboardStore((s) => s.selectedPointIndices.length > 0);
  const hasCurrentScope = useDashboardStore((s) => s.currentPointIndices !== null);
  const activeSourceId = useDashboardStore((s) => s.activeSelectionSourceId);
  const lockedSelection = useDashboardStore((s) => s.lockedSelection);
  const timelineSelection = useDashboardStore((s) => s.timelineSelection);
  const lockSelection = useDashboardStore((s) => s.lockSelection);
  const unlockSelection = useDashboardStore((s) => s.unlockSelection);
  const isLocked = lockedSelection !== null;
  const hasResettableScope =
    hasSelection || hasCurrentScope || timelineSelection !== undefined;

  const { ref: rectButtonRef, id: rectButtonId } = useCosmographButtonId();
  const { ref: polyButtonRef, id: polyButtonId } = useCosmographButtonId();

  // Which tool the user last clicked (tool "activated", awaiting draw)
  const [activatedToolId, setActivatedToolId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = useDashboardStore.subscribe((state, prevState) => {
      const hasSelectionNow = state.selectedPointIndices.length > 0;
      const hadSelection = prevState.selectedPointIndices.length > 0;
      const isLockedNow = state.lockedSelection !== null;
      const wasLocked = prevState.lockedSelection !== null;

      if ((hadSelection && !hasSelectionNow) || (!wasLocked && isLockedNow)) {
        setActivatedToolId(null);
      }
    });

    return unsubscribe;
  }, []);

  // Clear tool activation on Escape (cancels tool without selecting)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivatedToolId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const selectNode = useGraphStore((s) => s.selectNode);
  const setCurrentPointIndices = useDashboardStore(
    (s) => s.setCurrentPointIndices
  );
  const setHighlightedPointIndices = useDashboardStore(
    (s) => s.setHighlightedPointIndices
  );
  const setSelectedPointIndices = useDashboardStore((s) => s.setSelectedPointIndices);
  const setActiveSelectionSourceId = useDashboardStore((s) => s.setActiveSelectionSourceId);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const setTableView = useDashboardStore((s) => s.setTableView);
  const setInfoScopeMode = useDashboardStore((s) => s.setInfoScopeMode);
  const { cosmograph } = useCosmograph();

  const clearSelection = useCallback(() => {
    selectNode(null);
    setCurrentPointIndices(null);
    setHighlightedPointIndices([]);
    setSelectedPointIndices([]);
    setActiveSelectionSourceId(null);
    setTimelineSelection(undefined);
    setTableView("current");
    setInfoScopeMode("current");
    unlockSelection();
    cosmograph?.pointsSelection?.reset();
    cosmograph?.linksSelection?.reset();
    setActivatedToolId(null);
  }, [
    cosmograph,
    selectNode,
    setActiveSelectionSourceId,
    setCurrentPointIndices,
    setHighlightedPointIndices,
    setInfoScopeMode,
    setSelectedPointIndices,
    setTableView,
    setTimelineSelection,
    unlockSelection,
  ]);

  if (!portalTarget) return null;

  // Button is "on" if: user just activated this tool, OR a selection from this tool exists
  const rectOn = !isLocked && (
    activatedToolId === rectButtonId
    || (hasSelection && activeSourceId === rectButtonId)
  );
  const polyOn = !isLocked && (
    activatedToolId === polyButtonId
    || (hasSelection && activeSourceId === polyButtonId)
  );

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
      <div
        ref={rectButtonRef}
        className="graph-icon-btn"
        style={isLocked ? { ...wrapperStyle, opacity: 0.35, pointerEvents: "none" } : wrapperStyle}
        aria-pressed={rectOn}
        aria-disabled={isLocked}
        onClick={() => {
          if (!isLocked) setActivatedToolId(rectButtonId);
        }}
      >
        <CosmographButtonRectangularSelection style={innerStyle} />
      </div>
      <div
        ref={polyButtonRef}
        className="graph-icon-btn"
        style={isLocked ? { ...wrapperStyle, opacity: 0.35, pointerEvents: "none" } : wrapperStyle}
        aria-pressed={polyOn}
        aria-disabled={isLocked}
        onClick={() => {
          if (!isLocked) setActivatedToolId(polyButtonId);
        }}
      >
        <CosmographButtonPolygonalSelection style={innerStyle} />
      </div>
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
