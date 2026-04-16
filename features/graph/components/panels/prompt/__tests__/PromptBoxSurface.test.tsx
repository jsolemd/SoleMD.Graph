/**
 * @jest-environment jsdom
 */
import type { ComponentProps, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { getModeConfig } from "@/features/graph/lib/modes";
import { useDashboardStore } from "@/features/graph/stores";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { APP_CHROME_PX } from "@/lib/density";
import type { PromptBoxControllerState } from "../use-prompt-box-controller";
import { PromptBoxSurface } from "../PromptBoxSurface";

jest.mock("framer-motion", () => {
  const React = require("react");

  const MotionDiv = React.forwardRef(
    (
      {
        children,
        className,
        style,
        role,
        tabIndex,
        onClick,
        onKeyDown,
        onPointerDown,
        "aria-hidden": ariaHidden,
      }: {
        children?: ReactNode;
        className?: string;
        style?: React.CSSProperties;
        role?: string;
        tabIndex?: number;
        onClick?: () => void;
        onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
        onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
        "aria-hidden"?: boolean;
      },
      ref: React.Ref<HTMLDivElement>,
    ) => (
      <div
        ref={ref}
        className={className}
        style={style}
        role={role}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        aria-hidden={ariaHidden}
      >
        {children}
      </div>
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

const mockedCreateEditor = jest.fn(() => <div data-testid="create-editor" />);

jest.mock("../../CreateEditor", () => ({
  CreateEditor: (props: unknown) => mockedCreateEditor(props),
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
    referenceMentionSource: {
      getItems: jest.fn(async () => []),
    },
    handlePromptInteraction: jest.fn(),
    handleShowEntityOnGraph: jest.fn(),
    handleOpenEntityInWiki: jest.fn(),
    clearRag: jest.fn(),
    handlePromptContentChange: jest.fn(),
    handlePromptEmptyChange: jest.fn(),
    handleToggleFormattingTools: jest.fn(),
    handleToggleSelectionScope: jest.fn(),
    stepPromptUp: jest.fn(),
    stepPromptDown: jest.fn(),
    handlePillClick: jest.fn(),
    handlePillKeyDown: jest.fn(),
    editorRef: { current: null },
    cardRef: { current: null },
    dragX: motionValue(0),
    dragY: motionValue(0),
    cardHeight: motionValue(320),
    heightOverride: false,
    isFullHeightMode: false,
    normalWidth: "480px",
    ...overrides,
  };

  return {
    ...controllerState,
    placeholder: null,
  };
}

describe("PromptBoxSurface", () => {
  beforeEach(() => {
    mockedCreateEditor.mockClear();
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

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

  it("threads explicit entity graph actions through CreateEditor instead of deriving refs locally", () => {
    const handleShowEntityOnGraph = jest.fn();
    const handleOpenEntityInWiki = jest.fn();

    render(
      <PromptBoxSurface
        {...createProps({ handleShowEntityOnGraph, handleOpenEntityInWiki })}
      />,
    );

    expect(mockedCreateEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        onShowEntityOnGraph: handleShowEntityOnGraph,
        onOpenEntityInWiki: handleOpenEntityInWiki,
      }),
    );
  });

  it("keeps the expanded editor wrapper overflow-visible so hover and mention overlays are not clipped", () => {
    render(<PromptBoxSurface {...createProps({ isCollapsed: false })} />);

    const editorShell = screen.getByTestId("create-editor").parentElement;

    expect(editorShell).not.toBeNull();
    expect((editorShell as HTMLDivElement).style.overflow).toBe("visible");
  });

  it("anchors the mobile prompt at the safe-area bottom edge", () => {
    const { container } = render(
      <ShellVariantProvider value="mobile">
        <PromptBoxSurface {...createProps()} />
      </ShellVariantProvider>,
    );

    const shell = container.firstElementChild as HTMLDivElement;

    expect(shell.style.bottom).toContain("safe-area-inset-bottom");
    expect(shell.style.bottom).toContain(`${APP_CHROME_PX.edgeMargin}px`);
  });

  it("keeps the mobile prompt on the safe bottom lane in full-height modes", () => {
    const { container } = render(
      <ShellVariantProvider value="mobile">
        <PromptBoxSurface {...createProps({ isFullHeightMode: true })} />
      </ShellVariantProvider>,
    );

    const shell = container.firstElementChild as HTMLDivElement;

    expect(shell.style.bottom).toContain("safe-area-inset-bottom");
    expect(shell.style.bottom).toContain(`${APP_CHROME_PX.edgeMargin}px`);
  });
});
