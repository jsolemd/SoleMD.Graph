import {
  EVIDENCE_ASSIST_PROVIDER,
  extractEvidenceAssistRequestFromEditor,
  isEvidenceAssistRequest,
  selectEvidenceAssistExcerpt,
} from "../evidence-assist";
import {
  getPromptInteractionDefaultCommandIndex,
  resolvePromptInteractionTriggerMatch,
} from "../../editor/prompt-interactions";

describe("evidence-assist", () => {
  it("selects the last completed sentences leading into the cursor from the current paragraph", () => {
    const paragraphText = [
      "Melatonin may improve sleep quality in ICU patients.",
      "Delirium risk may also decrease in selected cohorts.",
      "The signal is not consistent across all trials.",
      "Larger randomized studies are still needed.",
    ].join(" ");

    const excerpt = selectEvidenceAssistExcerpt({
      paragraphText,
      cursorOffset: paragraphText.indexOf("Larger randomized"),
      maxSentences: 2,
    });

    expect(excerpt).toBe(
      "Delirium risk may also decrease in selected cohorts. The signal is not consistent across all trials.",
    );
  });

  it("builds a support/refute request from the editor selection context", () => {
    const paragraphText =
      "Vitamin D deficiency may be associated with worse outcomes. The causality remains uncertain.";

    const request = extractEvidenceAssistRequestFromEditor(
      {
        state: {
          selection: {
            $from: {
              parent: {
                textContent: paragraphText,
              },
              parentOffset: paragraphText.indexOf("causality"),
            },
          },
        },
        getText: () => paragraphText,
      } as never,
      "refute",
    );

    expect(request).toEqual({
      providerId: "evidence-assist",
      commandId: "refute",
      queryText: paragraphText,
      previewText: paragraphText,
      paragraphText,
    });
  });

  it("exposes a provider that resolves the generic prompt interaction contract", () => {
    expect(
      resolvePromptInteractionTriggerMatch({
        providers: [EVIDENCE_ASSIST_PROVIDER],
        textBeforeCursor: "This claim suggests ",
        insertedText: "/evidence",
      }),
    ).toMatchObject({
      provider: EVIDENCE_ASSIST_PROVIDER,
      trigger: {
        pattern: "/evidence",
        defaultCommandId: "support",
      },
      deletePrefixChars: 0,
    });
  });

  it("does not fire triggers inside words", () => {
    expect(
      resolvePromptInteractionTriggerMatch({
        providers: [EVIDENCE_ASSIST_PROVIDER],
        textBeforeCursor: "email",
        insertedText: "/evidence",
      }),
    ).toBeNull();
  });

  it("maps evidence-assist commands through the generic default-command index helper", () => {
    expect(getPromptInteractionDefaultCommandIndex(EVIDENCE_ASSIST_PROVIDER, "support")).toBe(0);
    expect(getPromptInteractionDefaultCommandIndex(EVIDENCE_ASSIST_PROVIDER, "refute")).toBe(1);
    expect(getPromptInteractionDefaultCommandIndex(EVIDENCE_ASSIST_PROVIDER, "both")).toBe(0);
  });

  it("narrowly identifies evidence-assist requests from the shared interaction contract", () => {
    expect(
      isEvidenceAssistRequest({
        providerId: "evidence-assist",
        commandId: "support",
      }),
    ).toBe(true);

    expect(
      isEvidenceAssistRequest({
        providerId: "not-evidence-assist",
        commandId: "support",
      }),
    ).toBe(false);
  });
});
