export type FieldChapterKey =
  | "hero"
  | "surfaceRail"
  | "storyOne"
  | "storyTwo"
  | "storyThree"
  | "sequence"
  | "mobileCarry"
  | "cta";

export const FIELD_CHAPTER_SECTION_IDS: Record<FieldChapterKey, string> = {
  hero: "section-hero",
  surfaceRail: "section-surface-rail",
  storyOne: "section-story-1",
  storyTwo: "section-story-2",
  storyThree: "section-story-3",
  sequence: "section-sequence",
  mobileCarry: "section-mobile-carry",
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
