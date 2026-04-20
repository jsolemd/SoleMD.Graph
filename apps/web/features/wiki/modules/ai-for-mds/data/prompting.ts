import type { MechanismStage } from "@/features/wiki/module-runtime/types";

export const promptingStages: MechanismStage[] = [
  {
    id: "persona",
    title: "Assign a Persona",
    description:
      "Define the role: 'Act as an expert consultation-liaison psychiatrist and clinical neuroscientist specializing in autoimmune neuropsychiatry.' This sets the model's tone, knowledge base, and professional voice.",
  },
  {
    id: "context",
    title: "Provide Clear Context",
    description:
      "Give case details: patient demographics, setting, presenting problem. 'The context is an inpatient with new-onset psychosis and dyskinesias, now presenting with severe catatonia. The suspected diagnosis is anti-NMDAR encephalitis.'",
  },
  {
    id: "goal",
    title: "State the Explicit Goal",
    description:
      "Specify the output you need: 'Your goal is to generate an evidence-based treatment algorithm. Focus only on established first-line and second-line interventions.' Not 'tell me about this patient,' but 'explain X to Y audience in Z format.'",
  },
  {
    id: "structure",
    title: "Request a Specific Structure",
    description:
      "Remove guesswork about layout: 'Present the algorithm in a table with three columns: Therapeutic Strategy, Intervention, and Clinical Rationale & Mechanism.' This lets the model focus on populating your framework with high-quality data.",
  },
  {
    id: "sample",
    title: "Provide a Quality Example",
    description:
      "Optional but powerful. Paste a short example of your own writing style or a template you like. This serves as a one-shot learning guide that instantly calibrates the model's understanding of the required tone, style, and depth of clinical detail.",
  },
  {
    id: "test",
    title: "Iterate & Challenge",
    description:
      "Add self-critique: 'After your response, challenge one assumption in this algorithm and suggest one alternative perspective.' This turns the model from a simple answer-provider into a sparring partner that checks its own logic.",
  },
];
