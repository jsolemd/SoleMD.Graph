"use client";

import type { ChapterAdapter } from "./types";

export const heroChapterAdapter: ChapterAdapter = () => {
  document.body.classList.add("is-hero-ready");
  return {
    dispose() {
      document.body.classList.remove("is-hero-ready");
    },
  };
};
