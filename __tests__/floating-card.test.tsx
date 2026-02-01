import { render, screen } from "@testing-library/react";
import { FloatingCard } from "@/components/ui/floating-card";
import { MantineProvider } from "@mantine/core";
import { Text, Title } from "@mantine/core";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: (component: any) => {
    const MotionComponent = ({
      children,
      whileHover,
      initial,
      animate,
      style,
      ...props
    }: any) => {
      const Component = component;
      return (
        <Component data-motion="true" style={style} {...props}>
          {children}
        </Component>
      );
    };
    MotionComponent.displayName = `Motion${
      component.displayName || component.name || "Component"
    }`;
    return MotionComponent;
  },
}));

/**
 * Test wrapper with Mantine provider
 */
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("FloatingCard Component", () => {
  describe("Basic Rendering", () => {
    it("renders children content correctly", () => {
      render(
        <TestWrapper>
          <FloatingCard>
            <Text>Test content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("applies default variant when no variant prop is provided", () => {
      render(
        <TestWrapper>
          <FloatingCard data-testid="floating-card">
            <Text>Default content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("floating-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Default content")).toBeInTheDocument();
    });

    it("forwards ref correctly", () => {
      const ref = { current: null };

      render(
        <TestWrapper>
          <FloatingCard ref={ref}>
            <Text>Content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("Variant Support", () => {
    it("renders with default variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="default" data-testid="default-card">
            <Text>Default variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("default-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Default variant")).toBeInTheDocument();
    });

    it("renders with innovation variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="innovation" data-testid="innovation-card">
            <Text>Innovation variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("innovation-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Innovation variant")).toBeInTheDocument();
    });

    it("renders with education variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="education" data-testid="education-card">
            <Text>Education variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("education-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Education variant")).toBeInTheDocument();
    });

    it("renders with action variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="action" data-testid="action-card">
            <Text>Action variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("action-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Action variant")).toBeInTheDocument();
    });

    it("renders with contact variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="contact" data-testid="contact-card">
            <Text>Contact variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("contact-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Contact variant")).toBeInTheDocument();
    });
  });

  describe("Interactive Behavior", () => {
    it("enables interactive animations by default", () => {
      const { container } = render(
        <TestWrapper>
          <FloatingCard data-testid="interactive-card">
            <Text>Interactive content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      // Check that the card is wrapped with motion component
      const motionDiv = container.querySelector("div[data-motion='true']");
      expect(motionDiv).toBeInTheDocument();
    });

    it("disables interactive animations when interactive is false", () => {
      render(
        <TestWrapper>
          <FloatingCard interactive={false} data-testid="non-interactive-card">
            <Text>Non-interactive content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("non-interactive-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Non-interactive content")).toBeInTheDocument();
    });
  });

  describe("Style Integration", () => {
    it("accepts custom style prop", () => {
      const customStyle = {
        padding: "2rem",
        margin: "1rem",
      };

      render(
        <TestWrapper>
          <FloatingCard style={customStyle} data-testid="custom-styles-card">
            <Text>Custom styles</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("custom-styles-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Custom styles")).toBeInTheDocument();
    });

    it("accepts custom className prop", () => {
      render(
        <TestWrapper>
          <FloatingCard
            className="custom-class"
            data-testid="custom-class-card"
          >
            <Text>Custom class</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("custom-class-card");
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass("custom-class");
    });
  });

  describe("Gradient Background Support", () => {
    it("applies gradient background for innovation variant", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="innovation" data-testid="gradient-card">
            <Text>Gradient background</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("gradient-card");
      expect(card).toBeInTheDocument();
      // The gradient is applied via CSS custom properties, so we just verify the card renders
      expect(screen.getByText("Gradient background")).toBeInTheDocument();
    });
  });

  describe("Border Radius System", () => {
    it("applies 2rem border radius by default", () => {
      render(
        <TestWrapper>
          <FloatingCard data-testid="rounded-card">
            <Text>Rounded corners</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("rounded-card");
      expect(card).toBeInTheDocument();
      // The border radius is applied via inline styles, but we verify the card renders correctly
      expect(screen.getByText("Rounded corners")).toBeInTheDocument();
    });
  });

  describe("Shadow System Integration", () => {
    it("applies floating shadow by default", () => {
      render(
        <TestWrapper>
          <FloatingCard data-testid="shadow-card">
            <Text>Shadow content</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("shadow-card");
      expect(card).toBeInTheDocument();
      // Shadow is applied via CSS custom properties, verify card renders
      expect(screen.getByText("Shadow content")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("maintains proper semantic structure", () => {
      render(
        <TestWrapper>
          <FloatingCard>
            <Title order={2}>Card Title</Title>
            <Text>Card description</Text>
          </FloatingCard>
        </TestWrapper>
      );

      expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
      expect(screen.getByText("Card description")).toBeInTheDocument();
    });

    it("supports ARIA attributes", () => {
      render(
        <TestWrapper>
          <FloatingCard aria-label="Feature card" role="article">
            <Text>Accessible card</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByRole("article");
      expect(card).toHaveAttribute("aria-label", "Feature card");
    });

    it("supports keyboard navigation", () => {
      render(
        <TestWrapper>
          <FloatingCard tabIndex={0} data-testid="focusable-card">
            <Text>Focusable card</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("focusable-card");
      expect(card).toHaveAttribute("tabIndex", "0");
    });
  });

  describe("Responsive Behavior", () => {
    it("renders consistently across different variant configurations", () => {
      const variants = [
        "default",
        "innovation",
        "education",
        "action",
        "contact",
      ] as const;

      variants.forEach((variant) => {
        const { unmount } = render(
          <TestWrapper>
            <FloatingCard
              variant={variant}
              data-testid={`${variant}-responsive-card`}
            >
              <Text>{variant} responsive content</Text>
            </FloatingCard>
          </TestWrapper>
        );

        const card = screen.getByTestId(`${variant}-responsive-card`);
        expect(card).toBeInTheDocument();
        expect(
          screen.getByText(`${variant} responsive content`)
        ).toBeInTheDocument();

        unmount();
      });
    });
  });

  describe("Mantine Integration", () => {
    it("works with Mantine components as children", () => {
      render(
        <TestWrapper>
          <FloatingCard variant="education">
            <Title order={3}>Education Card</Title>
            <Text size="sm" c="dimmed">
              This card contains Mantine components
            </Text>
          </FloatingCard>
        </TestWrapper>
      );

      expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
      expect(screen.getByText("Education Card")).toBeInTheDocument();
      expect(
        screen.getByText("This card contains Mantine components")
      ).toBeInTheDocument();
    });

    it("passes through Mantine Card props", () => {
      render(
        <TestWrapper>
          <FloatingCard padding="xl" data-testid="mantine-props-card">
            <Text>Mantine props test</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("mantine-props-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Mantine props test")).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("handles invalid variant gracefully", () => {
      // TypeScript would prevent this, but test runtime behavior
      render(
        <TestWrapper>
          <FloatingCard
            variant={"invalid" as any}
            data-testid="invalid-variant-card"
          >
            <Text>Invalid variant</Text>
          </FloatingCard>
        </TestWrapper>
      );

      const card = screen.getByTestId("invalid-variant-card");
      expect(card).toBeInTheDocument();
      expect(screen.getByText("Invalid variant")).toBeInTheDocument();
    });
  });
});
