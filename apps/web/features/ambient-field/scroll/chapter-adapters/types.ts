export type AmbientFieldChapterKey =
  | "welcome"
  | "moveNew"
  | "clients"
  | "graphRibbon"
  | "events"
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
