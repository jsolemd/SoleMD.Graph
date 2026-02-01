import { render, screen, fireEvent } from "@testing-library/react";
import { Brain, Heart, Microscope } from "lucide-react";
import { FeatureIcon } from "@/components/ui/feature-icon";
import { MantineProvider } from "@mantine/core";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, whileHover, whileTap, ...props }: any) => (
      <div data-motion="true" {...props}>
        {children}
      </div>
    ),
  },
}));

/**
 * Test wrapper with Mantine provider
 */
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("FeatureIcon Component", () => {
  describe("Basic Rendering", () => {
    it("renders with Lucide icon correctly", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Brain} aria-label="Brain icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Brain icon");
      expect(iconContainer).toBeInTheDocument();
    });

    it("applies default props when none provided", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Heart} aria-label="Default icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Default icon");
      expect(iconContainer).toBeInTheDocument();
      // Default color should be purple, size should be md
    });

    it("forwards ref correctly", () => {
      const ref = { current: null };

      render(
        <TestWrapper>
          <FeatureIcon ref={ref} icon={Brain} aria-label="Ref test" />
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
            <FeatureIcon
              icon={Microscope}
              color={color}
              aria-label={`${color} icon`}
            />
          </TestWrapper>
        );

        const iconContainer = screen.getByLabelText(`${color} icon`);
        expect(iconContainer).toBeInTheDocument();
      });
    });
  });

  describe("Size Variants", () => {
    it("renders with small size", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Brain} size="sm" aria-label="Small icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Small icon");
      expect(iconContainer).toBeInTheDocument();
    });

    it("renders with medium size (default)", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Brain} size="md" aria-label="Medium icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Medium icon");
      expect(iconContainer).toBeInTheDocument();
    });

    it("renders with large size", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Brain} size="lg" aria-label="Large icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Large icon");
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe("Hover Effects", () => {
    it("wraps with motion.div when hoverEffects is true", () => {
      const { container } = render(
        <TestWrapper>
          <FeatureIcon
            icon={Heart}
            hoverEffects
            aria-label="Hover effects icon"
          />
        </TestWrapper>
      );

      const motionDiv = container.querySelector("div[data-motion='true']");
      expect(motionDiv).toBeInTheDocument();
    });

    it("does not wrap with motion.div when hoverEffects is false", () => {
      const { container } = render(
        <TestWrapper>
          <FeatureIcon
            icon={Heart}
            hoverEffects={false}
            aria-label="No hover effects icon"
          />
        </TestWrapper>
      );

      const motionDiv = container.querySelector("div[data-motion='true']");
      expect(motionDiv).not.toBeInTheDocument();
    });
  });

  describe("Interactive Behavior", () => {
    it("handles click events when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            onClick={handleClick}
            aria-label="Clickable icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Clickable icon");
      fireEvent.click(iconContainer);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("handles keyboard events (Enter) when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            onClick={handleClick}
            aria-label="Keyboard accessible icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Keyboard accessible icon");
      fireEvent.keyDown(iconContainer, { key: "Enter" });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("handles keyboard events (Space) when onClick is provided", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            onClick={handleClick}
            aria-label="Space accessible icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Space accessible icon");
      fireEvent.keyDown(iconContainer, { key: " " });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not handle keyboard events for non-interactive keys", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            onClick={handleClick}
            aria-label="Non-interactive key icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Non-interactive key icon");
      fireEvent.keyDown(iconContainer, { key: "Tab" });

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("sets proper ARIA attributes for interactive icons", () => {
      const handleClick = jest.fn();

      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            onClick={handleClick}
            aria-label="Interactive brain icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Interactive brain icon");
      expect(iconContainer).toHaveAttribute("role", "button");
      expect(iconContainer).toHaveAttribute("tabIndex", "0");
    });

    it("does not set interactive ARIA attributes for non-interactive icons", () => {
      render(
        <TestWrapper>
          <FeatureIcon icon={Brain} aria-label="Non-interactive brain icon" />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Non-interactive brain icon");
      expect(iconContainer).not.toHaveAttribute("role");
      expect(iconContainer).not.toHaveAttribute("tabIndex");
    });

    it("hides icon from screen readers with aria-hidden", () => {
      const { container } = render(
        <TestWrapper>
          <FeatureIcon icon={Brain} aria-label="Icon with hidden SVG" />
        </TestWrapper>
      );

      // The Lucide icon should have aria-hidden="true"
      const svgElement = container.querySelector("svg");
      expect(svgElement).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Custom Props", () => {
    it("accepts custom className", () => {
      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            className="custom-class"
            aria-label="Custom class icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByLabelText("Custom class icon");
      expect(iconContainer).toHaveClass("custom-class");
    });

    it("spreads additional props correctly", () => {
      render(
        <TestWrapper>
          <FeatureIcon
            icon={Brain}
            data-testid="custom-prop-icon"
            aria-label="Custom props icon"
          />
        </TestWrapper>
      );

      const iconContainer = screen.getByTestId("custom-prop-icon");
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe("Icon Integration", () => {
    it("renders different Lucide icons correctly", () => {
      const { rerender } = render(
        <TestWrapper>
          <FeatureIcon icon={Brain} aria-label="Brain icon" />
        </TestWrapper>
      );

      expect(screen.getByLabelText("Brain icon")).toBeInTheDocument();

      rerender(
        <TestWrapper>
          <FeatureIcon icon={Heart} aria-label="Heart icon" />
        </TestWrapper>
      );

      expect(screen.getByLabelText("Heart icon")).toBeInTheDocument();

      rerender(
        <TestWrapper>
          <FeatureIcon icon={Microscope} aria-label="Microscope icon" />
        </TestWrapper>
      );

      expect(screen.getByLabelText("Microscope icon")).toBeInTheDocument();
    });
  });
});
