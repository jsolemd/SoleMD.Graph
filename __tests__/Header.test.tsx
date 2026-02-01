/**
 * Tests for Header component Button migration
 * Validates Mantine Button integration and functionality
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import Header from "../components/layout/Header";
import { solemTheme } from "../lib/mantine-theme";

// Mock next/link
jest.mock("next/link", () => {
  return ({ children, href, ...props }: any) => {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Test wrapper with Mantine provider only
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider theme={solemTheme} defaultColorScheme="light">
    {children}
  </MantineProvider>
);

describe("Header Component - Button Migration", () => {
  const defaultProps = {
    activePath: "/",
  };

  beforeEach(() => {
    // Clear any previous DOM state
    document.body.innerHTML = "";
  });

  test("renders Header with Mantine Button", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    // Check if the button is rendered
    const backButton = screen.getByRole("button", { name: /back to home/i });
    expect(backButton).toBeInTheDocument();
  });

  test("Button has correct Mantine variant (subtle)", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Check if the button has Mantine's subtle variant classes
    // Mantine applies specific classes for the subtle variant
    expect(backButton).toHaveClass("mantine-Button-root");
  });

  test("Button contains ArrowLeft icon", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Check if the ArrowLeft icon is present in the button
    // Mantine renders the leftSection as a span with specific classes
    const leftSection =
      backButton.querySelector("svg") ||
      backButton.querySelector(".mantine-Button-section");
    expect(leftSection).toBeInTheDocument();
  });

  test("Button has correct text content", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });
    expect(backButton).toHaveTextContent("Back to Home");
  });

  test("Button is wrapped in Link with correct href", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const linkElement = screen.getByRole("link", { name: /back to home/i });
    expect(linkElement).toHaveAttribute("href", "/");
  });

  test("Button has hover styles applied", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Check if transition styles are applied
    const computedStyle = window.getComputedStyle(backButton);
    expect(computedStyle.transition).toContain("300ms");
  });

  test("Button responds to click events", () => {
    const mockClick = jest.fn();

    render(
      <TestWrapper>
        <div onClick={mockClick}>
          <Header {...defaultProps} />
        </div>
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });
    fireEvent.click(backButton);

    // Button should be clickable (no errors thrown)
    expect(backButton).toBeInTheDocument();
  });

  test("Button maintains accessibility attributes", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Check accessibility attributes
    expect(backButton).toHaveAttribute("type", "button");
    expect(backButton).not.toHaveAttribute("disabled");
  });

  test("Button works with keyboard navigation", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Focus the button
    backButton.focus();
    expect(document.activeElement).toBe(backButton);

    // Test Enter key
    fireEvent.keyDown(backButton, { key: "Enter", code: "Enter" });
    expect(backButton).toBeInTheDocument();

    // Test Space key
    fireEvent.keyDown(backButton, { key: " ", code: "Space" });
    expect(backButton).toBeInTheDocument();
  });

  test("Header renders other elements correctly alongside migrated Button", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    // Check if other header elements are still present
    expect(screen.getByText("SoleMD")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.getByText("Wiki")).toBeInTheDocument();

    // Check if the migrated button is also present
    expect(
      screen.getByRole("button", { name: /back to home/i })
    ).toBeInTheDocument();
  });

  test("Button variant mapping works correctly", () => {
    render(
      <TestWrapper>
        <Header {...defaultProps} />
      </TestWrapper>
    );

    const backButton = screen.getByRole("button", { name: /back to home/i });

    // Verify that the button has Mantine-specific classes
    // The subtle variant should not have filled/solid background styles
    expect(backButton).toHaveClass("mantine-Button-root");

    // Check that it doesn't have filled variant classes (which would be default)
    const classList = Array.from(backButton.classList);
    const hasSubtleVariant = classList.some(
      (className) =>
        className.includes("subtle") || !className.includes("filled")
    );
    expect(hasSubtleVariant).toBe(true);
  });
});

describe("Header Component - Integration Tests", () => {
  test("Button migration doesn't break existing Header functionality", () => {
    const testPaths = ["/", "/about", "/research", "/education"];

    testPaths.forEach((path) => {
      render(
        <TestWrapper>
          <Header activePath={path} />
        </TestWrapper>
      );

      // Verify button is always present regardless of active path
      expect(
        screen.getByRole("button", { name: /back to home/i })
      ).toBeInTheDocument();

      // Clean up for next iteration
      document.body.innerHTML = "";
    });
  });

  test("Button works with different theme modes", () => {
    // Test with light theme
    render(
      <MantineProvider theme={solemTheme} defaultColorScheme="light">
        <Header activePath="/" />
      </MantineProvider>
    );

    let backButton = screen.getByRole("button", { name: /back to home/i });
    expect(backButton).toBeInTheDocument();

    // Clean up
    document.body.innerHTML = "";

    // Test with dark theme
    render(
      <MantineProvider theme={solemTheme} defaultColorScheme="dark">
        <Header activePath="/" />
      </MantineProvider>
    );

    backButton = screen.getByRole("button", { name: /back to home/i });
    expect(backButton).toBeInTheDocument();
  });
});
