"use client";

import type { RefObject } from "react";
import { Tooltip } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import {
  chromePillSurfaceStyle,
  panelScaledPx,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import { APP_CHROME_PX, densityPx } from "@/lib/density";
import { useSectionTocState } from "./use-section-toc-state";
import type { PanelEdgeTocEntry } from "./PanelEdgeToc";

const DEFAULT_COLOR = "var(--mode-accent)";
const DEFAULT_RAIL_WIDTH = 5;
const DEFAULT_HIT_WIDTH = 40;

interface ViewportTocRailProps {
  entries: PanelEdgeTocEntry[];
  scrollRef: RefObject<HTMLElement | null>;
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
  const { activeIndex, fillProgress, handleJump } = useSectionTocState({
    entries,
    scrollRef,
    scrollOffsetPx,
  });

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

  const activeFraction = Math.max(
    0,
    Math.min(1, fillProgress - Math.floor(fillProgress)),
  );
  const railWidth = panelScaledPx(compact ? 3 : DEFAULT_RAIL_WIDTH);
  const hitWidth = compact ? 32 : DEFAULT_HIT_WIDTH;
  const railInset = panelScaledPx(compact ? 5 : 4);
  const railRadius = panelScaledPx(compact ? 4 : 6);

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
      {entries.map((entry, index) => {
        const color = entry.color ?? DEFAULT_COLOR;
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
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: hitWidth,
                }}
              >
                {isActive ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      right: railInset,
                      top: 0,
                      width: railWidth,
                      height: `${activeFraction * 100}%`,
                      backgroundColor: color,
                      boxShadow: `0 0 ${compact ? 6 : 8}px ${color}`,
                      transition: "height 160ms ease-out",
                      borderRadius: railRadius,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </span>
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
