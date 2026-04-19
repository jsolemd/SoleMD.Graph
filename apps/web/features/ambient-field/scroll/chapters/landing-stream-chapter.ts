import type { ChapterEvent } from "../field-chapter-timeline";

// LANDING_STREAM_CHAPTER — Maze's stream conveyor arrives out of depth
// (`wrapper.z: -200 -> 0` over the section scroll,
// scripts.pretty.js:43629). The DOM popup choreography is handled by a
// companion scroll adapter (Phase 8's follow-up) and is not reflected
// here because it runs on GSAP `toggleActions`, not scrub.

export type LandingStreamChapterKey = "uAlpha" | "wrapperZ";

export const LANDING_STREAM_CHAPTER: readonly ChapterEvent<LandingStreamChapterKey>[] = [
  { label: "fade-in", atProgress: 0, duration: 0.15, fromTo: { uAlpha: [0, 1] } },
  { label: "approach", atProgress: 0, duration: 1, fromTo: { wrapperZ: [-200, 0] } },
];
