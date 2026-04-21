"use client";

import gsap from "gsap";
import type { MutableRefObject } from "react";
import { ensureGsapScrollTriggerRegistered } from "../controller/FieldController";
import type { FieldSceneState } from "../scene/visual-presets";
import type { FieldSectionManifestEntry } from "../surfaces/FieldLandingPage/field-landing-content";
import { bindFieldScrollState } from "./field-scroll-state";

export function registerFieldScrollTrigger(): void {
  ensureGsapScrollTriggerRegistered();
}

export interface BindFieldControllersOptions {
  heroSectionId: string;
  manifest: readonly FieldSectionManifestEntry[];
  reducedMotion: boolean;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

export function bindFieldControllers({
  heroSectionId,
  manifest,
  reducedMotion,
  sceneStateRef,
}: BindFieldControllersOptions): () => void {
  registerFieldScrollTrigger();
  const dispose = bindFieldScrollState({
    heroSectionId,
    manifest,
    reducedMotion,
    sceneStateRef,
  });

  return () => {
    dispose();
    void gsap;
  };
}
