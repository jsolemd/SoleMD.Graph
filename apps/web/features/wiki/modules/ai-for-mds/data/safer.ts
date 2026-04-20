import type { DefinitionItem } from "@/features/wiki/module-runtime/types";

export const saferSteps: DefinitionItem[] = [
  {
    term: "S - Secure & Summarize",
    definition:
      "Before anything else, confirm the AI interaction is happening in a secure environment. Strip all identifiers and craft a one-sentence SBAR-style summary (Who? What? Why now?) to keep both you and the model on the same diagnostic target.",
    detail:
      "Privacy and trust: HIPAA penalties and reputational damage are real. A crisp one-liner keeps both you and the model focused, and becomes the headline for hand-offs. If you are about to paste identifiable PHI into a public chatbot, stop and de-identify or reconsider entirely.",
  },
  {
    term: "A - Architect & Antagonize",
    definition:
      "Design the workflow and assign a specific expert persona. Ask the AI to act as a contrarian to fight confirmation bias. Get high-quality, synthesized data for complex questions in seconds.",
    detail:
      "LLMs mirror your framing; a contrarian role fights confirmation bias and forces exploration of mimics easily missed on a busy service. Assign a specific, expert persona and ask for structured, evidence-based output. Example: 'As a neurocritical care pharmacologist, synthesize evidence for non-dopaminergic bridge sedative therapies...'",
  },
  {
    term: "F - First-Pass Plausibility",
    definition:
      "Treat everything the model says as a first-pass possibility. Scan the output against the patient's full clinical picture, including problem list, medication list, and location.",
    detail:
      "LLMs know facts but miss patient context. Your expertise connects the dots. This mental posture catches high-stakes drug-drug interactions the AI might overlook. Example: AI suggests Valproic Acid, but you know the patient is on Lamotrigine - you flag the suggestion due to the high risk of SJS/TEN.",
  },
  {
    term: "E - Engage Your Expertise",
    definition:
      "Triage every AI suggestion: Keep, Modify, or Discard. The license and liability stay with you. You are the clinician of record.",
    detail:
      "Integrate systems-level knowledge like level-of-care requirements for a given medication. Explicitly document your rationale for discarding or modifying advice. If the system says 'No suicide risk identified' but your clinical gestalt disagrees, your judgment wins. Every time.",
  },
  {
    term: "R - Risk & Review",
    definition:
      "Before anything reaches the chart or the patient, assess plan risk (low / medium / high) and verify accordingly. Higher potential harm demands deeper verification.",
    detail:
      "Medium risk: verify with a trusted source. High risk: direct talk with colleague or consultant and notate. Independent checks catch rare errors and ensure team alignment. Ask: could this wording change how another team views the patient unfairly? If this note were read aloud in court, would you be comfortable saying AI assisted?",
  },
];
