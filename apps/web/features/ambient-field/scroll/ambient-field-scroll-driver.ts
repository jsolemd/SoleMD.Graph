"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MutableRefObject } from "react";
import {
  ensureGsapScrollTriggerRegistered,
} from "../controller/FieldController";
import type { BlobController } from "../controller/BlobController";
import type { AmbientFieldSceneState } from "../scene/visual-presets";

export function registerAmbientFieldScrollTrigger(): void {
  ensureGsapScrollTriggerRegistered();
}

export interface BindAmbientFieldControllersOptions {
  anchors: {
    blob: HTMLElement;
    blobEnd: HTMLElement;
  };
  controllers: {
    blob: BlobController;
  };
  hero: HTMLElement;
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}

// Landing-only binder: the landing is a blob-centric story, so only the
// blob layer is wired here. Stream + pcb controllers exist in the module
// for other surfaces — see
// `.claude/skills/ambient-field-modules/references/image-particle-conformation.md`
// for how to rehydrate them.
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

  // Blob owns its own scroll-linked timeline. Reduced motion is handled
  // inside `bindScroll` (skips construction, snaps baseline).
  disposers.push(controllers.blob.bindScroll(anchors.blob, anchors.blobEnd));

  if (!reducedMotion) {
    // Supplementary visibility/localProgress writer for the blob — the
    // blob is the persistent stage substrate (visibility 1 while on-
    // screen, localProgress driven by the anchor span).
    const trigger = ScrollTrigger.create({
      trigger: anchors.blob,
      endTrigger: anchors.blobEnd,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        const item = sceneStateRef.current.items.blob;
        if (!item) return;
        item.localProgress = self.progress;
        item.visibility = self.isActive ? 1 : item.visibility;
      },
      onEnter: () => {
        const item = sceneStateRef.current.items.blob;
        if (item) item.visibility = 1;
      },
      onEnterBack: () => {
        const item = sceneStateRef.current.items.blob;
        if (item) item.visibility = 1;
      },
    });
    triggers.push(trigger);

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
    // Reduced motion: hold blob visibility at 1.
    sceneStateRef.current.items.blob.visibility = 1;
    hero.style.setProperty("--ambient-hero-progress", "0");
  }

  // Maze defers its bind under `setTimeout(..., 1)` so ScrollTrigger's
  // post-bind refresh runs after layout settles. In React we can bind
  // synchronously but still need to force a refresh: multiple `fromTo`
  // tweens on the same uniform (uAlpha 1→floor at `diagram`, then
  // floor→1 at `shrink`) each write their `from` value at construction
  // time; the last one wins unless ScrollTrigger has had a chance to
  // revert the timeline back to progress 0. Without this refresh, on
  // reload with scroll already at 0 the user sees the blob in the wrong
  // state until the first manual scroll kicks a refresh.
  ScrollTrigger.refresh();

  return () => {
    for (const dispose of disposers) dispose();
    for (const trigger of triggers) trigger.kill();
    void gsap;
  };
}
