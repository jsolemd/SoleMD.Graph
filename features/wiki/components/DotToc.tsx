"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Tooltip } from "@mantine/core";
import { crisp } from "@/lib/motion";
import { dotTocPastelColorSequence } from "@/lib/theme/pastel-tokens";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import type { ModuleSection } from "@/features/wiki/module-runtime/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DotTocEntry {
  /** Exact DOM element ID to scroll to */
  id: string;
  /** Tooltip text */
  title: string;
  /** CSS color value for this dot (defaults to mode accent) */
  color?: string;
}

interface DotTocProps {
  entries: DotTocEntry[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 0.5) return false;
  }
  return true;
}

function resolveRailProgress(scrollTop: number, sectionStarts: number[]): number {
  if (sectionStarts.length <= 1) return 0;

  const clampedScrollTop = Math.max(0, scrollTop);
  if (clampedScrollTop <= sectionStarts[0]) return 0;

  for (let i = 0; i < sectionStarts.length - 1; i++) {
    const start = sectionStarts[i];
    const end = sectionStarts[i + 1];
    if (clampedScrollTop <= end) {
      const span = Math.max(1, end - start);
      return i + (clampedScrollTop - start) / span;
    }
  }

  return sectionStarts.length - 1;
}

function measureSectionStarts(
  container: HTMLElement,
  targets: HTMLElement[],
): number[] {
  if (targets.length === 0) return [];

  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const activationOffset = container.clientHeight * 0.2;
  const containerRect = container.getBoundingClientRect();
  let previous = 0;

  return targets.map((target) => {
    const rawStart = target.getBoundingClientRect().top
      - containerRect.top
      + container.scrollTop
      - activationOffset;
    const start = Math.min(maxScroll, Math.max(previous, rawStart));
    previous = start;
    return start;
  });
}

// ---------------------------------------------------------------------------
// Entry builders (shared across all consumers)
// ---------------------------------------------------------------------------

/** Build DotTocEntry[] from a module manifest's sections. */
export function entriesFromModuleSections(sections: ModuleSection[]): DotTocEntry[] {
  return applyDotTocRainbow(
    sections.map((section) => ({
      id: `section-${section.id}`,
      title: section.title,
    })),
  );
}

/** DotToc owns a full non-repeating pastel sweep before cycling back. */
function applyDotTocRainbow(
  entries: Array<Omit<DotTocEntry, "color">>,
): DotTocEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    color: dotTocPastelColorSequence[index % dotTocPastelColorSequence.length],
  }));
}

/** Scan a container for h1-h3[id] headings and return DotTocEntry[] with rainbow colors. */
export function entriesFromHeadings(container: HTMLElement): DotTocEntry[] {
  const headings = container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
  return applyDotTocRainbow(
    Array.from(headings, (h) => ({
      id: h.id,
      title: h.textContent?.trim() ?? "",
    })),
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOT_GAP_MAX = 26;
const DOT_SIZE = 9;
const DOT_SIZE_ACTIVE = 15;
const HIT_SIZE = 32;
const RAIL_BACKPLATE_WIDTH = 18;
const DEFAULT_COLOR = "var(--mode-accent)";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Scroll-aware dot rail for section navigation.
 *
 * Portaled to the nearest PanelShell (`.z-30`) so dots stay in the
 * panel's stacking context (no bleed-through to overlapping panels)
 * but escape the inner overflow-hidden clip wrapper.
 *
 * Reusable across wiki pages and module views - pass any set of
 * entries with DOM IDs and the scroll container ref.
 */
export function DotToc({ entries, scrollRef, anchorRef }: DotTocProps) {
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<{
    anchorTop: number;
    anchorHeight: number;
  } | null>(null);
  const [fillProgress, setFillProgress] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const sectionStartsRef = useRef<number[]>([]);

  // Stable key for the entries array to avoid effect churn
  const entriesKey = useMemo(
    () => entries.map((e) => e.id).join("|"),
    [entries],
  );

  // Resolve the portal target (PanelShell's outer motion.div)
  useEffect(() => {
    const anchorEl = anchorRef?.current ?? scrollRef.current;
    if (!anchorEl) return;
    panelRef.current = anchorEl.closest<HTMLElement>(".z-30");
  }, [anchorRef, scrollRef]);

  // Track the caller-defined anchor box for rail placement. The rail can
  // follow one element's scroll state while centering against another.
  useEffect(() => {
    const el = anchorRef?.current ?? scrollRef.current;
    const panel = panelRef.current;
    if (!el || !panel || entries.length === 0) return;

    function updateLayout() {
      const anchorRect = el!.getBoundingClientRect();
      const panelRect = panel!.getBoundingClientRect();
      setLayout((prev) => {
        const anchorTop = anchorRect.top - panelRect.top;
        const anchorHeight = anchorRect.height;
        if (prev && prev.anchorTop === anchorTop && prev.anchorHeight === anchorHeight) return prev;
        return { anchorTop, anchorHeight };
      });
    }

    updateLayout();

    const ro = new ResizeObserver(updateLayout);
    ro.observe(el);
    ro.observe(panel);

    // Panel drag: observe style/transform changes on the panel
    const panelMo = new MutationObserver(updateLayout);
    panelMo.observe(panel, { attributes: true, attributeFilter: ["style"] });

    return () => {
      ro.disconnect();
      panelMo.disconnect();
    };
  }, [anchorRef, scrollRef, entries.length]);

  // Track both the active section and the continuous rail progress against the
  // same heading targets so the fill line moves with scroll instead of jumping
  // only when the active heading flips.
  useEffect(() => {
    const maybeScrollEl = scrollRef.current;
    if (!maybeScrollEl || entries.length === 0) return;
    const scrollEl = maybeScrollEl;

    const entryIds = new Set(entries.map((e) => e.id));
    let targets: HTMLElement[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let setupRaf = 0;

    function syncFillProgress() {
      const next = resolveRailProgress(scrollEl.scrollTop, sectionStartsRef.current);
      setFillProgress((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    }

    function setupObserver() {
      observerRef.current?.disconnect();
      resizeObserver?.disconnect();

      targets = [];
      for (const id of entryIds) {
        const target = scrollEl.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (target) targets.push(target);
      }
      if (targets.length === 0) {
        sectionStartsRef.current = [];
        setFillProgress(0);
        setInView((prev) => (prev.size === 0 ? prev : new Set()));
        return;
      }

      const observer = new IntersectionObserver(
        (observed) => {
          setInView((prev) => {
            const next = new Set(prev);
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
            return changed ? next : prev;
          });
        },
        { root: scrollEl, rootMargin: "0px 0px -80% 0px" },
      );
      observerRef.current = observer;
      for (const t of targets) observer.observe(t);

      const nextSectionStarts = measureSectionStarts(scrollEl, targets);
      sectionStartsRef.current = nextSectionStarts;
      syncFillProgress();

      resizeObserver = new ResizeObserver(() => {
        const measuredStarts = measureSectionStarts(scrollEl, targets);
        if (!areNumberArraysEqual(sectionStartsRef.current, measuredStarts)) {
          sectionStartsRef.current = measuredStarts;
        }
        syncFillProgress();
      });
      resizeObserver.observe(scrollEl);
      for (const t of targets) resizeObserver.observe(t);
    }

    setupRaf = requestAnimationFrame(setupObserver);
    scrollEl.addEventListener("scroll", syncFillProgress, { passive: true });

    const mutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(setupRaf);
      setupRaf = requestAnimationFrame(setupObserver);
    });
    mutationObserver.observe(scrollEl, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(setupRaf);
      scrollEl.removeEventListener("scroll", syncFillProgress);
      observerRef.current?.disconnect();
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entriesKey is the stable proxy for entries
  }, [scrollRef, entriesKey]);

  const activeIndex = useMemo(() => {
    if (inView.size === 0) return 0;
    for (let i = 0; i < entries.length; i++) {
      if (inView.has(entries[i].id)) return i;
    }
    return 0;
  }, [inView, entries]);

  const handleClick = useCallback(
    (id: string) => {
      scrollRef.current
        ?.querySelector(`#${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef],
  );

  const portalTarget = panelRef.current;
  if (!tocOpen || entries.length === 0 || !layout || !portalTarget || typeof document === "undefined") return null;

  // Responsive gap: size the rail against the actual scroll viewport, not the
  // full panel chrome, so the dots stay aligned with what the user is reading.
  const maxRailHeight = layout.anchorHeight - HIT_SIZE * 2;
  const dotGap = entries.length > 1
    ? Math.min(DOT_GAP_MAX, Math.max(8, maxRailHeight / (entries.length - 1)))
    : DOT_GAP_MAX;

  const railHeight = (entries.length - 1) * dotGap;
  const fillHeight = fillProgress * dotGap;
  const navHeight = Math.max(entries.length * Math.min(dotGap, HIT_SIZE), railHeight + HIT_SIZE);

  // Center the rail within the scroll viewport, panel-relative coords.
  const navTop = layout.anchorTop + layout.anchorHeight / 2;

  const renderedDots = entries.map((entry, i) => {
    const isActive = i === activeIndex;
    const dotColor = entry.color ?? DEFAULT_COLOR;
    const matteDotColor = isActive
      ? dotColor
      : `color-mix(in srgb, ${dotColor} 52%, var(--graph-panel-bg))`;

    return (
      <Tooltip
        key={entry.id}
        label={entry.title}
        position="left"
        withArrow
        openDelay={200}
      >
        <motion.button
          type="button"
          aria-label={`Jump to ${entry.title}`}
          aria-current={isActive ? "step" : undefined}
          onClick={() => handleClick(entry.id)}
          style={{
            all: "unset",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: HIT_SIZE,
            height: dotGap < HIT_SIZE ? dotGap : HIT_SIZE,
            cursor: "pointer",
            boxSizing: "border-box" as const,
          }}
          whileHover={{ scale: 1.2 }}
        >
          <motion.div
            animate={{
              width: isActive ? DOT_SIZE_ACTIVE : DOT_SIZE,
              height: isActive ? DOT_SIZE_ACTIVE : DOT_SIZE,
              opacity: 1,
              backgroundColor: matteDotColor,
              boxShadow: "none",
            }}
            transition={crisp}
            style={{
              borderRadius: "50%",
              flexShrink: 0,
              zIndex: 1,
            }}
          />
        </motion.button>
      </Tooltip>
    );
  });

  return createPortal(
    <nav
      role="navigation"
      aria-label="Section navigation"
      style={{
        position: "absolute",
        right: -(HIT_SIZE / 2),
        top: navTop,
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      {/* Outer half-capsule: panel-matched surface only where the rail protrudes past the panel edge */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translateY(-50%)",
          width: RAIL_BACKPLATE_WIDTH,
          height: navHeight,
          backgroundColor: "var(--graph-panel-bg)",
          borderTopRightRadius: RAIL_BACKPLATE_WIDTH,
          borderBottomRightRadius: RAIL_BACKPLATE_WIDTH,
          boxShadow: "0 0 0 1px var(--graph-panel-border), var(--graph-panel-shadow)",
          clipPath: "inset(-40px -40px -40px 0)",
          pointerEvents: "none",
        }}
      />

      {/* Track background */}
      <div
        style={{
          position: "absolute",
          top: HIT_SIZE / 2,
          left: "50%",
          transform: "translateX(-50%)",
          width: 1.5,
          height: railHeight,
          backgroundColor: "var(--graph-panel-border)",
          opacity: 0.5,
          borderRadius: 1,
        }}
      />

      {/* Track fill (progress) */}
      <motion.div
        animate={{ height: fillHeight }}
        transition={crisp}
        data-testid="dot-toc-fill"
        style={{
          position: "absolute",
          top: HIT_SIZE / 2,
          left: "50%",
          transform: "translateX(-50%)",
          width: 1.5,
          backgroundColor: "var(--mode-accent)",
          opacity: 0.4,
          borderRadius: 1,
        }}
      />

      {/* Dots */}
      {renderedDots}
    </nav>,
    portalTarget,
  );
}
