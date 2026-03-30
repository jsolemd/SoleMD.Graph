import {
  extractEvidenceAssistRequestFromEditor,
  getEvidenceAssistDefaultCommandIndex,
  resolveEvidenceAssistTriggerMatch,
  selectEvidenceAssistExcerpt,
} from "../evidence-assist";

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
      intent: "refute",
      queryText: paragraphText,
      previewText: paragraphText,
      paragraphText,
    });
  });

  it("matches the support trigger at a valid boundary", () => {
    expect(
      resolveEvidenceAssistTriggerMatch({
        textBeforeCursor: "This claim suggests ",
        insertedText: "@",
      }),
    ).toMatchObject({
      trigger: {
        pattern: "@",
        defaultIntent: "support",
      },
      deletePrefixChars: 0,
    });
  });

  it("does not fire triggers inside words", () => {
    expect(
      resolveEvidenceAssistTriggerMatch({
        textBeforeCursor: "email",
        insertedText: "@",
      }),
    ).toBeNull();
  });

  it("maps default intents to the correct menu selection index", () => {
    expect(getEvidenceAssistDefaultCommandIndex("support")).toBe(0);
    expect(getEvidenceAssistDefaultCommandIndex("refute")).toBe(1);
    expect(getEvidenceAssistDefaultCommandIndex("both")).toBe(0);
  });
});
