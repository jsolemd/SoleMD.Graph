"use client";

import type { CSSProperties, RefObject } from "react";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import { panelSurfaceStyle } from "@/features/graph/components/panels/PanelShell/panel-styles";
import {
  ambientFieldProcessStageManifest,
  type AmbientFieldStreamPoint,
} from "./ambient-field-landing-content";

const processPanelStyle: CSSProperties = {
  ...panelSurfaceStyle,
  border: "1px solid var(--graph-panel-border)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 86%, transparent) 0%, color-mix(in srgb, var(--graph-panel-bg) 96%, var(--background) 4%) 100%)",
};

const DESKTOP_VIEWBOX = { width: 1204, height: 535 } as const;
const MOBILE_VIEWBOX = { width: 345, height: 653 } as const;

interface AmbientFieldProcessStageProps {
  isMobile: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  pathRefs: Array<RefObject<SVGPathElement | null>>;
  pointRefs: Array<RefObject<HTMLDivElement | null>>;
}

function getPointToneAccent(point: AmbientFieldStreamPoint) {
  return point.tone === "danger"
    ? "var(--color-warm-coral)"
    : "var(--color-soft-blue)";
}

function getPopupPlacement(index: number) {
  const placements = [
    { left: "26px", top: "-78px" },
    { left: "26px", top: "26px" },
    { left: "-210px", top: "-18px" },
  ] as const;

  return placements[index] ?? placements[placements.length - 1]!;
}

export function AmbientFieldProcessStage({
  isMobile,
  panelRef,
  pathRefs,
  pointRefs,
}: AmbientFieldProcessStageProps) {
  const viewBox = isMobile ? MOBILE_VIEWBOX : DESKTOP_VIEWBOX;
  const railPaths = isMobile
    ? ambientFieldProcessStageManifest.mobileRailPaths
    : ambientFieldProcessStageManifest.desktopRailPaths;

  return (
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-[1.45rem] px-3 py-3 sm:px-4 sm:py-4"
      style={processPanelStyle}
    >
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(circle at 16% 18%, color-mix(in srgb, var(--color-soft-blue) 16%, transparent) 0%, transparent 32%)",
            "radial-gradient(circle at 78% 22%, color-mix(in srgb, var(--color-soft-lavender) 14%, transparent) 0%, transparent 28%)",
            "radial-gradient(circle at 62% 76%, color-mix(in srgb, var(--color-warm-coral) 10%, transparent) 0%, transparent 34%)",
            "linear-gradient(180deg, color-mix(in srgb, var(--graph-bg) 24%, transparent) 0%, transparent 24%, color-mix(in srgb, var(--graph-bg) 18%, transparent) 100%)",
          ].join(", "),
        }}
      />

      <div className="relative min-h-[380px] sm:min-h-[440px]">
        <svg
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {railPaths.map((pathD, index) => (
            <path
              key={`${index}-${pathD.slice(0, 12)}`}
              ref={pathRefs[index]}
              d={pathD}
              fill="none"
              stroke="var(--color-soft-blue)"
              strokeOpacity={index >= 3 && index <= 5 ? 0.88 : 0.64}
              strokeWidth={isMobile ? 0.9 : 1.05}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {ambientFieldProcessStageManifest.points.map((point, index) => {
          const accent = getPointToneAccent(point);

          return (
            <div
              key={point.id}
              ref={pointRefs[index]}
              className="pointer-events-none absolute left-0 top-0"
              data-stream-point
              data-stream-tone={point.tone}
              style={{ opacity: 0, willChange: "transform, opacity" }}
            >
              <div
                className="absolute left-0 top-0 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  border: `1px solid color-mix(in srgb, ${accent} 56%, transparent)`,
                  background:
                    "color-mix(in srgb, var(--graph-panel-bg) 84%, transparent)",
                  boxShadow: [
                    `0 0 0 7px color-mix(in srgb, ${accent} 9%, transparent)`,
                    `0 0 24px color-mix(in srgb, ${accent} 28%, transparent)`,
                  ].join(", "),
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: accent }}
                />
              </div>

              {point.popups.map((popup, popupIndex) => {
                const placement = getPopupPlacement(popupIndex);

                return (
                  <div
                    key={popup.id}
                    data-stream-popup
                    data-popup-index={popupIndex}
                    className="absolute w-[200px] max-w-[44vw]"
                    style={{
                      left: placement.left,
                      top: placement.top,
                      opacity: 0,
                      transform: "translate3d(0, 10px, 0) scale(0.985)",
                      willChange: "transform, opacity",
                    }}
                  >
                    <OverlayCard
                      className="px-4 py-4"
                      style={{
                        ...panelSurfaceStyle,
                        border: `1px solid color-mix(in srgb, ${accent} 26%, var(--graph-panel-border) 74%)`,
                      }}
                    >
                      {popup.category ? (
                        <div
                          className="text-[11px] uppercase tracking-[0.18em]"
                          style={{
                            color:
                              "color-mix(in srgb, var(--graph-panel-text-dim) 84%, transparent)",
                          }}
                        >
                          {popup.category}
                        </div>
                      ) : null}
                      <div className="mt-2 text-[13px] font-medium leading-5">
                        {popup.title}
                      </div>
                      {popup.label ? (
                        <div
                          className="mt-2 text-[12px] leading-5"
                          style={{ color: accent }}
                        >
                          {popup.label}
                        </div>
                      ) : null}
                    </OverlayCard>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
