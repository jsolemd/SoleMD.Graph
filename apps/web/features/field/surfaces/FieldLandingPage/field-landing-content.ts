import type {
  FieldStageItemId,
  FieldVisualPreset,
} from "../../scene/visual-presets";

export type FieldLandingSectionVariant =
  | "hero"
  | "surfaceRail"
  | "story"
  | "sequence"
  | "mobileCarry"
  | "cta";

export interface FieldLandingSection {
  accentVar: string;
  align: "left" | "right" | "center";
  body: string;
  bullets: string[];
  detail: string;
  eyebrow: string;
  id: string;
  preset: FieldVisualPreset;
  title: string;
  variant: FieldLandingSectionVariant;
}

export interface FieldStoryBeat {
  accentVar: string;
  body: string;
  id: string;
  progressLabel: string;
  title: string;
  variant: "columns" | "centered";
}

export interface FieldSequenceItem {
  body: string;
  id: string;
  number: string;
  title: string;
}

export interface FieldSectionManifestEntry {
  sectionId: string;
  stageItemId: FieldStageItemId;
  endSectionId?: string;
  presetId: FieldVisualPreset;
}

export const fieldLandingSections: FieldLandingSection[] = [
  {
    id: "section-hero",
    preset: "blob",
    variant: "hero",
    eyebrow: "Field",
    title: "The clinical connectome.",
    body: "A living graph of biomedical evidence — shaped like what it studies.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-soft-blue)",
    align: "center",
  },
  {
    id: "section-surface-rail",
    preset: "blob",
    variant: "surfaceRail",
    eyebrow: "Zoom Levels",
    title: "Four layers deep.",
    body: "The same field, resolved four ways — papers, entities, connections, synthesis.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-soft-blue)",
    align: "center",
  },
  {
    id: "section-story-1",
    preset: "blob",
    variant: "story",
    eyebrow: "Papers",
    title: "Each point is a paper.",
    body: "Every dot you see is a real paper — indexed, embedded, retrievable.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-soft-lavender)",
    align: "left",
  },
  {
    id: "section-story-2",
    preset: "stream",
    variant: "story",
    eyebrow: "Entities",
    title: "They thread together.",
    body: "The threads are concepts — diagnoses, drugs, mechanisms — that recur across papers.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-golden-yellow)",
    align: "right",
  },
  {
    id: "section-story-3",
    preset: "stream",
    variant: "story",
    eyebrow: "Connections",
    title: "And they connect.",
    body: "When concepts recur, the graph records a relation. Delirium, haloperidol, QT, lithium — the literature already reasons this way. The graph makes it visible.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-teal)",
    align: "left",
  },
  {
    id: "section-sequence",
    preset: "stream",
    variant: "sequence",
    eyebrow: "Synthesis",
    title: "Structure emerges.",
    body: "Clusters form. Articles write themselves. Educators build modules on real nodes.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-golden-yellow)",
    align: "left",
  },
  {
    id: "section-mobile-carry",
    preset: "stream",
    variant: "mobileCarry",
    eyebrow: "Mobile",
    title: "The graph comes with you.",
    body: "Same field on rounds, at bedside, on the train. No second runtime.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
  {
    id: "section-cta",
    preset: "blob",
    variant: "cta",
    eyebrow: "End State",
    title: "Open the graph.",
    body: "You've seen the shape of it. The living graph is live.",
    detail: "",
    bullets: [],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
];

export const fieldStoryOneBeats: readonly FieldStoryBeat[] = [
  {
    id: "info-1",
    progressLabel: "01",
    title: "Papers emerge",
    body: "",
    accentVar: "var(--color-soft-blue)",
    variant: "columns",
  },
  {
    id: "info-2",
    progressLabel: "02",
    title: "Context narrows",
    body: "",
    accentVar: "var(--color-golden-yellow)",
    variant: "columns",
  },
  {
    id: "info-3",
    progressLabel: "03",
    title: "Ready to connect",
    body: "",
    accentVar: "var(--color-soft-lavender)",
    variant: "centered",
  },
] as const;

export const fieldStoryTwoBeats: readonly FieldStoryBeat[] = [
  {
    id: "info-4",
    progressLabel: "01",
    title: "Edges begin",
    body: "",
    accentVar: "var(--color-soft-blue)",
    variant: "columns",
  },
  {
    id: "info-5",
    progressLabel: "02",
    title: "Bridges form",
    body: "",
    accentVar: "var(--color-teal)",
    variant: "columns",
  },
  {
    id: "info-6",
    progressLabel: "03",
    title: "The pattern appears",
    body: "",
    accentVar: "var(--color-golden-yellow)",
    variant: "centered",
  },
] as const;

export const fieldSurfaceRailItems = [
  "Papers",
  "Entities",
  "Connections",
  "Synthesis",
] as const;

export const fieldSequenceItems: readonly FieldSequenceItem[] = [
  {
    id: "clusters",
    number: "01",
    title: "Clusters",
    body: "Research communities form from embedding proximity, not predefined categories.",
  },
  {
    id: "living-knowledge",
    number: "02",
    title: "Living Knowledge",
    body: "Auto-synthesized articles per entity — definitions, key findings, open questions — refreshed on every build.",
  },
  {
    id: "educational-modules",
    number: "03",
    title: "Educational Modules",
    body: "Step-through lessons anchored to real graph nodes. Sourced evidence illuminates around you as you progress.",
  },
] as const;

export const FIELD_SECTION_MANIFEST: readonly FieldSectionManifestEntry[] = [
  {
    sectionId: "section-hero",
    stageItemId: "blob",
    endSectionId: "section-surface-rail",
    presetId: "blob",
  },
  {
    sectionId: "section-surface-rail",
    stageItemId: "blob",
    endSectionId: "section-story-1",
    presetId: "blob",
  },
  {
    sectionId: "section-story-1",
    stageItemId: "blob",
    endSectionId: "section-story-2",
    presetId: "blob",
  },
  {
    sectionId: "section-story-2",
    stageItemId: "blob",
    endSectionId: "section-story-3",
    presetId: "blob",
  },
  {
    sectionId: "section-story-2",
    stageItemId: "stream",
    endSectionId: "section-story-3",
    presetId: "stream",
  },
  {
    sectionId: "section-story-3",
    stageItemId: "blob",
    endSectionId: "section-sequence",
    presetId: "blob",
  },
  {
    sectionId: "section-story-3",
    stageItemId: "stream",
    endSectionId: "section-sequence",
    presetId: "stream",
  },
  {
    sectionId: "section-sequence",
    stageItemId: "blob",
    endSectionId: "section-mobile-carry",
    presetId: "blob",
  },
  {
    sectionId: "section-sequence",
    stageItemId: "stream",
    endSectionId: "section-mobile-carry",
    presetId: "stream",
  },
  {
    sectionId: "section-mobile-carry",
    stageItemId: "blob",
    endSectionId: "section-cta",
    presetId: "blob",
  },
  {
    sectionId: "section-mobile-carry",
    stageItemId: "stream",
    endSectionId: "section-cta",
    presetId: "stream",
  },
  {
    sectionId: "section-cta",
    stageItemId: "blob",
    presetId: "blob",
  },
] as const;
