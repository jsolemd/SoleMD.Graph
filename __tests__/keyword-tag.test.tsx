import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordTag } from "@/components/ui/keyword-tag";
import { MantineProvider } from "@mantine/core";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, whileHover, whileTap, ...props }: any) => (
      <span data-motion="true" {...props}>
        {children}
      </span>
    ),
  },
}));

/**
 * Test wrapper with Mantine provider
 */
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("KeywordTag Component", () => {
  describe("Basic Rendering", () => {
    it("renders text content correctly", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Test Tag" />
        </TestWrapper>
      );

      expect(screen.getByText("Test Tag")).toBeInTheDocument();
    });

    it("applies default props when none provided", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Default Tag" />
        </TestWrapper>
      );

      const tag = screen.getByText("Default Tag");
      expect(tag).toBeInTheDocument();
      // Default color should be purple, size should be md
    });

    it("forwards ref correctly", () => {
      const ref = { current: null };

      render(
        <TestWrapper>
          <KeywordTag ref={ref} text="Ref Test" />
        </TestWrapper>
      );

      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("Color Variants", () => {
    const colors = [
      "teal",
      "purple",
      "blue",
      "green",
      "orange",
      "cyan",
    ] as const;

    colors.forEach((color) => {
      it(`renders with ${color} color correctly`, () => {
        render(
          <TestWrapper>
            <KeywordTag text={`${color} tag`} color={color} />
          </TestWrapper>
        );

        const tag = screen.getByText(`${color} tag`);
        expect(tag).toBeInTheDocument();
      });
    });
  });

  describe("Size Variants", () => {
    it("renders with small size", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Small Tag" size="sm" />
        </TestWrapper>
      );

      const tag = screen.getByText("Small Tag");
      expect(tag).toBeInTheDocument();
    });

    it("renders with medium size (default)", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Medium Tag" size="md" />
        </TestWrapper>
      );

      const tag = screen.getByText("Medium Tag");
      expect(tag).toBeInTheDocument();
    });
  });

  describe("Border Variant", () => {
    it("renders without border by default", () => {
      render(
        <TestWrapper>
          <KeywordTag text="No Border" />
        </TestWrapper>
      );

      const tag = screen.getByText("No Border");
      expect(tag).toBeInTheDocument();
    });

    it("renders with border when withBorder is true", () => {
      render(
        <TestWrapper>
          <KeywordTag text="With Border" withBorder />
        </TestWrapper>
      );

      const tag = screen.getByText("With Border");
      expect(tag).toBeInTheDocument();
    });
  });

  describe("Hover Effects", () => {
    it("wraps with motion.span when hoverEffects is true", () => {
      const { container } = render(
        <TestWrapper>
          <KeywordTag text="Hover Effects" hoverEffects />
        </TestWrapper>
      );

      const motionSpan = container.querySelector("span[data-motion='true']");
      expect(motionSpan).toBeInTheDocument();
    });

    it("does not wrap with motion.span when hoverEffects is false", () => {
      const { container } = render(
        <TestWrapper>
          <KeywordTag text="No Hover Effects" hoverEffects={false} />
        </TestWrapper>
      );

      const motionSpan = container.querySelector("span[data-motion='true']");
      expect(motionSpan).not.toBeInTheDocument();
    });
  });

  describe("Interactive Behavior", () => {
    it("handles click events when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag text="Clickable Tag" onClick={handleClick} />
        </TestWrapper>
      );

      const tag = screen.getByText("Clickable Tag");
      fireEvent.click(tag);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("handles keyboard events (Enter) when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag text="Keyboard Tag" onClick={handleClick} />
        </TestWrapper>
      );

      const tag = screen.getByText("Keyboard Tag");
      fireEvent.keyDown(tag, { key: "Enter" });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("handles keyboard events (Space) when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag text="Space Tag" onClick={handleClick} />
        </TestWrapper>
      );

      const tag = screen.getByText("Space Tag");
      fireEvent.keyDown(tag, { key: " " });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not handle keyboard events for non-interactive keys", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag text="Non-interactive Tag" onClick={handleClick} />
        </TestWrapper>
      );

      const tag = screen.getByText("Non-interactive Tag");
      fireEvent.keyDown(tag, { key: "Tab" });

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("sets proper ARIA attributes for interactive tags", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag text="Interactive Tag" onClick={handleClick} />
        </TestWrapper>
      );

      const tag = screen.getByText("Interactive Tag");
      expect(tag).toHaveAttribute("role", "button");
      expect(tag).toHaveAttribute("tabIndex", "0");
    });

    it("does not set interactive ARIA attributes for non-interactive tags", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Non-interactive Tag" />
        </TestWrapper>
      );

      const tag = screen.getByText("Non-interactive Tag");
      expect(tag).not.toHaveAttribute("role");
      expect(tag).not.toHaveAttribute("tabIndex");
    });

    it("uses text as default aria-label", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Default Label" />
        </TestWrapper>
      );

      const tag = screen.getByLabelText("Default Label");
      expect(tag).toBeInTheDocument();
    });

    it("uses custom aria-label when provided", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Tag Text" aria-label="Custom Label" />
        </TestWrapper>
      );

      const tag = screen.getByLabelText("Custom Label");
      expect(tag).toBeInTheDocument();
      expect(tag).toHaveTextContent("Tag Text");
    });
  });

  describe("Custom Props", () => {
    it("accepts custom className", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Custom Class" className="custom-class" />
        </TestWrapper>
      );

      const tag = screen.getByText("Custom Class");
      expect(tag).toHaveClass("custom-class");
    });

    it("spreads additional props correctly", () => {
      render(
        <TestWrapper>
          <KeywordTag text="Custom Props" data-testid="custom-prop-tag" />
        </TestWrapper>
      );

      const tag = screen.getByTestId("custom-prop-tag");
      expect(tag).toBeInTheDocument();
      expect(tag).toHaveTextContent("Custom Props");
    });
  });

  describe("Text Content", () => {
    it("renders different text content correctly", () => {
      const testTexts = [
        "Short",
        "Medium Length Tag",
        "Very Long Tag Text That Should Still Render Properly",
        "Special-Characters_123!@#",
      ];

      testTexts.forEach((text) => {
        const { rerender } = render(
          <TestWrapper>
            <KeywordTag text={text} />
          </TestWrapper>
        );

        expect(screen.getByText(text)).toBeInTheDocument();
      });
    });

    it("handles empty text gracefully", () => {
      render(
        <TestWrapper>
          <KeywordTag text="" />
        </TestWrapper>
      );

      // Should render but be empty
      const tag = screen.getByLabelText("");
      expect(tag).toBeInTheDocument();
      expect(tag).toHaveTextContent("");
    });
  });

  describe("Combined Props", () => {
    it("renders correctly with all props combined", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <KeywordTag
            text="Full Featured Tag"
            color="teal"
            size="sm"
            withBorder
            hoverEffects
            onClick={handleClick}
            className="full-featured"
            aria-label="Fully featured tag"
          />
        </TestWrapper>
      );

      const tag = screen.getByLabelText("Fully featured tag");
      expect(tag).toBeInTheDocument();
      expect(tag).toHaveTextContent("Full Featured Tag");
      expect(tag).toHaveClass("full-featured");
      expect(tag).toHaveAttribute("role", "button");

      fireEvent.click(tag);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
