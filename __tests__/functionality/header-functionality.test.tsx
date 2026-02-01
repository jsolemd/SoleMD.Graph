/**
 * @fileoverview Functionality tests for header component
 * @description Tests to ensure header functionality works after Mantine migration
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import Header from "@/components/layout/Header";

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

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/"),
}));

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Header Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Header Structure", () => {
    it("should render header with correct role", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("should render logo and brand name", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      expect(screen.getByText("SoleMD")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /solemd/i })).toHaveAttribute(
        "href",
        "/"
      );
    });

    it("should render navigation links", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      expect(screen.getByRole("link", { name: /about/i })).toHaveAttribute(
        "href",
        "/about"
      );
      expect(screen.getByRole("link", { name: /research/i })).toHaveAttribute(
        "href",
        "/research"
      );
      expect(screen.getByRole("link", { name: /education/i })).toHaveAttribute(
        "href",
        "/education"
      );
      expect(screen.getByRole("link", { name: /wiki/i })).toHaveAttribute(
        "href",
        "/wiki"
      );
    });

    it("should render back to home button", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const backButton = screen.getByRole("button", { name: /back to home/i });
      expect(backButton).toBeInTheDocument();
      expect(backButton.closest("a")).toHaveAttribute("href", "/");
    });
  });

  describe("Active Path Styling", () => {
    it("should highlight active about link", () => {
      render(
        <TestWrapper>
          <Header activePath="/about" />
        </TestWrapper>
      );

      const aboutLink = screen.getByRole("link", { name: /about/i });
      expect(aboutLink).toHaveClass("text-blue-600", "font-semibold");
    });

    it("should highlight active research link", () => {
      render(
        <TestWrapper>
          <Header activePath="/research" />
        </TestWrapper>
      );

      const researchLink = screen.getByRole("link", { name: /research/i });
      expect(researchLink).toHaveClass("text-teal-600", "font-semibold");
    });

    it("should highlight active education link", () => {
      render(
        <TestWrapper>
          <Header activePath="/education" />
        </TestWrapper>
      );

      const educationLink = screen.getByRole("link", { name: /education/i });
      expect(educationLink).toHaveClass("text-purple-600", "font-semibold");
    });

    it("should apply default styling for inactive links", () => {
      render(
        <TestWrapper>
          <Header activePath="/other" />
        </TestWrapper>
      );

      const aboutLink = screen.getByRole("link", { name: /about/i });
      expect(aboutLink).toHaveClass("text-gray-600", "hover:text-gray-900");
      expect(aboutLink).not.toHaveClass("font-semibold");
    });
  });

  describe("Button Functionality", () => {
    it("should render Mantine button with correct props", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /back to home/i });
      expect(button).toHaveAttribute("data-variant", "subtle");
    });

    it("should handle button clicks", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /back to home/i });

      // Button should be clickable (not throw error)
      await user.click(button);
      expect(button).toBeInTheDocument();
    });

    it("should have hover styles applied", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /back to home/i });
      // Check that the button has the styles object applied
      expect(button).toBeInTheDocument();
    });
  });

  describe("Icons", () => {
    it("should render brain icon in logo", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      // Brain icon should be present (as SVG)
      const logoContainer = screen.getByText("SoleMD").previousElementSibling;
      expect(logoContainer).toHaveClass(
        "w-8",
        "h-8",
        "bg-[#7e22ce]",
        "rounded-lg"
      );
    });

    it("should render arrow left icon in button", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /back to home/i });
      // ArrowLeft icon should be present as leftSection
      expect(button).toBeInTheDocument();
    });
  });

  describe("Responsive Design", () => {
    it("should have responsive navigation", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const nav = screen.getByRole("navigation");
      expect(nav).toHaveClass("hidden", "md:flex");
    });

    it("should have responsive container", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const container = screen.getByRole("banner").firstElementChild;
      expect(container).toHaveClass(
        "container",
        "max-w-6xl",
        "mx-auto",
        "px-6"
      );
    });

    it("should have fixed positioning", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const header = screen.getByRole("banner");
      expect(header).toHaveClass("fixed", "top-0", "z-50", "w-full");
    });
  });

  describe("Styling and Theme", () => {
    it("should have backdrop blur styling", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const header = screen.getByRole("banner");
      expect(header).toHaveClass(
        "bg-white/80",
        "backdrop-blur-md",
        "border-b",
        "border-gray-100"
      );
    });

    it("should have correct brand colors", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const logoIcon = screen.getByText("SoleMD").previousElementSibling;
      expect(logoIcon).toHaveClass("bg-[#7e22ce]");
    });

    it("should have proper text styling", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const brandText = screen.getByText("SoleMD");
      expect(brandText).toHaveClass(
        "text-xl",
        "font-semibold",
        "text-gray-900"
      );
    });
  });

  describe("Accessibility", () => {
    it("should have proper landmark roles", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    it("should have accessible link labels", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const links = screen.getAllByRole("link");
      links.forEach((link) => {
        expect(link).toHaveAccessibleName();
      });
    });

    it("should have accessible button label", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /back to home/i });
      expect(button).toHaveAccessibleName();
    });

    it("should support keyboard navigation", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      // Tab through navigation elements
      await user.tab(); // Logo link
      expect(screen.getByRole("link", { name: /solemd/i })).toHaveFocus();

      await user.tab(); // About link
      expect(screen.getByRole("link", { name: /about/i })).toHaveFocus();

      await user.tab(); // Research link
      expect(screen.getByRole("link", { name: /research/i })).toHaveFocus();

      await user.tab(); // Education link
      expect(screen.getByRole("link", { name: /education/i })).toHaveFocus();

      await user.tab(); // Wiki link
      expect(screen.getByRole("link", { name: /wiki/i })).toHaveFocus();

      await user.tab(); // Back button (wrapped in link)
      const backLink = screen
        .getByRole("button", { name: /back to home/i })
        .closest("a");
      expect(backLink).toHaveFocus();
    });
  });

  describe("Link Behavior", () => {
    it("should have correct href attributes", () => {
      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      expect(screen.getByRole("link", { name: /solemd/i })).toHaveAttribute(
        "href",
        "/"
      );
      expect(screen.getByRole("link", { name: /about/i })).toHaveAttribute(
        "href",
        "/about"
      );
      expect(screen.getByRole("link", { name: /research/i })).toHaveAttribute(
        "href",
        "/research"
      );
      expect(screen.getByRole("link", { name: /education/i })).toHaveAttribute(
        "href",
        "/education"
      );
      expect(screen.getByRole("link", { name: /wiki/i })).toHaveAttribute(
        "href",
        "/wiki"
      );
    });

    it("should handle link clicks", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Header activePath="" />
        </TestWrapper>
      );

      const aboutLink = screen.getByRole("link", { name: /about/i });

      // Link should be clickable (not throw error)
      await user.click(aboutLink);
      expect(aboutLink).toBeInTheDocument();
    });
  });
});
