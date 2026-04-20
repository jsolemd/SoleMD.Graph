import type { MechanismStage } from "@/features/wiki/module-runtime/types";

export const workflowStages: MechanismStage[] = [
  {
    id: "hypothesis",
    title: "Hypothesis Generation",
    description:
      "Describe a puzzling clinical observation and ask the model to brainstorm mechanistic hypotheses and testable research questions. You bring the output to your team meeting not as answers, but as discussion prompts. AI accelerates the brainstorming phase while you and your team provide the critical refinement.",
  },
  {
    id: "literature",
    title: "Literature Review",
    description:
      "Use specialized tools like Elicit, Consensus, or Scite to identify key trials, guidelines, and systematic reviews. Export results and have a general LLM summarize them in structured tables. You verify each citation and read the primary sources yourself - AI removes the mechanical friction while you provide the critical appraisal.",
  },
  {
    id: "design",
    title: "Experimental Design",
    description:
      "Ask the model to compare alternative study designs: retrospective chart review versus prospective registry, listing pros and cons in terms of bias, feasibility, ethics, and timeline. The model generates a comparison table that you and your statistician use as a discussion starter to challenge and de-risk the methodology.",
  },
  {
    id: "analysis",
    title: "Data Analysis",
    description:
      "AI helps with code snippets for statistical analysis and visualization, and can draft the narrative synthesis of results. You and your analyst verify the code and outputs. The model serves as a capable research assistant while the interpretation remains yours.",
  },
  {
    id: "manuscript",
    title: "Manuscript Writing",
    description:
      "AI writing tools help restructure sections, suggest titles and abstracts, and adapt text for different audiences. You write the core interpretation and discussion - that is your scholarly contribution. The tool handles phrasing, structure, and reference formatting, removing friction from the scaffolding.",
  },
];
