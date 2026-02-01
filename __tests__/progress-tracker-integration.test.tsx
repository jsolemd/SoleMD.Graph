/**
 * @fileoverview Integration test for ProgressTracker Component
 * @description Simple integration test to verify component functionality
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Mock Framer Motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the progress utilities
jest.mock("../app/education/ai-for-md/foundations/lib/progress", () => ({
  ProgressManager: jest.fn().mockImplementation(() => ({
    initializeProgress: jest.fn().mockResolvedValue({}),
  })),
  AchievementSystem: jest.fn().mockImplementation(() => ({
    checkAchievements: jest.fn().mockResolvedValue([]),
    getBadgeInfo: jest.fn().mockReturnValue({
      name: "Test Badge",
      description: "Test description",
      icon: "🏆",
    }),
  })),
}));

// Simple mock progress data
const mockProgress = {
  userId: "test-user",
  moduleId: "test-module",
  currentLesson: "lesson-1",
  completedLessons: ["lesson-1"],
  timeSpent: 30,
  lastAccessed: new Date(),
  completionPercentage: 50,
  isCompleted: false,
  lessonProgress: {
    "lesson-1": {
      lessonId: "lesson-1",
      completed: true,
      active: false,
      timeSpent: 30,
      lastAccessed: new Date(),
      contentProgress: 100,
      completedBlocks: [],
    },
    "lesson-2": {
      lessonId: "lesson-2",
      completed: false,
      active: true,
      timeSpent: 0,
      lastAccessed: new Date(),
      contentProgress: 0,
      completedBlocks: [],
    },
  },
  recentActivity: [],
  velocity: {
    lessonsPerWeek: 1,
    averageSessionTime: 30,
    consistencyScore: 0.8,
  },
  difficultyMetrics: {
    strugglingAreas: [],
    strongAreas: [],
    averageAttempts: 1,
  },
  engagement: {
    totalInteractions: 10,
    averageEngagementTime: 15,
    dropOffPoints: [],
  },
};

describe("ProgressTracker Integration", () => {
  it("should render basic progress information", async () => {
    // Dynamic import to avoid module resolution issues
    const { default: ProgressTracker } = await import(
      "../app/education/ai-for-md/foundations/learn/components/ProgressTracker"
    );

    render(
      <ProgressTracker
        moduleId="test-module"
        lessonId="lesson-1"
        progress={mockProgress}
        onProgressUpdate={jest.fn()}
      />
    );

    expect(screen.getByText("Your Progress")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
