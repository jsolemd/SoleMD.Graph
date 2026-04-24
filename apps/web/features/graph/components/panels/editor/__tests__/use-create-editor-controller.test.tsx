/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";

// Mock the tiptap adapter barrel BEFORE importing the hook.
const mockEditor: {
  isEmpty: boolean;
  isDestroyed: boolean;
  getMarkdown: jest.Mock;
  getText: jest.Mock;
  commands: { focus: jest.Mock; setContent: jest.Mock };
  can: jest.Mock;
  isActive: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  storage: { markdown: { manager: { parse: jest.Mock } } };
} = {
  isEmpty: true,
  isDestroyed: false,
  getMarkdown: jest.fn(() => ""),
  getText: jest.fn(() => ""),
  commands: {
    focus: jest.fn(),
    setContent: jest.fn(),
  },
  can: jest.fn(() => ({ chain: () => ({ focus: () => ({
    toggleBold: () => ({ run: () => false }),
    toggleItalic: () => ({ run: () => false }),
    toggleStrike: () => ({ run: () => false }),
    toggleBulletList: () => ({ run: () => false }),
    toggleOrderedList: () => ({ run: () => false }),
    toggleBlockquote: () => ({ run: () => false }),
    toggleCode: () => ({ run: () => false }),
    toggleCodeBlock: () => ({ run: () => false }),
    setHorizontalRule: () => ({ run: () => false }),
    undo: () => ({ run: () => false }),
    redo: () => ({ run: () => false }),
  }) }) })),
  isActive: jest.fn(() => false),
  on: jest.fn(),
  off: jest.fn(),
  storage: { markdown: { manager: { parse: jest.fn(() => ({})) } } },
};

const mockUseEditor = jest.fn(() => mockEditor);

jest.mock("@/features/graph/tiptap", () => ({
  Extension: { create: jest.fn(() => ({})) },
  Markdown: {},
  StarterKit: { configure: jest.fn(() => ({})) },
  useEditor: (...args: unknown[]) => mockUseEditor(...args),
  useEditorState: jest.fn(() => null),
}));

jest.mock("../entity-highlight-extension", () => ({
  clearEntityHighlights: jest.fn(),
  createEntityHighlightExtension: jest.fn(() => ({})),
  setEntityHighlights: jest.fn(),
}));

jest.mock("../prompt-interaction-extension", () => ({
  createPromptInteractionExtension: jest.fn(() => ({})),
}));

jest.mock("../reference-mention-extension", () => ({
  createReferenceMentionExtension: jest.fn(() => ({})),
}));

jest.mock("../use-editor-entity-runtime", () => ({
  useEditorEntityRuntime: () => ({
    entityHighlights: [],
    handleEntityHoverChange: jest.fn(),
    handleTextContextChange: jest.fn(),
  }),
}));

jest.mock("../editor-text-context", () => ({
  readEditorTextContext: jest.fn(() => null),
}));

import { useCreateEditorController } from "../use-create-editor-controller";

describe("useCreateEditorController", () => {
  beforeEach(() => {
    mockUseEditor.mockClear();
  });

  it("captures the Tiptap editor instance after commit (no render-time ref mutation)", () => {
    // Regression guard: the hook previously did `editorRef.current = editor`
    // during the render body. React 19 may discard render output on
    // concurrent-render retries, silently losing the assignment. The fix
    // moves the capture into a useLayoutEffect.
    const { result } = renderHook(() =>
      useCreateEditorController({
        content: "",
        onContentChange: jest.fn(),
        onEmptyChange: jest.fn(),
        ariaLabel: "Prompt",
      }),
    );

    // After commit, `flush()` should route through the captured editor
    // (i.e., through `editorRef.current.getMarkdown()`), proving the ref
    // was written from the layout effect, not dropped during concurrent
    // render retry.
    mockEditor.getMarkdown.mockReturnValueOnce("captured-markdown");
    const flushed = result.current.flush();
    expect(flushed).toBe("captured-markdown");
    expect(mockEditor.getMarkdown).toHaveBeenCalled();
  });

  it("keeps the editor reference stable across rerenders with new callbacks", () => {
    const { result, rerender } = renderHook(
      ({ onContentChange }: { onContentChange: () => void }) =>
        useCreateEditorController({
          content: "",
          onContentChange,
          onEmptyChange: jest.fn(),
          ariaLabel: "Prompt",
        }),
      { initialProps: { onContentChange: jest.fn() } },
    );

    const firstEditor = result.current.editor;

    // Swap the callback prop — the editor-instance ref should continue to
    // point at the same Tiptap editor.
    rerender({ onContentChange: jest.fn() });

    expect(result.current.editor).toBe(firstEditor);

    mockEditor.getText.mockReturnValueOnce("hello world");
    expect(result.current.getText()).toBe("hello world");
  });
});
