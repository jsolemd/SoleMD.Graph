"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { ensureGsapScrollTriggerRegistered } from "../controller/FieldController";
import type { FieldSceneState } from "../scene/visual-presets";
import type { FieldSectionManifestEntry } from "../surfaces/FieldLandingPage/field-landing-content";
import type { FieldSceneStore } from "./field-scene-store";
import { bindFieldScrollState } from "./field-scroll-state";

export function registerFieldScrollTrigger(): void {
  ensureGsapScrollTriggerRegistered();
}

export interface BindFieldControllersOptions {
  heroSectionId: string;
  manifest: readonly FieldSectionManifestEntry[];
  reducedMotion: boolean;
  sceneStore: FieldSceneStore;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

export function bindFieldControllers({
  heroSectionId,
  manifest,
  reducedMotion,
  sceneStore,
  sceneStateRef,
}: BindFieldControllersOptions): () => void {
  registerFieldScrollTrigger();
  const dispose = bindFieldScrollState({
    heroSectionId,
    manifest,
    reducedMotion,
    sceneStore,
    sceneStateRef,
  });

  return () => {
    dispose();
    void gsap;
  };
}

// Refreshes ScrollTrigger whenever the Next.js route pathname changes.
// Call once from the mount site (e.g. FieldLandingPage) so ScrollTrigger
// re-measures after client-side navigations that keep the field mounted
// but change DOM geometry.
export function useFieldScrollRouteRefresh(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureGsapScrollTriggerRegistered();
    ScrollTrigger.refresh();
  }, [pathname]);
}
