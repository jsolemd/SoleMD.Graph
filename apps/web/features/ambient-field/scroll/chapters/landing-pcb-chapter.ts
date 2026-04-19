import type { ChapterEvent } from "../field-chapter-timeline";

// LANDING_PCB_CHAPTER — Maze's pcb horizon-mesh scroll. Wrapper.z scrubs
// from -200 to 0 across the section, pulling the near-horizontal grid of
// points toward the camera (scripts.pretty.js:43615-43630).

export type LandingPcbChapterKey = "uAlpha" | "wrapperZ";

export const LANDING_PCB_CHAPTER: readonly ChapterEvent<LandingPcbChapterKey>[] = [
  { label: "fade-in", atProgress: 0, duration: 0.2, fromTo: { uAlpha: [0, 1] } },
  { label: "approach", atProgress: 0, duration: 1, fromTo: { wrapperZ: [-200, 0] } },
];
