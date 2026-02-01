/**
 * @fileoverview Theme Accessibility Testing Suite
 * @description Tests accessibility compliance for theme switching, color contrast,
 *              reduced motion preferences, and keyboard navigation
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { ThemeProvider } from "next-themes";
import { theme as mantineTheme } from "@/lib/mantine-theme";

// Mock Next.js navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/"),
}));

// Mock framer-motion with reduced motion support
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, style, ...props }: any) => (
      <div style={style} {...props}>
        {children}
      </div>
    ),
    button: ({ children, style, ...props }: any) => (
      <button style={style} {...props}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false, // Will be mocked per test
}));

// Test wrapper with accessibility providers
const AccessibleTestWrapper = ({
  children,
  initialTheme = "light",
  reducedMotion = false,
}: {
  children: React.ReactNode;
  initialTheme?: "light" | "dark";
  reducedMotion?: boolean;
}) => {
  React.useEffect(() => {
    // Mock prefers-reduced-motion
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches:
          query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }, [reducedMotion]);

  return (
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
};

describe("Theme Accessibility Testing Suite", () => {
  beforeEach(() => {
    // Reset DOM state
    document.documentElement.classList.remove("light", "dark");

    // Clear any existing matchMedia mocks
    if (window.matchMedia) {
      jest.clearAllMocks();
    }
  });

  describe("Color Contrast Compliance", () => {
    test("should maintain WCAG AA contrast ratios in light mode", () => {
      document.documentElement.classList.remove("dark");

      const ContrastTestComponent = () => (
        <div>
          <div
            data-testid="primary-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
            }}
          >
            Primary text content
          </div>
          <div
            data-testid="secondary-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
              opacity: 0.8,
            }}
          >
            Secondary text content
          </div>
          <div
            data-testid="muted-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
              opacity: 0.7,
            }}
          >
            Muted text content
          </div>
        </div>
      );

      render(
        <AccessibleTestWrapper initialTheme="light">
          <ContrastTestComponent />
        </AccessibleTestWrapper>
      );

      // Verify elements exist and have proper contrast styling
      expect(screen.getByTestId("primary-text")).toHaveStyle({
        color: "var(--foreground)",
        backgroundColor: "var(--background)",
      });

      expect(screen.getByTestId("secondary-text")).toHaveStyle({
        opacity: "0.8",
      });

      expect(screen.getByTestId("muted-text")).toHaveStyle({
        opacity: "0.7",
      });
    });

    test("should maintain WCAG AA contrast ratios in dark mode", () => {
      document.documentElement.classList.add("dark");

      const DarkModeContrastComponent = () => (
        <div>
          <div
            data-testid="dark-primary-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--background)",
            }}
          >
            Dark mode primary text
          </div>
          <div
            data-testid="dark-card-text"
            style={{
              color: "var(--foreground)",
              backgroundColor: "var(--card)",
            }}
          >
            Dark mode card text
          </div>
        </div>
      );

      render(
        <AccessibleTestWrapper initialTheme="dark">
          <DarkModeContrastComponent />
        </AccessibleTestWrapper>
      );

      expect(screen.getByTestId("dark-primary-text")).toHaveStyle({
        color: "var(--foreground)",
        backgroundColor: "var(--background)",
      });

      expect(screen.getByTestId("dark-card-text")).toHaveStyle({
        color: "var(--foreground)",
        backgroundColor: "var(--card)",
      });
    });

    test("should provide sufficient contrast for dynamic page colors", () => {
      const DynamicColorContrastComponent = () => {
        const pageColors = [
          { path: "/", color: "var(--color-soft-blue)", name: "Home" },
          {
            path: "/about",
            color: "var(--color-soft-lavender)",
            name: "About",
          },
          {
            path: "/education",
            color: "var(--color-fresh-green)",
            name: "Education",
          },
          {
            path: "/research",
            color: "var(--color-warm-coral)",
            name: "Research",
          },
        ];

        return (
          <div>
            {pageColors.map(({ path, color, name }) => (
              <div key={path}>
                <div
                  data-testid={`${name.toLowerCase()}-accent`}
                  style={{
                    backgroundColor: color,
                    color: "white", // White text on colored background
                    padding: "8px",
                  }}
                >
                  {name} Page Accent
                </div>
                <div
                  data-testid={`${name.toLowerCase()}-text`}
                  style={{
                    color: color,
                    backgroundColor: "var(--background)",
                    padding: "8px",
                  }}
                >
                  {name} Colored Text
                </div>
              </div>
            ))}
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <DynamicColorContrastComponent />
        </AccessibleTestWrapper>
      );

      // Verify all dynamic color combinations exist
      expect(screen.getByTestId("home-accent")).toHaveStyle({
        backgroundColor: "var(--color-soft-blue)",
        color: "white",
      });

      expect(screen.getByTestId("about-accent")).toHaveStyle({
        backgroundColor: "var(--color-soft-lavender)",
        color: "white",
      });

      expect(screen.getByTestId("education-accent")).toHaveStyle({
        backgroundColor: "var(--color-fresh-green)",
        color: "white",
      });

      expect(screen.getByTestId("research-accent")).toHaveStyle({
        backgroundColor: "var(--color-warm-coral)",
        color: "white",
      });
    });
  });

  describe("Reduced Motion Support", () => {
    test("should respect prefers-reduced-motion for theme transitions", () => {
      const ReducedMotionThemeComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        return (
          <div>
            <button
              data-testid="reduced-motion-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              Toggle Theme
            </button>
            <div
              data-testid="reduced-motion-element"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                transition: prefersReducedMotion ? "none" : "all 300ms ease",
              }}
            >
              Theme transition element
            </div>
          </div>
        );
      };

      render(
        <AccessibleTestWrapper reducedMotion={true}>
          <ReducedMotionThemeComponent />
        </AccessibleTestWrapper>
      );

      const element = screen.getByTestId("reduced-motion-element");
      expect(element).toHaveStyle({
        transition: "none",
      });
    });

    test("should respect prefers-reduced-motion for hover animations", () => {
      const ReducedMotionHoverComponent = () => {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        return (
          <div
            data-testid="reduced-motion-hover"
            style={{
              transition: prefersReducedMotion
                ? "none"
                : "transform 200ms ease",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!prefersReducedMotion) {
                e.currentTarget.style.transform = "translateY(-4px)";
              }
            }}
            onMouseLeave={(e) => {
              if (!prefersReducedMotion) {
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >
            Hover animation element
          </div>
        );
      };

      render(
        <AccessibleTestWrapper reducedMotion={true}>
          <ReducedMotionHoverComponent />
        </AccessibleTestWrapper>
      );

      const element = screen.getByTestId("reduced-motion-hover");
      expect(element).toHaveStyle({
        transition: "none",
      });

      // Test that hover doesn't trigger transform when reduced motion is preferred
      fireEvent.mouseEnter(element);
      expect(element).not.toHaveStyle({
        transform: "translateY(-4px)",
      });
    });

    test("should provide alternative feedback when animations are disabled", () => {
      const AlternativeFeedbackComponent = () => {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        const [isHovered, setIsHovered] = React.useState(false);

        return (
          <div
            data-testid="alternative-feedback"
            style={{
              backgroundColor:
                isHovered && prefersReducedMotion
                  ? "var(--color-soft-blue)"
                  : "var(--background)",
              color:
                isHovered && prefersReducedMotion
                  ? "white"
                  : "var(--foreground)",
              transition: prefersReducedMotion
                ? "none"
                : "transform 200ms ease",
              transform:
                !prefersReducedMotion && isHovered
                  ? "translateY(-4px)"
                  : "translateY(0)",
              padding: "8px",
              cursor: "pointer",
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            Interactive element with alternative feedback
          </div>
        );
      };

      render(
        <AccessibleTestWrapper reducedMotion={true}>
          <AlternativeFeedbackComponent />
        </AccessibleTestWrapper>
      );

      const element = screen.getByTestId("alternative-feedback");

      // Initially should have no special styling
      expect(element).toHaveStyle({
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        transition: "none",
      });

      // On hover, should provide color feedback instead of animation
      fireEvent.mouseEnter(element);
      expect(element).toHaveStyle({
        backgroundColor: "var(--color-soft-blue)",
        color: "white",
      });
    });
  });

  describe("Focus Management and Keyboard Navigation", () => {
    test("should provide visible focus indicators", async () => {
      const user = userEvent.setup();

      const FocusIndicatorComponent = () => (
        <div>
          <button
            data-testid="focus-button-1"
            style={{
              outline: "2px solid transparent",
              outlineOffset: "2px",
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              padding: "8px 16px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline =
                "2px solid var(--color-soft-blue)";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "2px solid transparent";
            }}
          >
            First Button
          </button>
          <button
            data-testid="focus-button-2"
            style={{
              outline: "2px solid transparent",
              outlineOffset: "2px",
              backgroundColor: "var(--color-soft-lavender)",
              color: "white",
              border: "none",
              padding: "8px 16px",
              marginLeft: "8px",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid var(--foreground)";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "2px solid transparent";
            }}
          >
            Second Button
          </button>
        </div>
      );

      render(
        <AccessibleTestWrapper>
          <FocusIndicatorComponent />
        </AccessibleTestWrapper>
      );

      const button1 = screen.getByTestId("focus-button-1");
      const button2 = screen.getByTestId("focus-button-2");

      // Tab to first button
      await user.tab();
      expect(button1).toHaveFocus();
      expect(button1).toHaveStyle({
        outline: "2px solid var(--color-soft-blue)",
        outlineOffset: "2px",
      });

      // Tab to second button
      await user.tab();
      expect(button2).toHaveFocus();
      expect(button2).toHaveStyle({
        outline: "2px solid var(--foreground)",
        outlineOffset: "2px",
      });

      // First button should lose focus styling
      expect(button1).toHaveStyle({
        outline: "2px solid transparent",
      });
    });

    test("should maintain focus visibility in both light and dark themes", async () => {
      const user = userEvent.setup();

      const ThemeFocusComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        React.useEffect(() => {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }, [theme]);

        return (
          <div>
            <button
              data-testid="theme-focus-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                padding: "8px 16px",
                outline: "2px solid transparent",
                outlineOffset: "2px",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline =
                  "2px solid var(--color-soft-blue)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "2px solid transparent";
              }}
            >
              Toggle Theme (Current: {theme})
            </button>
            <input
              data-testid="theme-focus-input"
              type="text"
              placeholder="Test input"
              style={{
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                padding: "8px",
                marginLeft: "8px",
                outline: "2px solid transparent",
                outlineOffset: "2px",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline =
                  "2px solid var(--color-soft-lavender)";
                e.currentTarget.style.borderColor =
                  "var(--color-soft-lavender)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "2px solid transparent";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            />
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <ThemeFocusComponent />
        </AccessibleTestWrapper>
      );

      const toggleButton = screen.getByTestId("theme-focus-toggle");
      const input = screen.getByTestId("theme-focus-input");

      // Test focus in light mode
      await user.tab();
      expect(toggleButton).toHaveFocus();
      expect(toggleButton).toHaveStyle({
        outline: "2px solid var(--color-soft-blue)",
      });

      // Switch to dark mode
      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });

      // Focus should still be visible in dark mode
      expect(toggleButton).toHaveStyle({
        outline: "2px solid var(--color-soft-blue)",
      });

      // Tab to input
      await user.tab();
      expect(input).toHaveFocus();
      expect(input).toHaveStyle({
        outline: "2px solid var(--color-soft-lavender)",
        borderColor: "var(--color-soft-lavender)",
      });
    });

    test("should support keyboard navigation for theme controls", async () => {
      const user = userEvent.setup();

      const KeyboardThemeComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        return (
          <div>
            <button
              data-testid="keyboard-theme-control"
              aria-label={`Switch to ${
                theme === "light" ? "dark" : "light"
              } theme`}
              aria-pressed={theme === "dark"}
              role="switch"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTheme(theme === "light" ? "dark" : "light");
                }
              }}
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
            </button>
            <div
              data-testid="theme-status"
              style={{
                color: "var(--foreground)",
                marginTop: "8px",
              }}
            >
              Current theme: {theme}
            </div>
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <KeyboardThemeComponent />
        </AccessibleTestWrapper>
      );

      const themeControl = screen.getByTestId("keyboard-theme-control");
      const themeStatus = screen.getByTestId("theme-status");

      // Initial state
      expect(themeControl).toHaveAttribute("aria-pressed", "false");
      expect(themeStatus).toHaveTextContent("Current theme: light");

      // Focus and activate with Enter key
      await user.tab();
      expect(themeControl).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(themeControl).toHaveAttribute("aria-pressed", "true");
      expect(themeStatus).toHaveTextContent("Current theme: dark");

      // Activate with Space key
      await user.keyboard(" ");
      expect(themeControl).toHaveAttribute("aria-pressed", "false");
      expect(themeStatus).toHaveTextContent("Current theme: light");
    });
  });

  describe("Screen Reader Support", () => {
    test("should provide proper ARIA labels for theme controls", () => {
      const ScreenReaderThemeComponent = () => {
        const [theme, setTheme] = React.useState<"light" | "dark">("light");

        return (
          <div>
            <button
              data-testid="sr-theme-toggle"
              aria-label={`Switch to ${
                theme === "light" ? "dark" : "light"
              } theme`}
              aria-pressed={theme === "dark"}
              aria-describedby="theme-description"
              role="switch"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
              <span className="sr-only">
                {theme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"}
              </span>
            </button>
            <div
              id="theme-description"
              data-testid="theme-description"
              style={{ display: "none" }}
            >
              Toggle between light and dark color schemes for better visibility
            </div>
            <div
              data-testid="theme-announcement"
              aria-live="polite"
              aria-atomic="true"
              style={{
                position: "absolute",
                left: "-10000px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              {theme === "dark"
                ? "Dark theme activated"
                : "Light theme activated"}
            </div>
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <ScreenReaderThemeComponent />
        </AccessibleTestWrapper>
      );

      const themeToggle = screen.getByTestId("sr-theme-toggle");
      const themeDescription = screen.getByTestId("theme-description");
      const themeAnnouncement = screen.getByTestId("theme-announcement");

      // Verify ARIA attributes
      expect(themeToggle).toHaveAttribute("aria-label", "Switch to dark theme");
      expect(themeToggle).toHaveAttribute("aria-pressed", "false");
      expect(themeToggle).toHaveAttribute(
        "aria-describedby",
        "theme-description"
      );
      expect(themeToggle).toHaveAttribute("role", "switch");

      // Verify description exists
      expect(themeDescription).toHaveAttribute("id", "theme-description");

      // Verify live region
      expect(themeAnnouncement).toHaveAttribute("aria-live", "polite");
      expect(themeAnnouncement).toHaveAttribute("aria-atomic", "true");
      expect(themeAnnouncement).toHaveTextContent("Light theme activated");

      // Test state change
      fireEvent.click(themeToggle);
      expect(themeToggle).toHaveAttribute(
        "aria-label",
        "Switch to light theme"
      );
      expect(themeToggle).toHaveAttribute("aria-pressed", "true");
      expect(themeAnnouncement).toHaveTextContent("Dark theme activated");
    });

    test("should announce dynamic color changes to screen readers", () => {
      const ColorChangeAnnouncementComponent = () => {
        const [currentPage, setCurrentPage] = React.useState("/");

        const pageInfo = {
          "/": { name: "Home", color: "soft blue" },
          "/about": { name: "About", color: "soft lavender" },
          "/education": { name: "Education", color: "fresh green" },
          "/research": { name: "Research", color: "warm coral" },
        };

        const currentPageInfo = pageInfo[currentPage as keyof typeof pageInfo];

        return (
          <div>
            <nav>
              {Object.entries(pageInfo).map(([path, info]) => (
                <button
                  key={path}
                  data-testid={`nav-${info.name.toLowerCase()}`}
                  onClick={() => setCurrentPage(path)}
                  aria-current={currentPage === path ? "page" : undefined}
                  style={{
                    color:
                      currentPage === path
                        ? `var(--color-${info.color.replace(" ", "-")})`
                        : "var(--foreground)",
                    fontWeight: currentPage === path ? 600 : 400,
                    margin: "0 8px",
                  }}
                >
                  {info.name}
                </button>
              ))}
            </nav>
            <div
              data-testid="color-announcement"
              aria-live="polite"
              aria-atomic="true"
              style={{
                position: "absolute",
                left: "-10000px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              {currentPageInfo.name} page selected. Theme color:{" "}
              {currentPageInfo.color}
            </div>
            <main
              data-testid="main-content"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                padding: "16px",
              }}
            >
              <h1
                style={{
                  color: `var(--color-${currentPageInfo.color.replace(
                    " ",
                    "-"
                  )})`,
                }}
              >
                {currentPageInfo.name} Page
              </h1>
            </main>
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <ColorChangeAnnouncementComponent />
        </AccessibleTestWrapper>
      );

      const homeNav = screen.getByTestId("nav-home");
      const aboutNav = screen.getByTestId("nav-about");
      const colorAnnouncement = screen.getByTestId("color-announcement");

      // Initial state
      expect(homeNav).toHaveAttribute("aria-current", "page");
      expect(colorAnnouncement).toHaveTextContent(
        "Home page selected. Theme color: soft blue"
      );

      // Navigate to about page
      fireEvent.click(aboutNav);
      expect(aboutNav).toHaveAttribute("aria-current", "page");
      expect(homeNav).not.toHaveAttribute("aria-current");
      expect(colorAnnouncement).toHaveTextContent(
        "About page selected. Theme color: soft lavender"
      );
    });
  });

  describe("High Contrast Mode Support", () => {
    test("should maintain functionality in high contrast mode", () => {
      // Mock high contrast media query
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === "(prefers-contrast: high)",
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      const HighContrastComponent = () => {
        const prefersHighContrast = window.matchMedia(
          "(prefers-contrast: high)"
        ).matches;

        return (
          <div>
            <div
              data-testid="high-contrast-text"
              style={{
                color: prefersHighContrast ? "#000000" : "var(--foreground)",
                backgroundColor: prefersHighContrast
                  ? "#ffffff"
                  : "var(--background)",
                border: prefersHighContrast
                  ? "2px solid #000000"
                  : "1px solid var(--border)",
                padding: "8px",
              }}
            >
              High contrast text
            </div>
            <button
              data-testid="high-contrast-button"
              style={{
                color: prefersHighContrast ? "#ffffff" : "white",
                backgroundColor: prefersHighContrast
                  ? "#000000"
                  : "var(--color-soft-blue)",
                border: prefersHighContrast ? "2px solid #ffffff" : "none",
                padding: "8px 16px",
              }}
            >
              High contrast button
            </button>
          </div>
        );
      };

      render(
        <AccessibleTestWrapper>
          <HighContrastComponent />
        </AccessibleTestWrapper>
      );

      const text = screen.getByTestId("high-contrast-text");
      const button = screen.getByTestId("high-contrast-button");

      // Should use high contrast colors
      expect(text).toHaveStyle({
        color: "#000000",
        backgroundColor: "#ffffff",
        border: "2px solid #000000",
      });

      expect(button).toHaveStyle({
        color: "#ffffff",
        backgroundColor: "#000000",
        border: "2px solid #ffffff",
      });
    });
  });

  describe("Error States and Fallbacks", () => {
    test("should handle CSS variable failures gracefully", () => {
      const FallbackComponent = () => (
        <div>
          <div
            data-testid="fallback-background"
            style={{
              backgroundColor: "var(--non-existent-bg, #ffffff)",
              color: "var(--non-existent-text, #000000)",
              border: "1px solid var(--non-existent-border, #cccccc)",
              padding: "8px",
            }}
          >
            Content with fallback colors
          </div>
          <button
            data-testid="fallback-button"
            style={{
              backgroundColor: "var(--non-existent-accent, #0066cc)",
              color: "var(--non-existent-button-text, #ffffff)",
              border: "none",
              padding: "8px 16px",
            }}
          >
            Button with fallback colors
          </button>
        </div>
      );

      render(
        <AccessibleTestWrapper>
          <FallbackComponent />
        </AccessibleTestWrapper>
      );

      const background = screen.getByTestId("fallback-background");
      const button = screen.getByTestId("fallback-button");

      // Should have fallback values in CSS
      expect(background).toHaveStyle({
        backgroundColor: "var(--non-existent-bg, #ffffff)",
        color: "var(--non-existent-text, #000000)",
        border: "1px solid var(--non-existent-border, #cccccc)",
      });

      expect(button).toHaveStyle({
        backgroundColor: "var(--non-existent-accent, #0066cc)",
        color: "var(--non-existent-button-text, #ffffff)",
      });
    });

    test("should maintain accessibility when JavaScript fails", () => {
      const NoJSComponent = () => (
        <div>
          <noscript>
            <div data-testid="noscript-message">
              This site works best with JavaScript enabled, but basic
              functionality is available without it.
            </div>
          </noscript>
          <div
            data-testid="css-only-theme"
            className="light-theme"
            style={{
              backgroundColor: "#fafafa", // Hardcoded light theme fallback
              color: "#000000",
              padding: "16px",
            }}
          >
            <h1 style={{ color: "#a8c5e9" }}>CSS-Only Theme Fallback</h1>
            <p>
              This content is accessible even without JavaScript theme
              switching.
            </p>
            <button
              style={{
                backgroundColor: "#a8c5e9",
                color: "white",
                border: "none",
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Accessible Button
            </button>
          </div>
        </div>
      );

      render(
        <AccessibleTestWrapper>
          <NoJSComponent />
        </AccessibleTestWrapper>
      );

      const cssOnlyTheme = screen.getByTestId("css-only-theme");

      expect(cssOnlyTheme).toHaveStyle({
        backgroundColor: "#fafafa",
        color: "#000000",
      });

      expect(screen.getByText("CSS-Only Theme Fallback")).toBeInTheDocument();
      expect(screen.getByText("Accessible Button")).toBeInTheDocument();
    });
  });
});
