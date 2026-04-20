"use client";

import type { ChapterAdapter } from "./types";

export const welcomeChapterAdapter: ChapterAdapter = () => {
  document.body.classList.add("is-welcome-ready");
  return {
    dispose() {
      document.body.classList.remove("is-welcome-ready");
    },
  };
};
