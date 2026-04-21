"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Tooltip } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import {
  chromePillSurfaceStyle,
  panelScaledPx,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import { APP_CHROME_PX, densityPx } from "@/lib/density";
import type { PanelEdgeTocEntry } from "./PanelEdgeToc";

const DEFAULT_COLOR = "var(--mode-accent)";
const DEFAULT_RAIL_WIDTH = 5;
const DEFAULT_HIT_WIDTH = 40;
const ACTIVATION_ROOT_MARGIN = "-25% 0px -70% 0px";

interface ViewportTocRailProps {
  entries: PanelEdgeTocEntry[];
  scrollRef?: RefObject<HTMLElement | null>;
  activeIndex?: number;
  bottomPx?: number;
  compact?: boolean;
  hideBelowWidth?: number;
  hideOnMobile?: boolean;
  narrowMode?: "hide" | "dock";
  rightPx?: number;
  scrollOffsetPx?: number;
  topPx?: number;
  zIndex?: number;
}

export function ViewportTocRail({
  entries,
  scrollRef,
  activeIndex: controlledActiveIndex,
  bottomPx = APP_CHROME_PX.floatingViewportInset,
  compact = false,
  hideBelowWidth,
  hideOnMobile = false,
  narrowMode = "hide",
  rightPx = APP_CHROME_PX.edgeMargin,
  scrollOffsetPx = 0,
  topPx = APP_CHROME_PX.panelTop + densityPx(32),
  zIndex = 20,
}: ViewportTocRailProps) {
  const shellVariant = useShellVariant();
  const { width: viewportWidth } = useViewportSize();
  const internalActiveIndex = useActiveSection({
    entries,
    scrollRef,
    enabled: controlledActiveIndex == null,
  });
  const activeIndex = controlledActiveIndex ?? internalActiveIndex;
  const fillRef = useRef<HTMLSpanElement>(null);
  useScrollTimelineFallback({ scrollRef, targetRef: fillRef });
  const handleJump = useCallback(
    (id: string) => {
      jumpToSection(id, scrollRef?.current ?? null, scrollOffsetPx);
    },
    [scrollRef, scrollOffsetPx],
  );

  if (entries.length === 0) return null;
  const isNarrowViewport =
    hideBelowWidth != null && viewportWidth > 0 && viewportWidth < hideBelowWidth;
  if (isNarrowViewport && narrowMode === "hide") {
    return null;
  }
  if (hideOnMobile && shellVariant === "mobile") return null;

  if (isNarrowViewport && narrowMode === "dock") {
    const activeEntry = entries[Math.max(0, Math.min(entries.length - 1, activeIndex))];

    return (
      <nav
        role="navigation"
        aria-label="Section navigation"
        className="pointer-events-none fixed inset-x-0"
        style={{
          bottom: Math.max(16, bottomPx),
          zIndex,
        }}
      >
        <div className="mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.2)]" style={chromePillSurfaceStyle}>
          <span
            className="max-w-[12rem] truncate text-[11px] font-medium"
            style={{ color: "var(--graph-panel-text-dim)" }}
          >
            {activeEntry?.title ?? "Sections"}
          </span>
          <div className="flex items-center gap-1.5">
            {entries.map((entry, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`Jump to ${entry.title}`}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => handleJump(entry.id)}
                  className="pointer-events-auto rounded-full border-0 p-0"
                  style={{
                    width: isActive ? 18 : 10,
                    height: 10,
                    backgroundColor: entry.color ?? DEFAULT_COLOR,
                    opacity: isActive ? 1 : 0.42,
                    boxShadow: isActive
                      ? `0 0 10px ${entry.color ?? DEFAULT_COLOR}`
                      : "none",
                    transition:
                      "width 160ms ease-out, opacity 160ms ease-out, box-shadow 160ms ease-out",
                  }}
                />
              );
            })}
          </div>
        </div>
      </nav>
    );
  }

  const railWidth = panelScaledPx(compact ? 3 : DEFAULT_RAIL_WIDTH);
  const hitWidth = compact ? 32 : DEFAULT_HIT_WIDTH;
  const railInset = panelScaledPx(compact ? 5 : 4);
  const railRadius = panelScaledPx(compact ? 4 : 6);
  const activeColor = entries[activeIndex]?.color ?? DEFAULT_COLOR;

  const fillStyle: CSSProperties = {
    position: "absolute",
    right: railInset,
    top: 0,
    bottom: 0,
    width: railWidth,
    backgroundColor: `color-mix(in srgb, ${activeColor} 52%, transparent)`,
    boxShadow: `0 0 ${compact ? 2 : 3}px color-mix(in srgb, ${activeColor} 32%, transparent)`,
    borderRadius: railRadius,
    transition: "background-color 240ms ease-out, box-shadow 240ms ease-out",
    pointerEvents: "none",
    willChange: "transform",
  };

  return (
    <nav
      role="navigation"
      aria-label="Section navigation"
      className="pointer-events-none fixed"
      style={{
        top: topPx,
        right: rightPx,
        bottom: bottomPx,
        width: hitWidth,
        display: "flex",
        flexDirection: "column",
        zIndex,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: railInset,
          top: 0,
          bottom: 0,
          width: railWidth,
          borderRadius: railRadius,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 88%, transparent) 0%, color-mix(in srgb, var(--graph-panel-border) 36%, transparent) 100%)",
          boxShadow:
            "inset 0 1px 0 color-mix(in srgb, var(--graph-panel-border) 42%, transparent)",
          pointerEvents: "none",
        }}
      />
      <span
        ref={fillRef}
        aria-hidden
        className="viewport-toc-rail-fill"
        style={fillStyle}
      />
      {entries.map((entry, index) => {
        const isActive = index === activeIndex;

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
              onClick={() => handleJump(entry.id)}
              style={{
                flex: 1,
                position: "relative",
                margin: 0,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                pointerEvents: "auto",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            />
          </Tooltip>
        );
      })}
    </nav>
  );
}

function useActiveSection({
  entries,
  scrollRef,
  enabled,
}: {
  entries: PanelEdgeTocEntry[];
  scrollRef?: RefObject<HTMLElement | null>;
  enabled: boolean;
}): number {
  const [activeIndex, setActiveIndex] = useState(0);
  const entriesKey = useMemo(
    () => entries.map((entry) => entry.id).join("|"),
    [entries],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    if (entries.length === 0) return undefined;
    if (typeof window === "undefined") return undefined;

    const container = scrollRef?.current ?? null;
    const queryRoot: Document | HTMLElement = container ?? document;
    const targets: Array<{ id: string; el: HTMLElement; index: number }> = [];
    entries.forEach((entry, index) => {
      const el = queryRoot.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`);
      if (el) targets.push({ id: entry.id, el, index });
    });
    if (targets.length === 0) return undefined;

    const intersecting = new Map<string, number>();
    const observer = new IntersectionObserver(
      (events) => {
        for (const event of events) {
          if (event.isIntersecting) {
            intersecting.set(event.target.id, event.intersectionRatio);
          } else {
            intersecting.delete(event.target.id);
          }
        }
        let nextIndex = -1;
        for (const { id, index } of targets) {
          if (intersecting.has(id)) {
            nextIndex = index;
            break;
          }
        }
        if (nextIndex === -1) {
          let aboveIndex = -1;
          for (const { el, index } of targets) {
            const rect = el.getBoundingClientRect();
            const rootTop = container ? container.getBoundingClientRect().top : 0;
            if (rect.top - rootTop <= 0) aboveIndex = index;
          }
          nextIndex = aboveIndex === -1 ? 0 : aboveIndex;
        }
        setActiveIndex((previous) => (previous === nextIndex ? previous : nextIndex));
      },
      {
        root: container,
        rootMargin: ACTIVATION_ROOT_MARGIN,
        threshold: 0,
      },
    );

    for (const target of targets) observer.observe(target.el);

    return () => observer.disconnect();
  }, [enabled, entries, entriesKey, scrollRef]);

  return activeIndex;
}

function useScrollTimelineFallback({
  scrollRef,
  targetRef,
}: {
  scrollRef?: RefObject<HTMLElement | null>;
  targetRef: RefObject<HTMLSpanElement | null>;
}): void {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof (window as unknown as { ScrollTimeline?: unknown }).ScrollTimeline !== "undefined") {
      return undefined;
    }

    const container = scrollRef?.current ?? null;
    const scrollEventTarget: Window | HTMLElement = container ?? window;
    let tickRaf = 0;

    function tick() {
      tickRaf = 0;
      const node = targetRef.current;
      if (!node) return;
      const scrollTop = container ? container.scrollTop : window.scrollY;
      const scrollMax = container
        ? Math.max(0, container.scrollHeight - container.clientHeight)
        : Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          );
      const progress = scrollMax > 0
        ? Math.max(0, Math.min(1, scrollTop / scrollMax))
        : 0;
      node.style.setProperty("--viewport-toc-rail-progress", progress.toFixed(4));
    }

    function schedule() {
      if (tickRaf !== 0) return;
      tickRaf = requestAnimationFrame(tick);
    }

    schedule();
    scrollEventTarget.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (tickRaf !== 0) cancelAnimationFrame(tickRaf);
      scrollEventTarget.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [scrollRef, targetRef]);
}

function jumpToSection(
  id: string,
  container: HTMLElement | null,
  scrollOffsetPx: number,
): void {
  const target = (container ?? document).querySelector<HTMLElement>(
    `#${CSS.escape(id)}`,
  );
  if (!target) return;

  if (container) {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop =
      targetRect.top - containerRect.top + container.scrollTop - scrollOffsetPx;
    container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  } else {
    const nextTop =
      target.getBoundingClientRect().top + window.scrollY - scrollOffsetPx;
    window.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }
}
