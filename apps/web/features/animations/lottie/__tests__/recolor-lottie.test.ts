import { recolorLottie, type LottieRgba } from "../recolor-lottie";

function buildFixture() {
  return {
    v: "5.7.1",
    assets: [
      {
        layers: [
          {
            ty: 4,
            shapes: [
              { ty: "fl", c: { a: 0, k: [0.05, 0.05, 0.05, 1] } },
              { ty: "st", c: { a: 0, k: [0.9, 0.9, 0.9, 1] } },
            ],
          },
        ],
      },
    ],
    layers: [
      {
        ty: 4,
        shapes: [
          {
            ty: "gr",
            it: [{ ty: "fl", c: { a: 0, k: [0.02, 0.02, 0.02, 1] } }],
          },
        ],
      },
    ],
  };
}

describe("recolorLottie clone cache", () => {
  it("clones once per (source, color) and reuses the clone on identical inputs", () => {
    const spy = jest.spyOn(globalThis, "structuredClone");
    spy.mockClear();

    const source = buildFixture();
    const rgbaA: LottieRgba = [0.4, 0.6, 1, 1];
    // A fresh tuple with identical values — simulates `resolveCssColor`
    // returning a new reference per call while CSS vars are unchanged.
    const rgbaB: LottieRgba = [0.4, 0.6, 1, 1];

    const first = recolorLottie(source, rgbaA);
    const second = recolorLottie(source, rgbaB);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    spy.mockRestore();
  });

  it("re-clones when the resolved color actually changes", () => {
    const spy = jest.spyOn(globalThis, "structuredClone");
    spy.mockClear();

    const source = buildFixture();
    const light: LottieRgba = [0.1, 0.1, 0.1, 1];
    const dark: LottieRgba = [0.9, 0.9, 0.9, 1];

    recolorLottie(source, light);
    recolorLottie(source, dark);

    expect(spy).toHaveBeenCalledTimes(2);

    // Cache hits after the color flips back — still no extra clones.
    recolorLottie(source, light);
    recolorLottie(source, dark);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it("keeps per-source isolation — two source JSONs do not share clones", () => {
    const a = buildFixture();
    const b = buildFixture();
    const rgba: LottieRgba = [0.4, 0.6, 1, 1];

    const cloneA = recolorLottie(a, rgba);
    const cloneB = recolorLottie(b, rgba);

    expect(cloneA).not.toBe(cloneB);
  });

  it("still recolors dark shapes in the returned clone", () => {
    const source = buildFixture();
    const accent: LottieRgba = [0.25, 0.5, 0.75, 0.9];

    const out = recolorLottie(source, accent) as ReturnType<typeof buildFixture>;

    const darkFill = out.assets[0].layers[0].shapes[0];
    const lightStroke = out.assets[0].layers[0].shapes[1];
    expect(darkFill.c?.k).toEqual(accent);
    // darkOnly default preserves light shapes.
    expect(lightStroke.c?.k).toEqual([0.9, 0.9, 0.9, 1]);
  });
});
