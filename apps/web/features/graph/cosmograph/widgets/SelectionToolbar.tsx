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
import {
  disabledNativeIconBtnStyle,
  nativeIconBtnFrameStyle,
  nativeIconBtnInnerStyle,
} from "@/features/graph/components/panels/PanelShell";

/**
 * Inner style applied to the Cosmograph-rendered `<div>`.
 * Overrides Cosmograph's default margin (3px), filter (brightness/contrast),
 * and border-radius (8px) so the inner div fills the circular wrapper cleanly.
 * `boxSizing: "border-box"` plus density-aware padding keeps the inset inside
 * the density-scaled wrapper so the native SVGs resolve to the same icon area
 * as the surrounding Lucide controls.
 */
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
      // Safety timeout — native Cosmograph buttons assign their id
      // synchronously or within one frame. If nothing appears after
      // DISCOVER_TIMEOUT_MS the contract is broken; disconnect the
      // observer and warn so the leak is visible instead of silent.
      const DISCOVER_TIMEOUT_MS = 5000;
      const discover = (
        container: HTMLElement | null,
        setter: (id: string) => void,
        label: string,
      ) => {
        if (!container) return () => {};
        const found = container.querySelector<HTMLElement>("[id]");
        if (found?.id) { setter(found.id); return () => {}; }
        const obs = new MutationObserver(() => {
          const el = container.querySelector<HTMLElement>("[id]");
          if (el?.id) { setter(el.id); obs.disconnect(); }
        });
        obs.observe(container, { childList: true, subtree: true });
        const timeoutId = window.setTimeout(() => {
          obs.disconnect();
          console.warn(
            `[SelectionToolbar] ${label} button id never appeared within ${DISCOVER_TIMEOUT_MS}ms — observer disconnected`,
          );
        }, DISCOVER_TIMEOUT_MS);
        // Cleanup unconditionally disconnects the observer and clears the
        // timeout, even if the button id never resolves.
        return () => {
          window.clearTimeout(timeoutId);
          obs.disconnect();
        };
      };
      const cleanupRect = discover(rectRef.current, setRectButtonId, "rect");
      const cleanupPoly = discover(polyRef.current, setPolyButtonId, "poly");
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
          style={isLocked ? { ...nativeIconBtnFrameStyle, ...disabledNativeIconBtnStyle } : nativeIconBtnFrameStyle}
          aria-label="Rectangular selection"
          aria-pressed={rectOn}
          aria-disabled={isLocked}
        >
          <CosmographButtonRectangularSelection style={nativeIconBtnInnerStyle} />
        </div>
        <div
          ref={polyRef}
          className="graph-icon-btn"
          style={isLocked ? { ...nativeIconBtnFrameStyle, ...disabledNativeIconBtnStyle } : nativeIconBtnFrameStyle}
          aria-label="Lasso selection"
          aria-pressed={polyOn}
          aria-disabled={isLocked}
        >
          <CosmographButtonPolygonalSelection style={nativeIconBtnInnerStyle} />
        </div>
      </>
    );
  },
);
