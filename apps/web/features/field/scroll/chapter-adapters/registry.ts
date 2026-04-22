import { ctaChapterAdapter } from "./cta-chapter";
import { heroChapterAdapter } from "./hero-chapter";
import { sequenceChapterAdapter } from "./sequence-chapter";
import { storyOneChapterAdapter } from "./story-one-chapter";
import { storyThreeChapterAdapter } from "./story-three-chapter";
import { storyTwoChapterAdapter } from "./story-two-chapter";
import { surfaceRailChapterAdapter } from "./surface-rail-chapter";
import type { FieldChapterKey, ChapterAdapter } from "./types";

export const fieldChapterAdapters: Record<
  FieldChapterKey,
  ChapterAdapter
> = {
  cta: ctaChapterAdapter,
  hero: heroChapterAdapter,
  sequence: sequenceChapterAdapter,
  storyOne: storyOneChapterAdapter,
  storyThree: storyThreeChapterAdapter,
  storyTwo: storyTwoChapterAdapter,
  surfaceRail: surfaceRailChapterAdapter,
};
