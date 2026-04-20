"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import type { AmbientFieldChapterKey } from "./types";
import { ambientFieldChapterAdapters } from "./registry";

export function useChapterAdapter(
  ref: RefObject<HTMLElement | null>,
  key: AmbientFieldChapterKey,
) {
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const adapter = ambientFieldChapterAdapters[key];
    if (!adapter) return;
    const handle = adapter(node, { reducedMotion });
    return () => {
      handle.dispose();
    };
  }, [key, reducedMotion, ref]);
}
