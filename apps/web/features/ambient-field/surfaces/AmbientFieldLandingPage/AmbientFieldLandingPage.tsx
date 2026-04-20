"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useViewportSize } from "@mantine/hooks";
import { motion, useReducedMotion } from "framer-motion";
import type { GraphBundle } from "@solemd/graph";
import {
  type ChromeSurfaceMode,
} from "@/features/graph/components/panels/PanelShell/panel-styles";
import {
  AmbientFieldConnectionOverlay,
  type AmbientFieldConnectionOverlayHandle,
} from "./AmbientFieldConnectionOverlay";
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
import { FieldCanvas } from "../../renderer/FieldCanvas";
import type { BlobController } from "../../controller/BlobController";
import type { FieldController } from "../../controller/FieldController";
import { fieldLoopClock } from "../../renderer/field-loop-clock";
import { AmbientFieldHotspotPool } from "./AmbientFieldHotspotPool";
import {
  createAmbientFieldSceneState,
  type AmbientFieldSceneState,
  type AmbientFieldStageItemId,
} from "../../scene/visual-presets";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "../../stage/FixedStageManager";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../../ambient-field-breakpoints";
import {
  ambientFieldLandingSections,
  FIELD_SECTION_MANIFEST,
} from "./ambient-field-landing-content";
import { ambientFieldBlobHotspots } from "./ambient-field-hotspot-overlay";
import { AmbientFieldClientsSection } from "./AmbientFieldClientsSection";
import { AmbientFieldCtaSection } from "./AmbientFieldCtaSection";
import { AmbientFieldEventsSection } from "./AmbientFieldEventsSection";
import { AmbientFieldGraphWarmupAction } from "./AmbientFieldGraphWarmupAction";
import { AmbientFieldGraphSection } from "./AmbientFieldGraphSection";
import { AmbientFieldHeroSection } from "./AmbientFieldHeroSection";
import { AmbientFieldMoveNewSection } from "./AmbientFieldMoveNewSection";
import { AmbientFieldScrollCue } from "./AmbientFieldScrollCue";
import { AmbientFieldStoryChapter } from "./AmbientFieldStoryChapter";
import {
  ambientFieldStoryOneBeats,
  ambientFieldStoryTwoBeats,
} from "./ambient-field-landing-content";

const rootShellStyle: CSSProperties = {
  backgroundColor: "var(--graph-bg)",
  color: "var(--graph-panel-text)",
};

const fieldVignetteStyle: CSSProperties = {
  background: "transparent",
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

function getLandingSection(sectionId: string) {
  const section = ambientFieldLandingSections.find(
    (candidate) => candidate.id === sectionId,
  );
  if (!section) {
    throw new Error(`Missing ambient-field landing section "${sectionId}"`);
  }
  return section;
}

function AmbientFieldLandingShellContent({
  graphReady,
  isCompactFieldViewport,
  sceneStateRef,
}: {
  graphReady: boolean;
  isCompactFieldViewport: boolean;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}) {
  const { ready: stageReady, registerController } = useFixedStageManager();
  const router = useRouter();
  const storyTwoRef = useRef<HTMLElement>(null);
  const connectionOverlayRef =
    useRef<AmbientFieldConnectionOverlayHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const blobControllerRef = useRef<BlobController | null>(null);
  const blobHotspotRefsRef = useRef<Array<HTMLDivElement | null>>([]);
  const blobHotspotCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [blobControllerReady, setBlobControllerReady] = useState(false);
  const [chromeSurfaceMode, setChromeSurfaceMode] =
    useState<ChromeSurfaceMode>("flush");
  const sectionNavScrollOffset = isCompactFieldViewport
    ? 24
    : APP_CHROME_PX.panelTop + 76;

  useEffect(() => {
    function syncChromeSurfaceMode() {
      const nextMode: ChromeSurfaceMode =
        window.scrollY > CHROME_SURFACE_TRANSITION_SCROLL_PX ? "pill" : "flush";
      setChromeSurfaceMode((current) =>
        current === nextMode ? current : nextMode,
      );
    }

    syncChromeSurfaceMode();
    window.addEventListener("scroll", syncChromeSurfaceMode, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncChromeSurfaceMode);
    };
  }, []);

  // Subscribe to the shared loop clock so the connection overlay and
  // per-hotspot card seats stay in sync with the frames BlobController
  // wrote to the DOM pool. No separate RAF, no React reconciliation —
  // a single read-and-write pass off the controller's current frame array.
  useEffect(() => {
    const disposer = fieldLoopClock.subscribe(
      "landing-hotspot-consumers",
      40,
      () => {
        const controller = blobControllerRef.current;
        if (!controller) return;
        const frames = controller.getLastFrames();
        controller.applyStageGates(stageRef.current);
        connectionOverlayRef.current?.updateFrames(frames);

        blobHotspotCardRefs.current.forEach((cardNode, index) => {
          if (!cardNode) return;
          const frame = frames[index];
          if (!frame?.visible) {
            cardNode.style.opacity = "0";
            cardNode.style.transform =
              "translate3d(-9999px, -9999px, 0) scale(0.92)";
            return;
          }
          const cardVisible = frame.mode === "card";
          cardNode.style.opacity = cardVisible ? "1" : "0";
          const cardTranslateY = cardVisible ? 0 : 10;
          cardNode.style.transform = `translate3d(${frame.x}px, ${frame.y + cardTranslateY}px, 0)`;
        });
      },
    );
    return disposer;
  }, []);

  function handleControllerReady(
    id: AmbientFieldStageItemId,
    controller: FieldController,
  ) {
    registerController(id, controller);
    if (id !== "blob") return;
    blobControllerRef.current = controller as BlobController;
    setBlobControllerReady(true);
  }

  // Once both the BlobController and the pool refs are available, hand the
  // pool nodes into the controller so `projectHotspots` can write DOM
  // directly. The controller is initially attached with wrapper/mouseWrapper/
  // model/material from FieldScene; we re-invoke `attach` here only to
  // install hotspotRefs alongside the existing attachment.
  useEffect(() => {
    if (!blobControllerReady) return;
    const controller = blobControllerRef.current;
    if (!controller || !controller.wrapper || !controller.mouseWrapper || !controller.model || !controller.material) {
      return;
    }
    controller.hotspotRefs = blobHotspotRefsRef.current.filter(
      (node): node is HTMLDivElement => node != null,
    );
  }, [blobControllerReady]);

  const tocEntries = useMemo<PanelEdgeTocEntry[]>(
    () =>
      ambientFieldLandingSections.map((section) => ({
        id: section.id,
        title: section.title,
        color: section.accentVar,
      })),
    [],
  );

  const heroSection = getLandingSection("section-welcome");
  const clientsSection = getLandingSection("section-clients");
  const storyOneSection = getLandingSection("section-story-1");
  const graphSection = getLandingSection("section-graph");
  const storyTwoSection = getLandingSection("section-story-2");
  const eventsSection = getLandingSection("section-events");
  const moveNewSection = getLandingSection("section-move-new");
  const ctaSection = getLandingSection("section-cta");

  function scrollToSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const top =
      section.getBoundingClientRect().top + window.scrollY - sectionNavScrollOffset;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  }

  return (
    <div
      data-panel-shell
      className="relative"
      style={rootShellStyle}
    >
      <FieldCanvas
        className="fixed inset-0"
        sceneStateRef={sceneStateRef}
        stageReady={stageReady}
        onControllerReady={handleControllerReady}
      />

      <div
        ref={stageRef}
        aria-hidden="true"
        className="afr-stage pointer-events-none fixed inset-0 z-[6]"
      >
        <AmbientFieldHotspotPool
          onRegisterRefs={(nodes) => {
            blobHotspotRefsRef.current = nodes;
            const controller = blobControllerRef.current;
            if (controller) {
              controller.hotspotRefs = nodes.filter(
                (node): node is HTMLDivElement => node != null,
              );
            }
          }}
          onRegisterCardRefs={(nodes) => {
            blobHotspotCardRefs.current = nodes;
          }}
          onHotspotAnimationEnd={(index) => {
            blobControllerRef.current?.onHotspotAnimationEnd(index);
          }}
          renderCard={(index) => {
            const hotspot = ambientFieldBlobHotspots[index];
            if (!hotspot) return null;
            if (!hotspot.title && hotspot.badges.length === 0) return null;
            const hotspotLabel = Array.from(
              new Set(["Selected", ...hotspot.badges]),
            ).join(" · ");
            return (
              <div
                className="ambient-field-hotspot-card-inner w-[198px] max-w-[34vw]"
                style={{
                  marginLeft: hotspot.cardLeft ?? "28px",
                  marginTop: hotspot.cardTop ?? "-18px",
                }}
              >
                <div
                  className="space-y-2 px-2 py-2 text-left"
                  style={{
                    color: "var(--graph-panel-text)",
                  }}
                >
                  <p
                    className="text-[10px] uppercase tracking-[0.18em]"
                    style={{
                      color:
                        "color-mix(in srgb, var(--graph-panel-text-dim) 88%, transparent)",
                      textShadow:
                        "0 1px 16px color-mix(in srgb, var(--graph-bg) 74%, transparent)",
                    }}
                  >
                    {hotspotLabel}
                  </p>
                  <p
                    className="text-[13px] font-medium leading-5"
                    style={{
                      textShadow:
                        "0 1px 20px color-mix(in srgb, var(--graph-bg) 82%, transparent)",
                    }}
                  >
                    {hotspot.title}
                  </p>
                </div>
              </div>
            );
          }}
        />
      </div>

      <AmbientFieldConnectionOverlay
        ref={connectionOverlayRef}
        targetRef={storyTwoRef}
      />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={fieldVignetteStyle}
      />

      <GraphLoadingChrome
        brandTooltipLabel="Back to top"
        groupRightControls
        onBrandClick={() =>
          window.scrollTo({ top: 0, behavior: "smooth" })
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
        <AmbientFieldHeroSection
          onExploreRuntime={() => scrollToSection("section-story-1")}
          section={heroSection}
        />

        <AmbientFieldClientsSection section={clientsSection} />

        <AmbientFieldStoryChapter
          beats={ambientFieldStoryOneBeats}
          section={storyOneSection}
        />

        <AmbientFieldGraphSection
          section={graphSection}
        />

        <AmbientFieldStoryChapter
          beats={ambientFieldStoryTwoBeats}
          section={storyTwoSection}
          sectionRef={storyTwoRef}
        />

        <AmbientFieldEventsSection section={eventsSection} />

        <AmbientFieldMoveNewSection section={moveNewSection} />

        <AmbientFieldCtaSection
          graphReady={graphReady}
          onOpenGraph={() => {
            if (graphReady) {
              router.push("/graph");
            }
          }}
          onReturnToTop={() =>
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          section={ctaSection}
        />
      </main>

      {isCompactFieldViewport ? null : (
        <ViewportTocRail
          entries={tocEntries}
          compact
          scrollOffsetPx={sectionNavScrollOffset}
        />
      )}
    </div>
  );
}

function AmbientFieldLandingShell({
  graphReady,
  shellVariant,
}: {
  graphReady: boolean;
  shellVariant: ShellVariant;
}) {
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth } = useViewportSize();
  const sceneStateRef = useRef<AmbientFieldSceneState>(
    createAmbientFieldSceneState(),
  );
  const isCompactFieldViewport =
    viewportWidth > 0
      ? viewportWidth < AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT
      : shellVariant === "mobile";

  useEffect(() => {
    sceneStateRef.current.motionEnabled = !reducedMotion;
  }, [reducedMotion]);

  return (
    <FixedStageManagerProvider
      isMobile={isCompactFieldViewport}
      manifest={FIELD_SECTION_MANIFEST}
      reducedMotion={!!reducedMotion}
      sceneStateRef={sceneStateRef}
    >
      <AmbientFieldLandingShellContent
        graphReady={graphReady}
        isCompactFieldViewport={isCompactFieldViewport}
        sceneStateRef={sceneStateRef}
      />
    </FixedStageManagerProvider>
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
