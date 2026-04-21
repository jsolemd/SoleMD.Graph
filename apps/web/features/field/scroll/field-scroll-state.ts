"use client";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MutableRefObject } from "react";
import type {
  FieldChapterState,
  FieldSceneState,
  FieldStageItemId,
  FieldStageItemState,
} from "../scene/visual-presets";
import type { FieldSectionManifestEntry } from "../surfaces/FieldLandingPage/field-landing-content";
import type { FieldSceneStore } from "./field-scene-store";

export {
  getFieldChapterProgress,
  getFieldChapterState,
  getFieldChapterVisibility,
  getFieldChapterProgressBucket,
  isFieldChapterActive,
} from "./scene-selectors";

interface FieldScrollEntryState {
  active: boolean;
  stageItemId: FieldStageItemId;
  progress: number;
  visibility: number;
}

export interface BindFieldScrollStateOptions {
  heroSectionId: string;
  manifest: readonly FieldSectionManifestEntry[];
  reducedMotion: boolean;
  sceneStore: FieldSceneStore;
  sceneStateRef: MutableRefObject<FieldSceneState>;
}

function resolveSection(sectionId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(sectionId);
}

function getOrCreateChapterState(
  sceneState: FieldSceneState,
  sectionId: string,
): FieldChapterState {
  const existing = sceneState.chapters[sectionId];
  if (existing) return existing;
  const next: FieldChapterState = {
    isActive: false,
    progress: 0,
    visibility: 0,
  };
  sceneState.chapters[sectionId] = next;
  return next;
}

function resetStageItems(items: Record<FieldStageItemId, FieldStageItemState>) {
  items.blob.visibility = 0;
  items.blob.localProgress = 0;
  items.blob.emphasis = 0;
  items.stream.visibility = 0;
  items.stream.localProgress = 0;
  items.stream.emphasis = 0;
  items.objectFormation.visibility = 0;
  items.objectFormation.localProgress = 0;
  items.objectFormation.emphasis = 0;
}

function recomputeStageItems(
  sceneState: FieldSceneState,
  entryStates: readonly FieldScrollEntryState[],
) {
  resetStageItems(sceneState.items);

  for (const entryState of entryStates) {
    const item = sceneState.items[entryState.stageItemId];
    if (!item) continue;
    item.visibility = Math.max(item.visibility, entryState.visibility);
    item.localProgress = Math.max(item.localProgress, entryState.progress);
    item.emphasis = Math.max(
      item.emphasis,
      entryState.active ? 1 : entryState.visibility,
    );
  }
}

function updateChapterState(
  sceneState: FieldSceneState,
  sectionId: string,
  active: boolean,
  progress: number,
  visibility: number,
) {
  const chapter = getOrCreateChapterState(sceneState, sectionId);
  chapter.isActive = active;
  chapter.progress = progress;
  chapter.visibility = visibility;
}

export function bindFieldScrollState({
  heroSectionId,
  manifest,
  reducedMotion,
  sceneStore,
  sceneStateRef,
}: BindFieldScrollStateOptions): () => void {
  sceneStore.setCurrentState(sceneStateRef.current);

  const triggers: ScrollTrigger[] = [];
  const entryStates = manifest.map<FieldScrollEntryState>((entry) => ({
    active: false,
    stageItemId: entry.stageItemId,
    progress: 0,
    visibility: 0,
  }));

  const hero = resolveSection(heroSectionId);

  const syncReducedMotionState = () => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    resetStageItems(sceneState.items);
    sceneState.items.blob.visibility = 1;
    sceneState.items.blob.emphasis = 1;
    sceneState.heroProgress = 0;

    for (const entry of manifest) {
      const chapter = getOrCreateChapterState(sceneState, entry.sectionId);
      chapter.isActive = false;
      chapter.progress = 0;
      chapter.visibility = 0;
    }
    sceneStore.notify();
  };

  if (reducedMotion) {
    syncReducedMotionState();
    return () => {
      sceneStore.setCurrentState(null);
    };
  }

  manifest.forEach((entry, index) => {
    const section = resolveSection(entry.sectionId);
    const endSection = entry.endSectionId
      ? resolveSection(entry.endSectionId)
      : null;
    if (!section) return;

    const trigger = ScrollTrigger.create({
      trigger: section,
      endTrigger: endSection ?? section,
      start: "top bottom",
      end: "bottom top",
      onUpdate: (self) => {
        const entryState = entryStates[index]!;
        entryState.progress = self.progress;
        entryState.active = self.isActive;
        entryState.visibility = self.isActive ? 1 : 0;

        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        updateChapterState(
          sceneState,
          entry.sectionId,
          self.isActive,
          self.progress,
          entryState.visibility,
        );
        recomputeStageItems(sceneState, entryStates);
        sceneStore.notify();
      },
      onEnter: () => {
        const entryState = entryStates[index]!;
        entryState.active = true;
        entryState.visibility = 1;
        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        updateChapterState(sceneState, entry.sectionId, true, entryState.progress, 1);
        recomputeStageItems(sceneState, entryStates);
        sceneStore.notify();
      },
      onEnterBack: () => {
        const entryState = entryStates[index]!;
        entryState.active = true;
        entryState.visibility = 1;
        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        updateChapterState(sceneState, entry.sectionId, true, entryState.progress, 1);
        recomputeStageItems(sceneState, entryStates);
        sceneStore.notify();
      },
      onLeave: () => {
        const entryState = entryStates[index]!;
        entryState.active = false;
        entryState.visibility = 0;
        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        updateChapterState(sceneState, entry.sectionId, false, 1, 0);
        recomputeStageItems(sceneState, entryStates);
        sceneStore.notify();
      },
      onLeaveBack: () => {
        const entryState = entryStates[index]!;
        entryState.active = false;
        entryState.visibility = 0;
        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        updateChapterState(sceneState, entry.sectionId, false, 0, 0);
        recomputeStageItems(sceneState, entryStates);
        sceneStore.notify();
      },
    });
    triggers.push(trigger);
  });

  if (hero) {
    const heroTrigger = ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "bottom top",
      onUpdate: (self) => {
        const sceneState = sceneStateRef.current;
        if (!sceneState) return;
        sceneState.heroProgress = self.progress;
      },
    });
    triggers.push(heroTrigger);
  } else {
    const sceneState = sceneStateRef.current;
    if (sceneState) {
      sceneState.heroProgress = 0;
    }
  }

  ScrollTrigger.refresh();

  return () => {
    for (const trigger of triggers) trigger.kill();
    sceneStore.setCurrentState(null);
  };
}
