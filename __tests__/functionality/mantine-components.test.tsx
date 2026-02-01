/**
 * @fileoverview Functionality tests for Mantine components
 * @description Tests to ensure Mantine components work identically after cleanup
 */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { Button, Card } from "@mantine/core";

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Mantine Components Functionality", () => {
  beforeEach(() => {
    // Reset any mocks before each test
    jest.clearAllMocks();
  });

  describe("Mantine Button Component", () => {
    it("should render button with correct text", () => {
      render(
        <TestWrapper>
          <Button>Test Button</Button>
        </TestWrapper>
      );

      expect(
        screen.getByRole("button", { name: /test button/i })
      ).toBeInTheDocument();
    });

    it("should handle click events", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Clickable Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /clickable button/i });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should render gradient button with correct classes", () => {
      render(
        <TestWrapper>
          <Button className="bg-gradient-to-r from-orange-500 to-cyan-500">
            Gradient Button
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /gradient button/i });
      expect(button).toHaveClass(
        "bg-gradient-to-r",
        "from-orange-500",
        "to-cyan-500"
      );
    });

    it("should render outline variant button", () => {
      render(
        <TestWrapper>
          <Button variant="outline">Outline Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /outline button/i });
      expect(button).toHaveAttribute("data-variant", "outline");
    });

    it("should render large size button", () => {
      render(
        <TestWrapper>
          <Button size="lg">Large Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /large button/i });
      expect(button).toHaveAttribute("data-size", "lg");
    });

    it("should be disabled when disabled prop is true", () => {
      render(
        <TestWrapper>
          <Button disabled>Disabled Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /disabled button/i });
      expect(button).toBeDisabled();
    });
  });

  describe("Mantine Card Component", () => {
    it("should render card with content", () => {
      render(
        <TestWrapper>
          <Card>
            <h3>Card Title</h3>
            <p>Card content goes here</p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Card Title")).toBeInTheDocument();
      expect(screen.getByText("Card content goes here")).toBeInTheDocument();
    });

    it("should render card with custom classes", () => {
      render(
        <TestWrapper>
          <Card className="custom-card-class" data-testid="test-card">
            Card Content
          </Card>
        </TestWrapper>
      );

      const card = screen.getByTestId("test-card");
      expect(card).toHaveClass("custom-card-class");
    });

    it("should render card with padding", () => {
      render(
        <TestWrapper>
          <Card p="md" data-testid="padded-card">
            Padded Card
          </Card>
        </TestWrapper>
      );

      const card = screen.getByTestId("padded-card");
      expect(card).toBeInTheDocument();
    });

    it("should handle click events on clickable cards", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Card
            onClick={handleClick}
            data-testid="clickable-card"
            style={{ cursor: "pointer" }}
          >
            Clickable Card
          </Card>
        </TestWrapper>
      );

      const card = screen.getByTestId("clickable-card");
      await user.click(card);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Component Integration", () => {
    it("should render button inside card", () => {
      render(
        <TestWrapper>
          <Card>
            <h3>Card with Button</h3>
            <Button>Card Button</Button>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Card with Button")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /card button/i })
      ).toBeInTheDocument();
    });

    it("should handle complex interactions", async () => {
      const handleButtonClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Card>
            <h3>Interactive Card</h3>
            <Button onClick={handleButtonClick}>Action Button</Button>
          </Card>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /action button/i });
      await user.click(button);

      expect(handleButtonClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes on buttons", () => {
      render(
        <TestWrapper>
          <Button aria-label="Accessible button">Button with ARIA</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /accessible button/i });
      expect(button).toHaveAttribute("aria-label", "Accessible button");
    });

    it("should support keyboard navigation", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Keyboard Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /keyboard button/i });

      // Focus the button
      await user.tab();
      expect(button).toHaveFocus();

      // Press Enter to activate
      await user.keyboard("{Enter}");
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should support space key activation", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Space Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /space button/i });
      button.focus();

      // Press Space to activate
      await user.keyboard(" ");
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Styling and CSS Classes", () => {
    it("should apply Tailwind classes correctly", () => {
      render(
        <TestWrapper>
          <Button className="px-8 py-4 text-lg font-medium">
            Styled Button
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /styled button/i });
      expect(button).toHaveClass("px-8", "py-4", "text-lg", "font-medium");
    });

    it("should apply gradient background classes", () => {
      render(
        <TestWrapper>
          <Button className="bg-gradient-to-r from-orange-500 to-cyan-500 text-white">
            Gradient Button
          </Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /gradient button/i });
      expect(button).toHaveClass(
        "bg-gradient-to-r",
        "from-orange-500",
        "to-cyan-500",
        "text-white"
      );
    });

    it("should apply hover classes", () => {
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
