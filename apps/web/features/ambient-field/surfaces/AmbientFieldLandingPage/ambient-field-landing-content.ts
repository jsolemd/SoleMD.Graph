import type { AmbientFieldVisualPreset } from "../../scene/visual-presets";

export type AmbientFieldLandingSectionVariant =
  | "hero"
  | "story"
  | "graph"
  | "cta";

export interface AmbientFieldLandingSection {
  accentVar: string;
  align: "left" | "right" | "center";
  body: string;
  bullets: string[];
  detail: string;
  eyebrow: string;
  id: string;
  preset: AmbientFieldVisualPreset;
  title: string;
  variant: AmbientFieldLandingSectionVariant;
}

export interface AmbientFieldStoryBeat {
  accentVar: string;
  body: string;
  id: string;
  progressLabel: string;
  title: string;
  variant: "columns" | "centered";
}

export const ambientFieldLandingSections: AmbientFieldLandingSection[] = [
  {
    id: "section-welcome",
    preset: "blob",
    variant: "hero",
    eyebrow: "Ambient Field",
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
    id: "section-graph",
    preset: "stream",
    variant: "graph",
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
    id: "section-story-2",
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
    id: "section-cta",
    preset: "pcb",
    variant: "cta",
    eyebrow: "End State",
    title: "Let the field reform into a clearer final shape rather than dropping away.",
    body:
      "The last chapter should feel like the evidence field has learned something. Instead of vanishing, it should reform into a more recognizable end state, potentially a brain-like silhouette or another biologically meaningful shape.",
    detail:
      "The current runtime can keep the later chapter lighter while parity work continues, but the ledger should now treat a re-formed end shape as the target instead of a quiet technical CTA.",
    bullets: [
      "Blob never fully disappears",
      "Re-formed end-state target",
      "Brain-shape exploration later",
    ],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
];

export const ambientFieldStoryOneBeats: readonly AmbientFieldStoryBeat[] = [
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

