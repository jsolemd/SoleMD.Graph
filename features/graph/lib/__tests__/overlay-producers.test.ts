import {
  ENTITY_OVERLAY_SELECTION_SOURCE_ID,
  RAG_ANSWER_SELECTION_SOURCE_ID,
  WIKI_PAGE_SELECTION_SOURCE_ID,
  isSelectedPointBaselineSelectionSourceId,
} from "../overlay-producers";

describe("overlay selection source contracts", () => {
  it("marks store-managed programmatic selection sources as selected-point baselines", () => {
    expect(
      isSelectedPointBaselineSelectionSourceId(
        ENTITY_OVERLAY_SELECTION_SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      isSelectedPointBaselineSelectionSourceId(
        RAG_ANSWER_SELECTION_SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      isSelectedPointBaselineSelectionSourceId(
        WIKI_PAGE_SELECTION_SOURCE_ID,
      ),
    ).toBe(true);
  });

  it("leaves canvas-owned/manual sources off the baseline-managed path", () => {
    expect(
      isSelectedPointBaselineSelectionSourceId("lasso:selection"),
    ).toBe(false);
    expect(
      isSelectedPointBaselineSelectionSourceId("filter:cluster"),
    ).toBe(false);
    expect(isSelectedPointBaselineSelectionSourceId(null)).toBe(false);
  });
});
