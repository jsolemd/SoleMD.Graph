"use client";

import type { CSSProperties, RefObject } from "react";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import { panelSurfaceStyle } from "@/features/graph/components/panels/PanelShell/panel-styles";
import {
  ambientFieldProcessStageManifest,
} from "./ambient-field-landing-content";
import { buildSmoothProcessPath } from "./ambient-field-process-geometry";

const processPanelStyle: CSSProperties = {
  ...panelSurfaceStyle,
  border: "1px solid var(--graph-panel-border)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--graph-panel-bg) 84%, transparent) 0%, color-mix(in srgb, var(--graph-panel-bg) 94%, var(--background) 6%) 100%)",
};

const DESKTOP_VIEWBOX = { width: 1200, height: 560 } as const;
const MOBILE_VIEWBOX = { width: 520, height: 720 } as const;

interface AmbientFieldProcessStageProps {
  isMobile: boolean;
  markerRefs: Array<RefObject<HTMLDivElement | null>>;
  panelRef: RefObject<HTMLDivElement | null>;
  popupRefs: Array<RefObject<HTMLDivElement | null>>;
}

export function AmbientFieldProcessStage({
  isMobile,
  markerRefs,
  panelRef,
  popupRefs,
}: AmbientFieldProcessStageProps) {
  const viewBox = isMobile ? MOBILE_VIEWBOX : DESKTOP_VIEWBOX;
  const pathPoints = isMobile
    ? ambientFieldProcessStageManifest.mobilePath
    : ambientFieldProcessStageManifest.desktopPath;
  const processPath = buildSmoothProcessPath(
    pathPoints,
    viewBox.width,
    viewBox.height,
  );

  return (
    <div
      ref={panelRef}
      className="relative h-[360px] overflow-hidden rounded-[1.4rem] sm:h-[420px] lg:h-[460px]"
      style={processPanelStyle}
    >
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(circle at 16% 16%, color-mix(in srgb, var(--color-soft-blue) 18%, transparent) 0%, transparent 30%)",
            "radial-gradient(circle at 78% 22%, color-mix(in srgb, var(--color-golden-yellow) 16%, transparent) 0%, transparent 26%)",
            "radial-gradient(circle at 62% 78%, color-mix(in srgb, var(--color-teal) 14%, transparent) 0%, transparent 32%)",
            "linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--background) 14%, transparent) 100%)",
          ].join(", "),
        }}
      />

      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ambientFieldProcessTrace" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-soft-blue)" stopOpacity="0.2" />
            <stop offset="38%" stopColor="var(--color-soft-lavender)" stopOpacity="0.68" />
            <stop offset="66%" stopColor="var(--color-golden-yellow)" stopOpacity="0.78" />
            <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0.24" />
          </linearGradient>
        </defs>

        <path
          d={processPath}
          fill="none"
          stroke="color-mix(in srgb, var(--graph-panel-border) 34%, transparent)"
          strokeWidth={isMobile ? 12 : 16}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.22"
        />
        <path
          d={processPath}
          fill="none"
          stroke="url(#ambientFieldProcessTrace)"
          strokeWidth={isMobile ? 4 : 5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.86"
        />
        <path
          d={processPath}
          fill="none"
          stroke="color-mix(in srgb, var(--graph-panel-border) 68%, transparent)"
          strokeWidth={1.2}
          strokeDasharray={isMobile ? "5 12" : "6 14"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.5"
        />
      </svg>

      {ambientFieldProcessStageManifest.markerLanes.map((lane, index) => (
        <div
          key={`${lane.accentVar}-${index}`}
          ref={markerRefs[index]}
          className="absolute left-0 top-0 h-3.5 w-3.5 rounded-full"
          style={{
            opacity: 0,
            backgroundColor: lane.accentVar,
            boxShadow: [
              `0 0 0 5px color-mix(in srgb, ${lane.accentVar} 10%, transparent)`,
              `0 0 20px color-mix(in srgb, ${lane.accentVar} 36%, transparent)`,
            ].join(", "),
            willChange: "transform, opacity",
          }}
        />
      ))}

      {ambientFieldProcessStageManifest.popups.map((popup, index) => (
        <div
          key={popup.id}
          ref={popupRefs[index]}
          className="pointer-events-none absolute w-[220px] max-w-[40vw] md:w-[240px] lg:w-[250px]"
          style={{
            left: isMobile ? popup.mobileLeft : popup.desktopLeft,
            top: isMobile ? popup.mobileTop : popup.desktopTop,
            opacity: 0,
            willChange: "transform, opacity",
          }}
        >
          <OverlayCard className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-wrap items-center gap-2">
              <MetaPill mono>{popup.id.toUpperCase()}</MetaPill>
              <MetaPill style={{ color: popup.accentVar }}>Process beat</MetaPill>
            </div>

            <h3 className="mt-3 text-[0.98rem] font-medium leading-6">
              {popup.title}
            </h3>
            <p
              className="mt-2 text-[13px] leading-6"
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text) 78%, transparent)",
              }}
            >
              {popup.body}
            </p>
          </OverlayCard>
        </div>
      ))}
    </div>
  );
}
