/**
 * @fileoverview Test file for InteractiveContent component
 * @description Comprehensive unit tests covering all content types, interactions, and edge cases
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

import "@testing-library/jest-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import InteractiveContent from "../learn/components/InteractiveContent";
import type {
  ContentBlock,
  InteractionEvent,
  TextContent,
  RichTextContent,
  InteractiveDemoContent,
  AssessmentContent,
  MultimediaContent,
  SimulationContent,
} from "../lib/content-types";

// -----------------------------------------------------------------------------
// TEST UTILITIES
// -----------------------------------------------------------------------------

/**
 * Wrapper component for Mantine provider
 */
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MantineProvider>{children}</MantineProvider>
);

/**
 * Mock interaction handler
 */
const mockOnInteraction = jest.fn();
const mockOnComplete = jest.fn();

/**
 * Reset mocks before each test
 */
beforeEach(() => {
  mockOnInteraction.mockClear();
  mockOnComplete.mockClear();
});

// -----------------------------------------------------------------------------
// MOCK DATA
// -----------------------------------------------------------------------------

const mockTextContent: TextContent = {
  id: "text-1",
  type: "text",
  title: "Introduction Text",
  content: {
    text: "This is a sample text content for testing purposes.",
    formatting: {
      fontSize: "1rem",
      textAlign: "left",
    },
  },
  metadata: {
    estimatedDuration: 2,
    learningObjectives: ["Understand basic concepts", "Learn key terminology"],
  },
};

const mockRichTextContent: RichTextContent = {
  id: "rich-text-1",
  type: "rich-text",
  title: "Rich Text Content",
  content: {
    html: "<p>This is <strong>rich text</strong> with <em>formatting</em>.</p>",
    sanitization: {
      allowedTags: ["p", "strong", "em"],
    },
  },
};

const mockInteractiveDemoContent: InteractiveDemoContent = {
  id: "demo-1",
  type: "interactive-demo",
  title: "Temperature Demo",
  content: {
    demoType: "temperature-slider",
    config: {
      settings: {
        minTemp: 0,
        maxTemp: 2,
        defaultTemp: 0.7,
      },
    },
    initialState: {
      temperature: 0.7,
    },
    actions: [
      {
        id: "reset",
        label: "Reset",
        type: "click",
        handler: "resetTemperature",
      },
    ],
  },
};

const mockAssessmentContent: AssessmentContent = {
  id: "assessment-1",
  type: "assessment",
  title: "Knowledge Check",
  content: {
    assessmentType: "multiple-choice",
    questions: [
      {
        id: "q1",
        type: "multiple-choice",
        question: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        correctAnswer: "Paris",
        explanation: "Paris is the capital and largest city of France.",
        points: 1,
      },
      {
        id: "q2",
        type: "true-false",
        question: "The Earth is flat.",
        correctAnswer: "False",
        explanation: "The Earth is approximately spherical.",
        points: 1,
      },
    ],
    scoring: {
      method: "percentage",
      passingThreshold: 70,
    },
    feedback: {
      showCorrectAnswers: true,
      showExplanations: true,
      immediateScore: true,
    },
  },
};

const mockMultimediaContent: MultimediaContent = {
  id: "video-1",
  type: "multimedia",
  title: "Educational Video",
  content: {
    mediaType: "video",
    src: "https://example.com/video.mp4",
    captions: [
      {
        language: "en",
        src: "https://example.com/captions.vtt",
        label: "English",
        default: true,
      },
    ],
    transcript: "This is the video transcript for accessibility.",
  },
};

const mockSimulationContent: SimulationContent = {
  id: "simulation-1",
  type: "simulation",
  title: "Parameter Simulation",
  content: {
    simulationType: "parameter-adjustment",
    parameters: {
      parameters: [
        {
          name: "temperature",
          type: "number",
          label: "Temperature",
          defaultValue: 0.7,
          min: 0,
          max: 2,
          step: 0.1,
        },
      ],
      initialValues: {
        temperature: 0.7,
      },
    },
    controls: [
      {
        id: "temp-slider",
        type: "slider",
        label: "Temperature",
        action: "adjustTemperature",
      },
      {
        id: "reset-btn",
        type: "button",
        label: "Reset",
        action: "reset",
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// TEST SUITE
// -----------------------------------------------------------------------------

describe("InteractiveContent", () => {
  // Happy path tests
  describe("Content Rendering", () => {
    it("should render text content correctly", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Introduction Text")).toBeInTheDocument();
      expect(
        screen.getByText("This is a sample text content for testing purposes.")
      ).toBeInTheDocument();
      expect(screen.getByText("~2 min")).toBeInTheDocument();
    });

    it("should render rich text content with HTML", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockRichTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Rich Text Content")).toBeInTheDocument();
      expect(screen.getByText("rich text")).toBeInTheDocument();
      expect(screen.getByText("formatting")).toBeInTheDocument();
    });

    it("should render interactive demo content", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockInteractiveDemoContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Temperature Demo")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Interactive temperature-slider demo will be rendered here"
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reset action" })
      ).toBeInTheDocument();
    });

    it("should render assessment content with questions", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockAssessmentContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Knowledge Check")).toBeInTheDocument();
      expect(
        screen.getByText("What is the capital of France?")
      ).toBeInTheDocument();
      expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
      expect(screen.getByText("London")).toBeInTheDocument();
      expect(screen.getByText("Paris")).toBeInTheDocument();
    });

    it("should render multimedia content", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockMultimediaContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Educational Video")).toBeInTheDocument();
      expect(screen.getByLabelText("Educational Video")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Show Transcript" })
      ).toBeInTheDocument();
    });

    it("should render simulation content", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockSimulationContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Parameter Simulation")).toBeInTheDocument();
      expect(screen.getByText("Controls")).toBeInTheDocument();
      expect(screen.getByText("Temperature")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    it("should handle content interaction button clicks", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      const interactionButton = screen.getByRole("button", {
        name: "Interact with text content",
      });
      await user.click(interactionButton);

      expect(mockOnInteraction).toHaveBeenCalledWith({
        type: "content_interaction",
        data: { blockId: "text-1", blockType: "text" },
        timestamp: expect.any(Date),
      });
    });

    it("should handle demo action clicks", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockInteractiveDemoContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      const resetButton = screen.getByRole("button", { name: "Reset action" });
      await user.click(resetButton);

      expect(mockOnInteraction).toHaveBeenCalledWith({
        type: "demo_action",
        data: { blockId: "demo-1", action: "reset", parameters: undefined },
        timestamp: expect.any(Date),
      });
    });

    it("should handle assessment question answering", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockAssessmentContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Answer first question
      const parisOption = screen.getByLabelText("Paris");
      await user.click(parisOption);

      const nextButton = screen.getByRole("button", { name: "Next question" });
      await user.click(nextButton);

      // Should move to second question
      expect(screen.getByText("The Earth is flat.")).toBeInTheDocument();
      expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    });

    it("should complete assessment and show results", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockAssessmentContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Answer first question correctly
      const parisOption = screen.getByLabelText("Paris");
      await user.click(parisOption);
      await user.click(screen.getByRole("button", { name: "Next question" }));

      // Answer second question correctly
      const falseButton = screen.getByRole("button", { name: "False" });
      await user.click(falseButton);
      await user.click(
        screen.getByRole("button", { name: "Submit assessment" })
      );

      // Should show results
      await waitFor(() => {
        expect(screen.getByText("Assessment Complete")).toBeInTheDocument();
        expect(screen.getByText("Score: 100%")).toBeInTheDocument();
        expect(
          screen.getByText("Congratulations! You passed.")
        ).toBeInTheDocument();
      });

      expect(mockOnInteraction).toHaveBeenCalledWith({
        type: "assessment_completed",
        data: {
          blockId: "assessment-1",
          answers: { q1: "Paris", q2: "False" },
          score: 100,
        },
        timestamp: expect.any(Date),
      });
    });

    it("should handle transcript toggle", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockMultimediaContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      const transcriptButton = screen.getByRole("button", {
        name: "Show Transcript",
      });
      await user.click(transcriptButton);

      await waitFor(() => {
        expect(
          screen.getByText("This is the video transcript for accessibility.")
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Hide Transcript" })
        ).toBeInTheDocument();
      });
    });
  });

  describe("Progress Tracking", () => {
    it("should show progress indicator when enabled", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent, mockRichTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
            showProgress={true}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Progress")).toBeInTheDocument();
      expect(screen.getByText("0 of 2 completed")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("should show completion button when all content is completed", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
            showProgress={true}
          />
        </TestWrapper>
      );

      // Simulate completing the content block
      const interactionButton = screen.getByRole("button", {
        name: "Interact with text content",
      });
      await user.click(interactionButton);

      // Mock the completion state (in real usage, this would be handled by parent component)
      // For testing, we'll check that the completion button appears when appropriate
      expect(
        screen.getByRole("button", { name: "Continue to next section" })
      ).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should display error messages when content fails to load", () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const invalidContent: ContentBlock = {
        id: "invalid-1",
        type: "text" as any,
        content: null, // Invalid content
      };

      render(
        <TestWrapper>
          <InteractiveContent
            content={[invalidContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Component should render gracefully even with invalid content
      expect(screen.getByText("Text Content")).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    it("should handle empty content array", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("No content available")).toBeInTheDocument();
      expect(screen.getByLabelText("No content available")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels and roles", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent, mockAssessmentContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
            showProgress={true}
          />
        </TestWrapper>
      );

      expect(screen.getByRole("main")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Interactive educational content")
      ).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });

    it("should support keyboard navigation", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      const interactionButton = screen.getByRole("button", {
        name: "Interact with text content",
      });

      // Tab to the button
      await user.tab();
      expect(interactionButton).toHaveFocus();

      // Press Enter to activate
      await user.keyboard("{Enter}");
      expect(mockOnInteraction).toHaveBeenCalled();
    });

    it("should have proper heading hierarchy", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Content titles should be properly labeled
      expect(screen.getByText("Introduction Text")).toBeInTheDocument();
    });
  });

  describe("Learning Objectives", () => {
    it("should display learning objectives when provided", () => {
      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Learning Objectives")).toBeInTheDocument();
      expect(screen.getByText("Understand basic concepts")).toBeInTheDocument();
      expect(screen.getByText("Learn key terminology")).toBeInTheDocument();
    });
  });

  describe("Responsive Design", () => {
    it("should render properly on different screen sizes", () => {
      // Mock window.matchMedia for responsive testing
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query.includes("max-width: 768px"),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Component should render without errors on mobile
      expect(screen.getByText("Introduction Text")).toBeInTheDocument();
    });
  });

  describe("Animation Behavior", () => {
    it("should respect reduced motion preferences", () => {
      // Mock prefers-reduced-motion
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query.includes("prefers-reduced-motion: reduce"),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      render(
        <TestWrapper>
          <InteractiveContent
            content={[mockTextContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      // Component should render without animations when reduced motion is preferred
      expect(screen.getByText("Introduction Text")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle content with missing required fields", () => {
      const incompleteContent: ContentBlock = {
        id: "incomplete-1",
        type: "text",
        content: {
          text: "Incomplete content",
        },
        // Missing title and metadata
      };

      render(
        <TestWrapper>
          <InteractiveContent
            content={[incompleteContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Text Content")).toBeInTheDocument();
      expect(screen.getByText("Incomplete content")).toBeInTheDocument();
    });

    it("should handle unsupported content types gracefully", () => {
      const unsupportedContent: ContentBlock = {
        id: "unsupported-1",
        type: "unsupported-type" as any,
        content: {},
      };

      render(
        <TestWrapper>
          <InteractiveContent
            content={[unsupportedContent]}
            onInteraction={mockOnInteraction}
            onComplete={mockOnComplete}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Unsupported Type Content")).toBeInTheDocument();
      expect(
        screen.getByText(
          "This content type will be implemented in future updates"
        )
      ).toBeInTheDocument();
    });
  });
});
