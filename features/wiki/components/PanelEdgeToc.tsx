"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@mantine/core";
import { panelScaledPx } from "@/features/graph/components/panels/PanelShell";
import { dotTocPastelColorSequence } from "@/lib/theme/pastel-tokens";
import type { ModuleSection } from "@/features/wiki/module-runtime/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PanelEdgeTocEntry {
  id: string;
  title: string;
  color?: string;
}

interface PanelEdgeTocProps {
  entries: PanelEdgeTocEntry[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// Section math (shared with tests)
// ---------------------------------------------------------------------------

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

function findRightEdgeResizeHandle(panel: HTMLElement): HTMLElement | null {
  const candidates = panel.querySelectorAll<HTMLElement>(".cursor-col-resize");
  if (candidates.length === 0) return null;
  const panelRight = panel.getBoundingClientRect().right;
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const el of candidates) {
    const dist = Math.abs(el.getBoundingClientRect().right - panelRight);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return bestDist < 20 ? best : null;
}

// ---------------------------------------------------------------------------
// Entry builders (shared across all consumers)
// ---------------------------------------------------------------------------

/** Build PanelEdgeTocEntry[] from a module manifest's sections. */
export function entriesFromModuleSections(sections: ModuleSection[]): PanelEdgeTocEntry[] {
  return applyRainbow(
    sections.map((section) => ({
      id: `section-${section.id}`,
      title: section.title,
    })),
  );
}

/** Scan a container for h1-h3[id] headings and return rainbow-coloured entries. */
export function entriesFromHeadings(container: HTMLElement): PanelEdgeTocEntry[] {
  const headings = container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]");
  return applyRainbow(
    Array.from(headings, (h) => ({
      id: h.id,
      title: h.textContent?.trim() ?? "",
    })),
  );
}

function applyRainbow(
  entries: Array<Omit<PanelEdgeTocEntry, "color">>,
): PanelEdgeTocEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    color: dotTocPastelColorSequence[index % dotTocPastelColorSequence.length],
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RAIL_WIDTH = 7;
const HIT_WIDTH = 48;
const RESIZE_CURSOR_WIDTH = 10;
const DRAG_THRESHOLD_PX = 4;
const DEFAULT_COLOR = "var(--mode-accent)";

/**
 * Inline edge navigation rail. Paints a thin colored strip along the panel's
 * right edge, one equal-height segment per section so the rail stays readable
 * on pages with uneven or small section content. The active section
 * brightens with a soft glow; a within-section fill tracks scroll within the
 * current section. Each segment is a button that jumps on click and shows a
 * title tooltip on hover (desktop only — mobile tap jumps immediately).
 * Gesture disambiguation: if the user drags past DRAG_THRESHOLD_PX during
 * pointerdown, the gesture is handed off to the panel's right-edge resize
 * handle via a synthesized mousedown, so a drag on the rail still resizes
 * the panel.
 */
export function PanelEdgeToc({ entries, scrollRef, anchorRef }: PanelEdgeTocProps) {
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<{
    anchorTop: number;
    anchorHeight: number;
    panelHeight: number;
    panelRadius: number;
  } | null>(null);
  const [fillProgress, setFillProgress] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const sectionStartsRef = useRef<number[]>([]);
  const driftedRef = useRef(false);

  const entriesKey = useMemo(
    () => entries.map((e) => e.id).join("|"),
    [entries],
  );

  // Portal target — matches both desktop (z-30) and mobile (z-50) PanelShell roots.
  useEffect(() => {
    const anchorEl = anchorRef?.current ?? scrollRef.current;
    if (!anchorEl) return;
    panelRef.current = anchorEl.closest<HTMLElement>("[data-panel-shell]");
  }, [anchorRef, scrollRef]);

  // Anchor the rail to the scroll viewport rect inside the panel.
  useEffect(() => {
    const el = anchorRef?.current ?? scrollRef.current;
    const panel = panelRef.current;
    if (!el || !panel || entries.length === 0) return;

    function updateLayout() {
      const anchorRect = el!.getBoundingClientRect();
      const panelRect = panel!.getBoundingClientRect();
      const panelRadius = parseFloat(getComputedStyle(panel!).borderTopRightRadius) || 0;
      setLayout((prev) => {
        const anchorTop = anchorRect.top - panelRect.top;
        const anchorHeight = anchorRect.height;
        const panelHeight = panelRect.height;
        if (
          prev
          && prev.anchorTop === anchorTop
          && prev.anchorHeight === anchorHeight
          && prev.panelHeight === panelHeight
          && prev.panelRadius === panelRadius
        ) return prev;
        return { anchorTop, anchorHeight, panelHeight, panelRadius };
      });
    }

    updateLayout();

    const ro = new ResizeObserver(updateLayout);
    ro.observe(el);
    ro.observe(panel);

    const panelMo = new MutationObserver(updateLayout);
    panelMo.observe(panel, { attributes: true, attributeFilter: ["style"] });

    return () => {
      ro.disconnect();
      panelMo.disconnect();
    };
  }, [anchorRef, scrollRef, entries.length]);

  // Section tracking.
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

      sectionStartsRef.current = measureSectionStarts(scrollEl, targets);
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
    if (inView.size > 0) {
      for (let i = 0; i < entries.length; i++) {
        if (inView.has(entries[i].id)) return i;
      }
    }
    // No heading sits in the top-20% activation zone — happens between
    // two headings (dead zone) or when scrolled past the last heading
    // at the bottom of the page. Fall back to the section that contains
    // the current scroll position, computed from fillProgress, so the
    // rail doesn't snap back to section 0.
    if (entries.length === 0) return 0;
    return Math.max(0, Math.min(entries.length - 1, Math.floor(fillProgress)));
  }, [inView, entries, fillProgress]);

  const handleJump = useCallback(
    (id: string) => {
      scrollRef.current
        ?.querySelector(`#${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef],
  );

  // Gesture disambiguator: a small horizontal drift during pointerdown means
  // the user is resizing the panel's right edge, not tapping a section. When
  // we detect drift we hand the gesture off to the panel's native resize
  // handle by dispatching a mousedown there — useFloatingPanel's handler
  // installs the document listeners and the drag proceeds normally.
  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    // Ignore secondary buttons and touch-originated pointerdowns (touch
    // devices should always tap-to-jump, never drag-to-resize mobile panels).
    if (event.button !== 0 || event.pointerType === "touch") return;

    const panel = panelRef.current;
    const handle = panel ? findRightEdgeResizeHandle(panel) : null;
    if (!panel || !handle) return;

    const startX = event.clientX;
    const startY = event.clientY;
    driftedRef.current = false;
    let handedOff = false;

    function onMove(moveEvent: PointerEvent) {
      if (handedOff) return;
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;
      handedOff = true;
      driftedRef.current = true;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      // Hand the drag off to the native resize handle. React attaches its
      // listeners at the root, so dispatching a native MouseEvent here
      // triggers the onMouseDown handler wired up in PanelShell.
      handle!.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: startY,
          button: 0,
        }),
      );
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }, []);

  const handleClick = useCallback(
    (id: string) => {
      if (driftedRef.current) {
        driftedRef.current = false;
        return;
      }
      handleJump(id);
    },
    [handleJump],
  );

  const portalTarget = panelRef.current;
  if (entries.length === 0 || !layout || !portalTarget || typeof document === "undefined") return null;

  const activeFraction = Math.max(0, Math.min(1, fillProgress - Math.floor(fillProgress)));
  const headerGap = Math.max(0, layout.anchorTop);
  const footerGap = Math.max(
    0,
    layout.panelHeight - layout.anchorTop - layout.anchorHeight,
  );
  const panelRadius = layout.panelRadius;
  // Only extend when there's meaningful gap. Otherwise use a pill cap on the
  // free end so the rail terminates cleanly.
  const hasTopExtension = headerGap > 2;
  const hasBottomExtension = footerGap > 2;
  const railWidthPx = panelScaledPx(RAIL_WIDTH);

  return createPortal(
    <nav
      role="navigation"
      aria-label="Section navigation"
      style={{
        position: "absolute",
        right: 0,
        top: layout.anchorTop,
        height: layout.anchorHeight,
        width: HIT_WIDTH,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {entries.map((entry, i) => {
        const isActive = i === activeIndex;
        const isFirst = i === 0;
        const isLast = i === entries.length - 1;
        const color = entry.color ?? DEFAULT_COLOR;
        const idleBg = `color-mix(in srgb, ${color} 38%, var(--graph-panel-bg))`;
        // Active unfilled uses a brighter shade than idle so the active
        // section is visibly distinct at 0% progress; the progress fill
        // then brightens to the full section color as the user scrolls,
        // making "how far through this section" easy to read.
        const activeBaseBg = `color-mix(in srgb, ${color} 55%, var(--graph-panel-bg))`;
        const capRadius = panelScaledPx(RAIL_WIDTH / 2);
        const tailRadius = 1;
        // The first/last buttons visually stretch into the panel's header /
        // footer gaps so they read as continuous with the panel's rounded
        // corners instead of ending in a hard cutoff. The extension is part
        // of the button itself — not a decorative strip — so hover, click,
        // and the active highlight apply to the extended area.
        const extendsTop = isFirst && hasTopExtension;
        const extendsBottom = isLast && hasBottomExtension;
        // Cap the extension to the rounded-corner depth. Without this cap the
        // first/last buttons reach all the way to the panel top/bottom at
        // right:0 and cover the header pin/close icons (same z-stack), eating
        // their clicks. The rail only needs to visually meet the corner.
        const topOffset = extendsTop ? -Math.min(headerGap, panelRadius) : 0;
        const bottomOffset = extendsBottom ? -Math.min(footerGap, panelRadius) : 0;
        const topLeftRadius = isFirst && !extendsTop ? capRadius : tailRadius;
        const topRightRadius = extendsTop
          ? panelRadius
          : isFirst
            ? capRadius
            : 0;
        const bottomLeftRadius = isLast && !extendsBottom ? capRadius : tailRadius;
        const bottomRightRadius = extendsBottom
          ? panelRadius
          : isLast
            ? capRadius
            : 0;

        return (
          <Tooltip
            key={entry.id}
            label={entry.title}
            position="left"
            withArrow
            openDelay={120}
            events={{ hover: true, focus: true, touch: false }}
          >
            <button
              type="button"
              aria-label={`Jump to ${entry.title}`}
              aria-current={isActive ? "step" : undefined}
              data-active={isActive || undefined}
              onPointerDown={handlePointerDown}
              onClick={() => handleClick(entry.id)}
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                position: "relative",
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                pointerEvents: "auto",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              {/* Visual + interactive rail for this section. For the first
                  and last buttons, this span extends beyond the button's
                  flex box into the panel's header/footer gap so the rail
                  reads as continuous with the panel's rounded corners. The
                  painted strip, active highlight, within-section progress
                  fill, and hit target all live inside this container so
                  they grow and respond together. */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 0,
                  top: topOffset,
                  bottom: bottomOffset,
                  width: HIT_WIDTH,
                  pointerEvents: "auto",
                }}
              >
                {/* Painted edge strip — flush with the panel edge. Active
                    sections use a mid-tone of their own color as the
                    baseline; the progress fill on top brightens to the
                    full section color to show scroll position. */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: railWidthPx,
                    backgroundColor: isActive ? activeBaseBg : idleBg,
                    boxShadow: isActive ? `0 0 7px ${color}` : "none",
                    transition: "background-color 180ms ease-out, box-shadow 180ms ease-out",
                    borderTopLeftRadius: topLeftRadius,
                    borderTopRightRadius: topRightRadius,
                    borderBottomLeftRadius: bottomLeftRadius,
                    borderBottomRightRadius: bottomRightRadius,
                    pointerEvents: "none",
                  }}
                />
                {/* Within-section progress — only on the active segment.
                    Height is a percentage of this wrapper, which already
                    includes the extension area, so the fill grows across
                    the entire visual rail for that section. Uses the full
                    section color so the filled portion reads as "lit up"
                    over the dimmer active baseline. */}
                {isActive && (
                  <span
                    aria-hidden
                    data-testid="panel-edge-toc-progress"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      width: railWidthPx,
                      height: `${activeFraction * 100}%`,
                      backgroundColor: color,
                      transition: "height 160ms ease-out",
                      borderTopLeftRadius: topLeftRadius,
                      borderTopRightRadius: topRightRadius,
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* Cursor hint over the painted strip — signals "drag to
                    resize." Events bubble to the button so click-to-jump
                    and the pointerdown drag-handoff still work. */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: RESIZE_CURSOR_WIDTH,
                    cursor: "col-resize",
                  }}
                />
              </span>
            </button>
          </Tooltip>
        );
      })}
    </nav>,
    portalTarget,
  );
}
