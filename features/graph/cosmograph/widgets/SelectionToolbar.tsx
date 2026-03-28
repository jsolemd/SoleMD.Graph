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

/* ── Hooks ─────────────────────────────────────────────────────── */

/**
 * Read the Cosmograph-assigned `id` from the rendered button `<div>`.
 * IDs are auto-generated (e.g. "c", "n") so we discover them at mount
 * via ref callback + MutationObserver fallback for async rendering.
 */
function useCosmographButtonId() {
  const [id, setId] = useState<string | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (el) {
      const inner = el.querySelector<HTMLElement>("[id]");
      if (inner?.id) { setId(inner.id); return; }
      const obs = new MutationObserver(() => {
        const found = el.querySelector<HTMLElement>("[id]");
        if (found?.id) { setId(found.id); obs.disconnect(); observerRef.current = null; }
      });
      obs.observe(el, { childList: true, subtree: true });
      observerRef.current = obs;
    }
  }, []);

  return { ref, id };
}

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

export const SelectionToolbar = forwardRef<SelectionToolbarHandle, SelectionToolbarProps>(
  function SelectionToolbar(
    { isLocked, activeSourceId, hasSelection, onActivate, onClear },
    ref,
  ) {
    const { ref: rectButtonRef, id: rectButtonId } = useCosmographButtonId();
    const { ref: polyButtonRef, id: polyButtonId } = useCosmographButtonId();
    const [activatedToolId, setActivatedToolId] = useState<string | null>(null);
    const { cosmograph } = useCosmograph();

    const clearSelections = useCallback(() => {
      cosmograph?.pointsSelection?.reset();
      cosmograph?.linksSelection?.reset();
      setActivatedToolId(null);
      onClear();
    }, [cosmograph, onClear]);

    useImperativeHandle(ref, () => ({ clearSelections }), [clearSelections]);

    // Clear tool activation when selection changes or locks
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

    // Clear tool activation on Escape
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setActivatedToolId(null);
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);

    const rectOn = !isLocked && (
      activatedToolId === rectButtonId
      || (hasSelection && activeSourceId === rectButtonId)
    );
    const polyOn = !isLocked && (
      activatedToolId === polyButtonId
      || (hasSelection && activeSourceId === polyButtonId)
    );

    return (
      <>
        <div
          ref={rectButtonRef}
          className="graph-icon-btn"
          style={isLocked ? { ...wrapperStyle, opacity: 0.35, pointerEvents: "none" } : wrapperStyle}
          aria-pressed={rectOn}
          aria-disabled={isLocked}
          onClick={() => {
            if (!isLocked) {
              setActivatedToolId(rectButtonId);
              onActivate("rect");
            }
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
            if (!isLocked) {
              setActivatedToolId(polyButtonId);
              onActivate("poly");
            }
          }}
        >
          <CosmographButtonPolygonalSelection style={innerStyle} />
        </div>
      </>
    );
  },
);
