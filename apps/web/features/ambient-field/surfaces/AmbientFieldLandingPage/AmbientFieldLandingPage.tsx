"use client";

import {
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
import { AmbientFieldCtaSection } from "./AmbientFieldCtaSection";
import { AmbientFieldGraphSection } from "./AmbientFieldGraphSection";
import { AmbientFieldHeroSection } from "./AmbientFieldHeroSection";
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

const ambientFieldBlobHotspots: ReadonlyArray<{
  badges: string[];
  id: string;
  isRed: boolean;
  title: string;
}> = [
  {
    id: "papers",
    isRed: false,
    title: "Paper subset enters focus",
    badges: ["Selected", "High confidence"],
  },
  {
    id: "entities",
    isRed: true,
    title: "Entity-rich paper neighborhood",
    badges: ["Gene", "Chemical"],
  },
  {
    id: "relations",
    isRed: true,
    title: "Relation bridge becomes visible",
    badges: ["Linking", "Synthesis-ready"],
  },
  ...Array.from({ length: 37 }, (_, index) => ({
    id: `dot-${index + 4}`,
    isRed: index % 2 === 0,
    title: "",
    badges: [],
  })),
];

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
  const blobHotspotRefs = useRef<Array<HTMLDivElement | null>>([]);
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

  function handleFieldFrame(timestamp: number) {
    scrollControllerRef.current?.syncFrame(timestamp);
  }

  function handleHotspotFrame(hotspots: AmbientFieldHotspotFrame[]) {
    blobHotspotRefs.current.forEach((node, index) => {
      if (!node) return;
      const frame = hotspots[index];
      if (!frame?.visible) {
        node.style.opacity = "0";
        node.style.transform = "translate3d(-9999px, -9999px, 0) scale(0.92)";
        node.dataset.mode = "hidden";
        return;
      }

      node.dataset.mode = frame.showCard ? "card" : "dot";
      node.style.setProperty(
        "--ambient-hotspot-ring",
        frame.showCard
          ? "var(--graph-panel-text)"
          : frame.isRed
            ? "var(--color-soft-pink)"
            : "var(--color-soft-blue)",
      );
      node.style.setProperty(
        "--ambient-hotspot-core",
        frame.showCard
          ? "var(--color-soft-pink)"
          : frame.isRed
            ? "var(--color-soft-pink)"
            : "var(--color-soft-blue)",
      );
      node.style.setProperty(
        "--ambient-hotspot-card-opacity",
        frame.showCard ? "1" : "0",
      );
      node.style.setProperty(
        "--ambient-hotspot-card-translate-y",
        frame.showCard ? "0px" : "10px",
      );

      node.style.opacity = frame.opacity.toFixed(4);
      node.style.transform =
        `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale})`;
    });
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
                  className="ambient-field-hotspot-card absolute left-10 top-0 w-[198px] max-w-[34vw] transition-[opacity,transform] duration-300"
                  style={{
                    opacity: "var(--ambient-hotspot-card-opacity)",
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
      </div>

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

      <main className="relative z-10">
        <div ref={heroRef}>
          <AmbientFieldHeroSection
            graphReady={graphReady}
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
