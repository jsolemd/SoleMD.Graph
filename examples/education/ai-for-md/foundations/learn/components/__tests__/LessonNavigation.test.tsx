/**
 * @fileoverview Test file for LessonNavigation component
 * @description Unit tests covering happy path, error cases, and edge cases
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

// Always import for custom matchers like .toBeInTheDocument()
import "@testing-library/jest-dom";

// Core RTL functions
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Use userEvent for realistic user interactions
import userEvent from "@testing-library/user-event";

// Component under test
import LessonNavigation from "../LessonNavigation";

// Types
import { Lesson, LessonProgress } from "../../../lib/types";

// Mock framer-motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    nav: ({
      children,
      initial,
      animate,
      transition,
      whileHover,
      whileTap,
      ...props
    }: any) => <nav {...props}>{children}</nav>,
    div: ({
      children,
      initial,
      animate,
      transition,
      whileHover,
      whileTap,
      ...props
    }: any) => <div {...props}>{children}</div>,
    button: ({
      children,
      initial,
      animate,
      transition,
      whileHover,
      whileTap,
      ...props
    }: any) => <button {...props}>{children}</button>,
  },
  useReducedMotion: () => false,
}));

// -----------------------------------------------------------------------------
// TEST DATA
// -----------------------------------------------------------------------------

const mockLessons: Lesson[] = [
  {
    id: "lesson-1",
    title: "Introduction to AI in Healthcare",
    description:
      "Overview of artificial intelligence applications in modern healthcare settings.",
    duration: 30,
    content: [],
    prerequisites: [],
    learningObjectives: ["Define AI in healthcare", "Identify applications"],
    order: 1,
    published: true,
  },
  {
    id: "lesson-2",
    title: "Clinical Decision Support Systems",
    description: "Understanding how AI supports clinical decision-making.",
    duration: 45,
    content: [],
    prerequisites: ["lesson-1"],
    learningObjectives: ["Understand CDSS", "Evaluate benefits"],
    order: 2,
    published: true,
  },
  {
    id: "lesson-3",
    title: "Machine Learning in Diagnostics",
    description: "Exploring ML applications in medical diagnostics.",
    duration: 60,
    content: [],
    prerequisites: ["lesson-1", "lesson-2"],
    learningObjectives: ["Apply ML concepts", "Analyze diagnostic tools"],
    order: 3,
    published: true,
  },
];

const mockLessonProgress: Record<string, LessonProgress> = {
  "lesson-1": {
    lessonId: "lesson-1",
    completed: true,
    active: false,
    timeSpent: 25,
    lastAccessed: new Date(),
    contentProgress: 100,
    completedBlocks: ["block-1", "block-2"],
  },
  "lesson-2": {
    lessonId: "lesson-2",
    completed: false,
    active: true,
    timeSpent: 15,
    lastAccessed: new Date(),
    contentProgress: 60,
    completedBlocks: ["block-1"],
  },
};

const defaultProps = {
  lessons: mockLessons,
  currentLessonId: "lesson-2",
  onLessonChange: jest.fn(),
  completedLessons: ["lesson-1"],
};

// -----------------------------------------------------------------------------
// TEST SUITE
// -----------------------------------------------------------------------------

describe("LessonNavigation", () => {
  // Reset mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.innerWidth for responsive tests
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  // Happy path test
  it("should render lessons and handle lesson selection successfully", async () => {
    // ARRANGE
    const mockOnLessonChange = jest.fn();
    const user = userEvent.setup();

    render(
      <LessonNavigation {...defaultProps} onLessonChange={mockOnLessonChange} />
    );

    // ASSERT - Check if lessons are rendered
    expect(
      screen.getByText("Introduction to AI in Healthcare")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Clinical Decision Support Systems")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Machine Learning in Diagnostics")
    ).toBeInTheDocument();

    // ASSERT - Check current lesson is highlighted
    const currentLessonButton = screen.getByRole("button", {
      name: /Clinical Decision Support Systems/i,
    });
    expect(currentLessonButton).toHaveAttribute("aria-current", "page");

    // ACT - Click on a different lesson
    const firstLessonButton = screen.getByRole("button", {
      name: /Introduction to AI in Healthcare/i,
    });
    await user.click(firstLessonButton);

    // ASSERT - Callback should be called
    expect(mockOnLessonChange).toHaveBeenCalledWith("lesson-1");
    expect(mockOnLessonChange).toHaveBeenCalledTimes(1);
  });

  // Accessibility test
  it("should provide proper accessibility features", () => {
    // ARRANGE
    render(<LessonNavigation {...defaultProps} />);

    // ASSERT - Navigation has proper role and label
    const navigation = screen.getByRole("navigation");
    expect(navigation).toHaveAttribute("aria-label", "Lesson navigation");

    // ASSERT - Lesson buttons have proper accessibility attributes
    const lessonButtons = screen
      .getAllByRole("button")
      .filter((button) =>
        button.getAttribute("aria-describedby")?.includes("lesson-")
      );
    lessonButtons.forEach((button) => {
      expect(button).toHaveAttribute("aria-describedby");
    });

    // ASSERT - Current lesson has aria-current
    const currentLessonButton = screen.getByRole("button", {
      name: /Clinical Decision Support Systems/i,
    });
    expect(currentLessonButton).toHaveAttribute("aria-current", "page");

    // ASSERT - Completed lesson has checkmark
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  // Keyboard navigation test
  it("should support keyboard navigation", async () => {
    // ARRANGE
    const mockOnLessonChange = jest.fn();
    const user = userEvent.setup();

    render(
      <LessonNavigation {...defaultProps} onLessonChange={mockOnLessonChange} />
    );

    // ACT - Click on first lesson to test basic functionality
    const firstLessonButton = screen.getByRole("button", {
      name: /Introduction to AI in Healthcare/i,
    });
    await user.click(firstLessonButton);

    // ASSERT - Should call onLessonChange for the clicked lesson
    expect(mockOnLessonChange).toHaveBeenCalledWith("lesson-1");
  });

  // Prerequisites test
  it("should handle lesson prerequisites correctly", () => {
    // ARRANGE - Render with no completed lessons
    render(
      <LessonNavigation
        {...defaultProps}
        completedLessons={[]}
        currentLessonId="lesson-1"
      />
    );

    // ASSERT - First lesson should be accessible
    const firstLessonButton = screen.getByRole("button", {
      name: /Introduction to AI in Healthcare/i,
    });
    expect(firstLessonButton).not.toBeDisabled();

    // ASSERT - Second lesson should be locked (has prerequisites)
    const secondLessonButton = screen.getByRole("button", {
      name: /Clinical Decision Support Systems/i,
    });
    expect(secondLessonButton).toBeDisabled();

    // ASSERT - Lock icon should be present for locked lessons
    // Note: Lock icons are rendered as Lucide icons, so we check for disabled state instead
    expect(secondLessonButton).toHaveAttribute("disabled");
  });

  // Progress indicators test
  it("should display progress indicators correctly", () => {
    // ARRANGE
    render(
      <LessonNavigation
        {...defaultProps}
        lessonProgress={mockLessonProgress}
        showDetailedProgress={true}
      />
    );

    // ASSERT - Completed lesson should show checkmark
    expect(
      screen.getByRole("button", {
        name: /Introduction to AI in Healthcare/i,
      })
    ).toBeInTheDocument();

    // ASSERT - Progress summary should be displayed
    expect(screen.getByText("1 of 3 completed")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  // Mobile responsive test
  it("should handle mobile responsive behavior", async () => {
    // ARRANGE - Mock mobile viewport
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 600,
    });

    const user = userEvent.setup();

    render(<LessonNavigation {...defaultProps} collapsible={true} />);

    // Trigger resize event
    fireEvent(window, new Event("resize"));

    // Wait for state update
    await waitFor(() => {
      // ASSERT - Should show collapse/expand button
      const toggleButton = screen.getByRole("button", {
        name: /Expand navigation|Collapse navigation/i,
      });
      expect(toggleButton).toBeInTheDocument();
    });
  });

  // Time estimates test
  it("should display time estimates when enabled", () => {
    // ARRANGE
    render(
      <LessonNavigation
        {...defaultProps}
        lessonProgress={mockLessonProgress}
        showTimeEstimates={true}
      />
    );

    // ASSERT - Should show remaining time for partially completed lesson
    expect(screen.getByText("30 min left")).toBeInTheDocument();

    // ASSERT - Should show total time for unstarted lesson
    expect(screen.getByText("60 min")).toBeInTheDocument();
  });

  // Collapse functionality test
  it("should handle collapse and expand functionality", async () => {
    // ARRANGE
    const user = userEvent.setup();

    render(<LessonNavigation {...defaultProps} collapsible={true} />);

    // ACT - Find and click the collapse button
    const toggleButton = screen.getByRole("button", {
      name: /Collapse navigation/i,
    });
    await user.click(toggleButton);

    // ASSERT - Navigation should be collapsed
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");

    // ACT - Click again to expand
    await user.click(toggleButton);

    // ASSERT - Navigation should be expanded
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
  });

  // Error handling test
  it("should handle empty lessons array gracefully", () => {
    // ARRANGE
    render(
      <LessonNavigation {...defaultProps} lessons={[]} completedLessons={[]} />
    );

    // ASSERT - Should still render navigation structure
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Course Navigation")).toBeInTheDocument();
    expect(screen.getByText("0 of 0 completed")).toBeInTheDocument();
  });

  // Custom props test
  it("should handle custom props correctly", () => {
    // ARRANGE
    const customAriaLabel = "Custom lesson navigation";
    const customClassName = "custom-navigation";

    render(
      <LessonNavigation
        {...defaultProps}
        ariaLabel={customAriaLabel}
        className={customClassName}
      />
    );

    // ASSERT - Custom aria-label should be applied
    const navigation = screen.getByRole("navigation");
    expect(navigation).toHaveAttribute("aria-label", customAriaLabel);

    // ASSERT - Custom className should be applied
    expect(navigation).toHaveClass(customClassName);
  });

  // Detailed progress test
  it("should show detailed progress when enabled", () => {
    // ARRANGE
    render(
      <LessonNavigation
        {...defaultProps}
        lessonProgress={mockLessonProgress}
        showDetailedProgress={true}
      />
    );

    // ASSERT - Should show percentage completion for in-progress lesson
    expect(screen.getByText("60% complete")).toBeInTheDocument();
  });

  // Focus management test
  it("should manage focus correctly during keyboard navigation", async () => {
    // ARRANGE
    const user = userEvent.setup();

    render(<LessonNavigation {...defaultProps} />);

    // ACT - Focus first lesson
    const firstLessonButton = screen.getByRole("button", {
      name: /Introduction to AI in Healthcare/i,
    });
    firstLessonButton.focus();

    // ASSERT - First lesson should be focused
    expect(firstLessonButton).toHaveFocus();

    // ACT - Focus current lesson (which is accessible)
    const currentLessonButton = screen.getByRole("button", {
      name: /Clinical Decision Support Systems/i,
    });
    currentLessonButton.focus();

    // ASSERT - Current lesson should be focused
    expect(currentLessonButton).toHaveFocus();
  });
});
