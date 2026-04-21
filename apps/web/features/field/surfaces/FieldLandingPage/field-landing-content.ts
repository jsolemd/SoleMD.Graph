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

export interface FieldSurfaceRailItem {
  id: string;
  label: string;
  name: string;
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
    title: "Enter one living evidence field.",
    body:
      "Start with papers, then stay in the same field as the story moves deeper into evidence, context, and synthesis.",
    detail:
      "Maze parity remains the motion baseline, but SoleMD now needs a persistent blob story: intro, paper discovery, paper/entity detail, relation synthesis, and a final re-formed end state.",
    bullets: [
      "One fixed stage",
      "Blob persists through the full scroll",
      "Each chapter changes emphasis, not substrate",
    ],
    accentVar: "var(--color-soft-blue)",
    align: "center",
  },
  {
    id: "section-surface-rail",
    preset: "blob",
    variant: "surfaceRail",
    eyebrow: "Evidence Surfaces",
    title: "Keep trusted surface types close to the field instead of cutting away.",
    body:
      "The landing should make familiar biomedical artifacts feel native to the same world: papers, entities, pathways, claims, and wiki pages all arrive as facets of one field rather than separate tools.",
    detail:
      "Maze uses a client/logo rail here. SoleMD uses the same reveal grammar, but the content is semantically aligned to evidence work rather than partner branding.",
    bullets: [
      "Papers and evidence cards",
      "Entity and relation context",
      "Wiki-ready syntheses",
    ],
    accentVar: "var(--color-soft-blue)",
    align: "center",
  },
  {
    id: "section-story-1",
    preset: "blob",
    variant: "story",
    eyebrow: "Paper Story",
    title: "Begin by surfacing the papers that deserve attention.",
    body:
      "The first chapter should make the blob feel like a searchable paper universe. Individual points start to matter, a selected subset begins to emerge, and the field feels curated rather than uniformly dense.",
    detail:
      "This is still blob-owned. The chapter should teach paper exploration by highlighting a few points without ever losing the rotating world behind them.",
    bullets: [
      "Highlighted paper points",
      "Persistent blob rotation",
      "Selection without disappearance",
    ],
    accentVar: "var(--color-soft-lavender)",
    align: "left",
  },
  {
    id: "section-story-2",
    preset: "stream",
    variant: "story",
    eyebrow: "Detail Story",
    title: "Move from papers into entities, relations, and paper metadata.",
    body:
      "The next chapter should feel like points are being inspected in context. Selected papers become richer, surrounding metadata starts to matter, and the user can imagine hover cards for entities, relations, and other evidence details.",
    detail:
      "For now the runtime can still use the existing hybrid stream choreography, but the story intent should shift from 'system trace' to 'paper detail and evidence context'.",
    bullets: [
      "Selected papers stay in focus",
      "Hover-card phase for metadata",
      "Blob remains visible underneath",
    ],
    accentVar: "var(--color-golden-yellow)",
    align: "right",
  },
  {
    id: "section-story-3",
    preset: "stream",
    variant: "story",
    eyebrow: "Synthesis Story",
    title: "Show how evidence connects across papers, entities, and wiki structure.",
    body:
      "Once a paper subset is visible, the next chapter should show synthesis: points relating to points, small bridges forming between neighborhoods, and an early sense of how the wiki or graph story emerges from connected evidence.",
    detail:
      "This is where connections between selected nodes should become explicit and where the later wiki-facing story can be staged without abandoning the same field.",
    bullets: [
      "Relation links between points",
      "Wiki-facing synthesis beat",
      "Persistent rotating substrate",
    ],
    accentVar: "var(--color-teal)",
    align: "left",
  },
  {
    id: "section-sequence",
    preset: "stream",
    variant: "sequence",
    eyebrow: "Review Path",
    title: "Turn raw motion into an intelligible review sequence.",
    body:
      "A strong detail story does not just move points. It shows a staged evidence pass: inspect the paper, expose the entity context, then connect the relations into something the reader can carry forward.",
    detail:
      "Maze uses a stepped review chapter here. SoleMD keeps the same reveal logic, but applies it to the evidence-review path rather than generic process marketing.",
    bullets: [
      "Paper first",
      "Entity context second",
      "Synthesis bridge third",
    ],
    accentVar: "var(--color-golden-yellow)",
    align: "left",
  },
  {
    id: "section-mobile-carry",
    preset: "stream",
    variant: "mobileCarry",
    eyebrow: "Mobile Carry",
    title: "Keep the field in motion on smaller screens without inventing a second runtime.",
    body:
      "The mobile chapter stays lightweight: a single moving band that reminds the reader the same field is still alive underneath the copy and stage carry.",
    detail:
      "Maze used a mobile-only marquee in this chapter slot. SoleMD uses the same structural contract to keep motion present on phone without building a separate mobile-only chapter system.",
    bullets: [
      "One runtime family",
      "Mobile-only marquee",
      "No second scene system",
    ],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
  {
    id: "section-cta",
    preset: "blob",
    variant: "cta",
    eyebrow: "End State",
    title: "Close on the same globe the reader met at the start.",
    body:
      "The landing should end as a clean bookend: the field becomes more active and expressive through the middle chapters, then settles naturally back into the same globe-like body it began with.",
    detail:
      "Future module pages can still converge into authored shapes or biologically specific silhouettes, but the landing itself should resolve back to the opening blob rather than introducing a second terminal surface.",
    bullets: [
      "Blob stays load-bearing",
      "Middle chapters can stay more dynamic",
      "Landing ends on a globe bookend",
    ],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
];

export const fieldStoryOneBeats: readonly FieldStoryBeat[] = [
  {
    id: "info-1",
    progressLabel: "01",
    title: "Highlight the papers that should pull the reader deeper",
    body:
      "The field should still feel like a globe here, but a few papers begin to stand out so the user understands that the system can guide attention without losing the larger context.",
    accentVar: "var(--color-soft-blue)",
    variant: "columns",
  },
  {
    id: "info-2",
    progressLabel: "02",
    title: "Use context to separate high-value papers from the wider field",
    body:
      "This middle beat is where selection becomes trustworthy. The blob remains present, but emphasis, pulse activity, and thinning make it clear that some papers now matter more than others.",
    accentVar: "var(--color-golden-yellow)",
    variant: "columns",
  },
  {
    id: "info-3",
    progressLabel: "03",
    title: "Prepare the jump from selected papers into paper details and relations",
    body:
      "Use the last beat as the bridge into the detail chapter: one centered question block, with selected papers ready to reveal entities, relations, and richer evidence context.",
    accentVar: "var(--color-soft-lavender)",
    variant: "centered",
  },
] as const;

export const fieldSurfaceRailItems: readonly FieldSurfaceRailItem[] = [
  {
    id: "papers",
    label: "Signal",
    name: "Ranked paper clusters",
  },
  {
    id: "entities",
    label: "Context",
    name: "Entity neighborhoods",
  },
  {
    id: "relations",
    label: "Bridge",
    name: "Relation paths",
  },
  {
    id: "claims",
    label: "Review",
    name: "Evidence claim cards",
  },
  {
    id: "wiki",
    label: "Synthesis",
    name: "Wiki-ready narratives",
  },
  {
    id: "graph",
    label: "Handoff",
    name: "Graph continuation",
  },
] as const;

export const fieldSequenceItems: readonly FieldSequenceItem[] = [
  {
    id: "review-1",
    number: "01",
    title: "Surface the paper worth opening",
    body:
      "Start with one selected paper so the user reads the chapter as review, not as raw animation.",
  },
  {
    id: "review-2",
    number: "02",
    title: "Expose the surrounding entity context",
    body:
      "Bring nearby entities and metadata into view without displacing the selected paper from the field.",
  },
  {
    id: "review-3",
    number: "03",
    title: "Connect the bridges into synthesis",
    body:
      "Finish by making the relation paths and wiki-facing interpretation legible enough to carry into the graph.",
  },
] as const;

export const fieldMobileCarryItems = [
  "Same field",
  "Same particles",
  "Mobile carry",
  "Evidence context",
  "Relation bridges",
  "Wiki-ready synthesis",
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

export const fieldStoryTwoBeats: readonly FieldStoryBeat[] = [
  {
    id: "info-4",
    progressLabel: "01",
    title: "Keep the selected papers in view while entity detail starts to accumulate",
    body:
      "The first synthesis beat should feel like the field is opening one layer deeper. Papers stay present, but entities and metadata begin to gather around them rather than replacing them.",
    accentVar: "var(--color-soft-blue)",
    variant: "columns",
  },
  {
    id: "info-5",
    progressLabel: "02",
    title: "Make the bridges between evidence neighborhoods explicit",
    body:
      "This is where relation structure becomes legible. The user should read small bridges and clustered neighborhoods rather than one flat cloud of unrelated points.",
    accentVar: "var(--color-teal)",
    variant: "columns",
  },
  {
    id: "info-6",
    progressLabel: "03",
    title: "Stage the wiki-facing synthesis without collapsing the shared field",
    body:
      "Finish the chapter by showing that synthesis is already present in the same field. The graph and wiki story emerge from the field rather than cutting to a separate product surface.",
    accentVar: "var(--color-golden-yellow)",
    variant: "centered",
  },
] as const;
