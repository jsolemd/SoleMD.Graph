/**
 * @jest-environment jsdom
 */
jest.mock("@/features/graph/tiptap", () => ({
  Decoration: {},
  DecorationSet: { create: jest.fn(), empty: {} },
  Extension: { create: jest.fn() },
  Plugin: jest.fn(),
  PluginKey: jest.fn().mockImplementation(() => ({ getState: jest.fn() })),
}));

import { resolveEntityHighlightElement } from "../entity-highlight-extension";

describe("entity-highlight-extension", () => {
  it("resolves highlighted spans when the event target is the inline element", () => {
    document.body.innerHTML = `
      <span data-entity-highlight-id="entity-1" class="tiptap-entity-highlight">
        schizophrenia
      </span>
    `;

    const element = document.querySelector(
      "[data-entity-highlight-id='entity-1']",
    );

    expect(resolveEntityHighlightElement(element)).toBe(element);
  });

  it("resolves highlighted spans when the browser reports a text node target", () => {
    document.body.innerHTML = `
      <span data-entity-highlight-id="entity-1" class="tiptap-entity-highlight">
        schizophrenia
      </span>
    `;

    const textNode =
      document.querySelector("[data-entity-highlight-id='entity-1']")?.firstChild ??
      null;

    expect(resolveEntityHighlightElement(textNode)).toBeInstanceOf(HTMLElement);
    expect(
      resolveEntityHighlightElement(textNode)?.getAttribute(
        "data-entity-highlight-id",
      ),
    ).toBe("entity-1");
  });
});
