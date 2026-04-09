/**
 * @jest-environment jsdom
 */
import type { ComponentProps, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { getModeConfig } from "@/features/graph/lib/modes";
import type { PromptBoxControllerState } from "../use-prompt-box-controller";
import { PromptBoxSurface } from "../PromptBoxSurface";

jest.mock("framer-motion", () => {
  const React = require("react");

  const MotionDiv = React.forwardRef(
    ({ children, ..._props }: { children?: ReactNode }, ref: React.Ref<HTMLDivElement>) => (
      <div ref={ref}>{children}</div>
    ),
  );
  MotionDiv.displayName = "MotionDiv";

  const MotionButton = React.forwardRef(
    (
      {
        children,
        disabled,
        onClick,
        className,
        "aria-label": ariaLabel,
        "aria-pressed": ariaPressed,
      }: {
        children?: ReactNode;
        disabled?: boolean;
        onClick?: () => void;
        className?: string;
        "aria-label"?: string;
        "aria-pressed"?: boolean;
      },
      ref: React.Ref<HTMLButtonElement>,
    ) => (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
      >
        {children}
      </button>
    ),
  );
  MotionButton.displayName = "MotionButton";

  return {
    motion: {
      div: MotionDiv,
      button: MotionButton,
    },
    motionValue: (initial: number) => ({
      get: () => initial,
      set: () => undefined,
    }),
  };
});

import { motionValue } from "framer-motion";

jest.mock("@mantine/core", () => {
  const actual = jest.requireActual("@mantine/core");

  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

jest.mock("../../../chrome/ModeToggleBar", () => ({
  ModeToggleBar: () => <div data-testid="mode-toggle-bar" />,
}));

jest.mock("../../CreateEditor", () => ({
  CreateEditor: () => <div data-testid="create-editor" />,
}));

function createProps(
  overrides: Partial<PromptBoxControllerState> = {},
): ComponentProps<typeof PromptBoxSurface> {
  const controllerState: PromptBoxControllerState = {
    mode: "ask",
    activeMode: getModeConfig("ask"),
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
    selectionScopeToggleLabel:
      "Select papers on the graph or narrow the current view to enable selection scope",
    selectedNode: null,
    selectedScopeLabel: null,
    typewriterText: "",
    typewriterIsLast: false,
    ragResponse: null,
    streamedAskAnswer: null,
    ragError: null,
    ragSession: null,
    ragGraphAvailability: null,
    isSubmitting: false,
    handleSubmit: jest.fn(),
    promptInteractionProviders: [],
    handlePromptInteraction: jest.fn(),
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
    dragControls: {} as PromptBoxControllerState["dragControls"],
    dragX: motionValue(0),
    dragY: motionValue(0),
    cardHeight: motionValue(320),
    heightOverride: false,
    isFullHeightMode: false,
    isOffset: false,
    normalWidth: "480px",
    ...overrides,
  };

  return {
    ...controllerState,
    placeholder: null,
  };
}

describe("PromptBoxSurface", () => {
  it("enables submit from the canonical hasInput signal even when markdown mirroring is empty", () => {
    render(<PromptBoxSurface {...createProps({ hasInput: true, activePromptValue: "" })} />);

    const submitButton = screen.getByRole("button", { name: "Submit prompt" });

    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps submit disabled when hasInput is false even if a stale mirrored value exists", () => {
    render(
      <PromptBoxSurface
        {...createProps({
          hasInput: false,
          activePromptValue: "stale mirrored markdown",
        })}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Submit prompt" });

    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
  });
});
