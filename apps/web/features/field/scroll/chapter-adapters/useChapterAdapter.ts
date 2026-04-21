"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import {
  FIELD_CHAPTER_SECTION_IDS,
  type ChapterAdapterState,
  type FieldChapterKey,
} from "./types";
import { fieldChapterAdapters } from "./registry";
import { useFieldSceneStore } from "../field-scene-store";
import {
  getFieldChapterProgress,
  isFieldChapterActive,
} from "../scene-selectors";

export function useChapterAdapter(
  ref: RefObject<HTMLElement | null>,
  key: FieldChapterKey,
) {
  const reducedMotion = useReducedMotion() ?? false;
  const sceneStore = useFieldSceneStore();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const adapter = fieldChapterAdapters[key];
    if (!adapter) return;

    const sectionId = FIELD_CHAPTER_SECTION_IDS[key];

    const getState = (): ChapterAdapterState => {
      const sceneState = sceneStore.getCurrentState();
      if (!sceneState) return { active: false, progress: 0 };
      return {
        active: isFieldChapterActive(sceneState, sectionId),
        progress: getFieldChapterProgress(sceneState, sectionId),
      };
    };

    const handle = adapter({
      element: node,
      reducedMotion,
      chapterKey: key,
      getState,
      subscribe: (listener) => sceneStore.subscribe(listener),
    });
    return () => {
      handle.dispose();
    };
  }, [key, reducedMotion, ref, sceneStore]);
}
