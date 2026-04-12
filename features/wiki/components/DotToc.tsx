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
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
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
  const raw = sections.map((s) => ({
    id: `section-${s.id}`,
    title: s.title,
    color: s.accent ? accentCssVar(s.accent) : undefined,
  }));
  return ensureAdjacentUnique(raw);
}

/**
 * Extended pastel palette — 20 distinct hues spanning the full rainbow.
 * Token accents first, then supplementary pastels for pages with many headings.
 * Ordered so adjacent entries always contrast visually.
 */
const RAINBOW: string[] = [
  accentCssVar("soft-blue"),       // blue
  accentCssVar("golden-yellow"),   // gold
  accentCssVar("fresh-green"),     // green
  accentCssVar("warm-coral"),      // coral
  accentCssVar("muted-indigo"),    // indigo
  accentCssVar("soft-pink"),       // pink
  "var(--color-seafoam)",          // seafoam
  accentCssVar("paper"),           // paper
  accentCssVar("soft-lavender"),   // lavender
  "var(--color-amber)",            // amber
  "var(--color-sky)",              // sky
  "var(--color-rose)",             // rose
  "var(--color-mint)",             // mint
  "var(--color-orchid)",           // orchid
  "var(--color-maize)",            // maize
  "var(--color-powder)",           // powder
  "var(--color-peach)",            // peach
  "var(--color-sage)",             // sage
  "var(--color-plum)",             // plum
  "var(--color-pear)",             // pear
];

/**
 * Post-process entries so no two adjacent dots share the same color.
 * Respects existing colors when possible; replaces only on collision.
 */
function ensureAdjacentUnique(entries: DotTocEntry[]): DotTocEntry[] {
  if (entries.length === 0) return entries;
  let cycleIdx = 0;
  let prevColor: string | undefined;

  return entries.map((entry) => {
    let color = entry.color ?? RAINBOW[cycleIdx++ % RAINBOW.length];

    if (color === prevColor) {
      for (let attempt = 0; attempt < RAINBOW.length; attempt++) {
        const candidate = RAINBOW[cycleIdx++ % RAINBOW.length];
        if (candidate !== prevColor) {
          color = candidate;
          break;
        }
      }
    }

    prevColor = color;
    return color === entry.color ? entry : { ...entry, color };
  });
}

/** Scan a container for h1-h3[id] headings and return DotTocEntry[] with rainbow colors. */
export function entriesFromHeadings(container: HTMLElement): DotTocEntry[] {
  const headings = container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
  const raw: DotTocEntry[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    raw.push({
      id: h.id,
      title: h.textContent?.trim() ?? "",
      color: RAINBOW[i % RAINBOW.length],
    });
  }
  return ensureAdjacentUnique(raw);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOT_GAP_MAX = 26;
const DOT_SIZE = 9;
const DOT_SIZE_ACTIVE = 20;
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
export function DotToc({ entries, scrollRef }: DotTocProps) {
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<{
    scrollTop: number;
    scrollHeight: number;
    panelHeight: number;
  } | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // Stable key for the entries array to avoid effect churn
  const entriesKey = useMemo(
    () => entries.map((e) => e.id).join("|"),
    [entries],
  );

  // Resolve the portal target (PanelShell's outer motion.div)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    panelRef.current = el.closest<HTMLElement>(".z-30");
  }, [scrollRef]);

  // Track scroll container + panel layout for positioning
  useEffect(() => {
    const el = scrollRef.current;
    const panel = panelRef.current;
    if (!el || !panel || entries.length === 0) return;

    function updateLayout() {
      const scrollRect = el!.getBoundingClientRect();
      const panelRect = panel!.getBoundingClientRect();
      setLayout((prev) => {
        const scrollTop = scrollRect.top - panelRect.top;
        const scrollHeight = scrollRect.height;
        const panelHeight = panelRect.height;
        if (prev && prev.scrollTop === scrollTop && prev.scrollHeight === scrollHeight && prev.panelHeight === panelHeight) return prev;
        return { scrollTop, scrollHeight, panelHeight };
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

  const portalTarget = panelRef.current;
  if (!tocOpen || entries.length === 0 || !layout || !portalTarget || typeof document === "undefined") return null;

  // Responsive gap: shrink if entries don't fit in panel
  const maxRailHeight = layout.panelHeight - HIT_SIZE * 2;
  const dotGap = entries.length > 1
    ? Math.min(DOT_GAP_MAX, Math.max(8, maxRailHeight / (entries.length - 1)))
    : DOT_GAP_MAX;

  const railHeight = (entries.length - 1) * dotGap;
  const fillHeight = activeIndex * dotGap;
  const navHeight = Math.max(entries.length * Math.min(dotGap, HIT_SIZE), railHeight + HIT_SIZE);

  // Center the rail within the panel, panel-relative coords
  const navTop = layout.panelHeight / 2;

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
      })}
    </nav>,
    portalTarget,
  );
}
