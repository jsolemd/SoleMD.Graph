"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { APP_CHROME_PX } from "@/lib/density";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";

interface FieldStoryProgressProps {
  beatIds: readonly string[];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function FieldStoryProgress({
  beatIds,
}: FieldStoryProgressProps) {
  const progressRootRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shellVariant = useShellVariantContext();

  useEffect(() => {
    const root = progressRootRef.current;
    if (!root || shellVariant !== "desktop") {
      if (root) {
        beatIds.forEach((_, index) => {
          root.style.setProperty(`--progress-${index + 1}`, "0");
        });
        root.style.setProperty("--bar-width", "0px");
        root.setAttribute("data-current-visible", "0");
        root.classList.remove("is-active");
      }
      return;
    }

    const headerHeight = APP_CHROME_PX.panelTop;

    const measureBarWidth = () => {
      const firstBar = barRefs.current[0];
      if (!firstBar) return;
      root.style.setProperty("--bar-width", `${firstBar.offsetWidth}px`);
    };

    const sync = () => {
      const viewportHeight = window.innerHeight;
      const pivotY = viewportHeight / 2;
      const progressMap: Record<string, number> = {};
      const progresses = beatIds.map((beatId, index) => {
        const sectionNode = document.getElementById(beatId);
        if (!sectionNode) {
          progressMap[`--progress-${index + 1}`] = 0;
          return 0;
        }

        const rect = sectionNode.getBoundingClientRect();
        const sectionHeight = Math.max(rect.height, 1);
        let progress = 0;
        if (rect.top < pivotY) {
          progress =
            rect.bottom - headerHeight <= 0
              ? 1
              : clamp01(Math.abs(rect.top - pivotY) / sectionHeight);
        }

        progressMap[`--progress-${index + 1}`] = Number(progress.toFixed(4));
        return progress;
      });

      const totalProgress = progresses.reduce((sum, value) => sum + value, 0);
      const currentVisible = Math.min(
        Math.floor(totalProgress) + 1,
        beatIds.length,
      );

      gsap.to(root, {
        ...progressMap,
        duration: 0.1,
        ease: "sine",
        overwrite: "auto",
      });

      root.setAttribute("data-current-visible", `${currentVisible}`);
      root.classList.toggle(
        "is-active",
        totalProgress > 0 && totalProgress < beatIds.length,
      );
    };

    measureBarWidth();
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", measureBarWidth);
    window.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", measureBarWidth);
      window.removeEventListener("resize", sync);
    };
  }, [beatIds, shellVariant]);

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
          <div
            ref={(node) => {
              barRefs.current[index] = node;
            }}
            data-progress-bar
            className="relative h-px flex-1 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--graph-panel-border)_44%,transparent)]"
          >
            <div
              className="absolute inset-y-0 left-0 origin-left rounded-full bg-[var(--color-soft-blue)]"
              style={{
                transform: `scaleX(var(--progress-${index + 1}, 0))`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
