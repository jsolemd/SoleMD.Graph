"use client";

import { createRef, useEffect, useMemo, useRef } from "react";
import { fieldLoopClock } from "@/features/ambient-field";

interface AmbientFieldStoryProgressProps {
  beatIds: readonly string[];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function AmbientFieldStoryProgress({
  beatIds,
}: AmbientFieldStoryProgressProps) {
  const beatKey = beatIds.join("|");
  const segmentRefs = useMemo(
    () => beatIds.map(() => createRef<HTMLDivElement>()),
    [beatKey],
  );
  const progressRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pending = true;

    const sync = () => {
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY;
      const focusTop = scrollY + viewportHeight * 0.35;
      let currentVisible = 0;

      beatIds.forEach((beatId, index) => {
        const sectionNode = document.getElementById(beatId);
        const segmentNode = segmentRefs[index]?.current;
        if (!sectionNode || !segmentNode) return;

        const sectionTop = sectionNode.getBoundingClientRect().top + scrollY;
        const sectionHeight = sectionNode.offsetHeight;
        const start = sectionTop - viewportHeight * 0.24;
        const end = sectionTop + sectionHeight - viewportHeight * 0.46;
        const progress = clamp01((focusTop - start) / Math.max(1, end - start));

        if (progress > 0.01) {
          currentVisible = index + 1;
        }

        segmentNode.style.setProperty("--ambient-story-progress", progress.toFixed(4));
      });

      progressRootRef.current?.setAttribute(
        "data-current-visible",
        `${currentVisible}`,
      );
    };

    const requestSync = () => {
      pending = true;
    };

    const disposer = fieldLoopClock.subscribe("story-progress", 50, () => {
      if (!pending) return;
      pending = false;
      sync();
    });

    sync();
    window.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);

    return () => {
      disposer();
      window.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
    };
  }, [beatIds, beatKey, segmentRefs]);

  return (
    <div
      ref={progressRootRef}
      className="sticky top-[92px] z-20 hidden items-center gap-5 pb-8 pt-3 lg:flex"
    >
      {beatIds.map((beatId, index) => (
        <div
          key={beatId}
          className="flex min-w-[124px] items-center gap-3"
        >
          <div className="text-[11px] font-medium tracking-[0.18em] text-[var(--graph-panel-text-dim)]">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="relative h-px flex-1 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--graph-panel-border)_44%,transparent)]">
            <div
              ref={segmentRefs[index]}
              className="absolute inset-y-0 left-0 origin-left rounded-full bg-[var(--color-soft-blue)] [transform:scaleX(var(--ambient-story-progress,0))]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
