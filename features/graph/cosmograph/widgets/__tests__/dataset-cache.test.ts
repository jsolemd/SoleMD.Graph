import {
  getCachedCategoricalDataset,
  getCachedNumericDataset,
  setCachedCategoricalDataset,
  setCachedNumericDataset,
} from "../dataset-cache";

describe("dataset cache eviction", () => {
  it("clears categorical cache entries when the next dataset is empty", () => {
    const key = "categorical:test";

    setCachedCategoricalDataset(key, [
      { value: "Nature", scopedCount: 5, totalCount: 5 },
    ]);
    expect(getCachedCategoricalDataset(key)).toEqual([
      { value: "Nature", scopedCount: 5, totalCount: 5 },
    ]);

    setCachedCategoricalDataset(key, []);

    expect(getCachedCategoricalDataset(key)).toBeNull();
  });

  it("clears numeric cache entries when the next dataset is empty", () => {
    const key = "numeric:test";

    setCachedNumericDataset(key, [1, 2, 3]);
    expect(getCachedNumericDataset(key)).toEqual([1, 2, 3]);

    setCachedNumericDataset(key, []);

    expect(getCachedNumericDataset(key)).toBeNull();
  });
});
