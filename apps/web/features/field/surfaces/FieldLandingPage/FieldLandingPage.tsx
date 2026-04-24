"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMediaQuery, useViewportSize } from "@mantine/hooks";
import { MotionConfig, useReducedMotion } from "framer-motion";
import type { GraphBundle } from "@solemd/graph";
import {
  FieldConnectionOverlay,
  type FieldConnectionOverlayHandle,
} from "./FieldConnectionOverlay";
import { GraphLoadingChrome } from "@/features/graph/components/shell/loading/GraphLoadingChrome";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import type { ShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import {
  useGraphWarmup,
  type GraphWarmupStatus,
} from "@/features/graph/hooks/use-graph-warmup";
import type { PanelEdgeTocEntry } from "@/features/wiki/components/PanelEdgeToc";
import { ViewportTocRail } from "@/features/wiki/components/ViewportTocRail";
import { APP_CHROME_PX } from "@/lib/density";
import type { BlobController } from "../../controller/BlobController";
import { fieldLoopClock } from "../../renderer/field-loop-clock";
import { useFieldRuntime } from "../../renderer/field-runtime-context";
import { FieldHotspotPool } from "./FieldHotspotPool";
import type { FieldStageItemId } from "../../scene/visual-presets";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "../../stage/FixedStageManager";
import { FIELD_NON_DESKTOP_BREAKPOINT } from "../../field-breakpoints";
import {
  fieldLandingSections,
  FIELD_SECTION_MANIFEST,
} from "./field-landing-content";
import { FieldCtaSection } from "./FieldCtaSection";
import { FieldGraphWarmupAction } from "./FieldGraphWarmupAction";
import { FieldHeroSection } from "./FieldHeroSection";
import { FieldScrollCue } from "./FieldScrollCue";
import { FieldStoryChapter } from "./FieldStoryChapter";
import { FieldStoryTwoSection } from "./FieldStoryTwoSection";
import { FieldSurfaceRailSection } from "./FieldSurfaceRailSection";
import {
  fieldSequenceBeats,
  fieldStoryOneBeats,
  fieldStoryTwoBeats,
} from "./field-landing-content";
import { useFieldSceneStore } from "../../scroll/field-scene-store";

// Panel-shell MUST be transparent: the FieldCanvas is hoisted to the
// (dashboard) layout (step 5a) and lives as a body-level sibling of
// this shell. An opaque background here paints over the canvas in tree
// order. Body already carries `background-color: var(--background)`
// via app/styles/base.css, so dropping the redundant bg lets the
// layout-owned particles show through.
const rootShellStyle: CSSProperties = {
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
  graphStatus,
  isCompactFieldViewport,
  reducedMotion,
  showViewportToc,
}: {
  graphStatus: GraphWarmupStatus;
  isCompactFieldViewport: boolean;
  reducedMotion: boolean;
  showViewportToc: boolean;
}) {
  const graphReady = graphStatus === "ready";
  const scrollBehavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
  const { ready: stageReady, registerController } = useFixedStageManager();
  const { controllersRef, controllerEpoch, sceneStateRef, setStageReady } =
    useFieldRuntime();
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

  // Mirror layout-registered controllers into the landing FixedStageManager
  // and pick up the blob controller for the hotspot-pool wiring. The Canvas
  // is mounted in the (dashboard) layout (DashboardClientShell); this
  // surface receives controllers through the runtime bridge.
  useEffect(() => {
    const registry = controllersRef.current;
    for (const [id, controller] of Object.entries(registry)) {
      if (!controller) continue;
      registerController(id as FieldStageItemId, controller);
    }
    const blob = registry.blob;
    if (blob) {
      blobControllerRef.current = blob as BlobController;
      setBlobControllerReady(true);
    }
  }, [controllerEpoch, controllersRef, registerController]);

  // Landing drives the shared stageReady signal off FixedStageManager. Orb
  // manages its own when it mounts at /graph.
  useEffect(() => {
    setStageReady(stageReady);
    return () => setStageReady(false);
  }, [setStageReady, stageReady]);

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

  // Once both the BlobController and the pool refs are available, hand the
  // pool nodes into the controller so `projectHotspots` can write DOM
  // directly. The controller is attached by FieldScene with wrapper/
  // mouseWrapper/model/material; we install hotspotRefs alongside.
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
  const ctaSection = getLandingSection("section-cta");

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
        <FieldHeroSection section={heroSection} />

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

        <FieldStoryChapter
          beats={fieldSequenceBeats}
          chapterKey="sequence"
          section={sequenceSection}
        />

        <FieldCtaSection
          graphReady={graphReady}
          onOpenGraph={() => {
            if (graphReady) {
              router.push("/graph");
            }
          }}
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
  const { sceneStateRef } = useFieldRuntime();
  const sceneStore = useFieldSceneStore();
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
  }, [reducedMotion, sceneStateRef]);

  return (
    <MotionConfig reducedMotion="user">
      <FixedStageManagerProvider
        isMobile={isCompactFieldViewport}
        manifest={FIELD_SECTION_MANIFEST}
        reducedMotion={!!reducedMotion}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <FieldLandingShellContent
          graphStatus={graphStatus}
          isCompactFieldViewport={isCompactFieldViewport}
          reducedMotion={!!reducedMotion}
          showViewportToc={showViewportToc}
        />
      </FixedStageManagerProvider>
    </MotionConfig>
  );
}

export function FieldLandingPage({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  const forcedGraphReady = useLandingGraphReadyDebugOverride();
  const { status } = useGraphWarmup(bundle);
  const shellVariant = useShellVariantContext();
  const graphStatus: GraphWarmupStatus = forcedGraphReady ? "ready" : status;

  return (
    <FieldLandingShell
      graphStatus={graphStatus}
      shellVariant={shellVariant}
    />
  );
}
