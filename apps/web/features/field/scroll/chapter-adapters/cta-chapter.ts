"use client";

import type { ChapterAdapter } from "./types";

export const ctaChapterAdapter: ChapterAdapter = ({ element }) => {
  element.classList.add("is-cta-ready");
  return {
    dispose() {
      element.classList.remove("is-cta-ready");
    },
  };
};
