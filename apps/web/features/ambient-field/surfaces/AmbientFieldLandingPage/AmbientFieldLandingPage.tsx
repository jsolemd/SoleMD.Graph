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
import { smooth } from "@/lib/motion";
import { FieldCanvas } from "../../renderer/FieldCanvas";
import type { BlobController } from "../../controller/BlobController";
import { fieldLoopClock } from "../../renderer/field-loop-clock";
import { AmbientFieldHotspotPool } from "./AmbientFieldHotspotPool";
import {
  prewarmAmbientFieldPointSources,
} from "../../asset/point-source-registry";
import {
  createAmbientFieldSceneState,
  type AmbientFieldSceneState,
} from "../../scene/visual-presets";
import { bindAmbientFieldControllers } from "../../scroll/ambient-field-scroll-driver";
import { AMBIENT_FIELD_NON_DESKTOP_BREAKPOINT } from "../../ambient-field-breakpoints";
import { ambientFieldLandingSections } from "./ambient-field-landing-content";
import { ambientFieldBlobHotspots } from "./ambient-field-hotspot-overlay";
import { AmbientFieldCtaSection } from "./AmbientFieldCtaSection";
import { AmbientFieldGraphWarmupAction } from "./AmbientFieldGraphWarmupAction";
import { AmbientFieldGraphSection } from "./AmbientFieldGraphSection";
import { AmbientFieldHeroSection } from "./AmbientFieldHeroSection";
import { AmbientFieldScrollCue } from "./AmbientFieldScrollCue";
import { AmbientFieldStoryChapter } from "./AmbientFieldStoryChapter";
import { ambientFieldStoryOneBeats } from "./ambient-field-landing-content";

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
  const storyTwoRef = useRef<HTMLElement>(null);
  const connectionOverlayRef =
    useRef<AmbientFieldConnectionOverlayHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const blobControllerRef = useRef<BlobController | null>(null);
  const blobHotspotRefsRef = useRef<Array<HTMLDivElement | null>>([]);
  const blobHotspotCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [blobControllerReady, setBlobControllerReady] = useState(false);
  const sceneStateRef = useRef<AmbientFieldSceneState>(
    createAmbientFieldSceneState(),
  );
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
      ids: ["blob"],
    });
  }, [isCompactFieldViewport]);

  useEffect(() => {
    if (!blobControllerReady) return undefined;
    const root = rootRef.current;
    const hero = heroRef.current;
    const blobAnchor = root?.querySelector<HTMLElement>("#section-story-1");
    const blobEndAnchor = root?.querySelector<HTMLElement>("#section-story-2");
    const blob = blobControllerRef.current;
    if (!root || !hero || !blobAnchor || !blobEndAnchor || !blob) {
      return undefined;
    }

    const dispose = bindAmbientFieldControllers({
      anchors: { blob: blobAnchor, blobEnd: blobEndAnchor },
      controllers: { blob },
      hero,
      reducedMotion: !!reducedMotion,
      sceneStateRef,
    });

    return dispose;
  }, [blobControllerReady, reducedMotion]);

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

  function handleBlobControllerReady(controller: BlobController) {
    blobControllerRef.current = controller;
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

  const heroSection = ambientFieldLandingSections[0]!;
  const storyOneSection = ambientFieldLandingSections[1]!;
  const graphSection = ambientFieldLandingSections[2]!;
  const storyTwoSection = ambientFieldLandingSections[3]!;
  const ctaSection = ambientFieldLandingSections[4]!;

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
      ref={rootRef}
      data-panel-shell
      className="relative"
      style={rootShellStyle}
    >
      <FieldCanvas
        className="fixed inset-0"
        sceneStateRef={sceneStateRef}
        reducedMotion={!!reducedMotion}
        onBlobControllerReady={handleBlobControllerReady}
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
            return (
              <div
                className="ambient-field-hotspot-card-inner w-[198px] max-w-[34vw]"
                style={{
                  marginLeft: hotspot.cardLeft ?? "28px",
                  marginTop: hotspot.cardTop ?? "-18px",
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
        <div ref={heroRef}>
          <AmbientFieldHeroSection
            onExploreRuntime={() => scrollToSection("section-story-1")}
            section={heroSection}
          />
        </div>

        <AmbientFieldStoryChapter
          beats={ambientFieldStoryOneBeats}
          section={storyOneSection}
        />

        <AmbientFieldGraphSection
          section={graphSection}
        />

        <section
          ref={storyTwoRef}
          id={storyTwoSection.id}
          data-ambient-section
          data-preset={storyTwoSection.preset}
          data-section-id={storyTwoSection.id}
          className="grid min-h-[128svh] grid-cols-12 grid-rows-[auto_1fr_auto] gap-x-6 gap-y-10 px-4 py-[12vh] sm:px-6 sm:py-[14vh]"
        >
          <div className="col-span-12 row-start-1 self-start text-left lg:col-span-6 lg:col-start-1">
            <motion.p
              className="text-[11px] uppercase tracking-[0.24em]"
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true, amount: 0.35 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                y: smooth,
                opacity: { duration: 0.18, ease: "easeOut" },
              }}
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text-dim) 92%, transparent)",
              }}
            >
              {storyTwoSection.eyebrow}
            </motion.p>

            <motion.h2
              className="mt-5 max-w-[18ch] text-[2.9rem] font-medium leading-[0.9] tracking-[-0.05em] sm:text-[4.25rem] lg:text-[5.2rem]"
              initial={{ opacity: 0, y: 18 }}
              viewport={{ once: true, amount: 0.35 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                y: smooth,
                opacity: { duration: 0.18, ease: "easeOut" },
              }}
            >
              {storyTwoSection.title}
            </motion.h2>
          </div>

          <div className="col-span-12 row-start-3 self-end text-left lg:col-span-5 lg:col-start-8 sm:text-right lg:text-right">
            <motion.p
              className="max-w-[44ch] text-[15px] leading-7 sm:text-[17px] sm:leading-8 sm:ml-auto"
              initial={{ opacity: 0, y: 18 }}
              viewport={{ once: true, amount: 0.35 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                y: smooth,
                opacity: { duration: 0.18, ease: "easeOut", delay: 0.04 },
              }}
              style={{
                color:
                  "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
              }}
            >
              {storyTwoSection.body}
            </motion.p>
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
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          section={ctaSection}
        />
      </main>

      <ViewportTocRail
        entries={tocEntries}
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
