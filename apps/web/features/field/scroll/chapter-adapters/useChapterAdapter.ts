"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import type { FieldChapterKey } from "./types";
import { fieldChapterAdapters } from "./registry";

export function useChapterAdapter(
  ref: RefObject<HTMLElement | null>,
  key: FieldChapterKey,
) {
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const adapter = fieldChapterAdapters[key];
    if (!adapter) return;
    const handle = adapter(node, { reducedMotion });
    return () => {
      handle.dispose();
    };
  }, [key, reducedMotion, ref]);
}
