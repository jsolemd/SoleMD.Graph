"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
} from "@cosmograph/react";
import { useDashboardStore } from "@/lib/graph/stores";

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
  const activeSourceId = useDashboardStore((s) => s.activeSelectionSourceId);

  const rect = useCosmographButtonId();
  const poly = useCosmographButtonId();

  // Which tool the user last clicked (tool "activated", awaiting draw)
  const [activatedToolId, setActivatedToolId] = useState<string | null>(null);

  // Clear tool activation when selection is cleared (click empty canvas)
  const prevHasSelection = useRef(hasSelection);
  useEffect(() => {
    if (prevHasSelection.current && !hasSelection) {
      setActivatedToolId(null);
    }
    prevHasSelection.current = hasSelection;
  }, [hasSelection]);

  // Clear tool activation on Escape (cancels tool without selecting)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivatedToolId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!portalTarget) return null;

  // Button is "on" if: user just activated this tool, OR a selection from this tool exists
  const rectOn = activatedToolId === rect.id
    || (hasSelection && activeSourceId === rect.id);
  const polyOn = activatedToolId === poly.id
    || (hasSelection && activeSourceId === poly.id);

  return createPortal(
    <>
      <div
        ref={rect.ref}
        className="graph-icon-btn"
        style={wrapperStyle}
        aria-pressed={rectOn}
        onClick={() => setActivatedToolId(rect.id)}
      >
        <CosmographButtonRectangularSelection style={innerStyle} />
      </div>
      <div
        ref={poly.ref}
        className="graph-icon-btn"
        style={wrapperStyle}
        aria-pressed={polyOn}
        onClick={() => setActivatedToolId(poly.id)}
      >
        <CosmographButtonPolygonalSelection style={innerStyle} />
      </div>
      <div
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: "var(--border-subtle)" }}
      />
    </>,
    portalTarget
  );
}
