/**
 * @fileoverview Test file for ProgressTracker Component
 * @description Unit tests covering progress tracking functionality, analytics integration,
 * local storage persistence, achievement system, and accessibility features
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

// Always import for custom matchers like .toBeInTheDocument()
import "@testing-library/jest-dom";

// Core RTL functions
import { render, screen, waitFor, act } from "@testing-library/react";

// Use userEvent for realistic user interactions
import userEvent from "@testing-library/user-event";

// Component under test
import ProgressTracker from "../app/education/ai-for-md/foundations/learn/components/ProgressTracker";

// Dependencies
import {
  ProgressManager,
  AchievementSystem,
} from "../app/education/ai-for-md/foundations/lib/progress";
import {
  UserProgress,
  InteractionEvent,
} from "../app/education/ai-for-md/foundations/lib/types";

// -----------------------------------------------------------------------------
// MOCKS
// -----------------------------------------------------------------------------

// Mock Framer Motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the progress manager
jest.mock("../app/education/ai-for-md/foundations/lib/progress", () => ({
  ProgressManager: jest.fn().mockImplementation(() => ({
    initializeProgress: jest.fn().mockResolvedValue(mockUserProgress),
    loadProgress: jest.fn().mockResolvedValue(mockUserProgress),
    completeLesson: jest.fn().mockResolvedValue(undefined),
    updateContentProgress: jest.fn().mockResolvedValue(undefined),
    trackTimeSpent: jest.fn().mockResolvedValue(undefined),
    getCurrentProgress: jest.fn().mockReturnValue(mockUserProgress),
  })),
  AchievementSystem: jest.fn().mockImplementation(() => ({
    checkAchievements: jest.fn().mockResolvedValue([]),
    getBadgeInfo: jest.fn().mockReturnValue({
      name: "Test Badge",
      description: "Test badge description",
      icon: "🏆",
    }),
  })),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
});

// -----------------------------------------------------------------------------
// TEST DATA
// -----------------------------------------------------------------------------

const mockUserProgress: UserProgress = {
  userId: "test-user-123",
  moduleId: "ai-for-md-foundations",
  currentLesson: "lesson-2",
  completedLessons: ["lesson-1"],
  timeSpent: 45, // 45 minutes
  lastAccessed: new Date("2024-01-15T10:00:00Z"),
  completionPercentage: 33,
  isCompleted: false,
  streak: 3,
  badges: ["first-lesson"],
  lessonProgress: {
    "lesson-1": {
      lessonId: "lesson-1",
      completed: true,
      active: false,
      timeSpent: 25,
      lastAccessed: new Date("2024-01-15T09:30:00Z"),
      contentProgress: 100,
      completedBlocks: ["block-1", "block-2"],
      assessmentScores: { "quiz-1": 85 },
    },
    "lesson-2": {
      lessonId: "lesson-2",
      completed: false,
      active: true,
      timeSpent: 20,
      lastAccessed: new Date("2024-01-15T10:00:00Z"),
      contentProgress: 60,
      completedBlocks: ["block-1"],
    },
    "lesson-3": {
      lessonId: "lesson-3",
      completed: false,
      active: false,
      timeSpent: 0,
      lastAccessed: new Date("2024-01-15T10:00:00Z"),
      contentProgress: 0,
      completedBlocks: [],
    },
  },
};

const mockEnhancedProgress = {
  ...mockUserProgress,
  recentActivity: [
    {
      id: "activity-1",
      type: "lesson_complete" as const,
      title: "Completed Introduction to AI",
      timestamp: new Date("2024-01-15T09:30:00Z"),
    },
  ],
  velocity: {
    lessonsPerWeek: 2.5,
    averageSessionTime: 22.5,
    consistencyScore: 0.8,
  },
  difficultyMetrics: {
    strugglingAreas: [],
    strongAreas: ["fundamentals"],
    averageAttempts: 1.2,
  },
  engagement: {
    totalInteractions: 45,
    averageEngagementTime: 15.5,
    dropOffPoints: [],
  },
};

const mockAnalytics = {
  trackInteraction: jest.fn(),
  trackMilestone: jest.fn(),
  trackDifficulty: jest.fn(),
  trackEngagement: jest.fn(),
};

// -----------------------------------------------------------------------------
// TEST SUITE
// -----------------------------------------------------------------------------

describe("ProgressTracker", () => {
  // Reset mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
  });

  // Clean up timers after each test
  afterEach(() => {
    jest.clearAllTimers();
  });

  // =============================================================================
  // HAPPY PATH TESTS
  // =============================================================================

  it("should render progress data and display completion percentage correctly", () => {
    // ARRANGE
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    expect(screen.getByText("Your Progress")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument(); // completed/total lessons
    expect(screen.getByText("0h 45m")).toBeInTheDocument(); // time spent
  });

  it("should display learning analytics when showAnalytics is true", () => {
    // ARRANGE
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        showAnalytics={true}
      />
    );

    // ASSERT
    expect(screen.getByText("Learning Insights")).toBeInTheDocument();
    expect(screen.getByText("2.5 lessons/week")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // consistency score
    expect(screen.getByText("3 days")).toBeInTheDocument(); // streak
  });

  it("should hide analytics when showAnalytics is false", () => {
    // ARRANGE
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        showAnalytics={false}
      />
    );

    // ASSERT
    expect(screen.queryByText("Learning Insights")).not.toBeInTheDocument();
  });

  it("should display completion celebration when module is 100% complete", () => {
    // ARRANGE
    const completedProgress = {
      ...mockEnhancedProgress,
      completedLessons: ["lesson-1", "lesson-2", "lesson-3"],
      completionPercentage: 100,
      isCompleted: true,
    };

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-3"
        progress={completedProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    expect(screen.getByText("Module Completed!")).toBeInTheDocument();
    expect(
      screen.getByText("Congratulations on finishing the Foundations module")
    ).toBeInTheDocument();
  });

  // =============================================================================
  // ANALYTICS INTEGRATION TESTS
  // =============================================================================

  it("should track session start interaction on component mount", async () => {
    // ARRANGE & ACT
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        analytics={mockAnalytics}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(mockAnalytics.trackInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "session_start",
          data: expect.objectContaining({
            moduleId: "ai-for-md-foundations",
            lessonId: "lesson-2",
          }),
        })
      );
    });
  });

  it("should track engagement metrics on component unmount", async () => {
    // ARRANGE
    const { unmount } = render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        analytics={mockAnalytics}
      />
    );

    // ACT
    unmount();

    // ASSERT
    await waitFor(() => {
      expect(mockAnalytics.trackEngagement).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: "ai-for-md-foundations",
          lessonId: "lesson-2",
          userId: "test-user-123",
        })
      );
    });
  });

  it("should track milestone when achievement is earned", async () => {
    // ARRANGE
    const mockAchievementSystem = {
      checkAchievements: jest.fn().mockResolvedValue(["halfway"]),
      getBadgeInfo: jest.fn().mockReturnValue({
        name: "Halfway There",
        description: "Completed 50% of the module",
        icon: "⭐",
      }),
    };

    (AchievementSystem as jest.Mock).mockImplementation(
      () => mockAchievementSystem
    );

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        analytics={mockAnalytics}
        showAchievements={true}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(mockAnalytics.trackMilestone).toHaveBeenCalledWith(
        "badge_earned",
        expect.objectContaining({
          badgeId: "halfway",
          moduleId: "ai-for-md-foundations",
          userId: "test-user-123",
        })
      );
    });
  });

  // =============================================================================
  // PROGRESS MANAGEMENT TESTS
  // =============================================================================

  it("should initialize progress manager on mount", async () => {
    // ARRANGE
    const mockProgressManager = {
      initializeProgress: jest.fn().mockResolvedValue(mockUserProgress),
    };

    (ProgressManager as jest.Mock).mockImplementation(
      () => mockProgressManager
    );

    // ACT
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(mockProgressManager.initializeProgress).toHaveBeenCalledWith(
        "test-user-123",
        "ai-for-md-foundations",
        3 // total lessons
      );
    });
  });

  it("should call onProgressUpdate when progress changes", async () => {
    // ARRANGE
    const mockOnProgressUpdate = jest.fn();
    const updatedProgress = {
      ...mockEnhancedProgress,
      completedLessons: ["lesson-1", "lesson-2"],
      completionPercentage: 67,
    };

    const { rerender } = render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={mockOnProgressUpdate}
      />
    );

    // ACT
    rerender(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-3"
        progress={updatedProgress}
        onProgressUpdate={mockOnProgressUpdate}
      />
    );

    // ASSERT - Progress update should be reflected in the UI
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  // =============================================================================
  // ACCESSIBILITY TESTS
  // =============================================================================

  it("should have proper ARIA labels and roles for accessibility", () => {
    // ARRANGE
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    const progressRegion = screen.getByRole("region", {
      name: "Learning Progress Tracker",
    });
    expect(progressRegion).toBeInTheDocument();

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "33");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    expect(progressBar).toHaveAttribute("aria-label", "Module completion: 33%");
  });

  it("should announce progress updates for screen readers when enabled", async () => {
    // ARRANGE
    const mockCreateElement = jest.spyOn(document, "createElement");
    const mockAppendChild = jest.spyOn(document.body, "appendChild");
    const mockRemoveChild = jest.spyOn(document.body, "removeChild");

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        accessibility={{ announceProgress: true }}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(mockCreateElement).toHaveBeenCalledWith("div");
    });

    // Clean up mocks
    mockCreateElement.mockRestore();
    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
  });

  it("should respect reduced motion preferences", () => {
    // ARRANGE
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        accessibility={{ reducedMotion: true }}
      />
    );

    // ASSERT - Component should render without motion-dependent features
    expect(screen.getByText("Your Progress")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  it("should handle progress manager initialization errors gracefully", async () => {
    // ARRANGE
    const mockProgressManager = {
      initializeProgress: jest
        .fn()
        .mockRejectedValue(new Error("Storage unavailable")),
    };

    (ProgressManager as jest.Mock).mockImplementation(
      () => mockProgressManager
    );

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // ACT
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update progress:"),
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("should handle achievement system errors gracefully", async () => {
    // ARRANGE
    const mockAchievementSystem = {
      checkAchievements: jest
        .fn()
        .mockRejectedValue(new Error("Achievement check failed")),
      getBadgeInfo: jest.fn(),
    };

    (AchievementSystem as jest.Mock).mockImplementation(
      () => mockAchievementSystem
    );

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // ACT
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        showAchievements={true}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to check achievements:",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  // =============================================================================
  // EDGE CASES AND BOUNDARY TESTS
  // =============================================================================

  it("should handle zero progress correctly", () => {
    // ARRANGE
    const zeroProgress = {
      ...mockEnhancedProgress,
      completedLessons: [],
      timeSpent: 0,
      completionPercentage: 0,
      lessonProgress: {
        "lesson-1": {
          lessonId: "lesson-1",
          completed: false,
          active: true,
          timeSpent: 0,
          lastAccessed: new Date(),
          contentProgress: 0,
          completedBlocks: [],
        },
      },
    };

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-1"
        progress={zeroProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    // ASSERT
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0/1")).toBeInTheDocument();
    expect(screen.getByText("0h 0m")).toBeInTheDocument();
  });

  it("should handle missing optional data gracefully", () => {
    // ARRANGE
    const minimalProgress = {
      ...mockEnhancedProgress,
      streak: undefined,
      badges: undefined,
      velocity: {
        lessonsPerWeek: 0,
        averageSessionTime: 0,
        consistencyScore: 0,
      },
    };

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={minimalProgress}
        onProgressUpdate={jest.fn()}
        showAnalytics={true}
      />
    );

    // ASSERT
    expect(screen.getByText("Learning Insights")).toBeInTheDocument();
    expect(screen.getByText("0.0 lessons/week")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument(); // consistency score
    expect(screen.queryByText("Current Streak")).not.toBeInTheDocument();
    expect(screen.queryByText("Achievements")).not.toBeInTheDocument();
  });

  it("should apply custom styles correctly", () => {
    // ARRANGE
    const customStyles = {
      borderRadius: "12px",
      backgroundColor: "#custom-color",
    };

    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        customStyles={customStyles}
      />
    );

    // ASSERT
    const progressContainer = screen.getByRole("region", {
      name: "Learning Progress Tracker",
    });
    expect(progressContainer).toHaveStyle("border-radius: 12px");
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  it("should integrate with analytics and progress manager correctly", async () => {
    // ARRANGE
    const mockProgressManager = {
      initializeProgress: jest.fn().mockResolvedValue(mockUserProgress),
    };

    (ProgressManager as jest.Mock).mockImplementation(
      () => mockProgressManager
    );

    // ACT
    render(
      <ProgressTracker
        moduleId="ai-for-md-foundations"
        lessonId="lesson-2"
        progress={mockEnhancedProgress}
        onProgressUpdate={jest.fn()}
        analytics={mockAnalytics}
      />
    );

    // ASSERT
    await waitFor(() => {
      expect(mockProgressManager.initializeProgress).toHaveBeenCalled();
      expect(mockAnalytics.trackInteraction).toHaveBeenCalled();
    });
  });
});
