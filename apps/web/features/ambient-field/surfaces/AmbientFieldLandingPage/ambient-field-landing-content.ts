import type { AmbientFieldVisualPreset } from "../../scene/visual-presets";
import type { AmbientFieldScrollManifest } from "../../scroll/ambient-field-scroll-state";

export type AmbientFieldLandingSectionVariant =
  | "hero"
  | "story"
  | "process"
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

export interface AmbientFieldProcessPoint {
  x: number;
  y: number;
}

export interface AmbientFieldProcessMarkerLane {
  accentVar: string;
  phase: number;
  scale: number;
}

export interface AmbientFieldProcessPopup {
  accentVar: string;
  body: string;
  desktopLeft: string;
  desktopTop: string;
  id: string;
  mobileLeft: string;
  mobileTop: string;
  title: string;
  window: readonly [number, number, number, number];
}

export interface AmbientFieldProcessStageManifest {
  desktopPath: readonly AmbientFieldProcessPoint[];
  markerLanes: readonly AmbientFieldProcessMarkerLane[];
  mobilePath: readonly AmbientFieldProcessPoint[];
  popups: readonly AmbientFieldProcessPopup[];
}

export const ambientFieldLandingSections: AmbientFieldLandingSection[] = [
  {
    id: "section-welcome",
    preset: "blob",
    variant: "hero",
    eyebrow: "Ambient Landing",
    title: "Enter the evidence space before the full graph opens.",
    body:
      "The landing page should already feel like the graph is thinking: one persistent world, a standard prompt surface, and a quiet warmup of the deeper workspace behind it.",
    detail:
      "This is the shared ambient substrate for the homepage first, then inline modules, expanded modules, and graph handoff after that.",
    bullets: [
      "Fixed ambient stage",
      "Prompt-first entry",
      "Graph warms in parallel",
    ],
    accentVar: "var(--color-soft-blue)",
    align: "center",
  },
  {
    id: "section-story-1",
    preset: "blob",
    variant: "story",
    eyebrow: "Scene Carry",
    title: "The opening field should already teach structure, not just mood.",
    body:
      "A calm evidence atmosphere works only if it feels governed. The field should carry density, neighborhoods, and center-of-gravity changes before the user ever opens the full workspace.",
    detail:
      "This first chapter keeps the motion soft and clustered so the world reads as one stable substrate instead of decorative noise.",
    bullets: [
      "Stable visual identity",
      "Sparse overlays",
      "No loading-screen reset",
    ],
    accentVar: "var(--color-soft-lavender)",
    align: "left",
  },
  {
    id: "section-process",
    preset: "stream",
    variant: "process",
    eyebrow: "Process Chapter",
    title: "When the story turns procedural, the field should flow with it.",
    body:
      "This is the key Maze move to preserve: the background stops reading like a cloud and starts behaving like a routed trace. Movement becomes directional and the DOM callouts explain what is happening in the same world.",
    detail:
      "The stream chapter is hybrid on purpose: the fixed stage carries the point field while the DOM layer handles the marker cadence, popup sequencing, and chapter-specific instruction.",
    bullets: [
      "Directional field motion",
      "Inline process callouts",
      "Shared substrate, not a separate module",
    ],
    accentVar: "var(--color-golden-yellow)",
    align: "right",
  },
  {
    id: "section-story-2",
    preset: "stream",
    variant: "story",
    eyebrow: "Module Basis",
    title: "The same scene should survive into explanation, modules, and handoff.",
    body:
      "This second band is where the ambient field proves it is infrastructure. Inline modules, learning shells, and sparse paper or entity overlays should land on the same carried scene instead of swapping to a new background.",
    detail:
      "That continuity is what makes the later graph handoff feel like a deepening of context rather than a route change into a different product.",
    bullets: [
      "Scene overlap instead of hard switches",
      "Inline modules can mount here",
      "Graph handoff stays visually continuous",
    ],
    accentVar: "var(--color-teal)",
    align: "right",
  },
  {
    id: "section-cta",
    preset: "pcb",
    variant: "cta",
    eyebrow: "Graph Bridge",
    title: "Open the graph only when the user is ready to go deeper.",
    body:
      "The landing experience should end in a calmer technical substrate that makes the final transition into the full graph feel deliberate, not forced.",
    detail:
      "This is the state the module system can also use for expansion moments, contextual bridges, and explicit graph entry packets later.",
    bullets: [
      "Same world, deeper mode",
      "Quiet readiness signal",
      "Direct graph entry when warm",
    ],
    accentVar: "var(--color-warm-coral)",
    align: "center",
  },
];

export const ambientFieldProcessStageManifest: AmbientFieldProcessStageManifest = {
  desktopPath: [
    { x: 0.06, y: 0.72 },
    { x: 0.16, y: 0.42 },
    { x: 0.26, y: 0.2 },
    { x: 0.38, y: 0.28 },
    { x: 0.52, y: 0.64 },
    { x: 0.66, y: 0.74 },
    { x: 0.78, y: 0.36 },
    { x: 0.9, y: 0.32 },
    { x: 0.96, y: 0.46 },
  ] as const,
  mobilePath: [
    { x: 0.24, y: 0.86 },
    { x: 0.26, y: 0.68 },
    { x: 0.35, y: 0.5 },
    { x: 0.48, y: 0.38 },
    { x: 0.58, y: 0.54 },
    { x: 0.66, y: 0.7 },
    { x: 0.74, y: 0.48 },
    { x: 0.82, y: 0.24 },
  ] as const,
  markerLanes: [
    {
      accentVar: "var(--color-soft-blue)",
      phase: 0,
      scale: 1,
    },
    {
      accentVar: "var(--color-golden-yellow)",
      phase: 0.22,
      scale: 0.82,
    },
    {
      accentVar: "var(--color-teal)",
      phase: 0.48,
      scale: 0.68,
    },
  ] as const,
  popups: [
    {
      id: "ingest",
      title: "Retrieve the right neighborhood",
      body:
        "Pull a narrow evidence corridor first so the chapter feels intentional instead of dropping the user into undifferentiated motion.",
      accentVar: "var(--color-soft-blue)",
      desktopLeft: "4%",
      desktopTop: "10%",
      mobileLeft: "6%",
      mobileTop: "8%",
      window: [0.02, 0.15, 0.24, 0.34],
    },
    {
      id: "route",
      title: "Route the stream through the chapter",
      body:
        "Directional current should read like system logic: the stream narrows, accelerates, and starts to convey ordered movement.",
      accentVar: "var(--color-soft-lavender)",
      desktopLeft: "28%",
      desktopTop: "54%",
      mobileLeft: "14%",
      mobileTop: "54%",
      window: [0.18, 0.3, 0.42, 0.54],
    },
    {
      id: "focus",
      title: "Surface the current decision point",
      body:
        "The DOM layer should explain what the field is doing at the same moment the background shifts into stronger directional emphasis.",
      accentVar: "var(--color-golden-yellow)",
      desktopLeft: "40%",
      desktopTop: "14%",
      mobileLeft: "30%",
      mobileTop: "24%",
      window: [0.34, 0.46, 0.56, 0.68],
    },
    {
      id: "sequence",
      title: "Sequence the bridge actions",
      body:
        "Cards should feel looped and procedural, not statically pinned. The chapter needs multiple beats before the next story band takes over.",
      accentVar: "var(--color-teal)",
      desktopLeft: "62%",
      desktopTop: "60%",
      mobileLeft: "26%",
      mobileTop: "66%",
      window: [0.54, 0.66, 0.78, 0.9],
    },
    {
      id: "handoff",
      title: "Hold continuity into the next surface",
      body:
        "The stream chapter should still feel like the same world as the inline module and graph handoff that follow after it.",
      accentVar: "var(--color-warm-coral)",
      desktopLeft: "76%",
      desktopTop: "18%",
      mobileLeft: "34%",
      mobileTop: "36%",
      window: [0.76, 0.86, 0.94, 1],
    },
  ] as const,
};

export const ambientFieldLandingScrollManifest: AmbientFieldScrollManifest = {
  activationViewportRatio: 0.24,
  focusViewportRatio: 0.32,
  processProgress: {
    start: {
      sectionId: "section-process",
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
        exit: {
          start: {
            sectionId: "section-process",
            offsetViewport: -0.58,
          },
          end: {
            sectionId: "section-process",
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
          sectionId: "section-process",
          offsetViewport: 0.08,
        },
      },
      emphasis: {
        base: 0.58,
        metric: "visibility",
        range: 0.42,
      },
    },
    stream: {
      visibility: {
        enter: {
          start: {
            sectionId: "section-process",
            offsetViewport: -0.34,
          },
          end: {
            sectionId: "section-process",
            offsetViewport: 0.18,
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
          sectionId: "section-process",
          offsetViewport: -0.08,
        },
        end: {
          sectionId: "section-cta",
          offsetViewport: 0,
        },
      },
      emphasis: {
        base: 0.36,
        metric: "processProgress",
        range: 0.64,
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
