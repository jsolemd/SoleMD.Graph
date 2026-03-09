"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CosmographButtonPolygonalSelection,
  CosmographButtonRectangularSelection,
} from "@cosmograph/react";

/**
 * Selection tools portaled into the native Cosmograph controls container
 * so they share the exact same flex row, alignment, and sizing.
 *
 * Uses createPortal (React-safe) instead of manual DOM insertion
 * to avoid cleanup issues when the component unmounts (e.g. Hide UI).
 */
const buttonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 24,
  border: "0.8px solid transparent",
  backgroundColor: "transparent",
  color: "var(--graph-panel-text-dim)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 9,
};

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

    // Wordmark may not be mounted yet — watch for it
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

export function CanvasControls() {
  const portalTarget = usePortalTarget("[data-wordmark-toolbar]");

  if (!portalTarget) return null;

  return createPortal(
    <>
      <CosmographButtonRectangularSelection style={buttonStyle} />
      <CosmographButtonPolygonalSelection style={buttonStyle} />
      <div
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: "var(--border-subtle)" }}
      />
    </>,
    portalTarget
  );
}
