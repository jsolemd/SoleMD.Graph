/**
 * @jest-environment jsdom
 */

import {
  isGraphKeyboardEditableTarget,
  shouldSkipGraphKeyboardShortcut,
} from "../graph-keyboard-guards";

describe("shouldSkipGraphKeyboardShortcut", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("skips native form controls", () => {
    for (const tag of ["input", "textarea", "select", "button"]) {
      const element = document.createElement(tag);
      document.body.appendChild(element);
      expect(shouldSkipGraphKeyboardShortcut(element)).toBe(true);
    }
  });

  it("treats text inputs as editable but not focused buttons", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");

    expect(isGraphKeyboardEditableTarget(input)).toBe(true);
    expect(isGraphKeyboardEditableTarget(button)).toBe(false);
  });

  it("skips editable and ARIA text/button controls", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const roleTextbox = document.createElement("div");
    roleTextbox.setAttribute("role", "textbox");
    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");

    expect(shouldSkipGraphKeyboardShortcut(editable)).toBe(true);
    expect(shouldSkipGraphKeyboardShortcut(roleTextbox)).toBe(true);
    expect(shouldSkipGraphKeyboardShortcut(roleButton)).toBe(true);
  });

  it("allows ordinary graph surface focus", () => {
    const surface = document.createElement("div");
    expect(shouldSkipGraphKeyboardShortcut(surface)).toBe(false);
    expect(shouldSkipGraphKeyboardShortcut(null)).toBe(false);
  });
});
