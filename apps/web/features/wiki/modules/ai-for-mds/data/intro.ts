import type { KeyFact } from "@/features/wiki/module-runtime/types";

export const introFacts: KeyFact[] = [
  {
    label: "Core Concepts",
    description:
      "How large language models actually work. Not the hype, not the fear - the mechanics you need to reason about capabilities and limitations.",
  },
  {
    label: "Precision Prompting",
    description:
      "How to communicate with these systems in a way that produces clinically useful output instead of generic fluff.",
  },
  {
    label: "Expert Output",
    description:
      "How to transform a chatbot into a structured clinical copilot that matches your workflow.",
  },
  {
    label: "S.A.F.E.R. Framework",
    description:
      "A safety checklist for clinical use. Especially important for psychiatry, where language, bias, and risk assessment are central.",
  },
  {
    label: "Research Toolkit",
    description:
      "Concrete tools for literature review, data analysis, and manuscript writing that you can start using today.",
  },
  {
    label: "AI Workflow",
    description:
      "End-to-end patterns for research and clinical work, with scenario playbooks you can adapt to your practice.",
  },
];

export const guideIntroContent: string =
  "This guide is a fully interactive web application you can explore hands-on. " +
  "Each section includes interactive demonstrations: buttons to click, sliders to drag, cards to flip, and toggles to switch. " +
  "Every section ends with a color-coded takeaway box that summarizes why what you just learned matters clinically. " +
  "You can jump directly to any section using the navigation, and deep linking works for sharing specific sections with colleagues.";

export const conclusionFacts: KeyFact[] = [
  {
    label: "Core Concepts",
    description:
      "You now have enough model understanding to know when to trust output and when to doubt it. You can explain tokens, context windows, and temperature to a resident on rounds.",
  },
  {
    label: "Precision Prompting",
    description:
      "You have a six-part method for turning vague requests into structured, clinically useful answers.",
  },
  {
    label: "Expert Output",
    description:
      "You know how to combine core concepts and precise prompting to make a chatbot behave like a clinical copilot.",
  },
  {
    label: "S.A.F.E.R. Framework",
    description:
      "You have a routine safety checklist for every clinical AI interaction. Especially critical for psychiatric work, where language, bias, and risk assessment are central.",
  },
  {
    label: "Research Toolkit",
    description:
      "You have a menu of concrete tools for reading, writing, and data work.",
  },
  {
    label: "AI Workflow",
    description:
      "You have seen patterns for integrating AI across cases, programs, and scholarly projects. AI is a cognitive partner woven into every stage of your workflow.",
  },
];
