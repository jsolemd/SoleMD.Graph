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
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [fillProgress, setFillProgress] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
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

    function syncFillProgress() {
      const next = resolveRailProgress(
        getScrollTop(scrollContainer),
        sectionStartsRef.current,
      );
      setFillProgress((previous) => (
        Math.abs(previous - next) < 0.001 ? previous : next
      ));
    }

    function setupObserver() {
      observerRef.current?.disconnect();
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
        setInView((previous) => (previous.size === 0 ? previous : new Set()));
        return;
      }

      const observer = new IntersectionObserver(
        (observed) => {
          setInView((previous) => {
            const next = new Set(previous);
            let changed = false;

            for (const entry of observed) {
              if (entry.isIntersecting) {
                if (!next.has(entry.target.id)) {
                  next.add(entry.target.id);
                  changed = true;
                }
              } else if (next.delete(entry.target.id)) {
                changed = true;
              }
            }

            return changed ? next : previous;
          });
        },
        { root: scrollContainer, rootMargin: "0px 0px -80% 0px" },
      );

      observerRef.current = observer;
      for (const target of targets) observer.observe(target);

      sectionStartsRef.current = measureSectionStarts(scrollContainer, targets);
      syncFillProgress();

      resizeObserver = new ResizeObserver(() => {
        const measuredStarts = measureSectionStarts(scrollContainer, targets);
        if (!areNumberArraysEqual(sectionStartsRef.current, measuredStarts)) {
          sectionStartsRef.current = measuredStarts;
        }
        syncFillProgress();
      });

      if (scrollContainer) resizeObserver.observe(scrollContainer);
      for (const target of targets) resizeObserver.observe(target);
    }

    setupRaf = requestAnimationFrame(setupObserver);
    scrollEventTarget.addEventListener("scroll", syncFillProgress, {
      passive: true,
    });

    const mutationTarget: HTMLElement | null =
      scrollContainer ??
      (typeof document === "undefined" ? null : document.body);
    const mutationObserver = mutationTarget ? new MutationObserver(() => {
      cancelAnimationFrame(setupRaf);
      setupRaf = requestAnimationFrame(setupObserver);
    }) : null;
    if (mutationObserver && mutationTarget) {
      mutationObserver.observe(mutationTarget, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(setupRaf);
      scrollEventTarget.removeEventListener("scroll", syncFillProgress);
      observerRef.current?.disconnect();
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [entries, entries.length, entriesKey, scrollRef]);

  const activeIndex = useMemo(() => {
    if (inView.size > 0) {
      for (let index = 0; index < entries.length; index += 1) {
        if (inView.has(entries[index].id)) return index;
      }
    }

    if (entries.length === 0) return 0;
    return Math.max(0, Math.min(entries.length - 1, Math.floor(fillProgress)));
  }, [entries, fillProgress, inView]);

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
