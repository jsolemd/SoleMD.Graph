import { selectTextContextWindow } from "../text-context-window";

describe("text-context-window", () => {
  it("selects the last completed context sentences leading into the cursor", () => {
    const paragraphText = [
      "Melatonin may improve sleep quality in ICU patients.",
      "Delirium risk may also decrease in selected cohorts.",
      "The signal is not consistent across all trials.",
      "Larger randomized studies are still needed.",
    ].join(" ");

    const excerpt = selectTextContextWindow({
      paragraphText,
      cursorOffset: paragraphText.indexOf("Larger randomized"),
      maxSentences: 2,
    });

    expect(excerpt).toBe(
      "Delirium risk may also decrease in selected cohorts. The signal is not consistent across all trials.",
    );
  });
});
