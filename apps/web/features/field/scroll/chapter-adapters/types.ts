export type FieldChapterKey =
  | "hero"
  | "surfaceRail"
  | "storyOne"
  | "storyTwo"
  | "storyThree"
  | "sequence"
  | "cta";

export const FIELD_CHAPTER_SECTION_IDS: Record<FieldChapterKey, string> = {
  hero: "section-hero",
  surfaceRail: "section-surface-rail",
  storyOne: "section-story-1",
  storyTwo: "section-story-2",
  storyThree: "section-story-3",
  sequence: "section-sequence",
  cta: "section-cta",
};

export interface ChapterAdapterState {
  active: boolean;
  progress: number;
}

export interface ChapterAdapterContext {
  element: HTMLElement;
  reducedMotion: boolean;
  chapterKey: FieldChapterKey;
  getState(): ChapterAdapterState;
  subscribe(listener: () => void): () => void;
}

export interface ChapterAdapterHandle {
  dispose(): void;
}

export type ChapterAdapter = (
  context: ChapterAdapterContext,
) => ChapterAdapterHandle;

// Shared handle returned by adapters that short-circuit during setup
// (empty query selectors, missing required sub-elements, etc.). Centralizing
// the noop dispose avoids 5+ copies of `{ dispose() {} }` scattered across
// the per-chapter adapter modules; every short-circuit path resolves to the
// same object since the teardown is unconditionally inert.
export const NOOP_CHAPTER_HANDLE: ChapterAdapterHandle = Object.freeze({
  dispose() {},
});
