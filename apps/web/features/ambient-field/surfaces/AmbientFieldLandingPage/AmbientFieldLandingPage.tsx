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
import type {
  AmbientFieldHotspotFrame,
} from "../../renderer/FieldScene";
import {
  AmbientFieldHotspotRing,
  type AmbientFieldHotspotPhase,
} from "../../overlay/AmbientFieldHotspotRing";
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

/** Build the secondary sidebar card's tinted style from the hosting section's
 *  accentVar so the card matches its chapter's brand color. */
function buildSecondaryCardStyle(accentVar: string): CSSProperties {
  return {
    ...panelSurfaceStyle,
    backgroundColor: `color-mix(in srgb, ${accentVar} 8%, var(--graph-panel-bg))`,
    border: `1px solid color-mix(in srgb, ${accentVar} 22%, var(--graph-panel-border))`,
  };
}

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
  const blobHotspotCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  // Per-hotspot reseed counter. Bumped from `onAnimationEnd` on the ring
  // primitive (Maze pattern) so each hotspot's 2 s CSS loop restarts
  // independently with its authored `--afr-delay`.
  const [hotspotSeedKeys, setHotspotSeedKeys] = useState<number[]>(() =>
    ambientFieldBlobHotspots.map(() => 0),
  );
  // Per-hotspot phase derived from the latest `handleHotspotFrame`. Stored in
  // state so the ring primitive can react via its `phase` prop (which gates
  // the `is-animating` class), while the per-frame transform/opacity stays
  // on the direct-DOM-write path for 60fps.
  const [hotspotPhases, setHotspotPhases] = useState<
    AmbientFieldHotspotPhase[]
  >(() => ambientFieldBlobHotspots.map(() => "hidden" as const));
  const hotspotPhasesRef = useRef<AmbientFieldHotspotPhase[]>(hotspotPhases);
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

    const currentPhases = hotspotPhasesRef.current;
    const nextPhases: AmbientFieldHotspotPhase[] = currentPhases.slice();
    let phasesChanged = false;

    blobHotspotRefs.current.forEach((node, index) => {
      const frame = hotspots[index];
      const cardNode = blobHotspotCardRefs.current[index] ?? null;
      if (!frame?.visible) {
        if (node) {
          node.style.opacity = "0";
          node.style.transform =
            "translate3d(-9999px, -9999px, 0) scale(0.92)";
        }
        if (cardNode) {
          cardNode.style.opacity = "0";
          cardNode.style.transform =
            "translate3d(-9999px, -9999px, 0) scale(0.92)";
        }
        if (nextPhases[index] !== "hidden") {
          nextPhases[index] = "hidden";
          phasesChanged = true;
        }
        return;
      }

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

      if (node) {
        node.style.opacity = pointOpacity.toFixed(4);
        node.style.transform = `translate3d(${displayX}px, ${displayY}px, 0) scale(${displayScale})`;
      }

      if (cardNode) {
        // Card rides the same sampled blob position as the ring, so it stays
        // visually tethered to the hotspot. The card's own opacity/offset is
        // driven by `frame.mode === "card"` — a soft fade-in/translate-Y as
        // the beat enters "card" mode.
        const cardVisible = frame.mode === "card";
        cardNode.style.opacity = cardVisible ? "1" : "0";
        const cardTranslateY = cardVisible ? 0 : 10;
        cardNode.style.transform = `translate3d(${displayX}px, ${displayY + cardTranslateY}px, 0)`;
      }

      const nextPhase: AmbientFieldHotspotPhase =
        frame.mode === "focus" ? "only-single" : "animating";
      if (nextPhases[index] !== nextPhase) {
        nextPhases[index] = nextPhase;
        phasesChanged = true;
      }
    });

    if (phasesChanged) {
      hotspotPhasesRef.current = nextPhases;
      setHotspotPhases(nextPhases);
    }

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
        className="afr-stage pointer-events-none fixed inset-0 z-[6]"
      >
        {ambientFieldBlobHotspots.map((hotspot, index) => {
          // Stable per-hotspot animation delay so each ring's 2 s pulse is
          // out of phase with its neighbors — Maze authors these by hand; we
          // derive a stable stagger from index using a prime multiplier.
          const delayMs = (index * 137) % 2000;
          const phase = hotspotPhases[index] ?? "hidden";
          const seedKey = hotspotSeedKeys[index] ?? 0;
          return (
            <div key={hotspot.id} style={{ display: "contents" }}>
              <AmbientFieldHotspotRing
                ref={(node) => {
                  blobHotspotRefs.current[index] = node;
                }}
                delayMs={delayMs}
                phase={reducedMotion ? "idle" : phase}
                projection={{
                  x: -9999,
                  y: -9999,
                  scale: 0.92,
                  opacity: 0,
                }}
                seedKey={seedKey}
                variant="cyan"
                onAnimationEnd={() => {
                  // Maze-parity per-hotspot reseed: bump the seed so the
                  // ring primitive's useEffect reflow-restarts the CSS
                  // keyframe for this index only.
                  setHotspotSeedKeys((previous) => {
                    const next = previous.slice();
                    next[index] = (next[index] ?? 0) + 1;
                    return next;
                  });
                }}
              />

              {index < 3 ? (
                <div
                  ref={(node) => {
                    blobHotspotCardRefs.current[index] = node;
                  }}
                  className="ambient-field-hotspot-card absolute left-0 top-0 w-[198px] max-w-[34vw] transition-[opacity] duration-300"
                  style={{
                    marginLeft: hotspot.cardLeft ?? "28px",
                    marginTop: hotspot.cardTop ?? "-18px",
                    opacity: 0,
                    transform: "translate3d(-9999px, -9999px, 0)",
                    willChange: "transform, opacity",
                  }}
                >
                  <OverlayCard
                    className="px-4 py-4"
                    style={{
                      ...panelSurfaceStyle,
                      border:
                        "1px solid color-mix(in srgb, var(--graph-panel-border) 76%, transparent)",
                    }}
                  >
                    <div className="flex flex-wrap gap-2">
                      <MetaPill mono>Selected</MetaPill>
                      {hotspot.badges.map((badge) => (
                        <MetaPill key={badge}>{badge}</MetaPill>
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
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="hidden lg:col-span-3 lg:col-start-1 lg:block">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                viewport={{ once: true, amount: 0.35 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  y: smooth,
                  opacity: { duration: 0.18, ease: "easeOut" },
                }}
              >
                <OverlayCard
                  style={buildSecondaryCardStyle(storyTwoSection.accentVar)}
                  className="px-5 py-5"
                >
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
            <div className="lg:col-span-4 lg:col-start-9">
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
