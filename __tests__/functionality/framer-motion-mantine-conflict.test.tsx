/**
 * @fileoverview Tests for Framer Motion + Mantine conflicts
 * @description Tests to identify conflicts between Framer Motion and Mantine components
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { Button, Card } from "@mantine/core";
import { motion } from "framer-motion";

// Test wrapper with Mantine provider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("Framer Motion + Mantine Conflicts", () => {
  describe("Button Conflicts", () => {
    it("should work correctly without motion wrapper", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Button onClick={handleClick}>Plain Button</Button>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /plain button/i });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should work correctly with motion wrapper", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={handleClick}>Motion Wrapped Button</Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /motion wrapped button/i,
      });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should preserve Mantine button attributes with motion wrapper", () => {
      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button size="lg" variant="outline">
              Motion Button
            </Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /motion button/i });
      expect(button).toHaveAttribute("data-size", "lg");
      expect(button).toHaveAttribute("data-variant", "outline");
    });

    it("should handle hover events with motion wrapper", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button className="hover:bg-gray-100">Hover Button</Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /hover button/i });

      // Hover should work (though we can't test the visual effect easily)
      await user.hover(button);
      expect(button).toHaveClass("hover:bg-gray-100");
    });
  });

  describe("Card Conflicts", () => {
    it("should work correctly without motion wrapper", () => {
      render(
        <TestWrapper>
          <Card className="p-4">
            <h3>Plain Card</h3>
            <p>Card content</p>
          </Card>
        </TestWrapper>
      );

      expect(screen.getByText("Plain Card")).toBeInTheDocument();
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });

    it("should work correctly with motion wrapper", () => {
      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.02, y: -5 }}>
            <Card className="p-4">
              <h3>Motion Card</h3>
              <p>Motion card content</p>
            </Card>
          </motion.div>
        </TestWrapper>
      );

      expect(screen.getByText("Motion Card")).toBeInTheDocument();
      expect(screen.getByText("Motion card content")).toBeInTheDocument();
    });

    it("should preserve card styling with motion wrapper", () => {
      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.02 }}>
            <Card className="p-8 shadow-lg" data-testid="motion-card">
              Motion Card Content
            </Card>
          </motion.div>
        </TestWrapper>
      );

      const card = screen.getByTestId("motion-card");
      expect(card).toHaveClass("p-8", "shadow-lg");
    });
  });

  describe("Event Propagation", () => {
    it("should handle click events through motion wrapper", async () => {
      const handleCardClick = jest.fn();
      const handleButtonClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.02 }}>
            <Card className="p-4" onClick={handleCardClick}>
              <h3>Clickable Card</h3>
              <Button onClick={handleButtonClick}>Card Button</Button>
            </Card>
          </motion.div>
        </TestWrapper>
      );

      // Click button - should only trigger button handler
      const button = screen.getByRole("button", { name: /card button/i });
      await user.click(button);

      expect(handleButtonClick).toHaveBeenCalledTimes(1);
      // Card click might also fire due to event bubbling - this is expected
    });

    it("should handle nested motion components", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.02 }}>
            <Card className="p-4">
              <motion.div whileHover={{ rotate: 5 }}>
                <Button onClick={handleClick}>Nested Motion Button</Button>
              </motion.div>
            </Card>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /nested motion button/i,
      });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Style Conflicts", () => {
    it("should preserve Mantine CSS variables with motion", () => {
      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button size="lg" variant="filled" data-testid="styled-button">
              Styled Button
            </Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByTestId("styled-button");

      // Check that Mantine attributes are preserved
      expect(button).toHaveAttribute("data-size", "lg");
      expect(button).toHaveAttribute("data-variant", "filled");

      // Check that Mantine classes are applied
      expect(button).toHaveClass("mantine-Button-root");
    });

    it("should handle custom classes with motion wrapper", () => {
      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button className="bg-blue-500 text-white px-8 py-4">
              Custom Styled Button
            </Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /custom styled button/i,
      });
      expect(button).toHaveClass("bg-blue-500", "text-white", "px-8", "py-4");
    });
  });

  describe("Accessibility with Motion", () => {
    it("should maintain accessibility with motion wrapper", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button aria-label="Accessible motion button">Motion Button</Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", {
        name: /accessible motion button/i,
      });

      // Should be focusable
      await user.tab();
      expect(button).toHaveFocus();

      // Should have aria attributes
      expect(button).toHaveAttribute("aria-label", "Accessible motion button");
    });

    it("should support keyboard navigation with motion", async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={handleClick}>Keyboard Button</Button>
          </motion.div>
        </TestWrapper>
      );

      const button = screen.getByRole("button", { name: /keyboard button/i });

      // Focus and activate with Enter
      button.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
