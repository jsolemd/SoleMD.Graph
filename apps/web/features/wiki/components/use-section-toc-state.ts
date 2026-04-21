"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PanelEdgeTocEntry } from "./PanelEdgeToc";

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) > 0.5) return false;
  }
  return true;
}

function resolveRailProgress(scrollTop: number, sectionStarts: number[]): number {
  if (sectionStarts.length <= 1) return 0;

  const clampedScrollTop = Math.max(0, scrollTop);
  if (clampedScrollTop <= sectionStarts[0]) return 0;

  for (let index = 0; index < sectionStarts.length - 1; index += 1) {
    const start = sectionStarts[index];
    const end = sectionStarts[index + 1];
    if (clampedScrollTop <= end) {
      const span = Math.max(1, end - start);
      return index + (clampedScrollTop - start) / span;
    }
  }

  return sectionStarts.length - 1;
}

function getScrollTop(container: HTMLElement | null): number {
  if (container) return container.scrollTop;
  if (typeof window === "undefined") return 0;
  return window.scrollY;
}

function getViewportHeight(container: HTMLElement | null): number {
  if (container) return container.clientHeight;
  if (typeof window === "undefined") return 0;
  return window.innerHeight;
}

function measureSectionStarts(
  container: HTMLElement | null,
  targets: HTMLElement[],
): number[] {
  if (targets.length === 0) return [];

  const scrollTop = getScrollTop(container);
  const viewportHeight = getViewportHeight(container);
  const activationOffset = viewportHeight * 0.2;
  const maxScroll = container
    ? Math.max(0, container.scrollHeight - container.clientHeight)
    : Math.max(
        0,
        (typeof document === "undefined"
          ? 0
          : document.documentElement.scrollHeight) - viewportHeight,
      );
  const containerTop = container
    ? container.getBoundingClientRect().top
    : 0;
  let previous = 0;

  return targets.map((target) => {
    const rawStart =
      target.getBoundingClientRect().top -
      containerTop +
      scrollTop -
      activationOffset;
    const start = Math.min(maxScroll, Math.max(previous, rawStart));
    previous = start;
    return start;
  });
}

interface SectionTocState {
  activeIndex: number;
  fillProgress: number;
  handleJump: (id: string) => void;
}

export function useSectionTocState({
  entries,
  scrollRef,
  scrollOffsetPx = 0,
}: {
  entries: PanelEdgeTocEntry[];
  scrollRef?: RefObject<HTMLElement | null>;
  scrollOffsetPx?: number;
}): SectionTocState {
  const [fillProgress, setFillProgress] = useState(0);
  const sectionStartsRef = useRef<number[]>([]);
  const entriesKey = useMemo(
    () => entries.map((entry) => entry.id).join("|"),
    [entries],
  );

  useEffect(() => {
    if (entries.length === 0) return undefined;
    const scrollContainer: HTMLElement | null = scrollRef?.current ?? null;
    const scrollEventTarget: Window | HTMLElement | null =
      scrollContainer ?? (typeof window === "undefined" ? null : window);
    if (!scrollEventTarget) return undefined;
    const queryRoot: Document | HTMLElement =
      scrollContainer ?? (typeof document === "undefined" ? null! : document);
    if (!queryRoot) return undefined;

    const entryIds = new Set(entries.map((entry) => entry.id));
    let targets: HTMLElement[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let setupRaf = 0;
    let tickRaf = 0;

    function tick() {
      tickRaf = 0;
      const nextFill = resolveRailProgress(
        getScrollTop(scrollContainer),
        sectionStartsRef.current,
      );
      setFillProgress((previous) => (
        Math.abs(previous - nextFill) < 0.001 ? previous : nextFill
      ));
    }

    function scheduleTick() {
      if (tickRaf !== 0) return;
      tickRaf = requestAnimationFrame(tick);
    }

    function setupObserver() {
      resizeObserver?.disconnect();

      targets = [];
      for (const id of entryIds) {
        const target = queryRoot.querySelector<HTMLElement>(
          `#${CSS.escape(id)}`,
        );
        if (target) targets.push(target);
      }

      if (targets.length === 0) {
        sectionStartsRef.current = [];
        setFillProgress(0);
        return;
      }

      sectionStartsRef.current = measureSectionStarts(scrollContainer, targets);
      scheduleTick();

      resizeObserver = new ResizeObserver(() => {
        const measuredStarts = measureSectionStarts(scrollContainer, targets);
        if (!areNumberArraysEqual(sectionStartsRef.current, measuredStarts)) {
          sectionStartsRef.current = measuredStarts;
        }
        scheduleTick();
      });

      if (scrollContainer) resizeObserver.observe(scrollContainer);
      for (const target of targets) resizeObserver.observe(target);
    }

    setupRaf = requestAnimationFrame(setupObserver);
    scrollEventTarget.addEventListener("scroll", scheduleTick, {
      passive: true,
    });

    const handleWindowResize = () => {
      cancelAnimationFrame(setupRaf);
      setupRaf = requestAnimationFrame(setupObserver);
    };
    if (!scrollContainer && typeof window !== "undefined") {
      window.addEventListener("resize", handleWindowResize, { passive: true });
    }

    return () => {
      cancelAnimationFrame(setupRaf);
      if (tickRaf !== 0) cancelAnimationFrame(tickRaf);
      scrollEventTarget.removeEventListener("scroll", scheduleTick);
      if (!scrollContainer && typeof window !== "undefined") {
        window.removeEventListener("resize", handleWindowResize);
      }
      resizeObserver?.disconnect();
    };
  }, [entries, entries.length, entriesKey, scrollRef]);

  const activeIndex = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.max(0, Math.min(entries.length - 1, Math.floor(fillProgress)));
  }, [entries.length, fillProgress]);

  const handleJump = useCallback(
    (id: string) => {
      const container = scrollRef?.current ?? null;
      const target = (container ?? document).querySelector<HTMLElement>(
        `#${CSS.escape(id)}`,
      );
      if (!target) return;

      if (container) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop =
          targetRect.top - containerRect.top + container.scrollTop - scrollOffsetPx;

        container.scrollTo({
          top: Math.max(0, nextTop),
          behavior: "smooth",
        });
      } else {
        const nextTop =
          target.getBoundingClientRect().top + window.scrollY - scrollOffsetPx;
        window.scrollTo({
          top: Math.max(0, nextTop),
          behavior: "smooth",
        });
      }
    },
    [scrollOffsetPx, scrollRef],
  );

  return {
    activeIndex,
    fillProgress,
    handleJump,
  };
}
