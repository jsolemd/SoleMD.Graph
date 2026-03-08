import { formatNumber, clamp } from "@/lib/utils";

describe("formatNumber", () => {
  it("formats numbers with locale separators", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("clamp", () => {
  it("clamps values to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
