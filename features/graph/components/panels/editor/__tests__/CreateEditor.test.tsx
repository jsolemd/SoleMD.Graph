/**
 * @jest-environment jsdom
 */
import type { ComponentProps, ReactNode } from "react";
import { render } from "@testing-library/react";
import type { CreateEditorControllerState } from "../use-create-editor-controller";
import { useCreateEditorController } from "../use-create-editor-controller";
import { CreateEditorSurface } from "../CreateEditorSurface";
import { CreateEditor } from "../../CreateEditor";

jest.mock("../use-create-editor-controller", () => ({
  useCreateEditorController: jest.fn(),
}));

jest.mock("../CreateEditorSurface", () => ({
  CreateEditorSurface: jest.fn(() => <div data-testid="create-editor-surface" />),
}));

const mockedUseCreateEditorController =
  useCreateEditorController as jest.MockedFunction<typeof useCreateEditorController>;
const mockedCreateEditorSurface =
  CreateEditorSurface as jest.MockedFunction<typeof CreateEditorSurface>;

function createControllerState(): CreateEditorControllerState {
  return {
    editor: { commands: { focus: jest.fn() } } as never,
    toolbarState: {
      isParagraph: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isBold: false,
      canBold: false,
      isItalic: false,
      canItalic: false,
      isStrike: false,
      canStrike: false,
      isBulletList: false,
      canBulletList: false,
      isOrderedList: false,
      canOrderedList: false,
      isBlockquote: false,
      canBlockquote: false,
      isCode: false,
      canCode: false,
      isCodeBlock: false,
      canCodeBlock: false,
      canHorizontalRule: false,
      canUndo: false,
      canRedo: false,
    },
    sourceMode: false,
    setSourceMode: jest.fn(),
    sourceText: "",
    editorFrameRef: { current: null },
    promptInteractionMenuRef: { current: null },
    promptInteractionMenu: null,
    referenceMentionMenu: null,
    entityHoverCard: null,
    closePromptInteractionMenu: jest.fn(),
    handlePromptInteractionMenuHover: jest.fn(),
    handlePromptInteractionMenuKeyDown: jest.fn(),
    handleSourceTextChange: jest.fn(),
    submitPromptInteractionCommand: jest.fn(),
    flush: jest.fn(() => ""),
    getText: jest.fn(() => ""),
  };
}

function createProps(overrides: Partial<ComponentProps<typeof CreateEditor>> = {}) {
  return {
    content: "",
    onContentChange: jest.fn(),
    onEmptyChange: jest.fn(),
    ariaLabel: "Ask prompt",
    compact: false,
    showToolbar: false,
    placeholder: undefined as ReactNode | undefined,
    ...overrides,
  };
}

describe("CreateEditor", () => {
  beforeEach(() => {
    mockedUseCreateEditorController.mockReset();
    mockedCreateEditorSurface.mockClear();
    mockedUseCreateEditorController.mockReturnValue(createControllerState());
  });

  it("keeps the editor subtree isolated when parent props are unchanged", () => {
    const props = createProps();
    const { rerender } = render(<CreateEditor {...props} />);

    expect(mockedUseCreateEditorController).toHaveBeenCalledTimes(1);
    expect(mockedCreateEditorSurface).toHaveBeenCalledTimes(1);

    rerender(<CreateEditor {...props} />);

    expect(mockedUseCreateEditorController).toHaveBeenCalledTimes(1);
    expect(mockedCreateEditorSurface).toHaveBeenCalledTimes(1);
  });

  it("rerenders when editor-facing props change", () => {
    const props = createProps();
    const { rerender } = render(<CreateEditor {...props} />);

    rerender(<CreateEditor {...props} content="Updated prompt" />);

    expect(mockedUseCreateEditorController).toHaveBeenCalledTimes(2);
    expect(mockedCreateEditorSurface).toHaveBeenCalledTimes(2);
  });
});
