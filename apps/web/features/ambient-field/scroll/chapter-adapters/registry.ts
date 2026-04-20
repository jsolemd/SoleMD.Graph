import { clientsChapterAdapter } from "./clients-chapter";
import { ctaChapterAdapter } from "./cta-chapter";
import { eventsChapterAdapter } from "./events-chapter";
import { graphRibbonChapterAdapter } from "./graph-ribbon-chapter";
import { moveNewChapterAdapter } from "./move-new-chapter";
import type { AmbientFieldChapterKey, ChapterAdapter } from "./types";
import { welcomeChapterAdapter } from "./welcome-chapter";

export const ambientFieldChapterAdapters: Record<
  AmbientFieldChapterKey,
  ChapterAdapter
> = {
  clients: clientsChapterAdapter,
  cta: ctaChapterAdapter,
  events: eventsChapterAdapter,
  graphRibbon: graphRibbonChapterAdapter,
  moveNew: moveNewChapterAdapter,
  welcome: welcomeChapterAdapter,
};
