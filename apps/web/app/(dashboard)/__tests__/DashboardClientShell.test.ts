import { resolveFieldMode } from "../DashboardClientShell";

describe("resolveFieldMode", () => {
  it("returns 'orb' on /graph in 3d mode", () => {
    expect(resolveFieldMode("/graph", "3d")).toBe("orb");
  });

  it("returns 'landing' on /graph when toggled to 2d", () => {
    expect(resolveFieldMode("/graph", "2d")).toBe("landing");
  });

  it("returns 'landing' on / regardless of renderer mode", () => {
    expect(resolveFieldMode("/", "3d")).toBe("landing");
    expect(resolveFieldMode("/", "2d")).toBe("landing");
  });

  it("returns 'landing' when pathname is null (initial SSR render)", () => {
    expect(resolveFieldMode(null, "3d")).toBe("landing");
    expect(resolveFieldMode(null, "2d")).toBe("landing");
  });
});
