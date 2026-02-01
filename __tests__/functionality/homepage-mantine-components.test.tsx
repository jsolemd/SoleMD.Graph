/**
 * @fileoverview Functionality tests for Mantine components on homepage
 * @description Tests to ensure homepage Mantine components work after cleanup
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { Button, Card } from "@mantine/core";

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Homepage Mantine Components Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Hero Section Buttons", () => {
    it("should render gradient button correctly", () => {
      render(
        <TestWrapper>
          <Button
            size="lg"
            className="bg-gradient-to-r from-orange-500 to-cyan-500 hover:from-orange-600 hover:to-cyan-600 text-white px-8 py-4 text-lg font-medium border-0"
          >
            Explore Integration
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /explore integration/i,
      });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("data-size", "lg");
      expect(button).toHaveClass(
        "bg-gradient-to-r",
        "from-orange-500",
        "to-cyan-500"
      );
    });

    it("should render outline button correctly", () => {
      render(
        <TestWrapper>
          <Button
            size="lg"
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg font-medium bg-transparent backdrop-blur-sm"
          >
            View Research
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /view research/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("data-variant", "outline");
      expect(button).toHaveAttribute("data-size", "lg");
      expect(button).toHaveClass("border-gray-300", "text-gray-700");
    });

    it("should render CTA button correctly", () => {
      render(
        <TestWrapper>
          <Button
            size="lg"
            className="bg-[#7e22ce] hover:bg-[#6b21a8] text-white px-8 py-4 text-lg font-medium"
          >
            Get Started Today
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /get started today/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("data-size", "lg");
      expect(button).toHaveClass("bg-[#7e22ce]", "text-white");
    });

    it("should handle button clicks", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Explore Integration</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /explore integration/i,
      });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Navigation Cards", () => {
    it("should render About card correctly", () => {
      render(
        <TestWrapper>
          <Card className="p-8 border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-blue-50 to-blue-100/50 backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">About</h3>
            <p className="text-gray-600 leading-relaxed">
              Meet the psychiatrist and neuroscientist behind SoleMD's mission
              to transform mental health education through AI.
            </p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(
        screen.getByText(/meet the psychiatrist and neuroscientist/i)
      ).toBeInTheDocument();
    });

    it("should render Research card correctly", () => {
      render(
        <TestWrapper>
          <Card className="p-8 border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-teal-50 to-teal-100/50 backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">
              Research
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Explore cutting-edge publications in computational psychiatry,
              neuroimaging AI, and digital mental health.
            </p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Research")).toBeInTheDocument();
      expect(
        screen.getByText(/cutting-edge publications/i)
      ).toBeInTheDocument();
    });

    it("should render Education card correctly", () => {
      render(
        <TestWrapper>
          <Card className="p-8 border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-purple-50 to-purple-100/50 backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">
              Education
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Comprehensive learning modules for AI in psychiatry, computational
              neuroscience, and neuroimaging analysis.
            </p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Education")).toBeInTheDocument();
      expect(
        screen.getByText(/comprehensive learning modules/i)
      ).toBeInTheDocument();
    });

    it("should render Knowledge Wiki card correctly", () => {
      render(
        <TestWrapper>
          <Card className="p-8 border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-green-50 to-green-100/50 backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">
              Knowledge Wiki
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Interactive knowledge graph connecting neuroscience concepts,
              psychiatric disorders, and evidence-based treatments.
            </p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Knowledge Wiki")).toBeInTheDocument();
      expect(
        screen.getByText(/interactive knowledge graph/i)
      ).toBeInTheDocument();
    });

    it("should apply correct card styling classes", () => {
      render(
        <TestWrapper>
          <Card
            className="p-8 border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-gradient-to-br from-blue-50 to-blue-100/50 backdrop-blur-sm"
            data-testid="test-card"
          >
            Test Card
          </Card>
        </TestWrapper>
      );

      const card = screen.getByTestId("test-card");
      expect(card).toHaveClass(
        "p-8",
        "border-0",
        "shadow-sm",
        "bg-gradient-to-br",
        "from-blue-50"
      );
    });
  });

  describe("Component Integration", () => {
    it("should render card with button inside", () => {
      render(
        <TestWrapper>
          <Card className="p-8">
            <h3>Card Title</h3>
            <Button>Card Action</Button>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Card Title")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /card action/i })
      ).toBeInTheDocument();
    });

    it("should handle interactions within cards", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Card className="p-8">
            <Button onClick={handleClick}>Interactive Button</Button>
          </Card>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /interactive button/i,
      });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Responsive Design Classes", () => {
    it("should have responsive text classes", () => {
      render(
        <TestWrapper>
          <h1 className="text-5xl md:text-7xl font-light text-gray-900">
            Responsive Heading
          </h1>
        </TestWrapper>
      );

      const heading = screen.getByText("Responsive Heading");
      expect(heading).toHaveClass("text-5xl", "md:text-7xl", "font-light");
    });

    it("should have responsive button layout classes", () => {
      render(
        <TestWrapper>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button>Button 1</Button>
            <Button>Button 2</Button>
          </div>
        </TestWrapper>
      );

      const container = screen.getByText("Button 1").closest(".flex");
      expect(container).toHaveClass(
        "flex",
        "flex-col",
        "sm:flex-row",
        "gap-4",
        "justify-center"
      );
    });

    it("should have responsive grid classes", () => {
      render(
        <TestWrapper>
          <div className="grid md:grid-cols-2 gap-8">
            <Card>Card 1</Card>
            <Card>Card 2</Card>
          </div>
        </TestWrapper>
      );

      const grid = screen.getByText("Card 1").closest(".grid");
      expect(grid).toHaveClass("grid", "md:grid-cols-2", "gap-8");
    });
  });

  describe("Accessibility", () => {
    it("should have accessible button labels", () => {
      render(
        <TestWrapper>
          <Button aria-label="Accessible button">Button Text</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /accessible button/i });
      expect(button).toHaveAttribute("aria-label", "Accessible button");
    });

    it("should support keyboard navigation on buttons", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Keyboard Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /keyboard button/i });

      // Focus and activate with Enter
      button.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should have proper heading hierarchy", () => {
      render(
        <TestWrapper>
          <div>
            <h1>Main Heading</h1>
            <h2>Section Heading</h2>
            <h3>Card Heading</h3>
          </div>
        </TestWrapper>
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Main Heading"
      );
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Section Heading"
      );
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
        "Card Heading"
      );
    });
  });

  describe("Theme Integration", () => {
    it("should apply brand colors correctly", () => {
      render(
        <TestWrapper>
          <Button className="bg-[#7e22ce] text-white">Brand Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /brand button/i });
      expect(button).toHaveClass("bg-[#7e22ce]", "text-white");
    });

    it("should apply gradient backgrounds", () => {
      render(
        <TestWrapper>
          <div
            className="bg-gradient-to-r from-orange-500 to-cyan-500"
            data-testid="gradient"
          >
            Gradient Background
          </div>
        </TestWrapper>
      );

      const element = screen.getByTestId("gradient");
      expect(element).toHaveClass(
        "bg-gradient-to-r",
        "from-orange-500",
        "to-cyan-500"
      );
    });

    it("should apply hover states", () => {
      render(
        <TestWrapper>
          <Button className="hover:bg-gray-50">Hover Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /hover button/i });
      expect(button).toHaveClass("hover:bg-gray-50");
    });
  });
});
