"use client";

import {
  createRef,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { useViewportSize } from "@mantine/hooks";
import { motion, useReducedMotion } from "framer-motion";
import type { GraphBundle, GraphBundleLoadProgress } from "@solemd/graph";
import { MetaPill } from "@/features/graph/components/panels/PanelShell/MetaPill";
import { OverlayCard } from "@/features/graph/components/panels/PanelShell/OverlaySurface";
import {
  chromePillSurfaceStyle,
  panelAccentCardStyle,
  panelSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import { PromptStageSurface } from "@/features/graph/components/panels/prompt/PromptStageSurface";
import {
  MAX_CARD_W,
  cardWidth,
} from "@/features/graph/components/panels/prompt/constants";
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
import {
  prewarmAmbientFieldPointSources,
} from "../../asset/point-source-registry";
import {
  createAmbientFieldSceneState,
  type AmbientFieldSceneState,
} from "../../scene/visual-presets";
import {
  composeAmbientFieldOverlayControllers,
  createAmbientFieldScrollController,
  type AmbientFieldScrollController,
} from "../../scroll/ambient-field-scroll-driver";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../../ambient-field-breakpoints";
import {
  ambientFieldLandingSections,
  ambientFieldLandingScrollManifest,
  ambientFieldProcessStageManifest,
} from "./ambient-field-landing-content";
import { AmbientFieldCtaSection } from "./AmbientFieldCtaSection";
import { createAmbientFieldHeroPromptController } from "./ambient-field-hero-prompt-controller";
import { AmbientFieldHeroSection } from "./AmbientFieldHeroSection";
import { createAmbientFieldProcessStageController } from "./ambient-field-process-stage-controller";
import { AmbientFieldProcessStage } from "./AmbientFieldProcessStage";
import { AmbientFieldSectionCard } from "./AmbientFieldSectionCard";

const rootShellStyle: CSSProperties = {
  backgroundColor: "var(--graph-bg)",
  color: "var(--graph-panel-text)",
};

const fieldVignetteStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 50% 16%, transparent 0%, transparent 24%, color-mix(in srgb, var(--graph-bg) 14%, transparent) 58%, color-mix(in srgb, var(--graph-bg) 62%, transparent) 100%)",
};

const secondaryCardStyle: CSSProperties = {
  ...panelSurfaceStyle,
  border: "1px solid color-mix(in srgb, var(--graph-panel-border) 72%, transparent)",
};

const GRAPH_UNAVAILABLE_ERROR = new Error("Graph warmup unavailable");

function getGraphWarmupLabel(progress: GraphBundleLoadProgress | null): string {
  switch (progress?.stage) {
    case "resolving":
      return "Connecting graph";
    case "views":
      return "Preparing tables";
    case "points":
      return "Loading points";
    case "clusters":
      return "Organizing clusters";
    case "facets":
      return "Building facets";
    case "hydrating":
      return "Preparing layout";
    case "ready":
      return "Graph ready";
    default:
      return "Warming graph";
  }
}

function GraphWarmupStatus({
  graphError,
  graphProgress,
  graphReady,
  onOpenGraph,
}: {
  graphError: Error | null;
  graphProgress: GraphBundleLoadProgress | null;
  graphReady: boolean;
  onOpenGraph: () => void;
}) {
  if (graphReady) {
    return (
      <button
        type="button"
        onClick={onOpenGraph}
        className="rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
        style={{
          ...chromePillSurfaceStyle,
          color: "var(--graph-panel-text)",
        }}
      >
        Go to graph
      </button>
    );
  }

  return (
    <div
      className="rounded-full px-3.5 py-2 text-xs font-medium"
      style={{
        ...chromePillSurfaceStyle,
        color: graphError
          ? "var(--feedback-danger-fg)"
          : "var(--graph-panel-text-dim)",
      }}
    >
      {graphError ? "Graph warmup unavailable" : getGraphWarmupLabel(graphProgress)}
    </div>
  );
}

function AmbientFieldLandingShell({
  graphError,
  graphProgress,
  graphReady,
  shellVariant,
}: {
  graphError: Error | null;
  graphProgress: GraphBundleLoadProgress | null;
  graphReady: boolean;
  shellVariant: ShellVariant;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth } = useViewportSize();
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const heroPromptRef = useRef<HTMLDivElement>(null);
  const topPromptRef = useRef<HTMLDivElement>(null);
  const processPanelRef = useRef<HTMLDivElement>(null);
  const processMarkerRefs = useMemo(
    () =>
      ambientFieldProcessStageManifest.markerLanes.map(() =>
        createRef<HTMLDivElement>(),
      ),
    [],
  );
  const processPopupRefs = useMemo(
    () =>
      ambientFieldProcessStageManifest.popups.map(() =>
        createRef<HTMLDivElement>(),
      ),
    [],
  );
  const sceneStateRef = useRef<AmbientFieldSceneState>(
    createAmbientFieldSceneState(),
  );
  const scrollControllerRef = useRef<AmbientFieldScrollController | null>(null);
  const isCompactFieldViewport =
    viewportWidth > 0
      ? viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT
      : shellVariant === "mobile";
  const sectionNavScrollOffset = isCompactFieldViewport
    ? 24
    : APP_CHROME_PX.panelTop + 76;
  const stagePromptWidth =
    viewportWidth > 0
      ? isCompactFieldViewport
        ? Math.min(viewportWidth - 32, 496)
        : Math.min(cardWidth(viewportWidth), 640)
      : MAX_CARD_W;

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
    const heroPrompt = heroPromptRef.current;
    if (!root || !hero || !heroPrompt) return undefined;

    const overlayController = composeAmbientFieldOverlayControllers([
      createAmbientFieldHeroPromptController({
        heroPrompt,
        topPrompt: topPromptRef.current,
      }),
      createAmbientFieldProcessStageController({
        isMobile: isCompactFieldViewport,
        panel: processPanelRef.current,
        markers: processMarkerRefs.map((markerRef) => markerRef.current),
        popups: processPopupRefs.map((popupRef) => popupRef.current),
      }),
    ]);
    const controller = createAmbientFieldScrollController({
      root,
      hero,
      overlayController,
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
  }, [isCompactFieldViewport, processMarkerRefs, processPopupRefs, reducedMotion]);

  function handleFieldFrame(timestamp: number) {
    scrollControllerRef.current?.syncFrame(timestamp);
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
  const processSection = ambientFieldLandingSections[2]!;
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
      />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={fieldVignetteStyle}
      />

      <GraphLoadingChrome
        brandTooltipLabel="Back to top"
        onBrandClick={() =>
          rootRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }
        rightSlot={
          <GraphWarmupStatus
            graphError={graphError}
            graphProgress={graphProgress}
            graphReady={graphReady}
            onOpenGraph={() => router.push("/graph")}
          />
        }
      />

      {!isCompactFieldViewport ? (
        <div
          ref={topPromptRef}
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-5 z-20 opacity-0"
          style={{
            width: `min(${stagePromptWidth}px, calc(100vw - 6rem))`,
          }}
        >
          <div className="origin-top scale-[0.9]">
            <PromptStageSurface
              compact
              placeholder="Ask the knowledge web about a pathway, paper cluster, or mechanism…"
              primaryActionDisabled={!graphReady}
            />
          </div>
        </div>
      ) : null}

      <main className="relative z-10">
        <div ref={heroRef}>
          <AmbientFieldHeroSection
            graphReady={graphReady}
            promptRef={heroPromptRef}
            stagePromptWidth={stagePromptWidth}
            warmupLabel={getGraphWarmupLabel(graphProgress)}
            onExploreRuntime={() => scrollToSection("section-story-1")}
            onOpenGraph={() => {
              if (graphReady) {
                router.push("/graph");
              }
            }}
            section={heroSection}
          />
        </div>

        <section
          id={storyOneSection.id}
          data-ambient-section
          data-preset={storyOneSection.preset}
          data-section-id={storyOneSection.id}
          className="flex min-h-[95svh] items-center px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5 lg:col-start-1">
              <AmbientFieldSectionCard section={storyOneSection} />
            </div>
            <div className="hidden lg:col-span-4 lg:col-start-8 lg:block">
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
                    <MetaPill mono>Signal</MetaPill>
                    <MetaPill style={{ color: "var(--color-soft-blue)" }}>
                      Field is still the same object
                    </MetaPill>
                  </div>
                  <div className="mt-5 rounded-[1rem] p-4" style={panelAccentCardStyle}>
                    <p className="text-[13px] leading-6 text-[var(--graph-panel-text-dim)]">
                      One fixed stage means the user keeps orienting inside the same
                      world while the story changes around it.
                    </p>
                  </div>
                </OverlayCard>
              </motion.div>
            </div>
          </div>
        </section>

        <section
          id={processSection.id}
          data-ambient-section
          data-preset={processSection.preset}
          data-section-id={processSection.id}
          className="flex min-h-[108svh] items-center px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="lg:col-span-5">
              <AmbientFieldSectionCard section={processSection} />
            </div>
            <div className="lg:col-span-7">
              <AmbientFieldProcessStage
                isMobile={isCompactFieldViewport}
                markerRefs={processMarkerRefs}
                panelRef={processPanelRef}
                popupRefs={processPopupRefs}
              />
            </div>
          </div>
        </section>

        <section
          id={storyTwoSection.id}
          data-ambient-section
          data-preset={storyTwoSection.preset}
          data-section-id={storyTwoSection.id}
          className="flex min-h-[100svh] items-center px-4 py-16 sm:px-6 sm:py-20"
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
  const { graphError, graphProgress, graphReady } = useGraphWarmup(bundle);
  const shellVariant = useShellVariant();

  return (
    <ShellVariantProvider value={shellVariant}>
      <AmbientFieldLandingShell
        graphError={graphError}
        graphProgress={graphProgress}
        graphReady={graphReady}
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
  const shellVariant = useShellVariant();

  if (bundle == null) {
    return (
      <ShellVariantProvider value={shellVariant}>
        <AmbientFieldLandingShell
          graphError={GRAPH_UNAVAILABLE_ERROR}
          graphProgress={null}
          graphReady={false}
          shellVariant={shellVariant}
        />
      </ShellVariantProvider>
    );
  }

  return <AmbientFieldLandingPageWithWarmup bundle={bundle} />;
}
