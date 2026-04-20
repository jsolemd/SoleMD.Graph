import type { BeforeAfterItem } from "@/features/wiki/module-runtime/types";

export const expertComparisons: BeforeAfterItem[] = [
  {
    label: "Clinical Query",
    before:
      "Tell me about valproic acid.",
    after:
      "You are a clinical copilot for inpatient psychiatry. Provide a structured reference sheet on valproic acid with sections: Overview, Epidemiology, Mechanism of Action, Clinical Indications with evidence grades, Dosing and Titration, Monitoring Requirements by timeline, and Safety Issues including pregnancy, hepatic disease, and drug interactions.",
  },
  {
    label: "Diagnostic Reasoning",
    before:
      "What could be wrong with my patient?",
    after:
      "Act as a consultation-liaison psychiatrist. A 68-year-old male is post-CABG day 3 with agitation and pulling at lines. Draft a one-paragraph explanation for the ICU team about why this is likely delirium rather than primary psychosis. Include differential considerations, one key clinical finding, and recommended next steps.",
  },
  {
    label: "Treatment Planning",
    before:
      "How do you treat catatonia?",
    after:
      "As a neurocritical care specialist, generate an evidence-based treatment algorithm for catatonia in suspected anti-NMDAR encephalitis. Present it as a table with Therapeutic Strategy, Intervention, and Clinical Rationale columns. After your response, identify one potential oversight.",
  },
  {
    label: "Literature Synthesis",
    before:
      "What's the evidence for prophylactic antipsychotics?",
    after:
      "Search for systematic reviews and RCTs on prophylactic antipsychotics in high-risk delirium populations. Summarize in a table with Author, Year, Population, Intervention, Key Finding, and Limitations. Flag any studies with contrasting findings and note their methodological differences.",
  },
];
