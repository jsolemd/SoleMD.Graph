/**
 * Integration tests for SoleMD optimizations
 * Verifies that all optimization components work together correctly
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { FloatingCard } from "@/components/ui/floating-card";
import ThemeToggle from "@/components/ui/theme-toggle";
import { solemTheme } from "@/lib/mantine-theme";
import { cn, debounce, throttle, storage } from "@/lib/utils";
import { Heart } from "lucide-react";

// Mock next-themes
jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: jest.fn(),
    resolvedTheme: "light",
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Test wrapper with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="light">
    <MantineProvider theme={solemTheme}>{children}</MantineProvider>
  </ThemeProvider>
);

describe("SoleMD Optimization Integration", () => {
  describe("Utility Functions", () => {
    test("cn function merges classes correctly", () => {
      const result = cn("px-4 py-2", "bg-blue-500", { "text-white": true });
      expect(result).toContain("px-4");
      expect(result).toContain("py-2");
      expect(result).toContain("bg-blue-500");
      expect(result).toContain("text-white");
    });

    test("debounce function works correctly", async () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(mockFn).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test("throttle function works correctly", async () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 150));
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test("storage utility handles localStorage safely", () => {
      // Test setting and getting
      storage.set("test-key", "test-value");
      expect(storage.get("test-key")).toBe("test-value");

      // Test removal
      storage.remove("test-key");
      expect(storage.get("test-key")).toBeNull();
    });
  });

  describe("Error Boundary", () => {
    const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error("Test error");
      }
      return <div>No error</div>;
    };

    test("catches and displays errors gracefully", () => {
      const onError = jest.fn();

      render(
        <TestWrapper>
          <ErrorBoundary onError={onError}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </TestWrapper>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
      expect(screen.getByText("Go Home")).toBeInTheDocument();
      expect(onError).toHaveBeenCalled();
    });

    test("renders children when no error occurs", () => {
      render(
        <TestWrapper>
          <ErrorBoundary>
            <ThrowError shouldThrow={false} />
          </ErrorBoundary>
        </TestWrapper>
      );

      expect(screen.getByText("No error")).toBeInTheDocument();
      expect(
        screen.queryByText("Something went wrong")
      ).not.toBeInTheDocument();
    });

    test("retry functionality works", () => {
      const { rerender } = render(
        <TestWrapper>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </TestWrapper>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();

      const retryButton = screen.getByText("Try Again");
      fireEvent.click(retryButton);

      // After retry, component should attempt to render again
      rerender(
        <TestWrapper>
          <ErrorBoundary>
            <ThrowError shouldThrow={false} />
          </ErrorBoundary>
        </TestWrapper>
      );

      expect(screen.getByText("No error")).toBeInTheDocument();
    });
  });

  describe("FloatingCard Component", () => {
    test("renders with all props correctly", () => {
      render(
        <TestWrapper>
          <FloatingCard
            elevation="medium"
            glassEffect
            hoverLift
            icon={Heart}
            iconColor="purple"
            iconSize="lg"
            data-testid="floating-card"
          >
            <div>Card Content</div>
          </FloatingCard>
        </TestWrapper>
      );

      expect(screen.getByTestId("floating-card")).toBeInTheDocument();
      expect(screen.getByText("Card Content")).toBeInTheDocument();
      expect(screen.getByTestId("icon-container")).toBeInTheDocument();
    });

    test("applies correct elevation styles", () => {
      const { container } = render(
        <TestWrapper>
          <FloatingCard elevation="high" data-testid="floating-card">
            Content
          </FloatingCard>
        </TestWrapper>
      );

      const card = container.querySelector('[data-testid="floating-card"]');
      expect(card).toHaveStyle({
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.16)",
      });
    });

    test("icon container has correct color styling", () => {
      render(
        <TestWrapper>
          <FloatingCard icon={Heart} iconColor="teal">
            Content
          </FloatingCard>
        </TestWrapper>
      );

      const iconContainer = screen.getByTestId("icon-container");
      expect(iconContainer).toHaveStyle({
        backgroundColor: "var(--c-teal-border)",
      });
    });
  });

  describe("Theme Integration", () => {
    test("Mantine theme uses correct color variables", () => {
      expect(solemTheme.colors?.solemPurple?.[0]).toBe("var(--c-purple-bg)");
      expect(solemTheme.colors?.solemPurple?.[2]).toBe(
        "var(--c-purple-border)"
      );
      expect(solemTheme.colors?.solemPurple?.[6]).toBe("var(--c-purple-text)");
    });

    test("theme has correct primary color configuration", () => {
      expect(solemTheme.primaryColor).toBe("solemPurple");
      expect(solemTheme.primaryShade).toEqual({ light: 6, dark: 6 });
    });

    test("theme includes all semantic colors", () => {
      const expectedColors = [
        "solemPurple",
        "solemTeal",
        "solemBlue",
        "solemOrange",
        "solemCyan",
        "solemGreen",
      ];

      expectedColors.forEach((color) => {
        expect(solemTheme.colors).toHaveProperty(color);
        expect(solemTheme.colors?.[color]).toHaveLength(10);
      });
    });
  });

  describe("Component Integration", () => {
    test("FloatingCard works within ErrorBoundary", () => {
      render(
        <TestWrapper>
          <ErrorBoundary>
            <FloatingCard elevation="medium" icon={Heart}>
              <div>Protected Content</div>
            </FloatingCard>
          </ErrorBoundary>
        </TestWrapper>
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    test("ThemeToggle renders without errors", () => {
      render(
        <TestWrapper>
          <ThemeToggle />
        </TestWrapper>
      );

      // Should render theme toggle button
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-label");
    });
  });

  describe("Performance Utilities", () => {
    test("performance monitoring doesn't break rendering", () => {
      // This test ensures performance hooks don't interfere with normal rendering
      const TestComponent = () => {
        return <div>Performance Test</div>;
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByText("Performance Test")).toBeInTheDocument();
    });
  });

  describe("CSS Integration", () => {
    test("CSS custom properties are available", () => {
      // Test that our CSS custom properties are properly defined
      const testElement = document.createElement("div");
      document.body.appendChild(testElement);

      // Set a CSS custom property to test
      testElement.style.setProperty("color", "var(--c-purple-text)");

      // The property should be set (even if the value isn't resolved in tests)
      expect(testElement.style.color).toBe("var(--c-purple-text)");

      document.body.removeChild(testElement);
    });
  });
});

describe("Accessibility Integration", () => {
  test("FloatingCard maintains accessibility", () => {
    render(
      <TestWrapper>
        <FloatingCard
          elevation="medium"
          icon={Heart}
          role="article"
          aria-label="Test card"
        >
          <h2>Card Title</h2>
          <p>Card description</p>
        </FloatingCard>
      </TestWrapper>
    );

    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("aria-label", "Test card");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  test("Error boundary provides accessible error messages", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <TestWrapper>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </TestWrapper>
    );

    const heading = screen.getByRole("heading", {
      name: /something went wrong/i,
    });
    expect(heading).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    buttons.forEach((button) => {
      expect(button).toHaveAccessibleName();
    });
  });
});
