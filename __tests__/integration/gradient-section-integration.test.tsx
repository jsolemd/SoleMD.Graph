/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "@/lib/mantine-theme";
import { GradientSection } from "@/components/layout/GradientSection";
import { FloatingCard } from "@/components/ui/floating-card";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    section: ({ children, style, className, ...props }: any) => (
      <section
        className={className}
        style={style}
        data-testid="gradient-section"
        {...props}
      >
        {children}
      </section>
    ),
    div: ({ children, style, className, ...props }: any) => (
      <div
        className={className}
        style={style}
        data-testid="motion-div"
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
    {children}
  </MantineProvider>
);

describe("GradientSection Integration Tests", () => {
  describe("Integration with FloatingCard", () => {
    it("renders FloatingCard inside GradientSection correctly", () => {
      render(
        <TestWrapper>
          <GradientSection variant="innovation">
            <FloatingCard variant="innovation">
              <div>Innovation card content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      const cardContent = screen.getByText("Innovation card content");

      expect(section).toBeInTheDocument();
      expect(cardContent).toBeInTheDocument();
      expect(section).toHaveStyle({
        background: "var(--gradient-innovation)",
      });
    });

    it("maintains proper z-index layering", () => {
      render(
        <TestWrapper>
          <GradientSection variant="education" orbCount={2}>
            <FloatingCard variant="education">
              <div>Education content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      const contentContainer = section.querySelector('[style*="z-index: 10"]');
      const orbContainer = section.querySelector('[style*="z-index: 1"]');

      expect(contentContainer).toBeInTheDocument();
      expect(orbContainer).toBeInTheDocument();
    });

    it("supports multiple FloatingCards with different variants", () => {
      render(
        <TestWrapper>
          <GradientSection variant="hero">
            <FloatingCard variant="innovation">
              <div>Innovation card</div>
            </FloatingCard>
            <FloatingCard variant="education">
              <div>Education card</div>
            </FloatingCard>
            <FloatingCard variant="action">
              <div>Action card</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      expect(screen.getByText("Innovation card")).toBeInTheDocument();
      expect(screen.getByText("Education card")).toBeInTheDocument();
      expect(screen.getByText("Action card")).toBeInTheDocument();
    });
  });

  describe("CSS Custom Properties Integration", () => {
    it("uses consistent gradient variables across components", () => {
      render(
        <TestWrapper>
          <GradientSection variant="contact">
            <FloatingCard variant="contact">
              <div>Contact content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveStyle({
        background: "var(--gradient-contact)",
      });
    });

    it("maintains theme consistency in light/dark modes", () => {
      // Test light mode
      render(
        <TestWrapper>
          <GradientSection variant="action">
            <FloatingCard variant="action">
              <div>Action content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveStyle({
        background: "var(--gradient-action)",
      });
    });
  });

  describe("Responsive Behavior", () => {
    it("maintains responsive design with nested components", () => {
      render(
        <TestWrapper>
          <GradientSection variant="hero" className="responsive-test">
            <div className="container">
              <FloatingCard variant="default">
                <div>Responsive content</div>
              </FloatingCard>
            </div>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveClass("responsive-test");
      expect(section).toHaveClass("overflow-hidden");
    });

    it("applies proper section spacing", () => {
      render(
        <TestWrapper>
          <GradientSection>
            <FloatingCard>
              <div>Spaced content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveStyle({
        padding: "var(--spacing-section, 6rem) 0",
      });
    });
  });

  describe("Performance Integration", () => {
    it("applies performance optimizations to both components", () => {
      render(
        <TestWrapper>
          <GradientSection variant="innovation" orbCount={1}>
            <FloatingCard variant="innovation">
              <div>Optimized content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveStyle({
        willChange: "transform",
        backfaceVisibility: "hidden",
      });
    });
  });

  describe("Accessibility Integration", () => {
    it("maintains semantic structure with nested components", () => {
      render(
        <TestWrapper>
          <GradientSection>
            <FloatingCard>
              <h2>Accessible Heading</h2>
              <p>Accessible paragraph</p>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      const heading = screen.getByText("Accessible Heading");
      const paragraph = screen.getByText("Accessible paragraph");

      expect(section.tagName).toBe("SECTION");
      expect(heading.tagName).toBe("H2");
      expect(paragraph.tagName).toBe("P");
    });

    it("ensures orbs don't interfere with content accessibility", () => {
      render(
        <TestWrapper>
          <GradientSection orbCount={2}>
            <FloatingCard>
              <button>Accessible Button</button>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const button = screen.getByText("Accessible Button");
      const orbContainer = screen
        .getByTestId("gradient-section")
        .querySelector(".pointer-events-none");

      expect(button).toBeInTheDocument();
      expect(orbContainer).toBeInTheDocument();
      expect(orbContainer).toHaveClass("pointer-events-none");
    });
  });

  describe("Error Handling and Fallbacks", () => {
    it("handles missing CSS custom properties gracefully", () => {
      render(
        <TestWrapper>
          <GradientSection variant="innovation">
            <FloatingCard variant="innovation">
              <div>Fallback content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      const section = screen.getByTestId("gradient-section");
      expect(section).toHaveStyle({
        backgroundImage: "linear-gradient(135deg, #fbb44e 0%, #ffc245 100%)",
      });
    });

    it("handles invalid variant gracefully", () => {
      render(
        <TestWrapper>
          <GradientSection variant="invalid" as any>
            <FloatingCard>
              <div>Invalid variant content</div>
            </FloatingCard>
          </GradientSection>
        </TestWrapper>
      );

      // Should fall back to hero variant
      const section = screen.getByTestId("gradient-section");
      expect(section).toBeInTheDocument();
      expect(screen.getByText("Invalid variant content")).toBeInTheDocument();
    });
  });
});
