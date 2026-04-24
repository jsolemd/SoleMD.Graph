import {
  HIDDEN_CLUSTER_LABEL_CLASS_NAME,
  NATIVE_COSMOGRAPH_LABEL_THEME_CSS,
  resolveClusterLabelClassName,
} from "../label-appearance";

describe("resolveClusterLabelClassName", () => {
  it("returns empty className for normal labels", () => {
    expect(resolveClusterLabelClassName("Neurology")).toBe("");
    expect(resolveClusterLabelClassName("  Spaces  ")).toBe("");
  });

  it("returns the hidden className for empty / placeholder labels", () => {
    expect(resolveClusterLabelClassName("")).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
    expect(resolveClusterLabelClassName("   ")).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
    expect(resolveClusterLabelClassName("null")).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
    expect(resolveClusterLabelClassName("NULL")).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
    expect(resolveClusterLabelClassName("undefined")).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
  });

  it("handles null / undefined input without throwing", () => {
    expect(resolveClusterLabelClassName(null)).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
    expect(resolveClusterLabelClassName(undefined)).toBe(HIDDEN_CLUSTER_LABEL_CLASS_NAME);
  });

  it("never returns a raw CSS declaration where a className is expected", () => {
    const outputs = ["", "  ", "null", "undefined", "Real Label"].map(
      resolveClusterLabelClassName,
    );
    for (const className of outputs) {
      expect(className).not.toMatch(/[:;]/);
    }
  });
});

describe("NATIVE_COSMOGRAPH_LABEL_THEME_CSS", () => {
  it("hides labels marked with the hidden className", () => {
    expect(NATIVE_COSMOGRAPH_LABEL_THEME_CSS).toContain(
      `.${HIDDEN_CLUSTER_LABEL_CLASS_NAME}`,
    );
    expect(NATIVE_COSMOGRAPH_LABEL_THEME_CSS).toMatch(/display:\s*none/);
  });
});
