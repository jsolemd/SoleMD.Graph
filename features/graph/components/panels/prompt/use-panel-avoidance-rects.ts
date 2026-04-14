"use client";

import { useEffect, useState } from "react";
import type { PromptAvoidRect } from "./avoidance";

const DESKTOP_PANEL_SELECTOR = '[data-panel-shell="desktop"]';

function measurePanelRects(): PromptAvoidRect[] {
  return Array.from(document.querySelectorAll<HTMLElement>(DESKTOP_PANEL_SELECTOR))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }));
}

export function usePanelAvoidanceRects({ enabled }: { enabled: boolean }) {
  const [avoidRects, setAvoidRects] = useState<PromptAvoidRect[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      setAvoidRects([]);
      return;
    }

    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    const mutationObserver = new MutationObserver(() => {
      observePanels();
      scheduleMeasure();
    });

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setAvoidRects(measurePanelRects());
      });
    };

    const observePanels = () => {
      resizeObserver.disconnect();
      document.querySelectorAll<HTMLElement>(DESKTOP_PANEL_SELECTOR).forEach((element) => {
        resizeObserver.observe(element);
      });
    };

    observePanels();
    scheduleMeasure();
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [enabled]);

  return avoidRects;
}
