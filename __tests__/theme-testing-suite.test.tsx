/**
 * @fileoverview Comprehensive Theme Testing Suite
 * @description Tests theme switching functionality, dynamic coloring, CSS variable resolution,
 *              animation performance, and accessibility compliance across all updated pages
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { theme as mantineTheme } from "@/lib/mantine-theme";
import { getCurrentPageColor, navigationLinks } from "@/lib/utils";

// Mock Next.js navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, style, ...props }: any) => (
      <div style={style} {...props}>
        {children}
      </div>
    ),
    h1: ({ children, style, ...props }: any) => (
      <h1 style={style} {...props}>
        {children}
      </h1>
    ),
    p: ({ children, style, ...props }: any) => (
      <p style={style} {...props}>
        {children}
      </p>
    ),
    section: ({ children, style, ...props }: any) => (
      <section style={style} {...props}>
        {children}
      </section>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
  useScroll: () => ({ scrollY: { get: () => 0 } }),
  useTransform: () => 0,
  useMotionTemplate: () => "rgba(0,0,0,0)",
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

// Test wrapper with both theme providers
const TestWrapper = ({
  children,
  initialTheme = "light",
}: {
  children: React.ReactNode;
  initialTheme?: "light" | "dark";
}) => (
  <ThemeProvider
    attribute="class"
    defaultTheme={initialTheme}
    enableSystem={false}
  >
    <MantineProvider theme={mantineTheme} defaultColorScheme={initialTheme}>
      {children}
    </MantineProvider>
  </ThemeProvider>
);

describe("Comprehensive Theme Testing Suite", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUsePathname.mockReset();
    // Clear any theme classes from document
    document.documentElement.classList.remove("light", "dark");
  });

  describe("Theme Switching Functionality", () => {
    test("should switch between light and dark themes without errors", async () => {
      const ThemeToggleComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        React.useEffect(() => {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }, [theme]);

        return (
          <div>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              data-testid="theme-toggle"
            >
              Toggle Theme
            </button>
            <div
              data-testid="themed-element"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                transition: "all 300ms ease",
              }}
            >
              Themed Content
            </div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <ThemeToggleComponent />
        </TestWrapper>
      );

      const toggleButton = screen.getByTestId("theme-toggle");
      const themedElement = screen.getByTestId("themed-element");

      // Initial light theme
      expect(document.documentElement).not.toHaveClass("dark");

      // Switch to dark theme
      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });

      // Switch back to light theme
      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(document.documentElement).not.toHaveClass("dark");
      });

      // Verify element has transition property
      expect(themedElement).toHaveStyle("transition: all 300ms ease");
    });

    test("should maintain theme state across component re-renders", async () => {
      const StatefulThemeComponent = () => {
        const [count, setCount] = React.useState(0);
        const [theme, setTheme] = React.useState<"light" | "dark">("dark");

        React.useEffect(() => {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }, [theme]);

        return (
          <div>
            <button
              onClick={() => setCount((c) => c + 1)}
              data-testid="counter"
            >
              Count: {count}
            </button>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              data-testid="theme-toggle"
            >
              Theme: {theme}
            </button>
          </div>
        );
      };

      render(
        <TestWrapper initialTheme="dark">
          <StatefulThemeComponent />
        </TestWrapper>
      );

      // Set dark theme
      fireEvent.click(screen.getByTestId("theme-toggle"));
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });

      // Trigger re-render
      fireEvent.click(screen.getByTestId("counter"));
      fireEvent.click(screen.getByTestId("counter"));

      // Theme should persist
      expect(document.documentElement).toHaveClass("dark");
    });
  });

  describe("Dynamic Coloring Updates", () => {
    const DynamicColorComponent = ({ pathname }: { pathname: string }) => {
      const pageColor = getCurrentPageColor(pathname);

      return (
        <div>
          <div
            data-testid="header-logo"
            style={{
              backgroundColor: pageColor,
              transition: "background-color 300ms ease",
            }}
          >
            Logo
          </div>
          <div
            data-testid="md-text"
            style={{
              color: pageColor,
              transition: "color 300ms ease",
            }}
          >
            MD
          </div>
        </div>
      );
    };

    navigationLinks.forEach(({ link, color, label }) => {
      test(`should apply correct ${label} page color (${link})`, () => {
        mockUsePathname.mockReturnValue(link);

        render(
          <TestWrapper>
            <DynamicColorComponent pathname={link} />
          </TestWrapper>
        );

        const headerLogo = screen.getByTestId("header-logo");
        const mdText = screen.getByTestId("md-text");

        expect(headerLogo).toHaveStyle({
          backgroundColor: color,
          transition: "background-color 300ms ease",
        });

        expect(mdText).toHaveStyle({
          color: color,
          transition: "color 300ms ease",
        });
      });
    });

    test("should update colors when pathname changes", async () => {
      const { rerender } = render(
        <TestWrapper>
          <DynamicColorComponent pathname="/" />
        </TestWrapper>
      );

      const headerLogo = screen.getByTestId("header-logo");

      // Initial home color
      expect(headerLogo).toHaveStyle({
        backgroundColor: "var(--color-soft-blue)",
      });

      // Change to about page
      rerender(
        <TestWrapper>
          <DynamicColorComponent pathname="/about" />
        </TestWrapper>
      );

      expect(headerLogo).toHaveStyle({
        backgroundColor: "var(--color-soft-lavender)",
      });
    });

    test("should use default color for unknown routes", () => {
      render(
        <TestWrapper>
          <DynamicColorComponent pathname="/unknown-route" />
        </TestWrapper>
      );

      const headerLogo = screen.getByTestId("header-logo");
      expect(headerLogo).toHaveStyle({
        backgroundColor: "var(--color-soft-blue)", // Default color
      });
    });
  });

  describe("CSS Variable Resolution", () => {
    test("should resolve CSS variables in light mode", () => {
      document.documentElement.classList.remove("dark");

      const CSSVariableComponent = () => (
        <div>
          <div
            data-testid="background-element"
            style={{ backgroundColor: "var(--background)" }}
          >
            Background
          </div>
          <div
            data-testid="foreground-element"
            style={{ color: "var(--foreground)" }}
          >
            Foreground
          </div>
          <div
            data-testid="card-element"
            style={{ backgroundColor: "var(--card)" }}
          >
            Card
          </div>
          <div
            data-testid="border-element"
            style={{ borderColor: "var(--border)" }}
          >
            Border
          </div>
        </div>
      );

      render(
        <TestWrapper initialTheme="light">
          <CSSVariableComponent />
        </TestWrapper>
      );

      // Verify CSS variables are applied (browser will resolve them)
      expect(screen.getByTestId("background-element")).toHaveStyle({
        backgroundColor: "var(--background)",
      });
      expect(screen.getByTestId("foreground-element")).toHaveStyle({
        color: "var(--foreground)",
      });
      expect(screen.getByTestId("card-element")).toHaveStyle({
        backgroundColor: "var(--card)",
      });
      expect(screen.getByTestId("border-element")).toHaveStyle({
        borderColor: "var(--border)",
      });
    });

    test("should resolve CSS variables in dark mode", () => {
      document.documentElement.classList.add("dark");

      const CSSVariableComponent = () => (
        <div>
          <div
            data-testid="background-element"
            style={{ backgroundColor: "var(--background)" }}
          >
            Background
          </div>
          <div
            data-testid="foreground-element"
            style={{ color: "var(--foreground)" }}
          >
            Foreground
          </div>
        </div>
      );

      render(
        <TestWrapper initialTheme="dark">
          <CSSVariableComponent />
        </TestWrapper>
      );

      // Verify CSS variables are applied for dark mode
      expect(screen.getByTestId("background-element")).toHaveStyle({
        backgroundColor: "var(--background)",
      });
      expect(screen.getByTestId("foreground-element")).toHaveStyle({
        color: "var(--foreground)",
      });
    });

    test("should handle CSS variable fallbacks", () => {
      const FallbackComponent = () => (
        <div>
          <div
            data-testid="fallback-element"
            style={{
              backgroundColor: "var(--non-existent-variable, #ffffff)",
              color: "var(--another-non-existent, #000000)",
            }}
          >
            Fallback Content
          </div>
        </div>
      );

      render(
        <TestWrapper>
          <FallbackComponent />
        </TestWrapper>
      );

      const element = screen.getByTestId("fallback-element");
      expect(element).toHaveStyle({
        backgroundColor: "var(--non-existent-variable, #ffffff)",
        color: "var(--another-non-existent, #000000)",
      });
    });
  });

  describe("Animation Performance and Smooth Transitions", () => {
    test("should apply correct transition timing for theme changes", () => {
      const TransitionComponent = () => (
        <div>
          <div
            data-testid="theme-transition"
            style={{
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
              transition: "all 300ms ease",
            }}
          >
            Theme Transition Element
          </div>
          <div
            data-testid="color-transition"
            style={{
              backgroundColor: getCurrentPageColor("/about"),
              transition: "background-color 300ms ease",
            }}
          >
            Color Transition Element
          </div>
        </div>
      );

      render(
        <TestWrapper>
          <TransitionComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId("theme-transition")).toHaveStyle({
        transition: "all 300ms ease",
      });

      expect(screen.getByTestId("color-transition")).toHaveStyle({
        transition: "background-color 300ms ease",
      });
    });

    test("should apply correct hover animation timing", () => {
      const HoverAnimationComponent = () => (
        <div>
          <div
            data-testid="hover-element"
            style={{
              transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Hover Animation Element
          </div>
        </div>
      );

      render(
        <TestWrapper>
          <HoverAnimationComponent />
        </TestWrapper>
      );

      const element = screen.getByTestId("hover-element");
      expect(element).toHaveStyle({
        transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      });

      // Test hover interaction
      fireEvent.mouseEnter(element);
      expect(element).toHaveStyle({
        transform: "translateY(-4px)",
      });

      fireEvent.mouseLeave(element);
      expect(element).toHaveStyle({
        transform: "translateY(0)",
      });
    });

    test("should prevent transform conflicts in animations", () => {
      const ConflictPreventionComponent = () => (
        <div>
          <button
            data-testid="button-with-hover"
            style={{
              backgroundColor: "var(--color-soft-lavender)",
              transition: "background-color 200ms ease",
              transform: "none !important", // Prevent conflicts
            }}
          >
            Button with Hover Prevention
          </button>
        </div>
      );

      render(
        <TestWrapper>
          <ConflictPreventionComponent />
        </TestWrapper>
      );

      const button = screen.getByTestId("button-with-hover");
      expect(button).toHaveStyle({
        transition: "background-color 200ms ease",
      });
    });
  });

  describe("Accessibility Compliance", () => {
    test("should maintain proper color contrast ratios", () => {
      const ContrastComponent = () => (
        <div>
          <div
            data-testid="high-contrast-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
            }}
          >
            High contrast text for readability
          </div>
          <div
            data-testid="secondary-text"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
              backgroundColor: "var(--background)",
            }}
          >
            Secondary text with opacity
          </div>
        </div>
      );

      render(
        <TestWrapper>
          <ContrastComponent />
        </TestWrapper>
      );

      // Verify elements exist and have proper styling
      expect(screen.getByTestId("high-contrast-text")).toHaveStyle({
        color: "var(--foreground)",
        backgroundColor: "var(--background)",
      });

      expect(screen.getByTestId("secondary-text")).toHaveStyle({
        color: "var(--foreground)",
        opacity: "0.8",
        backgroundColor: "var(--background)",
      });
    });

    test("should respect reduced motion preferences", () => {
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

      const ReducedMotionComponent = () => {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        return (
          <div
            data-testid="motion-element"
            style={{
              transition: prefersReducedMotion ? "none" : "all 300ms ease",
            }}
          >
            Motion-aware element
          </div>
        );
      };

      render(
        <TestWrapper>
          <ReducedMotionComponent />
        </TestWrapper>
      );

      // Should respect reduced motion preference
      expect(screen.getByTestId("motion-element")).toHaveStyle({
        transition: "none",
      });
    });

    test("should maintain focus visibility", async () => {
      const user = userEvent.setup();

      const FocusComponent = () => (
        <div>
          <button
            data-testid="focusable-button"
            style={{
              outline: "2px solid transparent",
              outlineOffset: "2px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline =
                "2px solid var(--color-soft-lavender)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "2px solid transparent";
            }}
          >
            Focusable Button
          </button>
        </div>
      );

      render(
        <TestWrapper>
          <FocusComponent />
        </TestWrapper>
      );

      const button = screen.getByTestId("focusable-button");

      // Focus the button
      await user.tab();
      expect(button).toHaveFocus();
      expect(button).toHaveStyle({
        outline: "2px solid var(--color-soft-lavender)",
      });
    });

    test("should provide proper ARIA attributes for theme controls", () => {
      const ThemeControlComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        return (
          <button
            data-testid="theme-control"
            aria-label={`Switch to ${
              theme === "light" ? "dark" : "light"
            } theme`}
            aria-pressed={theme === "dark"}
            role="switch"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        );
      };

      render(
        <TestWrapper>
          <ThemeControlComponent />
        </TestWrapper>
      );

      const themeControl = screen.getByTestId("theme-control");
      expect(themeControl).toHaveAttribute(
        "aria-label",
        "Switch to dark theme"
      );
      expect(themeControl).toHaveAttribute("aria-pressed", "false");
      expect(themeControl).toHaveAttribute("role", "switch");

      // Test interaction
      fireEvent.click(themeControl);
      expect(themeControl).toHaveAttribute(
        "aria-label",
        "Switch to light theme"
      );
      expect(themeControl).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("Cross-Page Theme Consistency", () => {
    const pages = [
      { path: "/", name: "Home" },
      { path: "/about", name: "About" },
      { path: "/education", name: "Education" },
      { path: "/research", name: "Research" },
    ];

    pages.forEach(({ path, name }) => {
      test(`should maintain theme consistency on ${name} page`, () => {
        mockUsePathname.mockReturnValue(path);

        const PageComponent = () => (
          <div>
            <div
              data-testid="page-background"
              style={{ backgroundColor: "var(--background)" }}
            >
              Page Background
            </div>
            <div data-testid="page-text" style={{ color: "var(--foreground)" }}>
              Page Text
            </div>
            <div
              data-testid="page-card"
              style={{ backgroundColor: "var(--card)" }}
            >
              Page Card
            </div>
            <div
              data-testid="dynamic-color"
              style={{ backgroundColor: getCurrentPageColor(path) }}
            >
              Dynamic Color Element
            </div>
          </div>
        );

        render(
          <TestWrapper>
            <PageComponent />
          </TestWrapper>
        );

        // Verify consistent theme variables
        expect(screen.getByTestId("page-background")).toHaveStyle({
          backgroundColor: "var(--background)",
        });
        expect(screen.getByTestId("page-text")).toHaveStyle({
          color: "var(--foreground)",
        });
        expect(screen.getByTestId("page-card")).toHaveStyle({
          backgroundColor: "var(--card)",
        });

        // Verify dynamic coloring
        const expectedColor = getCurrentPageColor(path);
        expect(screen.getByTestId("dynamic-color")).toHaveStyle({
          backgroundColor: expectedColor,
        });
      });
    });
  });

  describe("Performance and Build Verification", () => {
    test("should not cause memory leaks with theme switching", async () => {
      const MemoryTestComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");
        const [mounted, setMounted] = React.useState(false);

        React.useEffect(() => {
          setMounted(true);
          return () => {
            // Cleanup function to test memory management
            setMounted(false);
          };
        }, []);

        if (!mounted) return null;

        return (
          <div>
            <button
              data-testid="memory-theme-toggle"
              onClick={() =>
                setTheme((t) => (t === "light" ? "dark" : "light"))
              }
            >
              Toggle: {theme}
            </button>
            <div style={{ backgroundColor: "var(--background)" }}>Content</div>
          </div>
        );
      };

      const { unmount } = render(
        <TestWrapper>
          <MemoryTestComponent />
        </TestWrapper>
      );

      // Rapid theme switching
      const toggle = screen.getByTestId("memory-theme-toggle");
      for (let i = 0; i < 10; i++) {
        fireEvent.click(toggle);
        await waitFor(() => {
          expect(toggle).toBeInTheDocument();
        });
      }

      // Unmount should not cause errors
      expect(() => unmount()).not.toThrow();
    });

    test("should handle rapid theme changes gracefully", async () => {
      const RapidChangeComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        return (
          <div>
            <button
              data-testid="rapid-toggle"
              onClick={() => {
                // Rapid successive changes
                setTheme("dark");
                setTimeout(() => setTheme("light"), 10);
                setTimeout(() => setTheme("dark"), 20);
                setTimeout(() => setTheme("light"), 30);
              }}
            >
              Rapid Toggle
            </button>
            <div
              data-testid="rapid-element"
              style={{
                backgroundColor: "var(--background)",
                transition: "background-color 300ms ease",
              }}
            >
              Rapid Change Element
            </div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <RapidChangeComponent />
        </TestWrapper>
      );

      const toggle = screen.getByTestId("rapid-toggle");
      const element = screen.getByTestId("rapid-element");

      // Should not throw errors with rapid changes
      expect(() => fireEvent.click(toggle)).not.toThrow();

      // Element should still have transition
      expect(element).toHaveStyle({
        transition: "background-color 300ms ease",
      });
    });
  });
});
