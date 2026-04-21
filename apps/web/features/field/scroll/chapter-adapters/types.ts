export type FieldChapterKey =
  | "hero"
  | "surfaceRail"
  | "storyTwo"
  | "sequence"
  | "mobileCarry"
  | "cta";

export interface ChapterAdapterOptions {
  reducedMotion: boolean;
}

export interface ChapterAdapterHandle {
  dispose(): void;
}

export type ChapterAdapter = (
  element: HTMLElement,
  options: ChapterAdapterOptions,
) => ChapterAdapterHandle;
