/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MantineProvider } from "@mantine/core";
import { PromptBoxSurface } from "../PromptBoxSurface";

jest.mock("framer-motion", () => {
  const React = require("react");
  const sanitizeProps = (props: Record<string, unknown>) => {
    const {
      whileHover: _whileHover,
      whileTap: _whileTap,
      transition: _transition,
      initial: _initial,
      drag: _drag,
      dragControls: _dragControls,
      dragListener: _dragListener,
      dragMomentum: _dragMomentum,
      dragElastic: _dragElastic,
      ...rest
    } = props;

    return rest;
  };

  return {
    motion: {
      div: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) =>
        React.createElement("div", { ...sanitizeProps(props), ref }),
      ),
      button: React.forwardRef(
        (props: Record<string, unknown>, ref: React.Ref<HTMLButtonElement>) =>
          React.createElement("button", { ...sanitizeProps(props), ref }),
      ),
    },
  };
});

jest.mock("../../CreateEditor", () => ({
  CreateEditor: () => <div data-testid="create-editor" />,
}));

jest.mock("../../../chrome/ModeToggleBar", () => ({
  ModeToggleBar: () => <div data-testid="mode-toggle-bar" />,
}));

jest.mock("../RagResponsePanel", () => ({
  RagResponsePanel: () => <div data-testid="rag-response-panel" />,
}));

function createProps(
  overrides: Partial<ComponentProps<typeof PromptBoxSurface>> = {},
): ComponentProps<typeof PromptBoxSurface> {
  return {
    mode: "ask",
    activeMode: {
      key: "ask",
      label: "Ask",
      accent: "var(--mode-accent)",
      accentSubtle: "var(--mode-accent-subtle)",
      accentBorder: "var(--mode-accent-border)",
    },
    isCreate: false,
    isAsk: true,
    isCollapsed: false,
    isMaximized: false,
    isCreateMaximized: false,
    activePromptValue: "",
    hasInput: false,
    showFormattingTools: false,
    selectionScopeAvailable: false,
    selectionOnlyEnabled: false,
    selectionScopeToggleLabel: "Scope to selection",
    selectedNode: null,
    selectedScopeLabel: null,
    typewriterText: "Ask with the graph",
    typewriterIsLast: false,
    ragResponse: null,
    streamedAskAnswer: null,
    ragError: null,
    ragSession: null,
    ragGraphAvailability: null,
    ragInteractionTrace: null,
    isSubmitting: false,
    handleSubmit: jest.fn(),
    runEvidenceAssistQuery: jest.fn(),
    clearRag: jest.fn(),
    handlePromptContentChange: jest.fn(),
    handlePromptEmptyChange: jest.fn(),
    handleToggleFormattingTools: jest.fn(),
    handleToggleSelectionScope: jest.fn(),
    stepPromptUp: jest.fn(),
    stepPromptDown: jest.fn(),
    handlePillClick: jest.fn(),
    handlePillKeyDown: jest.fn(),
    handleDragStart: jest.fn(),
    handleDragEnd: jest.fn(),
    handleRecenter: jest.fn(),
    editorRef: { current: null },
    cardRef: { current: null },
    dragControls: {} as never,
    dragX: { get: () => 0 } as never,
    dragY: { get: () => 0 } as never,
    cardHeight: {} as never,
    heightOverride: false,
    isFullHeightMode: false,
    isOffset: false,
    normalWidth: "520px",
    placeholder: null,
    ...overrides,
  };
}

describe("PromptBoxSurface", () => {
  it("enables ask submit from input presence instead of mirrored ask text state", () => {
    render(
      <MantineProvider>
        <PromptBoxSurface
          {...createProps({
            hasInput: true,
            activePromptValue: "",
          })}
        />
      </MantineProvider>,
    );

    expect(
      (screen.getByRole("button", { name: "Submit prompt" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
