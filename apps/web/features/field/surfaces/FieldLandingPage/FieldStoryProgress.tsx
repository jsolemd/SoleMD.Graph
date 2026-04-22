"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { APP_CHROME_PX } from "@/lib/density";
import { useFieldSceneStore } from "../../scroll/field-scene-store";
import {
  getFieldChapterProgress,
  isFieldChapterActive,
} from "../../scroll/scene-selectors";
import {
  FIELD_CHAPTER_SECTION_IDS,
  type FieldChapterKey,
} from "../../scroll/chapter-adapters/types";

interface FieldStoryProgressProps {
  beatIds: readonly string[];
  chapterKey: FieldChapterKey;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function FieldStoryProgress({
  beatIds,
  chapterKey,
}: FieldStoryProgressProps) {
  const sceneStore = useFieldSceneStore();
  const progressRootRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);
  const numberRefs = useRef<Array<HTMLDivElement | null>>([]);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = progressRootRef.current;
    if (!root) return;

    const mobileMql = window.matchMedia("(max-width: 1023px)");
    const headerHeight = APP_CHROME_PX.panelTop;
    const sectionId = FIELD_CHAPTER_SECTION_IDS[chapterKey];

    const applyNumberEmphasis = (currentVisible: number) => {
      numberRefs.current.forEach((numNode, index) => {
        if (!numNode) return;
        const isCurrent = index + 1 === currentVisible;
        numNode.style.color = isCurrent
          ? "var(--graph-panel-text)"
          : "var(--graph-panel-text-dim)";
        numNode.style.fontWeight = isCurrent ? "600" : "500";
      });
    };

    const resetBars = () => {
      beatIds.forEach((_, index) => {
        root.style.setProperty(`--progress-${index + 1}`, "0");
      });
      root.style.setProperty("--bar-width", "0px");
      root.setAttribute("data-current-visible", "0");
      root.setAttribute("aria-valuenow", "1");
      root.classList.remove("is-active");
      barRefs.current.forEach((bar) => {
        bar?.parentElement?.removeAttribute("aria-current");
      });
      applyNumberEmphasis(0);
      if (descRef.current) {
        descRef.current.textContent = `Chapter 1 of ${beatIds.length}`;
      }
    };

    const measureBarWidth = () => {
      const firstBar = barRefs.current[0];
      if (!firstBar) return;
      root.style.setProperty("--bar-width", `${firstBar.offsetWidth}px`);
    };

    const sync = () => {
      if (mobileMql.matches) return;
      const sceneState = sceneStore.getCurrentState();
      if (!sceneState) {
        resetBars();
        return;
      }
      const chapterActive = isFieldChapterActive(sceneState, sectionId);
      const chapterProgress = getFieldChapterProgress(sceneState, sectionId);
      if (!chapterActive && chapterProgress <= 0.001) {
        resetBars();
        return;
      }
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
      root.setAttribute("aria-valuenow", `${currentVisible}`);
      root.classList.toggle(
        "is-active",
        totalProgress > 0 && totalProgress < beatIds.length,
      );

      barRefs.current.forEach((bar, index) => {
        const container = bar?.parentElement;
        if (!container) return;
        if (index + 1 === currentVisible) {
          container.setAttribute("aria-current", "true");
        } else {
          container.removeAttribute("aria-current");
        }
      });

      applyNumberEmphasis(currentVisible);

      if (descRef.current) {
        descRef.current.textContent = `Chapter ${currentVisible} of ${beatIds.length}`;
      }
    };

    if (mobileMql.matches) {
      resetBars();
    } else {
      measureBarWidth();
      sync();
    }

    const unsubscribe = sceneStore.subscribe(sync);
    const handleResize = () => {
      if (mobileMql.matches) {
        resetBars();
        return;
      }
      measureBarWidth();
      sync();
    };
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      unsubscribe();
      window.removeEventListener("resize", handleResize);
    };
  }, [beatIds, chapterKey, sceneStore]);

  return (
    <div
      ref={progressRootRef}
      role="progressbar"
      aria-label="Chapter progress"
      aria-valuemin={1}
      aria-valuemax={beatIds.length}
      aria-valuenow={1}
      aria-describedby={`progress-desc-${chapterKey}`}
      className="sticky top-[92px] z-20 hidden items-center gap-5 pb-8 pt-3 lg:flex"
    >
      <p ref={descRef} id={`progress-desc-${chapterKey}`} className="sr-only">
        Chapter 1 of {beatIds.length}
      </p>
      {beatIds.map((beatId, index) => (
        <div
          key={beatId}
          role="listitem"
          className="flex min-w-[124px] items-center gap-3"
        >
          <div
            ref={(node) => {
              numberRefs.current[index] = node;
            }}
            className="text-[11px] font-medium tracking-[0.18em] text-[var(--graph-panel-text-dim)] transition-[color,font-weight] duration-200"
          >
            {String(index + 1).padStart(2, "0")}
          </div>
          <div
            ref={(node) => {
              barRefs.current[index] = node;
            }}
            data-progress-bar
            className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--graph-panel-border)_65%,transparent)]"
          >
            <div
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[var(--color-soft-blue)]"
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
