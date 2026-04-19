"use client";

import { createRef, useEffect, useMemo, useRef, type RefObject } from "react";

interface AmbientFieldStoryProgressProps {
  beatIds: readonly string[];
  rootRef: RefObject<HTMLDivElement | null>;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function AmbientFieldStoryProgress({
  beatIds,
  rootRef,
}: AmbientFieldStoryProgressProps) {
  const beatKey = beatIds.join("|");
  const segmentRefs = useMemo(
    () => beatIds.map(() => createRef<HTMLDivElement>()),
    [beatKey],
  );
  const progressRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let frame = 0;

    const sync = () => {
      frame = 0;

      const viewportHeight = root.clientHeight;
      const focusTop = root.scrollTop + viewportHeight * 0.35;
      let currentVisible = 0;

      beatIds.forEach((beatId, index) => {
        const sectionNode = root.querySelector<HTMLElement>(`#${CSS.escape(beatId)}`);
        const segmentNode = segmentRefs[index]?.current;
        if (!sectionNode || !segmentNode) return;

        const start = sectionNode.offsetTop - viewportHeight * 0.24;
        const end =
          sectionNode.offsetTop + sectionNode.offsetHeight - viewportHeight * 0.46;
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
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    requestSync();
    root.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      root.removeEventListener("scroll", requestSync);
      window.removeEventListener("resize", requestSync);
    };
  }, [beatIds, beatKey, progressRootRef, rootRef, segmentRefs]);

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
