"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useViewportSize } from "@mantine/hooks";
import { motion, useReducedMotion } from "framer-motion";
import type { GraphBundle } from "@solemd/graph";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import {
  type ChromeSurfaceMode,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { GraphLoadingChrome } from "@/features/graph/components/shell/loading/GraphLoadingChrome";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import {
  useShellVariant,
  type ShellVariant,
} from "@/features/graph/components/shell/use-shell-variant";
import { useGraphWarmup } from "@/features/graph/hooks/use-graph-warmup";
import type { PanelEdgeTocEntry } from "@/features/wiki/components/PanelEdgeToc";
import { ViewportTocRail } from "@/features/wiki/components/ViewportTocRail";
import { APP_CHROME_PX } from "@/lib/density";
import { smooth } from "@/lib/motion";
import { FieldCanvas } from "../../renderer/FieldCanvas";
import type { AmbientFieldHotspotFrame } from "../../renderer/FieldScene";
import {
  prewarmAmbientFieldPointSources,
} from "../../asset/point-source-registry";
import {
  createAmbientFieldSceneState,
  type AmbientFieldSceneState,
} from "../../scene/visual-presets";
import {
  createAmbientFieldScrollController,
  type AmbientFieldScrollController,
} from "../../scroll/ambient-field-scroll-driver";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../../ambient-field-breakpoints";
import {
  ambientFieldLandingSections,
  ambientFieldLandingScrollManifest,
} from "./ambient-field-landing-content";
import {
  ambientFieldBlobHotspots,
  ambientFieldFocusedPaperSeat,
  resolveAmbientFieldFocusPresentation,
  type AmbientFieldFocusMotionState,
} from "./ambient-field-hotspot-overlay";
import { AmbientFieldCtaSection } from "./AmbientFieldCtaSection";
import { AmbientFieldGraphWarmupAction } from "./AmbientFieldGraphWarmupAction";
import { AmbientFieldGraphSection } from "./AmbientFieldGraphSection";
import { AmbientFieldHeroSection } from "./AmbientFieldHeroSection";
import { AmbientFieldScrollCue } from "./AmbientFieldScrollCue";
import { AmbientFieldSectionCard } from "./AmbientFieldSectionCard";
import { AmbientFieldStoryChapter } from "./AmbientFieldStoryChapter";
import { ambientFieldStoryOneBeats } from "./ambient-field-landing-content";

const rootShellStyle: CSSProperties = {
  backgroundColor: "var(--graph-bg)",
  color: "var(--graph-panel-text)",
};

const fieldVignetteStyle: CSSProperties = {
  background: "transparent",
};

const secondaryCardStyle: CSSProperties = {
  ...panelSurfaceStyle,
  border: "1px solid color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
};

const CHROME_SURFACE_TRANSITION_SCROLL_PX = 24;
const LANDING_GRAPH_READY_DEBUG_PARAM = "landingGraphReady";

function useLandingGraphReadyDebugOverride(): boolean {
  const searchParams = useSearchParams();

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const value = searchParams.get(LANDING_GRAPH_READY_DEBUG_PARAM);
  return value === "1" || value === "true" || value === "ready";
}

function AmbientFieldLandingShell({
  graphReady,
  shellVariant,
}: {
  graphReady: boolean;
  shellVariant: ShellVariant;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth } = useViewportSize();
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const blobHotspotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusMotionStateRef = useRef<AmbientFieldFocusMotionState | null>(null);
  const focusedPaperSeatRef = useRef<HTMLDivElement>(null);
  const sceneStateRef = useRef<AmbientFieldSceneState>(
    createAmbientFieldSceneState(),
  );
  const scrollControllerRef = useRef<AmbientFieldScrollController | null>(null);
  const [chromeSurfaceMode, setChromeSurfaceMode] =
    useState<ChromeSurfaceMode>("flush");
  const isCompactFieldViewport =
    viewportWidth > 0
      ? viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT
      : shellVariant === "mobile";
  const sectionNavScrollOffset = isCompactFieldViewport
    ? 24
    : APP_CHROME_PX.panelTop + 76;

  useEffect(() => {
    sceneStateRef.current.motionEnabled = !reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    prewarmAmbientFieldPointSources({
      densityScale: 1,
      isMobile: isCompactFieldViewport,
    });
  }, [isCompactFieldViewport]);

  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero) return undefined;

    const controller = createAmbientFieldScrollController({
      root,
      hero,
      reducedMotion: !!reducedMotion,
      scrollManifest: ambientFieldLandingScrollManifest,
      sceneStateRef,
    });
    scrollControllerRef.current = controller;

    return () => {
      if (scrollControllerRef.current === controller) {
        scrollControllerRef.current = null;
      }
      controller.cleanup();
    };
  }, [isCompactFieldViewport, reducedMotion]);

  useEffect(() => {
    const scrollRoot = rootRef.current;
    if (!scrollRoot) return undefined;

    let frame = 0;

    function syncChromeSurfaceMode() {
      frame = 0;
      const nextMode: ChromeSurfaceMode =
        scrollRoot!.scrollTop > CHROME_SURFACE_TRANSITION_SCROLL_PX
          ? "pill"
          : "flush";
      setChromeSurfaceMode((current) =>
        current === nextMode ? current : nextMode,
      );
    }

    function handleScroll() {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(syncChromeSurfaceMode);
    }

    syncChromeSurfaceMode();
    scrollRoot!.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollRoot!.removeEventListener("scroll", handleScroll);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  function handleFieldFrame(timestamp: number) {
    scrollControllerRef.current?.syncFrame(timestamp);
  }

  function handleHotspotFrame(hotspots: AmbientFieldHotspotFrame[]) {
    const focusedPaperFrame =
      hotspots.find((frame) => frame.visible && frame.mode === "focus") ?? null;
    const focusedPaperSeat = focusedPaperSeatRef.current;
    const focusedPaperSeatRect = focusedPaperSeat?.getBoundingClientRect() ?? null;
    const nowSeconds =
      typeof performance === "undefined" ? 0 : performance.now() / 1000;
    const focusPresentation =
      focusedPaperFrame && focusedPaperSeatRect
        ? resolveAmbientFieldFocusPresentation({
            frame: focusedPaperFrame,
            nowSeconds,
            previousState: focusMotionStateRef.current,
            seatRect: focusedPaperSeatRect,
          })
        : null;
    focusMotionStateRef.current = focusPresentation?.state ?? null;

    blobHotspotRefs.current.forEach((node, index) => {
      if (!node) return;
      const frame = hotspots[index];
      if (!frame?.visible) {
        node.style.opacity = "0";
        node.style.transform = "translate3d(-9999px, -9999px, 0) scale(0.92)";
        node.dataset.mode = "hidden";
        return;
      }

      node.dataset.mode = frame.mode;
      const hotspot = ambientFieldBlobHotspots[index];
      const cardLeft = hotspot?.cardLeft ?? "28px";
      const cardTop = hotspot?.cardTop ?? "-18px";
      node.style.setProperty(
        "--ambient-hotspot-ring",
        frame.color,
      );
      node.style.setProperty(
        "--ambient-hotspot-core",
        frame.color,
      );
      node.style.setProperty(
        "--ambient-hotspot-card-opacity",
        frame.mode === "card" ? "1" : "0",
      );
      node.style.setProperty(
        "--ambient-hotspot-card-translate-y",
        frame.mode === "card" ? "0px" : "10px",
      );
      node.style.setProperty("--ambient-hotspot-card-left", cardLeft);
      node.style.setProperty("--ambient-hotspot-card-top", cardTop);

      let displayX = frame.x;
      let displayY = frame.y;
      let displayScale = frame.scale;
      let pointOpacity = frame.opacity;
      if (frame.mode === "focus" && focusPresentation) {
        displayX = focusPresentation.pointX;
        displayY = focusPresentation.pointY;
        displayScale = focusPresentation.pointScale;
        pointOpacity = focusPresentation.pointOpacity;
      }

      node.style.opacity = pointOpacity.toFixed(4);
      node.style.transform =
        `translate3d(${displayX}px, ${displayY}px, 0) scale(${displayScale})`;
    });
    if (!focusedPaperSeat) return;

    if (!focusedPaperFrame || !focusPresentation) {
      focusMotionStateRef.current = null;
      focusedPaperSeat.style.opacity = "0";
      focusedPaperSeat.style.transform = "translate3d(0, 18px, 0) scale(0.96)";
      return;
    }

    focusedPaperSeat.style.setProperty(
      "--ambient-focused-paper-accent",
      focusedPaperFrame.color,
    );
    focusedPaperSeat.style.opacity = Math.min(1, focusPresentation.seatOpacity).toFixed(4);
    focusedPaperSeat.style.transform =
      `translate3d(0, ${focusPresentation.seatTranslateY}px, 0) scale(${focusPresentation.seatScale})`;
  }

  const tocEntries = useMemo<PanelEdgeTocEntry[]>(
    () =>
      ambientFieldLandingSections.map((section) => ({
        id: section.id,
        title: section.title,
        color: section.accentVar,
      })),
    [],
  );

  const heroSection = ambientFieldLandingSections[0]!;
  const storyOneSection = ambientFieldLandingSections[1]!;
  const graphSection = ambientFieldLandingSections[2]!;
  const storyTwoSection = ambientFieldLandingSections[3]!;
  const ctaSection = ambientFieldLandingSections[4]!;

  function scrollToSection(sectionId: string) {
    const root = rootRef.current;
    const section = root?.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`);
    if (!root || !section) return;

    root.scrollTo({
      top: Math.max(0, section.offsetTop - sectionNavScrollOffset),
      behavior: "smooth",
    });
  }

  return (
    <div
      ref={rootRef}
      data-panel-shell
      className="relative h-screen overflow-y-auto overflow-x-clip"
      style={rootShellStyle}
    >
      <FieldCanvas
        className="fixed inset-0"
        sceneStateRef={sceneStateRef}
        reducedMotion={!!reducedMotion}
        onFrame={handleFieldFrame}
        onHotspotsFrame={handleHotspotFrame}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[6]"
      >
        {ambientFieldBlobHotspots.map((hotspot, index) => {
          return (
            <div
              key={hotspot.id}
              ref={(node) => {
                blobHotspotRefs.current[index] = node;
              }}
              className="absolute left-0 top-0"
              style={{
                "--ambient-hotspot-card-opacity": "0",
                "--ambient-hotspot-card-translate-y": "10px",
                "--ambient-hotspot-card-left": "28px",
                "--ambient-hotspot-card-top": "-18px",
                "--ambient-hotspot-core": "var(--color-soft-blue)",
                "--ambient-hotspot-ring": "var(--color-soft-blue)",
                opacity: 0,
                transform: "translate3d(-9999px, -9999px, 0) scale(0.92)",
                willChange: "transform, opacity",
              } as CSSProperties}
            >
              <div
                className="absolute left-0 top-0 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  border:
                    "1px solid color-mix(in srgb, var(--ambient-hotspot-ring) 58%, transparent)",
                  background:
                    "color-mix(in srgb, var(--graph-panel-bg) 84%, transparent)",
                  boxShadow: [
                    "0 0 0 7px color-mix(in srgb, var(--ambient-hotspot-core) 9%, transparent)",
                    "0 0 24px color-mix(in srgb, var(--ambient-hotspot-core) 26%, transparent)",
                  ].join(", "),
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: "var(--ambient-hotspot-core)" }}
                />
              </div>

              {index < 3 ? (
                <div
                  className="ambient-field-hotspot-card absolute w-[198px] max-w-[34vw] transition-[opacity,transform] duration-300"
                  style={{
                    left: "var(--ambient-hotspot-card-left)",
                    opacity: "var(--ambient-hotspot-card-opacity)",
                    top: "var(--ambient-hotspot-card-top)",
                    transform:
                      "translateY(var(--ambient-hotspot-card-translate-y))",
                  }}
                >
                  <OverlayCard
                    className="px-4 py-4"
                    style={{
                      ...panelSurfaceStyle,
                      border:
                        "1px solid color-mix(in srgb, var(--ambient-hotspot-core) 24%, var(--graph-panel-border) 76%)",
                    }}
                  >
                    <div className="flex flex-wrap gap-2">
                      <MetaPill mono>Selected</MetaPill>
                      {hotspot.badges.map((badge) => (
                        <MetaPill
                          key={badge}
                          style={{ color: "var(--ambient-hotspot-core)" }}
                        >
                          {badge}
                        </MetaPill>
                      ))}
                    </div>
                    <p className="mt-3 text-[13px] font-medium leading-5">
                      {hotspot.title}
                    </p>
                  </OverlayCard>
                </div>
              ) : null}
            </div>
          );
        })}
        <div
          ref={focusedPaperSeatRef}
          className="absolute right-4 top-[20%] w-[min(23rem,calc(100vw-2rem))] max-w-[420px] transition-[opacity,transform] duration-300 sm:right-6 sm:top-[18%] lg:right-[max(2rem,6vw)] lg:top-[18%]"
          style={{
            "--ambient-focused-paper-accent": "var(--color-soft-blue)",
            opacity: 0,
            transform: "translate3d(0, 18px, 0) scale(0.96)",
            willChange: "opacity, transform",
          } as CSSProperties}
        >
          <OverlayCard
            className="px-5 py-5 sm:px-6 sm:py-6"
            style={{
              ...panelSurfaceStyle,
              border:
                "1px solid color-mix(in srgb, var(--ambient-focused-paper-accent) 26%, var(--graph-panel-border) 74%)",
            }}
          >
            <div className="flex flex-wrap gap-2">
              <MetaPill mono>{ambientFieldFocusedPaperSeat.badge}</MetaPill>
              <MetaPill style={{ color: "var(--ambient-focused-paper-accent)" }}>
                {ambientFieldFocusedPaperSeat.eyebrow}
              </MetaPill>
            </div>
            <p className="mt-4 text-[14px] font-medium leading-6 sm:text-[15px]">
              {ambientFieldFocusedPaperSeat.title}
            </p>
            <p
              className="mt-3 text-[13px] leading-6 sm:text-[14px]"
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text) 78%, transparent)",
              }}
            >
              {ambientFieldFocusedPaperSeat.summary}
            </p>
          </OverlayCard>
        </div>
      </div>

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={fieldVignetteStyle}
      />

      <GraphLoadingChrome
        brandTooltipLabel="Back to top"
        groupRightControls
        onBrandClick={() =>
          rootRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }
        surfaceMode={chromeSurfaceMode}
        rightSlot={
          <AmbientFieldGraphWarmupAction
            graphReady={graphReady}
            onOpenGraph={() => router.push("/graph")}
          />
        }
      />

      <AmbientFieldScrollCue visible={chromeSurfaceMode === "flush"} />

      <main className="relative z-10">
        <div ref={heroRef}>
          <AmbientFieldHeroSection
            onExploreRuntime={() => scrollToSection("section-story-1")}
            section={heroSection}
          />
        </div>

        <AmbientFieldStoryChapter
          beats={ambientFieldStoryOneBeats}
          rootRef={rootRef}
          section={storyOneSection}
        />

        <AmbientFieldGraphSection
          section={graphSection}
        />

        <section
          id={storyTwoSection.id}
          data-ambient-section
          data-preset={storyTwoSection.preset}
          data-section-id={storyTwoSection.id}
          className="flex min-h-[128svh] items-center px-4 py-[12vh] sm:px-6 sm:py-[14vh]"
        >
          <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="hidden lg:col-span-4 lg:col-start-1 lg:block">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                viewport={{ once: true, amount: 0.35 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  y: smooth,
                  opacity: { duration: 0.18, ease: "easeOut" },
                }}
              >
                <OverlayCard style={secondaryCardStyle} className="px-5 py-5">
                  <div className="flex items-center gap-2">
                    <MetaPill mono>Module</MetaPill>
                    <MetaPill style={{ color: storyTwoSection.accentVar }}>
                      Shared substrate
                    </MetaPill>
                  </div>
                  <p
                    className="mt-3 text-[13px] leading-6"
                    style={{
                      color:
                        "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
                    }}
                  >
                    Inline modules can attach here without forking the renderer or
                    inventing another background model.
                  </p>
                </OverlayCard>
              </motion.div>
            </div>
            <div className="lg:col-span-5 lg:col-start-8">
              <AmbientFieldSectionCard section={storyTwoSection} />
            </div>
          </div>
        </section>

        <AmbientFieldCtaSection
          graphReady={graphReady}
          onOpenGraph={() => {
            if (graphReady) {
              router.push("/graph");
            }
          }}
          onReturnToTop={() =>
            rootRef.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
          section={ctaSection}
        />
      </main>

      <ViewportTocRail
        entries={tocEntries}
        scrollRef={rootRef}
        compact
        hideBelowWidth={AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT}
        narrowMode="dock"
        scrollOffsetPx={sectionNavScrollOffset}
      />
    </div>
  );
}

function AmbientFieldLandingPageWithWarmup({ bundle }: { bundle: GraphBundle }) {
  const forcedGraphReady = useLandingGraphReadyDebugOverride();
  const { graphReady } = useGraphWarmup(bundle);
  const shellVariant = useShellVariant();

  return (
    <ShellVariantProvider value={shellVariant}>
      <AmbientFieldLandingShell
        graphReady={graphReady || forcedGraphReady}
        shellVariant={shellVariant}
      />
    </ShellVariantProvider>
  );
}

export function AmbientFieldLandingPage({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  const forcedGraphReady = useLandingGraphReadyDebugOverride();
  const shellVariant = useShellVariant();

  if (bundle == null) {
    return (
      <ShellVariantProvider value={shellVariant}>
        <AmbientFieldLandingShell
          graphReady={forcedGraphReady}
          shellVariant={shellVariant}
        />
      </ShellVariantProvider>
    );
  }

  return <AmbientFieldLandingPageWithWarmup bundle={bundle} />;
}
