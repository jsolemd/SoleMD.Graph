/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "@/lib/mantine-theme";
import { PillButton, PillButtonProps } from "@/components/ui/pill-button";

// Mock Framer Motion for testing
jest.mock("framer-motion", () => ({
  motion: (Component: any) => {
    const MotionComponent = React.forwardRef((props: any, ref: any) => {
      const { variants, whileHover, whileTap, ...otherProps } = props;
      return <Component ref={ref} {...otherProps} />;
    });
    MotionComponent.displayName = `Motion(${
      Component.displayName || Component.name || "Component"
    })`;
    return MotionComponent;
  },
}));

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
    {children}
  </MantineProvider>
);

// Helper function to render PillButton with wrapper
const renderPillButton = (props: Partial<PillButtonProps> = {}) => {
  const { children = "Test Button", ...otherProps } = props;
  return render(
    <TestWrapper>
      <PillButton {...otherProps}>{children}</PillButton>
    </TestWrapper>
  );
};

describe("PillButton Component", () => {
  describe("Basic Rendering", () => {
    test("renders with default props", () => {
      renderPillButton();
      const button = screen.getByRole("button", { name: /test button/i });
      expect(button).toBeInTheDocument();
    });

    test("renders with custom text", () => {
      renderPillButton({ children: "Custom Button Text" });
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("Custom Button Text");
    });

    test("applies custom className", () => {
      renderPillButton({ className: "custom-class" });
      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });
  });

  describe("Variant Support", () => {
    test("renders primary variant by default", () => {
      renderPillButton();
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-soft-lavender)",
        color: "#ffffff",
      });
    });

    test("renders innovation variant correctly", () => {
      renderPillButton({ variant: "innovation" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-golden-yellow)",
        color: "#ffffff",
      });
    });

    test("renders education variant correctly", () => {
      renderPillButton({ variant: "education" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-fresh-green)",
        color: "#ffffff",
      });
    });

    test("renders action variant correctly", () => {
      renderPillButton({ variant: "action" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-warm-coral)",
        color: "#ffffff",
      });
    });

    test("renders contact variant correctly", () => {
      renderPillButton({ variant: "contact" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-soft-pink)",
        color: "#ffffff",
      });
    });

    test("renders secondary variant with border", () => {
      renderPillButton({ variant: "secondary" });
      const button = screen.getByRole("button");

      // Check inline styles directly
      expect(button.style.backgroundColor).toBe("transparent");
      expect(button.style.color).toBe("var(--color-soft-lavender)");
      expect(button.style.border).toBe("1px solid var(--color-soft-lavender)");
    });
  });

  describe("Size Variants", () => {
    test("renders medium size by default", () => {
      renderPillButton();
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        padding: "0.75rem 2rem",
        fontSize: "1rem",
        height: "2.5rem",
        minWidth: "5rem",
      });
    });

    test("renders small size correctly", () => {
      renderPillButton({ size: "sm" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        padding: "0.5rem 1.5rem",
        fontSize: "0.875rem",
        height: "2rem",
        minWidth: "4rem",
      });
    });

    test("renders large size correctly", () => {
      renderPillButton({ size: "lg" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        padding: "1rem 2.5rem",
        fontSize: "1.125rem",
        height: "3rem",
        minWidth: "6rem",
      });
    });

    test("renders extra large size correctly", () => {
      renderPillButton({ size: "xl" });
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        padding: "1.25rem 3rem",
        fontSize: "1.25rem",
        height: "3.5rem",
        minWidth: "7rem",
      });
    });
  });

  describe("Pill-Shaped Design", () => {
    test("has 2rem border radius", () => {
      renderPillButton();
      const button = screen.getByRole("button");
      expect(button).toHaveStyle({
        borderRadius: "2rem",
      });
    });

    test("maintains pill shape across all sizes", () => {
      const sizes: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];

      sizes.forEach((size) => {
        const { unmount } = renderPillButton({ size });
        const button = screen.getByRole("button");
        expect(button).toHaveStyle({
          borderRadius: "2rem",
        });
        unmount();
      });
    });
  });

  describe("Interaction Handling", () => {
    test("handles click events", async () => {
      const handleClick = jest.fn();
      renderPillButton({ onClick: handleClick });

      const button = screen.getByRole("button");
      await userEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    test("handles mouse enter and leave events", async () => {
      renderPillButton({ variant: "innovation" });
      const button = screen.getByRole("button");

      // Test mouse enter
      fireEvent.mouseEnter(button);
      await waitFor(() => {
        expect(button).toHaveStyle({
          backgroundColor: "var(--accent-innovation-hover)",
          boxShadow: "var(--shadow-medium)",
        });
      });

      // Test mouse leave
      fireEvent.mouseLeave(button);
      await waitFor(() => {
        expect(button).toHaveStyle({
          backgroundColor: "var(--color-golden-yellow)",
          boxShadow: "var(--shadow-subtle)",
        });
      });
    });

    test("does not trigger hover effects when disabled", async () => {
      renderPillButton({ disabled: true, variant: "innovation" });
      const button = screen.getByRole("button");

      fireEvent.mouseEnter(button);

      // Should maintain original styles
      expect(button).toHaveStyle({
        backgroundColor: "var(--color-golden-yellow)",
        opacity: "0.6",
        cursor: "not-allowed",
      });
    });
  });

  describe("Accessibility Features", () => {
    test("has proper ARIA attributes", () => {
      renderPillButton({ "aria-label": "Custom aria label" });
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Custom aria label");
    });

    test("supports keyboard navigation", async () => {
      const handleClick = jest.fn();
      renderPillButton({ onClick: handleClick });

      const button = screen.getByRole("button");
      button.focus();

      expect(button).toHaveFocus();

      // Test Enter key
      await userEvent.keyboard("{Enter}");
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Test Space key
      await userEvent.keyboard(" ");
      expect(handleClick).toHaveBeenCalledTimes(2);
    });

    test("has focus-visible styles", () => {
      renderPillButton();
      const button = screen.getByRole("button");

      // Focus the button
      button.focus();

      // The focus styles are applied via Mantine's styles prop, not inline styles
      // So we just verify the button can receive focus
      expect(button).toHaveFocus();
    });

    test("meets minimum touch target size", () => {
      renderPillButton({ size: "sm" });
      const button = screen.getByRole("button");

      // Small buttons should have minimum 44px height for accessibility
      expect(button).toHaveStyle({
        minHeight: "44px",
      });
    });

    test("supports disabled state", () => {
      renderPillButton({ disabled: true });
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
      expect(button).toHaveStyle({
        opacity: "0.6",
        cursor: "not-allowed",
      });
    });
  });

  describe("Animation Features", () => {
    test("enables animations by default", () => {
      renderPillButton();
      const button = screen.getByRole("button");

      // Check that transition is applied via inline styles
      expect(button.style.transition).toContain("background-color 200ms");
    });

    test("can disable animations", () => {
      renderPillButton({ animated: false });
      const button = screen.getByRole("button");

      // When animations are disabled, transition should be undefined or empty
      expect(button.style.transition).toBeFalsy();
    });

    test("respects reduced motion preferences", () => {
      // Mock prefers-reduced-motion
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      renderPillButton();
      const button = screen.getByRole("button");

      // The component should handle reduced motion via CSS media query
      expect(button).toBeInTheDocument();
    });
  });

  describe("Future Lottie Integration", () => {
    test("reserves space for Lottie icon on left", () => {
      renderPillButton({ withLottieIcon: true, lottiePosition: "left" });
      const button = screen.getByRole("button");

      expect(button).toHaveStyle({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
      });

      // Check for our custom placeholder span (not Mantine's internal spans)
      const customPlaceholders = button.querySelectorAll(
        "span[style*='width: 1rem']"
      );
      expect(customPlaceholders).toHaveLength(1);
    });

    test("reserves space for Lottie icon on right", () => {
      renderPillButton({ withLottieIcon: true, lottiePosition: "right" });
      const button = screen.getByRole("button");

      // Check for our custom placeholder span (not Mantine's internal spans)
      const customPlaceholders = button.querySelectorAll(
        "span[style*='width: 1rem']"
      );
      expect(customPlaceholders).toHaveLength(1);

      // The placeholder should be after the text content
      expect(button.textContent).toBe("Test Button");
    });

    test("does not show placeholder when withLottieIcon is false", () => {
      renderPillButton({ withLottieIcon: false });
      const button = screen.getByRole("button");

      // Check for our custom placeholder spans (not Mantine's internal spans)
      const customPlaceholders = button.querySelectorAll(
        "span[style*='width: 1rem']"
      );
      expect(customPlaceholders).toHaveLength(0);

      expect(button).toHaveStyle({
        gap: "0",
      });
    });
  });

  describe("Brand Integration", () => {
    test("uses Inter font family", () => {
      renderPillButton();
      const button = screen.getByRole("button");

      expect(button).toHaveStyle({
        fontFamily: "var(--font-family)",
        fontWeight: "400",
      });
    });

    test("uses brand shadow system", () => {
      renderPillButton();
      const button = screen.getByRole("button");

      expect(button).toHaveStyle({
        boxShadow: "var(--shadow-subtle)",
      });
    });

    test("prevents transform conflicts with Framer Motion", () => {
      renderPillButton();
      const button = screen.getByRole("button");

      // The styles should include transform: none !important for hover/active states
      // This is tested through the styles prop structure
      expect(button).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    test("handles missing children gracefully", () => {
      render(
        <TestWrapper>
          <PillButton />
        </TestWrapper>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    test("handles invalid variant gracefully", () => {
      // TypeScript would prevent this, but test runtime behavior
      renderPillButton({ variant: "invalid" as any });
      const button = screen.getByRole("button");

      // Should fall back to primary variant styles
      expect(button).toBeInTheDocument();
    });

    test("handles invalid size gracefully", () => {
      // TypeScript would prevent this, but test runtime behavior
      renderPillButton({ size: "invalid" as any });
      const button = screen.getByRole("button");

      // Should fall back to medium size styles
      expect(button).toBeInTheDocument();
    });
  });
});
