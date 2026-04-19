import type { ChapterEvent } from "../field-chapter-timeline";

// LANDING_BLOB_CHAPTER — Maze's blob scroll timeline translated into
// progress-unit events. Source labels + times from scripts.pretty.js:43291-43414,
// divided by the chapter's 10-unit scrub span so this file is a
// declarative 1:1 port. Reusable by the landing page and by any future
// module that binds a blob to a scroll anchor.

export type LandingBlobChapterKey =
  | "uAlpha"
  | "uAmplitude"
  | "uDepth"
  | "uFrequency"
  | "uSelection"
  | "wrapperScale"
  | "modelYShift"
  | "hotspotOpacity"
  | "hotspotMaxNumber"
  | "hotspotOnlyReds";

export const LANDING_BLOB_CHAPTER: readonly ChapterEvent<LandingBlobChapterKey>[] = [
  // Formation → expansion. At progress 0 the blob reads as a formed globe
  // (resting uAmplitude 0.08, uFrequency 0.3 in visual-presets.ts); this
  // event ramps both up to the Maze stats shape over the first ~15 % of
  // chapter scroll (scripts.pretty.js:43291-43303 + stats beat merged).
  {
    label: "start-frequency",
    atProgress: 0,
    duration: 0.15,
    fromTo: { uFrequency: [0.3, 1.7], uAmplitude: [0.08, 0.25] },
  },
  // "hotspots" (t=2..2.1s): opacity 0->1, maxNumber 0->3
  { label: "hotspots-open", atProgress: 0.2, duration: 0.01, fromTo: { hotspotOpacity: [0, 1], hotspotMaxNumber: [0, 3] } },
  // +1.2..+1.3s: maxNumber 3 -> 40
  { label: "hotspots-expand", atProgress: 0.32, duration: 0.01, fromTo: { hotspotMaxNumber: [3, 40] } },
  // +1.4..+2.0s: uSelection 1 -> 0.3
  { label: "hotspots-selection", atProgress: 0.34, duration: 0.06, fromTo: { uSelection: [1, 0.3] } },
  // +2.4..+2.5s: hotspot opacity -> 0 (exit card phase)
  { label: "hotspots-dim", atProgress: 0.44, duration: 0.01, fromTo: { hotspotOpacity: [1, 0] } },
  // "diagram" (t=4.9..5.3s): uDepth 0.5 -> 1, wrapper.scale 1 -> 1.8 (1 s), uAmplitude -> 0.5
  {
    label: "diagram",
    atProgress: 0.49,
    duration: 0.1,
    fromTo: {
      uDepth: [0.5, 1],
      uAlpha: [1, 0],
      wrapperScale: [1, 1.8],
      uAmplitude: [0.25, 0.5],
    },
  },
  // "shrink" (t=6.3..6.6s): uAlpha 0 -> 1, wrapper.scale -> 1 (1 s)
  {
    label: "shrink",
    atProgress: 0.63,
    duration: 0.1,
    fromTo: {
      uAlpha: [0, 1],
      wrapperScale: [1.8, 1],
      uAmplitude: [0.5, 0.4],
    },
  },
  // "quickly" (t=7.2..7.3s): maxNumber -> 3, onlyReds 0 -> 1, opacity -> 1
  {
    label: "quickly",
    atProgress: 0.72,
    duration: 0.01,
    fromTo: {
      hotspotMaxNumber: [40, 3],
      hotspotOnlyReds: [0, 1],
      hotspotOpacity: [0, 1],
    },
  },
  // "respond" (t=7.9..8s): opacity -> 0
  { label: "respond-dim", atProgress: 0.79, duration: 0.01, fromTo: { hotspotOpacity: [1, 0] } },
  // "end" (t=9..10): model.position.y: 0 -> sceneUnits * 0.5
  { label: "end-drift", atProgress: 0.9, duration: 0.1, fromTo: { modelYShift: [0, 0.5] } },
];
