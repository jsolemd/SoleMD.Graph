"use client";

import type { MutableRefObject } from "react";
import type { AmbientFieldSceneState } from "../scene/visual-presets";
import {
  resolveAmbientFieldScrollState,
  type AmbientFieldScrollManifest,
  type AmbientFieldScrollStop,
} from "./ambient-field-scroll-state";
import { createUniformScrubber } from "./ambient-field-uniform-scrubber";

interface SetupAmbientFieldScrollOptions {
  hero: HTMLElement;
  overlayController?: AmbientFieldScrollOverlayController;
  reducedMotion: boolean;
  root: HTMLDivElement;
  scrollManifest: AmbientFieldScrollManifest;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}

export interface AmbientFieldScrollController {
  cleanup: () => void;
  syncFrame: (timestamp: number) => void;
}

export interface AmbientFieldScrollOverlayController {
  cleanup?: () => void;
  syncFrame: (frame: {
    activeSectionId: string;
    heroProgress: number;
    itemState: AmbientFieldSceneState["items"];
    phaseProgress: AmbientFieldSceneState["phases"];
    processProgress: number;
    reducedMotion: boolean;
    scrollProgress: number;
    scrollTop: number;
    streamVisibility: number;
    timestamp: number;
    viewportHeight: number;
  }) => void;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function composeAmbientFieldOverlayControllers(
  controllers: Array<AmbientFieldScrollOverlayController | null | undefined>,
): AmbientFieldScrollOverlayController | undefined {
  const activeControllers = controllers.filter(Boolean) as AmbientFieldScrollOverlayController[];
  if (activeControllers.length === 0) {
    return undefined;
  }

  return {
    syncFrame(frame) {
      for (const controller of activeControllers) {
        controller.syncFrame(frame);
      }
    },
    cleanup() {
      for (const controller of activeControllers) {
        controller.cleanup?.();
      }
    },
  };
}

export function createAmbientFieldScrollController({
  hero,
  overlayController,
  reducedMotion,
  root,
  scrollManifest,
  sceneStateRef,
}: SetupAmbientFieldScrollOptions): AmbientFieldScrollController {
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let sectionStops: AmbientFieldScrollStop[] = [];

  const sectionNodes = Array.from(
    root.querySelectorAll<HTMLElement>("[data-ambient-section]"),
  );

  // Low-pass the raw scroll input once at the driver stage to emulate Maze's
  // `scrub: 1` contract — verified in Maze source at
  // `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43300` and
  // matching sites, where GSAP ScrollTrigger timelines bind with scrub: 1
  // (linear 1-second catchup). Exponential half-life of 250 ms ≈ 94 %
  // catchup in 1 s, close to GSAP's linear duration behavior; a 1-second
  // half-life (the original Round-13 pick) only reaches 50 % in 1 s and
  // reads as sluggish compared to mazehq.com.
  const scrollScrubber = createUniformScrubber<"scrollTop">({
    halfLifeMs: 250,
    initial: { scrollTop: root.scrollTop },
  });
  let lastFrameMs: number | null = null;

  function measureSectionStops(): AmbientFieldScrollStop[] {
    const rootRect = root.getBoundingClientRect();

    return sectionNodes
      .map((node) => ({
        id: node.dataset.sectionId ?? node.id,
        preset: node.dataset.preset as AmbientFieldScrollStop["preset"],
        start:
          node.getBoundingClientRect().top -
          rootRect.top +
          root.scrollTop,
      }))
      .sort((left, right) => left.start - right.start);
  }

  function refreshMeasurements() {
    sectionStops = measureSectionStops();
  }

  function syncFrame(timestamp: number) {
    const rawScrollTop = root.scrollTop;
    const dtMs = lastFrameMs == null ? 0 : Math.max(0, timestamp - lastFrameMs);
    lastFrameMs = timestamp;
    const scrollTop = reducedMotion
      ? rawScrollTop
      : scrollScrubber.step(dtMs, { scrollTop: rawScrollTop }).scrollTop;
    const viewportHeight = root.clientHeight;
    const scrollMax = Math.max(0, root.scrollHeight - viewportHeight);
    const heroProgress = clamp01(scrollTop / Math.max(1, viewportHeight * 0.96));
    const resolved = resolveAmbientFieldScrollState({
      manifest: scrollManifest,
      scrollTop,
      scrollMax,
      viewportHeight,
      stops: sectionStops,
    });

    sceneStateRef.current.activeSectionId = resolved.activeSectionId;
    sceneStateRef.current.phases = resolved.phases;
    sceneStateRef.current.scrollProgress = resolved.scrollProgress;
    sceneStateRef.current.processProgress = resolved.processProgress;
    sceneStateRef.current.items = resolved.items;

    overlayController?.syncFrame({
      activeSectionId: resolved.activeSectionId,
      heroProgress,
      itemState: resolved.items,
      phaseProgress: resolved.phases,
      processProgress: resolved.processProgress,
      reducedMotion,
      scrollProgress: resolved.scrollProgress,
      scrollTop,
      streamVisibility: resolved.items.stream.visibility,
      timestamp,
      viewportHeight,
    });

    hero.style.setProperty(
      "--ambient-hero-progress",
      heroProgress.toFixed(4),
    );
  }

  refreshMeasurements();

  resizeObserver = new ResizeObserver(refreshMeasurements);
  resizeObserver.observe(root);
  resizeObserver.observe(hero);
  for (const node of sectionNodes) {
    resizeObserver.observe(node);
  }

  mutationObserver = new MutationObserver(refreshMeasurements);
  mutationObserver.observe(root, { childList: true, subtree: true });

  syncFrame(0);

  return {
    syncFrame,
    cleanup() {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      overlayController?.cleanup?.();
    },
  };
}
