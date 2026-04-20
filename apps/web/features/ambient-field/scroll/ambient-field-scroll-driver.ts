"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MutableRefObject } from "react";
import {
  ensureGsapScrollTriggerRegistered,
} from "../controller/FieldController";
import type { BlobController } from "../controller/BlobController";
import type { PcbController } from "../controller/PcbController";
import type { StreamController } from "../controller/StreamController";
import type {
  AmbientFieldSceneState,
  AmbientFieldStageItemId,
} from "../scene/visual-presets";

export function registerAmbientFieldScrollTrigger(): void {
  ensureGsapScrollTriggerRegistered();
}

export interface BindAmbientFieldControllersOptions {
  anchors: {
    blob: HTMLElement;
    blobEnd: HTMLElement;
    stream: HTMLElement;
    pcb: HTMLElement;
    pcbEnd?: HTMLElement | null;
  };
  controllers: {
    blob: BlobController;
    stream: StreamController;
    pcb: PcbController;
  };
  hero: HTMLElement;
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}

export function bindAmbientFieldControllers({
  anchors,
  controllers,
  hero,
  reducedMotion,
  sceneStateRef,
}: BindAmbientFieldControllersOptions): () => void {
  registerAmbientFieldScrollTrigger();

  const disposers: Array<() => void> = [];
  const triggers: ScrollTrigger[] = [];

  // Each controller owns its scroll-linked timeline. Reduced motion is
  // handled inside `bindScroll` (skips construction, snaps baseline).
  disposers.push(controllers.blob.bindScroll(anchors.blob, anchors.blobEnd));
  disposers.push(controllers.stream.bindScroll(anchors.stream, null));
  disposers.push(
    controllers.pcb.bindScroll(anchors.pcb, anchors.pcbEnd ?? null),
  );

  if (!reducedMotion) {
    // Per-item visibility / localProgress writers. The blob is treated as
    // the persistent stage substrate (visibility 1, localProgress driven by
    // the blob anchor span) and stream/pcb fade in/out by their anchors.
    const itemAnchors: Array<{
      anchor: HTMLElement;
      endAnchor?: HTMLElement | null;
      id: AmbientFieldStageItemId;
    }> = [
      { anchor: anchors.blob, endAnchor: anchors.blobEnd, id: "blob" },
      { anchor: anchors.stream, id: "stream" },
      { anchor: anchors.pcb, endAnchor: anchors.pcbEnd ?? null, id: "pcb" },
    ];

    for (const { anchor, endAnchor, id } of itemAnchors) {
      const trigger = ScrollTrigger.create({
        trigger: anchor,
        endTrigger: endAnchor ?? anchor,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => {
          const item = sceneStateRef.current.items[id];
          if (!item) return;
          item.localProgress = self.progress;
          item.visibility = self.isActive ? 1 : item.visibility;
        },
        onEnter: () => {
          const item = sceneStateRef.current.items[id];
          if (item) item.visibility = 1;
        },
        onEnterBack: () => {
          const item = sceneStateRef.current.items[id];
          if (item) item.visibility = 1;
        },
        onLeave: () => {
          const item = sceneStateRef.current.items[id];
          if (item && id !== "blob") item.visibility = 0;
        },
        onLeaveBack: () => {
          const item = sceneStateRef.current.items[id];
          if (item && id !== "blob") item.visibility = 0;
        },
      });
      triggers.push(trigger);
    }

    // `--ambient-hero-progress` drives the chrome surface fade-in. Was
    // previously written from the per-frame syncFrame in the manifest
    // driver; ScrollTrigger now owns this directly.
    const heroTrigger = ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => {
        hero.style.setProperty(
          "--ambient-hero-progress",
          self.progress.toFixed(4),
        );
      },
    });
    triggers.push(heroTrigger);
  } else {
    // Reduced motion: still surface visibility=1 for the blob substrate.
    sceneStateRef.current.items.blob.visibility = 1;
    sceneStateRef.current.items.stream.visibility = 1;
    sceneStateRef.current.items.pcb.visibility = 1;
    hero.style.setProperty("--ambient-hero-progress", "0");
  }

  // Maze defers its bind under `setTimeout(..., 1)` so ScrollTrigger's
  // post-bind refresh runs after layout settles. In React we can bind
  // synchronously but still need to force a refresh: multiple `fromTo`
  // tweens on the same uniform (uAlpha 1→0 at `diagram`, then 0→1 at
  // `shrink`) each write their `from` value at construction time; the
  // last one wins unless ScrollTrigger has had a chance to revert the
  // timeline back to progress 0. Without this refresh, on reload with
  // scroll already at 0 the user sees the blob invisible until the
  // first manual scroll kicks a refresh.
  ScrollTrigger.refresh();

  return () => {
    for (const dispose of disposers) dispose();
    for (const trigger of triggers) trigger.kill();
    void gsap;
  };
}
