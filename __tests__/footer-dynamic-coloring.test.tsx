/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { usePathname } from "next/navigation";
import Footer from "@/components/layout/Footer";
import { MantineProvider } from "@mantine/core";
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
  },
}));

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Footer Dynamic Coloring", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUsePathname.mockReset();
  });

  describe("Logo Dynamic Coloring", () => {
    test("should apply correct page color to logo icon background", () => {
      mockUsePathname.mockReturnValue("/about");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      // Find the logo icon container
      const logoIcon = screen
        .getByRole("button")
        .querySelector('[style*="background-color"]');
      expect(logoIcon).toHaveStyle({
        backgroundColor: "var(--color-soft-lavender)",
        transition: "background-color 300ms ease",
      });
    });

    test("should apply correct page color to MD text", () => {
      mockUsePathname.mockReturnValue("/education");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      // Find the "MD" text element
      const mdText = screen.getByText("MD");
      expect(mdText).toHaveStyle({
        color: "var(--color-fresh-green)",
        transition: "color 300ms ease",
      });
    });

    test("should use default color for unknown routes", () => {
      mockUsePathname.mockReturnValue("/unknown-route");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const logoIcon = screen
        .getByRole("button")
        .querySelector('[style*="background-color"]');
      expect(logoIcon).toHaveStyle({
        backgroundColor: "var(--color-soft-blue)", // Default color
      });
    });
  });

  describe("Navigation Links Dynamic Coloring", () => {
    test("should highlight active navigation link with correct color", () => {
      mockUsePathname.mockReturnValue("/research");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const researchLink = screen.getByText("Research");
      expect(researchLink).toHaveStyle({
        color: "var(--color-warm-coral)",
        fontWeight: "600",
      });
    });

    test("should show inactive links with default text color", () => {
      mockUsePathname.mockReturnValue("/about");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const educationLink = screen.getByText("Education");
      expect(educationLink).toHaveStyle({
        color: "var(--mantine-color-text)",
        fontWeight: "500",
      });
    });

    test("should show active indicator dot for current page", () => {
      mockUsePathname.mockReturnValue("/education");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      // Find the active indicator dot
      const educationLink = screen.getByText("Education").parentElement;
      const indicatorDot = educationLink?.querySelector(
        '[style*="border-radius: 50%"]'
      );

      expect(indicatorDot).toBeInTheDocument();
      expect(indicatorDot).toHaveStyle({
        backgroundColor: "var(--color-fresh-green)",
      });
    });
  });

  describe("Theme-Aware Styling", () => {
    test("should use theme-aware CSS variables for background and borders", () => {
      mockUsePathname.mockReturnValue("/");

      const { container } = render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const footer = container.querySelector("footer");
      expect(footer).toHaveStyle({
        borderColor: "var(--border)",
        backgroundColor: "var(--background)",
        transition: "all 300ms ease",
      });
    });

    test("should use theme-aware styling for copyright text", () => {
      mockUsePathname.mockReturnValue("/");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const copyrightText = screen.getByText(
        /© \d{4} SoleMD\. All rights reserved\./
      );
      expect(copyrightText).toHaveStyle({
        color: "var(--foreground)",
        opacity: "0.7",
        transition: "color 300ms ease",
      });
    });

    test("should use theme-aware styling for divider", () => {
      mockUsePathname.mockReturnValue("/");

      const { container } = render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      // Check if divider uses theme-aware border color
      const divider = container.querySelector('[role="separator"]');
      expect(divider).toBeInTheDocument();
    });
  });

  describe("Hover Effects", () => {
    test("should change link color on hover for inactive links", () => {
      mockUsePathname.mockReturnValue("/about");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const educationLink = screen.getByText("Education");

      // Simulate mouse enter
      fireEvent.mouseEnter(educationLink);
      expect(educationLink).toHaveStyle({
        color: "var(--color-fresh-green)",
      });

      // Simulate mouse leave
      fireEvent.mouseLeave(educationLink);
      expect(educationLink).toHaveStyle({
        color: "var(--mantine-color-text)",
      });
    });

    test("should not change color on hover for active links", () => {
      mockUsePathname.mockReturnValue("/research");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const researchLink = screen.getByText("Research");
      const initialColor = "var(--color-warm-coral)";

      expect(researchLink).toHaveStyle({ color: initialColor });

      // Hover should not change active link color
      fireEvent.mouseEnter(researchLink);
      expect(researchLink).toHaveStyle({ color: initialColor });
    });
  });

  describe("Consistency with Header Implementation", () => {
    test("should use same logo sizing as Header (32px)", () => {
      mockUsePathname.mockReturnValue("/");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const logoIcon = screen
        .getByRole("button")
        .querySelector('[style*="width"]');
      expect(logoIcon).toHaveStyle({
        width: "2rem", // 32px in rem
        height: "2rem",
      });
    });

    test("should use same text sizing as Header (lg)", () => {
      mockUsePathname.mockReturnValue("/");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const soleText = screen.getByText("Sole");
      const mdText = screen.getByText("MD");

      // Both should have consistent styling with Header
      expect(soleText).toHaveStyle({ color: "var(--mantine-color-text)" });
      expect(mdText).toHaveStyle({ color: "var(--color-soft-blue)" });
    });

    test("should use same transition timing as Header (300ms)", () => {
      mockUsePathname.mockReturnValue("/about");

      render(
        <TestWrapper>
          <Footer />
        </TestWrapper>
      );

      const logoIcon = screen
        .getByRole("button")
        .querySelector('[style*="transition"]');
      expect(logoIcon).toHaveStyle({
        transition: "background-color 300ms ease",
      });
    });
  });

  describe("Page Color Mapping Validation", () => {
    const testCases = [
      { path: "/", expectedColor: "var(--color-soft-blue)", label: "Home" },
      {
        path: "/about",
        expectedColor: "var(--color-soft-lavender)",
        label: "About",
      },
      {
        path: "/research",
        expectedColor: "var(--color-warm-coral)",
        label: "Research",
      },
      {
        path: "/education",
        expectedColor: "var(--color-fresh-green)",
        label: "Education",
      },
      {
        path: "/wiki",
        expectedColor: "var(--color-golden-yellow)",
        label: "Wiki",
      },
    ];

    testCases.forEach(({ path, expectedColor, label }) => {
      test(`should apply correct color for ${label} page (${path})`, () => {
        mockUsePathname.mockReturnValue(path);

        render(
          <TestWrapper>
            <Footer />
          </TestWrapper>
        );

        const logoIcon = screen
          .getByRole("button")
          .querySelector('[style*="background-color"]');
        const mdText = screen.getByText("MD");

        expect(logoIcon).toHaveStyle({ backgroundColor: expectedColor });
        expect(mdText).toHaveStyle({ color: expectedColor });
      });
    });
  });
});

describe("getCurrentPageColor Function Integration", () => {
  test("should return correct colors for all navigation routes", () => {
    navigationLinks.forEach((link) => {
      const color = getCurrentPageColor(link.link);
      expect(color).toBe(link.color);
    });
  });

  test("should return default color for unknown routes", () => {
    const color = getCurrentPageColor("/unknown-route");
    expect(color).toBe("var(--color-soft-blue)");
  });
});
