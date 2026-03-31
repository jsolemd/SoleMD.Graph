import {
  resolveGraphContentContrastLevel,
  resolveGraphControlContrastLevel,
} from "../control-contrast";

describe("control-contrast", () => {
  it("treats dynamic labels as the densest graph-content signal", () => {
    expect(
      resolveGraphContentContrastLevel({
        showLabels: true,
        showDynamicLabels: true,
        showTopLabels: true,
      }),
    ).toBe(2);
  });

  it("treats static labels as a medium graph-content signal", () => {
    expect(
      resolveGraphContentContrastLevel({
        showLabels: true,
        showDynamicLabels: false,
        showTopLabels: false,
      }),
    ).toBe(1);
  });

  it("promotes focused points above all other contrast signals", () => {
    expect(
      resolveGraphControlContrastLevel({
        graphContentContrastLevel: 1,
        hasFocusedPoint: true,
        hasSelection: true,
      }),
    ).toBe(2);
  });

  it("uses selection as a medium contrast bump when the graph is otherwise calm", () => {
    expect(
      resolveGraphControlContrastLevel({
        graphContentContrastLevel: 0,
        hasFocusedPoint: false,
        hasSelection: true,
      }),
    ).toBe(1);
  });
});
