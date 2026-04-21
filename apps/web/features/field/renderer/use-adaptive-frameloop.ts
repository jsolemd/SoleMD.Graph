"use client";

import { useEffect, useState, type RefObject } from "react";

export type AdaptiveFrameloop = "always" | "demand";

interface UseAdaptiveFrameloopOptions {
  reducedMotion: boolean;
  containerRef: RefObject<HTMLElement | null>;
}

function readTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function useAdaptiveFrameloop({
  reducedMotion,
  containerRef,
}: UseAdaptiveFrameloopOptions): AdaptiveFrameloop {
  const [tabVisible, setTabVisible] = useState<boolean>(() => readTabVisible());
  const [onscreen, setOnscreen] = useState<boolean>(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setTabVisible(document.visibilityState === "visible");
    handler();
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setOnscreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setOnscreen(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  if (reducedMotion || !tabVisible || !onscreen) return "demand";
  return "always";
}
