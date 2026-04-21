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
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { useReducedMotion } from "framer-motion";
import type { GraphBundle } from "@solemd/graph";
import {
  FieldConnectionOverlay,
  type FieldConnectionOverlayHandle,
} from "./FieldConnectionOverlay";
import { GraphLoadingChrome } from "@/features/graph/components/shell/loading/GraphLoadingChrome";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import {
  useShellVariant,
  type ShellVariant,
} from "@/features/graph/components/shell/use-shell-variant";
import {
  useGraphWarmup,
  type GraphWarmupStatus,
} from "@/features/graph/hooks/use-graph-warmup";
import type { PanelEdgeTocEntry } from "@/features/wiki/components/PanelEdgeToc";
import { ViewportTocRail } from "@/features/wiki/components/ViewportTocRail";
import { APP_CHROME_PX } from "@/lib/density";
import { FieldCanvas } from "../../renderer/FieldCanvas";
import type { BlobController } from "../../controller/BlobController";
import type { FieldController } from "../../controller/FieldController";
import { fieldLoopClock } from "../../renderer/field-loop-clock";
import {
  createFieldSceneStore,
  FieldSceneStoreProvider,
} from "../../scroll/field-scene-store";
import { FieldHotspotPool } from "./FieldHotspotPool";
import {
  createFieldSceneState,
  type FieldSceneState,
  type FieldStageItemId,
} from "../../scene/visual-presets";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "../../stage/FixedStageManager";
import { FIELD_NON_DESKTOP_BREAKPOINT } from "../../field-breakpoints";
import {
  fieldLandingSections,
  FIELD_SECTION_MANIFEST,
} from "./field-landing-content";
import { fieldBlobHotspots } from "./field-hotspot-overlay";
import { FieldCtaSection } from "./FieldCtaSection";
import { FieldGraphWarmupAction } from "./FieldGraphWarmupAction";
import { FieldHeroSection } from "./FieldHeroSection";
import { FieldMobileCarrySection } from "./FieldMobileCarrySection";
import { FieldScrollCue } from "./FieldScrollCue";
import { FieldSequenceSection } from "./FieldSequenceSection";
import { FieldStoryChapter } from "./FieldStoryChapter";
import { FieldStoryTwoSection } from "./FieldStoryTwoSection";
import { FieldSurfaceRailSection } from "./FieldSurfaceRailSection";
import {
  fieldStoryOneBeats,
  fieldStoryTwoBeats,
} from "./field-landing-content";

const rootShellStyle: CSSProperties = {
  backgroundColor: "var(--graph-bg)",
  color: "var(--graph-panel-text)",
};

const fieldVignetteStyle: CSSProperties = {
  background: "transparent",
};

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
  const section = fieldLandingSections.find(
    (candidate) => candidate.id === sectionId,
  );
  if (!section) {
    throw new Error(`Missing field landing section "${sectionId}"`);
  }
  return section;
}

function FieldLandingShellContent({
  activeStageItemIds,
  graphStatus,
  isCompactFieldViewport,
  reducedMotion,
  sceneStateRef,
  showViewportToc,
}: {
  activeStageItemIds: readonly FieldStageItemId[];
  graphStatus: GraphWarmupStatus;
  isCompactFieldViewport: boolean;
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<FieldSceneState>;
  showViewportToc: boolean;
}) {
  const graphReady = graphStatus === "ready";
  const scrollBehavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
  const { ready: stageReady, registerController } = useFixedStageManager();
  const router = useRouter();
  const connectionOverlayRef =
    useRef<FieldConnectionOverlayHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const blobControllerRef = useRef<BlobController | null>(null);
  const blobHotspotRefsRef = useRef<Array<HTMLDivElement | null>>([]);
  const blobHotspotCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [blobControllerReady, setBlobControllerReady] = useState(false);
  const sectionNavScrollOffset = isCompactFieldViewport
    ? 24
    : APP_CHROME_PX.panelTop + 76;

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
    id: FieldStageItemId,
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
      fieldLandingSections.map((section) => ({
        id: section.id,
        title: section.title,
        color: section.accentVar,
      })),
    [],
  );

  const heroSection = getLandingSection("section-hero");
  const surfaceRailSection = getLandingSection("section-surface-rail");
  const storyOneSection = getLandingSection("section-story-1");
  const storyTwoSection = getLandingSection("section-story-2");
  const storyThreeSection = getLandingSection("section-story-3");
  const sequenceSection = getLandingSection("section-sequence");
  const mobileCarrySection = getLandingSection("section-mobile-carry");
  const ctaSection = getLandingSection("section-cta");

  function scrollToSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const top =
      section.getBoundingClientRect().top + window.scrollY - sectionNavScrollOffset;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: scrollBehavior,
    });
  }

  return (
    <div
      data-panel-shell
      className="relative"
      style={rootShellStyle}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <FieldCanvas
        activeIds={activeStageItemIds}
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
        <FieldHotspotPool
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
            const hotspot = fieldBlobHotspots[index];
            if (!hotspot) return null;
            if (!hotspot.title && hotspot.badges.length === 0) return null;
            const hotspotLabel = Array.from(
              new Set(["Selected", ...hotspot.badges]),
            ).join(" · ");
            return (
              <div
                className="field-hotspot-card-inner w-[198px] max-w-[34vw]"
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

      <FieldConnectionOverlay
        chapterId="section-story-3"
        ref={connectionOverlayRef}
        sceneStateRef={sceneStateRef}
      />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={fieldVignetteStyle}
      />

      <GraphLoadingChrome
        brandTooltipLabel="Back to top"
        groupRightControls
        onBrandClick={() =>
          window.scrollTo({ top: 0, behavior: scrollBehavior })
        }
        surfaceMode="auto"
        rightSlot={
          <FieldGraphWarmupAction
            status={graphStatus}
            onOpenGraph={() => router.push("/graph")}
          />
        }
      />

      <FieldScrollCue />

      <main id="main-content" className="relative z-10">
        <FieldHeroSection
          onExploreRuntime={() => scrollToSection("section-story-1")}
          section={heroSection}
        />

        <FieldSurfaceRailSection section={surfaceRailSection} />

        <FieldStoryChapter
          beats={fieldStoryOneBeats}
          chapterKey="storyOne"
          section={storyOneSection}
        />

        <FieldStoryTwoSection
          section={storyTwoSection}
        />

        <FieldStoryChapter
          beats={fieldStoryTwoBeats}
          chapterKey="storyThree"
          section={storyThreeSection}
        />

        <FieldSequenceSection section={sequenceSection} />

        <FieldMobileCarrySection section={mobileCarrySection} />

        <FieldCtaSection
          graphReady={graphReady}
          onOpenGraph={() => {
            if (graphReady) {
              router.push("/graph");
            }
          }}
          onReturnToTop={() =>
            window.scrollTo({ top: 0, behavior: scrollBehavior })
          }
          section={ctaSection}
        />
      </main>

      {showViewportToc ? (
        <ViewportTocRail
          entries={tocEntries}
          compact
          rightPx={4}
          scrollOffsetPx={sectionNavScrollOffset}
        />
      ) : null}
    </div>
  );
}

function FieldLandingShell({
  graphStatus,
  shellVariant,
}: {
  graphStatus: GraphWarmupStatus;
  shellVariant: ShellVariant;
}) {
  const reducedMotion = useReducedMotion();
  const hasAnyCoarsePointer = useMediaQuery("(any-pointer: coarse)");
  const hasAnyFinePointer = useMediaQuery("(any-pointer: fine)");
  const isPureTouchDevice = !!hasAnyCoarsePointer && !hasAnyFinePointer;
  const { width: viewportWidth } = useViewportSize();
  const sceneStateRef = useMemo<MutableRefObject<FieldSceneState>>(
    () => ({ current: createFieldSceneState() }),
    [],
  );
  const sceneStore = useMemo(
    () => createFieldSceneStore(sceneStateRef.current),
    [sceneStateRef],
  );
  const activeStageItemIds = useMemo(
    () =>
      Array.from(
        new Set(FIELD_SECTION_MANIFEST.map((entry) => entry.stageItemId)),
      ) as FieldStageItemId[],
    [],
  );
  const isCompactFieldViewport =
    viewportWidth > 0
      ? viewportWidth < FIELD_NON_DESKTOP_BREAKPOINT
      : shellVariant === "mobile";
  const showViewportToc =
    shellVariant === "desktop"
    && !isCompactFieldViewport
    && !isPureTouchDevice;

  useEffect(() => {
    sceneStateRef.current.motionEnabled = !reducedMotion;
  }, [reducedMotion]);

  return (
    <FieldSceneStoreProvider store={sceneStore}>
      <FixedStageManagerProvider
        isMobile={isCompactFieldViewport}
        manifest={FIELD_SECTION_MANIFEST}
        reducedMotion={!!reducedMotion}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <FieldLandingShellContent
          activeStageItemIds={activeStageItemIds}
          graphStatus={graphStatus}
          isCompactFieldViewport={isCompactFieldViewport}
          reducedMotion={!!reducedMotion}
          sceneStateRef={sceneStateRef}
          showViewportToc={showViewportToc}
        />
      </FixedStageManagerProvider>
    </FieldSceneStoreProvider>
  );
}

export function FieldLandingPage({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  const forcedGraphReady = useLandingGraphReadyDebugOverride();
  const { status } = useGraphWarmup(bundle);
  const shellVariant = useShellVariant();
  const graphStatus: GraphWarmupStatus = forcedGraphReady ? "ready" : status;

  return (
    <ShellVariantProvider value={shellVariant}>
      <FieldLandingShell
        graphStatus={graphStatus}
        shellVariant={shellVariant}
      />
    </ShellVariantProvider>
  );
}
