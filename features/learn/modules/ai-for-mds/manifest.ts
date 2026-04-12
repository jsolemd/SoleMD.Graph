import type { ModuleManifest } from "@/features/learn/types";

export const manifest: ModuleManifest = {
  slug: "ai-for-mds",
  title: "AI for MDs",
  accent: "soft-blue",
  audience: "Practicing physicians",
  estimatedMinutes: 60,
  version: "1.0",
  lastUpdated: "2026-04-11",
  authors: ["Jon Sole, MD"],
  objectives: [
    "Build a mental model of how LLMs work that you can explain to a resident on rounds.",
    "Learn a prompt method that moves you from vague questions to structured, high-quality answers.",
    "Apply the S.A.F.E.R. framework so any clinical AI use has explicit risk checks built in.",
    "Leave with specific, low-risk use cases you could implement this month without violating privacy or offloading psychiatric judgment.",
  ],
  sections: [
    {
      id: "introduction",
      title: "Welcome, Clinical Innovator",
      subtitle: "Your learning journey at a glance",
    },
    {
      id: "guide-intro",
      title: "How to Use This Guide",
      subtitle: "Interactive patterns and navigation",
    },
    {
      id: "foundations",
      title: "Core LLM Concepts",
      subtitle: "Seven interactive demos",
      accent: "soft-blue",
    },
    {
      id: "prompting",
      title: "Precision Prompting",
      subtitle: "The six-part prompt builder",
      accent: "golden-yellow",
    },
    {
      id: "expert",
      title: "Expert Output",
      subtitle: "From novice to clinical copilot",
      accent: "fresh-green",
    },
    {
      id: "safer",
      title: "The S.A.F.E.R. Framework",
      subtitle: "A safety checklist for clinical AI use",
      accent: "muted-indigo",
    },
    {
      id: "toolkit",
      title: "The MD's AI Toolkit",
      subtitle: "Tools you can use today",
      accent: "soft-pink",
    },
    {
      id: "workflow",
      title: "AI-Augmented Research Workflow",
      subtitle: "From hypothesis to manuscript",
      accent: "muted-indigo",
    },
    {
      id: "clinical-case",
      title: "Clinical Case: Ms. K",
      subtitle: "AI relationships and clinical judgment",
      accent: "warm-coral",
    },
    {
      id: "conclusion",
      title: "The AI-Powered Clinician",
      subtitle: "Your next steps",
      accent: "soft-lavender",
    },
  ],
  citations: [],
  glossaryTerms: [],
  animations: [],
  wikiSlug: "ai-for-mds",
};
