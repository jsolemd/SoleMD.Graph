"use client";

import { useState, useEffect, useCallback } from "react";
import type { ModuleSection } from "@/features/learn/types";
import { prefersReducedMotion } from "@/features/learn/motion";

interface ModuleProgressProps {
  sections: ModuleSection[];
}

export function ModuleProgress({ sections: _sections }: ModuleProgressProps) {
  const [progress, setProgress] = useState(0);
  const reduced = typeof window !== "undefined" && prefersReducedMotion();

  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) {
      setProgress(100);
      return;
    }
    setProgress((scrollTop / docHeight) * 100);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 1000,
        backgroundColor: "color-mix(in srgb, var(--module-accent) 30%, transparent)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "var(--module-accent)",
          transition: reduced ? "none" : "width 100ms ease-out",
        }}
      />
    </div>
  );
}
