import type { AmbientFieldVisualPreset } from "../../scene/visual-presets";
import type { AmbientFieldScrollManifest } from "../../scroll/ambient-field-scroll-state";

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

export interface AmbientFieldClientRailItem {
  id: string;
  label: string;
}

export interface AmbientFieldStoryBeat {
  accentVar: string;
  body: string;
  id: string;
  progressLabel: string;
  title: string;
  variant: "columns" | "centered";
}

export interface AmbientFieldGraphStep {
  id: string;
  number: string;
  text: string;
}

export interface AmbientFieldStreamPopup {
  category?: string;
  id: string;
  label?: string;
  title: string;
}

export interface AmbientFieldStreamPoint {
  id: string;
  pathIndex: number;
  popups: readonly AmbientFieldStreamPopup[];
  tone: "default" | "danger";
}

export interface AmbientFieldProcessStageManifest {
  desktopRailPaths: readonly string[];
  mobileRailPaths: readonly string[];
  points: readonly AmbientFieldStreamPoint[];
}

export const ambientFieldLandingSections: AmbientFieldLandingSection[] = [
  {
    id: "section-welcome",
    preset: "blob",
    variant: "hero",
    eyebrow: "Ambient Field",
    title: "Enter a living evidence field that never drops out of view.",
    body:
      "The homepage should begin with a coherent rotating globe of papers and stay in that same living substrate all the way down the page. Each chapter changes what the user notices inside the field rather than replacing the field itself.",
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

export const ambientFieldHeroClients: readonly AmbientFieldClientRailItem[] = [
  { id: "papers", label: "Papers" },
  { id: "entities", label: "Entities" },
  { id: "pathways", label: "Pathways" },
  { id: "mechanisms", label: "Mechanisms" },
  { id: "clusters", label: "Clusters" },
  { id: "timelines", label: "Timelines" },
] as const;

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

export const ambientFieldGraphSteps: readonly AmbientFieldGraphStep[] = [
  {
    id: "step-1",
    number: "01",
    text: "Selected papers move into focus without losing the wider field.",
  },
  {
    id: "step-2",
    number: "02",
    text: "Entities, relations, and metadata begin to cluster around them.",
  },
  {
    id: "step-3",
    number: "03",
    text: "Connections between evidence neighborhoods become legible.",
  },
  {
    id: "step-4",
    number: "04",
    text: "The same field can now transition into synthesis, wiki context, or graph entry.",
  },
] as const;

export const ambientFieldProcessStageManifest: AmbientFieldProcessStageManifest = {
  desktopRailPaths: [
    "M1175 480.3C1019.6 479.3 1016 453.8 848.9 453.8C681.8 453.8 657 475.9 465.1 475.9C273.2 475.9 320.5 414.1 183.9 414.1",
    "M1175 465.2C1019.6 464.2 1016 497.9 848.9 497.9C681.8 497.9 657 452.8 465.1 452.8C273.2 452.8 320.5 391 183.9 391",
    "M1175 450.2C1019.6 449.2 1016 467.9 848.9 467.9C681.8 467.9 657 499.7 465.1 499.7C273.2 499.7 320.5 437.9 183.9 437.9",
    "M1175 146.2C512.5 146.2 895.4 77 184 77",
    "M1175 302C1019.6 301 1076 303.4 908.9 303.4C741.8 303.4 697 128.5 505.1 128.5C313.2 128.5 320.5 127.7 183.9 127.7",
    "M1175 326C1019.6 325 1086 327.4 918.9 327.4C751.8 327.4 667 152.5 475.1 152.5C283.2 152.5 320.5 151.7 183.9 151.7",
    "M1175 509C1019.6 508 1026 477.4 858.9 477.4C691.8 477.4 667 431.5 475.1 431.5C283.2 431.5 320.5 367.7 183.9 367.7",
    "M1175 495C1019.6 494 1006 441.4 838.9 441.4C671.8 441.4 667 411.5 475.1 411.5C283.2 411.5 320.5 344.7 183.9 344.7",
  ] as const,
  mobileRailPaths: [
    "M47.2 653C47.9 554.4 64.9 552.2 64.9 446.2C64.9 340.2 50.2 324.5 50.2 202.8C50.2 81.1 91.4 111.1 91.4 24.5",
    "M57.3 653C58 554.4 35.5 552.2 35.5 446.2C35.5 340.2 65.6 324.5 65.6 202.8C65.6 81.1 106.8 111.1 106.8 24.5",
    "M67.3 653C68 554.4 55.5 552.2 55.5 446.2C55.5 340.2 34.3 324.5 34.3 202.8C34.3 81.1 75.4 111.1 75.4 24.5",
    "M269.9 653C269.9 232.8 316 475.6 316 24.5",
    "M166.1 653C166.8 554.4 165.2 590.2 165.2 484.3C165.2 378.4 281.7 349.9 281.7 228.2C281.7 106.5 282.2 111.1 282.2 24.5",
    "M150 653C150.7 554.4 149.1 596.6 149.1 490.6C149.1 384.7 265.6 330.9 265.6 209.2C265.6 87.5 266.1 111.1 266.1 24.5",
    "M28.1 653C28.8 554.4 49.1 558.5 49.1 452.6C49.1 346.7 79.7 330.9 79.7 209.2C79.7 87.5 122.2 111.1 122.2 24.5",
    "M37.4 653C38.1 554.4 73.1 545.8 73.1 439.9C73.1 334 93 330.9 93 209.2C93 87.5 137.5 111.1 137.5 24.5",
  ] as const,
  points: [
    {
      id: "kdc",
      pathIndex: 0,
      tone: "default",
      popups: [
        {
          id: "kdc-primary",
          category: "Evidence check",
          title: "KDC-style dependency chain",
          label: "Not present",
        },
        {
          id: "kdc-secondary",
          title: "Exception logged for later review",
        },
      ],
    },
    {
      id: "function",
      pathIndex: 1,
      tone: "default",
      popups: [
        {
          id: "function-primary",
          category: "Evidence check",
          title: "Function remains reachable",
          label: "Not present",
        },
        {
          id: "function-secondary",
          title: "Context removed this route from focus",
        },
      ],
    },
    {
      id: "fpt",
      pathIndex: 2,
      tone: "default",
      popups: [
        {
          id: "fpt-primary",
          category: "Evidence check",
          title: "Related paper corridor detected",
          label: "Not present",
        },
        {
          id: "fpt-secondary",
          title: "Exception logged for later review",
        },
      ],
    },
    {
      id: "access",
      pathIndex: 3,
      tone: "danger",
      popups: [
        {
          id: "access-primary",
          category: "Evidence check",
          title: "High-confidence access route",
          label: "Present",
        },
        {
          id: "access-secondary",
          title: "Highly connected paper cluster",
        },
        {
          id: "access-tertiary",
          title: "Module state prepared automatically",
        },
      ],
    },
    {
      id: "json",
      pathIndex: 4,
      tone: "danger",
      popups: [
        {
          id: "json-primary",
          category: "Evidence check",
          title: "Cross-study signal convergence",
          label: "Present",
        },
        {
          id: "json-secondary",
          title: "Isolated validation environment",
        },
        {
          id: "json-tertiary",
          title: "Ticket created",
          label: "SLA 7 days",
        },
      ],
    },
    {
      id: "fou",
      pathIndex: 5,
      tone: "danger",
      popups: [
        {
          id: "fou-primary",
          category: "Evidence check",
          title: "Mechanism bridge already configured",
          label: "Present",
        },
        {
          id: "fou-secondary",
          title: "Test environment prepared",
        },
        {
          id: "fou-tertiary",
          title: "Ticket created",
          label: "SLA 30 days",
        },
      ],
    },
    {
      id: "image",
      pathIndex: 6,
      tone: "default",
      popups: [
        {
          id: "image-primary",
          category: "Evidence check",
          title: "Image parsing configuration",
          label: "Not present",
        },
        {
          id: "image-secondary",
          title: "Exception logged for later review",
        },
      ],
    },
    {
      id: "framebuffer",
      pathIndex: 7,
      tone: "default",
      popups: [
        {
          id: "framebuffer-primary",
          category: "Evidence check",
          title: "Framebuffer console enable",
          label: "Not present",
        },
        {
          id: "framebuffer-secondary",
          title: "Context removed this route from focus",
        },
      ],
    },
  ] as const,
};

export const ambientFieldLandingScrollManifest: AmbientFieldScrollManifest = {
  activationViewportRatio: 0.24,
  focusViewportRatio: 0.32,
  processProgress: {
    start: {
      sectionId: "section-graph",
      offsetViewport: 0.04,
    },
    end: {
      sectionId: "section-story-2",
      offsetViewport: -0.22,
    },
  },
  stages: {
    blob: {
      visibility: {
        enter: {
          start: {
            sectionId: "section-welcome",
            offsetViewport: -0.18,
          },
          end: {
            sectionId: "section-welcome",
            offsetViewport: 0.16,
          },
        },
      },
      localProgress: {
        start: {
          sectionId: "section-welcome",
          offsetViewport: 0,
        },
        end: {
          sectionId: "section-story-2",
          offsetViewport: 0.18,
        },
      },
      emphasis: {
        base: 0.62,
        metric: "localProgress",
        range: 0.38,
      },
    },
    stream: {
      visibility: {
        enter: {
          start: {
            sectionId: "section-graph",
            offsetViewport: -0.32,
          },
          end: {
            sectionId: "section-graph",
            offsetViewport: 0.1,
          },
        },
        exit: {
          start: {
            sectionId: "section-cta",
            offsetViewport: -0.54,
          },
          end: {
            sectionId: "section-cta",
            offsetViewport: 0.12,
          },
        },
      },
      localProgress: {
        start: {
          sectionId: "section-graph",
          offsetViewport: -0.08,
        },
        end: {
          sectionId: "section-cta",
          offsetViewport: 0,
        },
      },
      emphasis: {
        base: 0.32,
        metric: "processProgress",
        range: 0.68,
      },
    },
    pcb: {
      visibility: {
        enter: {
          start: {
            sectionId: "section-cta",
            offsetViewport: -0.28,
          },
          end: {
            sectionId: "section-cta",
            offsetViewport: 0.18,
          },
        },
      },
      localProgress: {
        start: {
          sectionId: "section-cta",
          offsetViewport: 0,
        },
        end: {
          sectionId: "section-cta",
          offsetViewport: 1,
        },
      },
      emphasis: {
        base: 0.34,
        metric: "visibility",
        range: 0.66,
      },
    },
  },
};
