import {
  MOBILE_SHELL_MAX_WIDTH,
  resolveShellVariant,
} from "../use-shell-variant";

describe("resolveShellVariant", () => {
  it("keeps hover-capable desktop windows on the desktop shell even when narrow", () => {
    expect(
      resolveShellVariant({
        hasCoarsePointer: false,
        hasHover: true,
        viewportWidth: 640,
      }),
    ).toBe("desktop");
  });

  it("keeps resized desktop windows on desktop when the pointer is fine", () => {
    expect(
      resolveShellVariant({
        hasCoarsePointer: false,
        hasHover: true,
        viewportWidth: MOBILE_SHELL_MAX_WIDTH - 120,
      }),
    ).toBe("desktop");
  });

  it("uses mobile for coarse-pointer widths inside the mobile shell breakpoint", () => {
    expect(
      resolveShellVariant({
        hasCoarsePointer: true,
        hasHover: false,
        viewportWidth: MOBILE_SHELL_MAX_WIDTH - 40,
      }),
    ).toBe("mobile");
  });

  it("uses mobile when the surface cannot hover inside the mobile shell breakpoint", () => {
    expect(
      resolveShellVariant({
        hasCoarsePointer: false,
        hasHover: false,
        viewportWidth: MOBILE_SHELL_MAX_WIDTH - 40,
      }),
    ).toBe("mobile");
  });
});
