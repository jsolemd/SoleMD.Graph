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
import type { ModuleSection } from "@/features/learn/types";
import { accentCssVar } from "@/features/learn/tokens";

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
}

// ---------------------------------------------------------------------------
// Entry builders (shared across all consumers)
// ---------------------------------------------------------------------------

/** Build DotTocEntry[] from a module manifest's sections. */
export function entriesFromModuleSections(sections: ModuleSection[]): DotTocEntry[] {
  return sections.map((s) => ({
    id: `section-${s.id}`,
    title: s.title,
    color: s.accent ? accentCssVar(s.accent) : undefined,
  }));
}

/** Scan a container for h1-h3[id] headings and return DotTocEntry[]. */
export function entriesFromHeadings(container: HTMLElement): DotTocEntry[] {
  const headings = container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
  const entries: DotTocEntry[] = [];
  for (const h of headings) {
    entries.push({ id: h.id, title: h.textContent?.trim() ?? "" });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOT_GAP = 18;
const DOT_SIZE = 6;
const DOT_SIZE_ACTIVE = 8;
const HIT_SIZE = 24;
const DEFAULT_COLOR = "var(--mode-accent)";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Scroll-aware dot rail for section navigation.
 *
 * Portaled to document.body so dots float above the panel edge.
 * Anchored to the scroll container's bounding rect via ResizeObserver
 * + a MutationObserver on the nearest positioned ancestor (panel div)
 * to catch transform-based repositioning.
 *
 * Reusable across wiki pages and module views - pass any set of
 * entries with DOM IDs and the scroll container ref.
 */
export function DotToc({ entries, scrollRef }: DotTocProps) {
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<{ top: number; right: number; height: number } | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Stable key for the entries array to avoid effect churn
  const entriesKey = useMemo(
    () => entries.map((e) => e.id).join("|"),
    [entries],
  );

  // Track scroll container position for portal anchoring.
  // ResizeObserver covers size changes; MutationObserver on the panel
  // ancestor catches transform-based drag repositioning without RAF polling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || entries.length === 0) return;

    function updateAnchor() {
      const rect = el!.getBoundingClientRect();
      setAnchor((prev) => {
        const top = rect.top;
        const right = window.innerWidth - rect.right;
        const height = rect.height;
        if (prev && prev.top === top && prev.right === right && prev.height === height) return prev;
        return { top, right, height };
      });
    }

    updateAnchor();

    // Size changes
    const ro = new ResizeObserver(updateAnchor);
    ro.observe(el);

    // Viewport changes
    window.addEventListener("resize", updateAnchor);

    // Panel drag repositioning: observe style/transform changes on the
    // nearest positioned ancestor (the PanelShell motion.div).
    const panelEl = el.closest<HTMLElement>(".z-30");
    let panelMo: MutationObserver | undefined;
    if (panelEl) {
      panelMo = new MutationObserver(updateAnchor);
      panelMo.observe(panelEl, { attributes: true, attributeFilter: ["style"] });
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateAnchor);
      panelMo?.disconnect();
    };
  }, [scrollRef, entries.length]);

  // IntersectionObserver + MutationObserver for active section tracking
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || entries.length === 0) return;

    const entryIds = new Set(entries.map((e) => e.id));

    function setupObserver() {
      observerRef.current?.disconnect();

      const targets: HTMLElement[] = [];
      for (const id of entryIds) {
        const target = el!.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (target) targets.push(target);
      }
      if (targets.length === 0) return;

      const observer = new IntersectionObserver(
        (observed) => {
          setInView((prev) => {
            const next = new Set(prev);
            for (const entry of observed) {
              if (entry.isIntersecting) next.add(entry.target.id);
              else next.delete(entry.target.id);
            }
            return next;
          });
        },
        { root: el, rootMargin: "0px 0px -80% 0px" },
      );
      observerRef.current = observer;
      for (const t of targets) observer.observe(t);
    }

    const raf = requestAnimationFrame(setupObserver);
    const mutationObserver = new MutationObserver(() => setupObserver());
    mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      observerRef.current?.disconnect();
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

  if (entries.length === 0 || !anchor || typeof document === "undefined") return null;

  const railHeight = (entries.length - 1) * DOT_GAP;
  const fillHeight = activeIndex * DOT_GAP;

  return createPortal(
    <nav
      role="navigation"
      aria-label="Section navigation"
      style={{
        position: "fixed",
        right: anchor.right - HIT_SIZE / 2,
        top: anchor.top + anchor.height / 2,
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 40,
        pointerEvents: "auto",
      }}
    >
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
      {entries.map((entry, i) => {
        const isActive = i === activeIndex;
        const dotColor = entry.color ?? DEFAULT_COLOR;

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
                height: HIT_SIZE,
                cursor: "pointer",
                boxSizing: "border-box" as const,
              }}
              whileHover={{ scale: 1.2 }}
            >
              <motion.div
                animate={{
                  width: isActive ? DOT_SIZE_ACTIVE : DOT_SIZE,
                  height: isActive ? DOT_SIZE_ACTIVE : DOT_SIZE,
                  opacity: isActive ? 1 : 0.4,
                  boxShadow: isActive
                    ? `0 0 6px ${dotColor}`
                    : "0 0 0px transparent",
                }}
                transition={crisp}
                style={{
                  borderRadius: "50%",
                  backgroundColor: dotColor,
                  flexShrink: 0,
                }}
              />
            </motion.button>
          </Tooltip>
        );
      })}
    </nav>,
    document.body,
  );
}
