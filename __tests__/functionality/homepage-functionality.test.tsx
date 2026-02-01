/**
 * @fileoverview Functionality tests for homepage components
 * @description Tests to ensure homepage functionality works after Mantine migration
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import LandingPage from "@/app/page";

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({ children, href, ...props }: any) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
}));

// Hero canvas will be changed significantly, so we'll skip mocking it for now

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Homepage Functionality", () => {
  beforeEach(() => {
    // Mock IntersectionObserver
    global.IntersectionObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Page Structure", () => {
    // Hero canvas test skipped - component will be changed significantly

    it("should render main heading", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(screen.getByText("Psychiatry")).toBeInTheDocument();
      expect(screen.getByText("Reimagined")).toBeInTheDocument();
    });

    it("should render hero section description", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(screen.getByText(/neural circuits/i)).toBeInTheDocument();
      expect(screen.getByText(/artificial intelligence/i)).toBeInTheDocument();
    });

    it("should render all main sections", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      // Check for section headings
      expect(screen.getByText("Discover Our")).toBeInTheDocument();
      expect(screen.getByText("Platform")).toBeInTheDocument();
      expect(screen.getByText("Ready to advance your")).toBeInTheDocument();
      expect(screen.getByText("neuroscience knowledge?")).toBeInTheDocument();
    });
  });

  describe("Navigation Cards", () => {
    it("should render all navigation cards", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("Research")).toBeInTheDocument();
      expect(screen.getByText("Education")).toBeInTheDocument();
      expect(screen.getByText("Knowledge Wiki")).toBeInTheDocument();
    });

    it("should have correct links for navigation cards", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(
        screen.getByRole("link", { name: /about meet the psychiatrist/i })
      ).toHaveAttribute("href", "/about");
      expect(
        screen.getByRole("link", { name: /research explore cutting-edge/i })
      ).toHaveAttribute("href", "/research");
      expect(
        screen.getByRole("link", { name: /education comprehensive learning/i })
      ).toHaveAttribute("href", "/education");
      expect(
        screen.getByRole("link", { name: /knowledge wiki interactive/i })
      ).toHaveAttribute("href", "https://publish.obsidian.md/solemd");
    });

    it("should have external link attributes for wiki", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const wikiLink = screen.getByRole("link", {
        name: /knowledge wiki interactive/i,
      });
      expect(wikiLink).toHaveAttribute("target", "_blank");
      expect(wikiLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Action Buttons", () => {
    it("should render hero action buttons", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(
        screen.getByRole("button", { name: /explore integration/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /view research/i })
      ).toBeInTheDocument();
    });

    it("should render CTA button", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(
        screen.getByRole("button", { name: /get started today/i })
      ).toBeInTheDocument();
    });

    it("should have correct button variants", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const exploreButton = screen.getByRole("button", {
        name: /explore integration/i,
      });
      const viewButton = screen.getByRole("button", { name: /view research/i });

      // Check for gradient classes on explore button
      expect(exploreButton).toHaveClass(
        "bg-gradient-to-r",
        "from-orange-500",
        "to-cyan-500"
      );

      // Check for outline variant on view button
      expect(viewButton).toHaveAttribute("data-variant", "outline");
    });

    it("should handle button clicks", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const exploreButton = screen.getByRole("button", {
        name: /explore integration/i,
      });

      // Button should be clickable (not throw error)
      await user.click(exploreButton);
      expect(exploreButton).toBeInTheDocument();
    });
  });

  describe("Content Sections", () => {
    it("should render card descriptions", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(
        screen.getByText(/meet the psychiatrist and neuroscientist/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/cutting-edge publications in computational/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/comprehensive learning modules for ai/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/interactive knowledge graph connecting/i)
      ).toBeInTheDocument();
    });

    it("should render CTA section content", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      expect(
        screen.getByText(/join hundreds of mental health professionals/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/computational psychiatry/i)).toBeInTheDocument();
    });
  });

  describe("Icons and Visual Elements", () => {
    it("should render card icons", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      // Icons are rendered as SVG elements with specific classes
      const icons = screen.getAllByRole("img", { hidden: true });
      expect(icons.length).toBeGreaterThan(0);
    });

    it("should render arrow icons for external links", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      // ArrowUpRight icons should be present for each card
      const arrowIcons = document.querySelectorAll("svg");
      expect(arrowIcons.length).toBeGreaterThan(0);
    });
  });

  describe("Responsive Behavior", () => {
    it("should render mobile-friendly structure", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      // Check for responsive classes
      const heroSection = screen.getByText("Psychiatry").closest("section");
      expect(heroSection).toHaveClass("min-h-screen");

      const container = screen.getByText("Psychiatry").closest(".container");
      expect(container).toHaveClass("max-w-4xl", "mx-auto", "px-6");
    });

    it("should have responsive text classes", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const mainHeading = screen.getByText("Psychiatry");
      expect(mainHeading).toHaveClass("text-5xl", "md:text-7xl");
    });
  });

  describe("Accessibility", () => {
    it("should have proper heading hierarchy", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      // Main heading should be h1
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

      // Section headings should be h2
      const h2Headings = screen.getAllByRole("heading", { level: 2 });
      expect(h2Headings.length).toBeGreaterThan(0);

      // Card headings should be h3
      const h3Headings = screen.getAllByRole("heading", { level: 3 });
      expect(h3Headings.length).toBe(4); // About, Research, Education, Knowledge Wiki
    });

    it("should have accessible button labels", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toHaveAccessibleName();
      });
    });

    it("should have accessible link labels", () => {
      render(
        <TestWrapper>
          <LandingPage />
        </TestWrapper>
      );

      const links = screen.getAllByRole("link");
      links.forEach((link) => {
        expect(link).toHaveAccessibleName();
      });
    });
  });
});
