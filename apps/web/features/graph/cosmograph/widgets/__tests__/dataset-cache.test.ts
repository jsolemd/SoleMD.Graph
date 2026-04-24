import {
  WIDGET_DATASET_CACHE_MAX,
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

describe("dataset cache bounds", () => {
  it("evicts the oldest categorical entry once the cache exceeds its bound", () => {
    const overflow = WIDGET_DATASET_CACHE_MAX + 10;

    for (let i = 0; i < overflow; i++) {
      setCachedCategoricalDataset(`bound-cat:${i}`, [
        { value: `v${i}`, scopedCount: 1, totalCount: 1 },
      ]);
    }

    // Oldest entries should be evicted (FIFO by insertion order).
    for (let i = 0; i < overflow - WIDGET_DATASET_CACHE_MAX; i++) {
      expect(getCachedCategoricalDataset(`bound-cat:${i}`)).toBeNull();
    }
    // Most recent entries should survive.
    for (let i = overflow - WIDGET_DATASET_CACHE_MAX; i < overflow; i++) {
      expect(getCachedCategoricalDataset(`bound-cat:${i}`)).not.toBeNull();
    }
  });

  it("evicts the oldest numeric entry once the cache exceeds its bound", () => {
    const overflow = WIDGET_DATASET_CACHE_MAX + 5;

    for (let i = 0; i < overflow; i++) {
      setCachedNumericDataset(`bound-num:${i}`, [i]);
    }

    // Oldest evicted, newest retained — LRU by insertion.
    expect(getCachedNumericDataset("bound-num:0")).toBeNull();
    expect(getCachedNumericDataset(`bound-num:${overflow - 1}`)).toEqual([
      overflow - 1,
    ]);
  });
});
