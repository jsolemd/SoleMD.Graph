import { getCurrentPageColor } from "@/lib/utils";

describe("getCurrentPageColor", () => {
  it("returns the correct color for known routes", () => {
    expect(getCurrentPageColor("/"))
      .toBe("var(--color-soft-blue)");
    expect(getCurrentPageColor("/about"))
      .toBe("var(--color-soft-lavender)");
    expect(getCurrentPageColor("/research"))
      .toBe("var(--color-warm-coral)");
    expect(getCurrentPageColor("/education"))
      .toBe("var(--color-fresh-green)");
    expect(getCurrentPageColor("/wiki"))
      .toBe("var(--color-golden-yellow)");
  });

  it("returns the default color for unknown routes", () => {
    expect(getCurrentPageColor("/unknown"))
      .toBe("var(--color-soft-blue)");
  });
});
