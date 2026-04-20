"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MutableRefObject } from "react";
import {
  ensureGsapScrollTriggerRegistered,
  type FieldController,
} from "../controller/FieldController";
import type {
  AmbientFieldSceneState,
  AmbientFieldStageItemId,
} from "../scene/visual-presets";
import type { FieldSectionManifestEntry } from "../surfaces/AmbientFieldLandingPage/ambient-field-landing-content";

export function registerAmbientFieldScrollTrigger(): void {
  ensureGsapScrollTriggerRegistered();
}

export interface BindAmbientFieldControllersOptions {
  controllers: Record<AmbientFieldStageItemId, FieldController>;
  heroAnchorId: string;
  manifest: readonly FieldSectionManifestEntry[];
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<AmbientFieldSceneState>;
}

function resolveAnchor(anchorId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(anchorId);
}

export function bindAmbientFieldControllers({
  controllers,
  heroAnchorId,
  manifest,
  reducedMotion,
  sceneStateRef,
}: BindAmbientFieldControllersOptions): () => void {
  registerAmbientFieldScrollTrigger();

  const disposers: Array<() => void> = [];
  const triggers: ScrollTrigger[] = [];

  for (const entry of manifest) {
    const anchor = resolveAnchor(entry.anchorId);
    const endAnchor = entry.endAnchorId ? resolveAnchor(entry.endAnchorId) : null;
    const controller = controllers[entry.controllerSlug];
    if (!anchor || !controller) continue;

    disposers.push(controller.bindScroll(anchor, endAnchor));

    if (reducedMotion) {
      const item = sceneStateRef.current.items[entry.controllerSlug];
      if (!item) continue;
      item.localProgress = 0;
      item.visibility = entry.controllerSlug === "blob" ? 1 : 0;
      continue;
    }

    const trigger = ScrollTrigger.create({
      trigger: anchor,
      endTrigger: endAnchor ?? anchor,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        const item = sceneStateRef.current.items[entry.controllerSlug];
        if (!item) return;
        item.localProgress = self.progress;
        item.visibility = self.isActive ? 1 : 0;
      },
      onEnter: () => {
        const item = sceneStateRef.current.items[entry.controllerSlug];
        if (item) item.visibility = 1;
      },
      onEnterBack: () => {
        const item = sceneStateRef.current.items[entry.controllerSlug];
        if (item) item.visibility = 1;
      },
      onLeave: () => {
        const item = sceneStateRef.current.items[entry.controllerSlug];
        if (item) item.visibility = 0;
      },
      onLeaveBack: () => {
        const item = sceneStateRef.current.items[entry.controllerSlug];
        if (item) item.visibility = 0;
      },
    });
    triggers.push(trigger);
  }

  const hero = resolveAnchor(heroAnchorId);
  if (hero && !reducedMotion) {
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
  } else if (hero) {
    hero.style.setProperty("--ambient-hero-progress", "0");
  }

  ScrollTrigger.refresh();

  return () => {
    for (const dispose of disposers) dispose();
    for (const trigger of triggers) trigger.kill();
    void gsap;
  };
}
