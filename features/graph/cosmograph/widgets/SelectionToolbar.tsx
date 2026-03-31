"use client";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
  useCosmograph,
} from "@cosmograph/react";
import { useDashboardStore } from "@/features/graph/stores";

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

/* ── Component ─────────────────────────────────────────────────── */

export interface SelectionToolbarHandle {
  /** Reset Cosmograph point/link selections and clear internal tool state. */
  clearSelections: () => void;
}

interface SelectionToolbarProps {
  isLocked: boolean;
  activeSourceId: string | null;
  hasSelection: boolean;
  onActivate: (tool: "rect" | "poly") => void;
  /** Called after Cosmograph selections are reset — parent uses this to clear store state. */
  onClear: () => void;
}

/**
 * Selection tool buttons — thin adapter over Cosmograph native controls.
 *
 * Architecture: the native `CosmographButtonRectangularSelection` and
 * `CosmographButtonPolygonalSelection` own all click→activate→drag→select
 * behavior internally. Our adapter only tracks which tool is active for
 * `aria-pressed` styling and exposes `clearSelections` for the parent.
 *
 * No wrapper `onClick` handlers — native buttons are the sole click target.
 */
export const SelectionToolbar = forwardRef<SelectionToolbarHandle, SelectionToolbarProps>(
  function SelectionToolbar(
    { isLocked, activeSourceId, hasSelection, onActivate, onClear },
    ref,
  ) {
    const rectRef = useRef<HTMLDivElement>(null);
    const polyRef = useRef<HTMLDivElement>(null);
    const [activeToolId, setActiveToolId] = useState<string | null>(null);
    const { cosmograph } = useCosmograph();

    const clearSelections = useCallback(() => {
      cosmograph?.pointsSelection?.reset();
      cosmograph?.linksSelection?.reset();
      setActiveToolId(null);
      onClear();
    }, [cosmograph, onClear]);

    useImperativeHandle(ref, () => ({ clearSelections }), [clearSelections]);

    // Discover Cosmograph-assigned button IDs by observing the rendered DOM.
    // Native buttons render a child `<div id="...">` asynchronously.
    const [rectButtonId, setRectButtonId] = useState<string | null>(null);
    const [polyButtonId, setPolyButtonId] = useState<string | null>(null);

    useEffect(() => {
      const discover = (container: HTMLElement | null, setter: (id: string) => void) => {
        if (!container) return () => {};
        const found = container.querySelector<HTMLElement>("[id]");
        if (found?.id) { setter(found.id); return () => {}; }
        const obs = new MutationObserver(() => {
          const el = container.querySelector<HTMLElement>("[id]");
          if (el?.id) { setter(el.id); obs.disconnect(); }
        });
        obs.observe(container, { childList: true, subtree: true });
        return () => obs.disconnect();
      };
      const cleanupRect = discover(rectRef.current, setRectButtonId);
      const cleanupPoly = discover(polyRef.current, setPolyButtonId);
      return () => { cleanupRect(); cleanupPoly(); };
    }, []);

    // Track which tool the user activates via click on the native buttons.
    // Listen for native click events (capture phase) on the wrappers so we
    // know when a tool was activated without intercepting the native handler.
    useEffect(() => {
      const rectEl = rectRef.current;
      const polyEl = polyRef.current;
      if (!rectEl || !polyEl) return;

      const handleRectClick = () => {
        if (!isLocked) {
          setActiveToolId(rectButtonId);
          onActivate("rect");
        }
      };
      const handlePolyClick = () => {
        if (!isLocked) {
          setActiveToolId(polyButtonId);
          onActivate("poly");
        }
      };

      // Capture phase — observe only, don't call activation methods.
      // The native CosmographButton already calls activateRectSelection()
      // in its own click handler; duplicating that can confuse internal state.
      rectEl.addEventListener("click", handleRectClick, true);
      polyEl.addEventListener("click", handlePolyClick, true);
      return () => {
        rectEl.removeEventListener("click", handleRectClick, true);
        polyEl.removeEventListener("click", handlePolyClick, true);
      };
    }, [isLocked, rectButtonId, polyButtonId, onActivate]);

    // Clear tool activation when selection changes or locks
    useEffect(() => {
      const unsubscribe = useDashboardStore.subscribe((state, prevState) => {
        const hasSelectionNow = state.selectedPointCount > 0;
        const hadSelection = prevState.selectedPointCount > 0;
        const isLockedNow = state.selectionLocked;
        const wasLocked = prevState.selectionLocked;

        if ((hadSelection && !hasSelectionNow) || (!wasLocked && isLockedNow)) {
          setActiveToolId(null);
        }
      });
      return unsubscribe;
    }, []);

    // Clear tool activation on Escape
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setActiveToolId(null);
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);

    const rectOn = !isLocked && (
      activeToolId === rectButtonId
      || (hasSelection && activeSourceId === rectButtonId)
    );
    const polyOn = !isLocked && (
      activeToolId === polyButtonId
      || (hasSelection && activeSourceId === polyButtonId)
    );

    return (
      <>
        <div
          ref={rectRef}
          className="graph-icon-btn"
          style={isLocked ? { ...wrapperStyle, opacity: 0.35, pointerEvents: "none" } : wrapperStyle}
          aria-pressed={rectOn}
          aria-disabled={isLocked}
        >
          <CosmographButtonRectangularSelection style={innerStyle} />
        </div>
        <div
          ref={polyRef}
          className="graph-icon-btn"
          style={isLocked ? { ...wrapperStyle, opacity: 0.35, pointerEvents: "none" } : wrapperStyle}
          aria-pressed={polyOn}
          aria-disabled={isLocked}
        >
          <CosmographButtonPolygonalSelection style={innerStyle} />
        </div>
      </>
    );
  },
);
