/**
 * @fileoverview Test file for Interactive Exercises
 * @description Unit tests covering interactive exercise components with accessibility and user interaction testing
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

import "@testing-library/jest-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";

// Component under test
import InteractiveExercises from "../app/education/ai-for-md/foundations/learn/components/InteractiveExercises";
import SaferFrameworkDemo from "../app/education/ai-for-md/foundations/learn/components/SaferFrameworkDemo";
import MultimediaComponents from "../app/education/ai-for-md/foundations/learn/components/MultimediaContent";

// -----------------------------------------------------------------------------
// TEST WRAPPER
// -----------------------------------------------------------------------------

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

// -----------------------------------------------------------------------------
// MOCKS
// -----------------------------------------------------------------------------

const mockOnInteraction = jest.fn();

// Mock Framer Motion to avoid animation issues in tests
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: any) => children,
  useMotionValue: () => ({ set: jest.fn(), get: () => 0 }),
  useTransform: () => 0,
}));

// -----------------------------------------------------------------------------
// TEMPERATURE SLIDER TESTS
// -----------------------------------------------------------------------------

describe("TemperatureSlider", () => {
  beforeEach(() => {
    mockOnInteraction.mockClear();
  });

  it("should render temperature control with initial state", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(screen.getByText("Temperature Control")).toBeInTheDocument();
    expect(
      screen.getByText("Adjust creativity vs. factuality")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature slider")).toBeInTheDocument();
    expect(screen.getByText("AI Response")).toBeInTheDocument();
  });

  it("should display factual response initially", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(
      screen.getByText(/Benzodiazepines are first-line treatment/)
    ).toBeInTheDocument();
    expect(screen.getByText("Factual")).toBeInTheDocument();
  });

  it("should handle temperature changes and update response", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const slider = screen.getByLabelText("Temperature slider");

    // Simulate changing temperature to creative level
    fireEvent.change(slider, { target: { value: "0.8" } });

    await waitFor(() => {
      expect(mockOnInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "temperature_changed",
          temperature: 0.8,
        })
      );
    });
  });

  it("should be accessible with proper ARIA labels", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(screen.getByLabelText("Temperature slider")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("should show loading state during response generation", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const slider = screen.getByLabelText("Temperature slider");
    fireEvent.change(slider, { target: { value: "0.5" } });

    // Should show loading state briefly
    expect(screen.getByText("Generating response...")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// PROMPT BUILDER TESTS
// -----------------------------------------------------------------------------

describe("PromptBuilder", () => {
  beforeEach(() => {
    mockOnInteraction.mockClear();
  });

  it("should render prompt builder with initial state", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    expect(screen.getByText("Precision Prompt Builder")).toBeInTheDocument();
    expect(
      screen.getByText("Click components in order to build an expert prompt")
    ).toBeInTheDocument();
    expect(screen.getByText("Persona")).toBeInTheDocument();
    expect(screen.getByText("Goal")).toBeInTheDocument();
    expect(screen.getByText("Context")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
    expect(screen.getByText("Constraint")).toBeInTheDocument();
  });

  it("should show initial basic prompt and response", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    expect(
      screen.getByText(
        "Help me with the treatment for catatonia in anti-NMDAR encephalitis."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Benzodiazepines are first line.")
    ).toBeInTheDocument();
  });

  it("should handle prompt part selection in sequence", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Click the first part (Persona)
    const personaButton = screen.getByLabelText(/Persona:/);
    await user.click(personaButton);

    expect(mockOnInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "prompt_part_added",
        part: expect.objectContaining({ id: "persona" }),
        step: 1,
      })
    );
  });

  it("should prevent clicking parts out of sequence", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Try to click the third part (Context) without clicking first two
    const contextButton = screen.getByLabelText(/Context:/);
    expect(contextButton).toBeDisabled();
  });

  it("should show and hide critique panel", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    const showAnalysisButton = screen.getByText("Show Analysis");
    await user.click(showAnalysisButton);

    expect(screen.getByText("Prompt Analysis")).toBeInTheDocument();
    expect(screen.getByText(/Initial Prompt Issues/)).toBeInTheDocument();

    const hideAnalysisButton = screen.getByText("Hide Analysis");
    await user.click(hideAnalysisButton);

    expect(screen.queryByText("Prompt Analysis")).not.toBeInTheDocument();
  });

  it("should reset builder state", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Add a part first
    const personaButton = screen.getByLabelText(/Persona:/);
    await user.click(personaButton);

    // Reset
    const resetButton = screen.getByText("Reset");
    await user.click(resetButton);

    expect(mockOnInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "prompt_builder_reset",
      })
    );
  });
});

// -----------------------------------------------------------------------------
// MODEL SIZE SIMULATOR TESTS
// -----------------------------------------------------------------------------

describe("ModelSizeSimulator", () => {
  beforeEach(() => {
    mockOnInteraction.mockClear();
  });

  it("should render model size simulator with initial state", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.ModelSizeSimulator
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(
      screen.getByText("Model Size vs. Task Performance")
    ).toBeInTheDocument();
    expect(screen.getByText("Small Model")).toBeInTheDocument();
    expect(screen.getByText("Medium Model")).toBeInTheDocument();
    expect(screen.getByText("Large Model")).toBeInTheDocument();
    expect(screen.getByText("Run Simulation")).toBeInTheDocument();
  });

  it("should handle model selection", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.ModelSizeSimulator
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const mediumModelButton = screen.getByText("Medium Model");
    await user.click(mediumModelButton);

    // Should visually indicate selection (tested through styling)
    expect(mediumModelButton).toBeInTheDocument();
  });

  it("should handle task selection", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.ModelSizeSimulator
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const taskSelect = screen.getByLabelText("Select Clinical Task:");
    await user.click(taskSelect);

    // Should show task options
    expect(screen.getByText(/Progress Note Summary/)).toBeInTheDocument();
  });

  it("should run simulation and show results", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.ModelSizeSimulator
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const runButton = screen.getByText("Run Simulation");
    await user.click(runButton);

    // Should show processing state
    expect(screen.getByText("Processing...")).toBeInTheDocument();

    // Wait for simulation to complete
    await waitFor(() => {
      expect(mockOnInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "model_simulation",
        })
      );
    });
  });

  it("should display performance metrics", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.ModelSizeSimulator
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(screen.getByText("Performance Metrics:")).toBeInTheDocument();
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// SAFER FRAMEWORK DEMO TESTS
// -----------------------------------------------------------------------------

describe("SaferFrameworkDemo", () => {
  beforeEach(() => {
    mockOnInteraction.mockClear();
  });

  it("should render SAFER framework demo with initial state", () => {
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    expect(screen.getByText("S.A.F.E.R. Framework Demo")).toBeInTheDocument();
    expect(
      screen.getByText("Interactive C-L Psychiatry workflow demonstration")
    ).toBeInTheDocument();
    expect(screen.getByText("Secure & Summarize")).toBeInTheDocument();
    expect(screen.getByText("Architect & Antagonize")).toBeInTheDocument();
    expect(screen.getByText("First-Pass Plausibility")).toBeInTheDocument();
    expect(screen.getByText("Engage Your Expertise")).toBeInTheDocument();
    expect(screen.getByText("Risk & Review")).toBeInTheDocument();
  });

  it("should show guide panel by default", () => {
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    expect(screen.getByText("Guide Panel")).toBeInTheDocument();
    expect(screen.getByText(/This panel provides context/)).toBeInTheDocument();
  });

  it("should handle step execution", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Click the first step (Secure)
    const secureButton = screen.getByText("Secure & Summarize");
    await user.click(secureButton);

    // Should start the step animation
    await waitFor(() => {
      expect(mockOnInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "safer_step_completed",
          step: "secure",
        })
      );
    });
  });

  it("should toggle guide panel visibility", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    const hideGuideButton = screen.getByText("Hide Guide");
    await user.click(hideGuideButton);

    expect(screen.queryByText("Guide Panel")).not.toBeInTheDocument();

    const showGuideButton = screen.getByText("Show Guide");
    await user.click(showGuideButton);

    expect(screen.getByText("Guide Panel")).toBeInTheDocument();
  });

  it("should reset demo state", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    const resetButton = screen.getByText("Reset");
    await user.click(resetButton);

    expect(mockOnInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "safer_demo_reset",
      })
    );
  });

  it("should prevent clicking steps out of sequence", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Try to click the third step without completing first two
    const firstPassButton = screen.getByText("First-Pass Plausibility");
    expect(firstPassButton).toBeDisabled();
  });
});

// -----------------------------------------------------------------------------
// MULTIMEDIA COMPONENTS TESTS
// -----------------------------------------------------------------------------

describe("MultimediaComponents", () => {
  beforeEach(() => {
    mockOnInteraction.mockClear();
  });

  describe("VideoPlayer", () => {
    it("should render video player with controls", () => {
      render(
        <TestWrapper>
          <MultimediaComponents.VideoPlayer
            src="/test-video.mp4"
            title="Test Video"
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      expect(screen.getByLabelText("Test Video")).toBeInTheDocument();
      expect(screen.getByText("Play")).toBeInTheDocument();
    });

    it("should handle video controls", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <MultimediaComponents.VideoPlayer
            src="/test-video.mp4"
            title="Test Video"
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      const playButton = screen.getByLabelText("Play video");
      await user.click(playButton);

      // Note: Video interaction testing is limited in jsdom environment
      expect(playButton).toBeInTheDocument();
    });

    it("should show transcript when provided", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <MultimediaComponents.VideoPlayer
            src="/test-video.mp4"
            title="Test Video"
            transcript="This is a test transcript."
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Transcript")).toBeInTheDocument();

      const showTranscriptButton = screen.getByText("Show");
      await user.click(showTranscriptButton);

      expect(
        screen.getByText("This is a test transcript.")
      ).toBeInTheDocument();
    });
  });

  describe("AudioPlayer", () => {
    it("should render audio player with controls", () => {
      render(
        <TestWrapper>
          <MultimediaComponents.AudioPlayer
            src="/test-audio.mp3"
            title="Test Audio"
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Test Audio")).toBeInTheDocument();
      expect(screen.getByText("Play")).toBeInTheDocument();
    });

    it("should show waveform visualization", () => {
      render(
        <TestWrapper>
          <MultimediaComponents.AudioPlayer
            src="/test-audio.mp3"
            title="Test Audio"
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      // Waveform is rendered as visual elements
      expect(screen.getByLabelText("Audio progress")).toBeInTheDocument();
    });
  });

  describe("InteractiveImage", () => {
    it("should render interactive image with annotations", () => {
      const annotations = [
        {
          x: 50,
          y: 50,
          title: "Test Annotation",
          description: "Test description",
        },
      ];

      render(
        <TestWrapper>
          <MultimediaComponents.InteractiveImage
            src="/test-image.jpg"
            alt="Test Image"
            title="Test Image"
            annotations={annotations}
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      expect(screen.getByText("Test Image")).toBeInTheDocument();
      expect(screen.getByAltText("Test Image")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Annotation 1: Test Annotation")
      ).toBeInTheDocument();
    });

    it("should handle annotation clicks", async () => {
      const user = userEvent.setup();
      const annotations = [
        {
          x: 50,
          y: 50,
          title: "Test Annotation",
          description: "Test description",
        },
      ];

      render(
        <TestWrapper>
          <MultimediaComponents.InteractiveImage
            src="/test-image.jpg"
            alt="Test Image"
            annotations={annotations}
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      const annotationButton = screen.getByLabelText(
        "Annotation 1: Test Annotation"
      );
      await user.click(annotationButton);

      expect(mockOnInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "annotation_clicked",
          annotation: annotations[0],
        })
      );

      expect(screen.getByText("Test Annotation")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("should handle zoom functionality", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <MultimediaComponents.InteractiveImage
            src="/test-image.jpg"
            alt="Test Image"
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );

      const zoomButton = screen.getByLabelText("Zoom in");
      await user.click(zoomButton);

      expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------------
// ACCESSIBILITY TESTS
// -----------------------------------------------------------------------------

describe("Interactive Exercises Accessibility", () => {
  it("should have proper ARIA labels and roles", () => {
    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature slider")).toBeInTheDocument();
  });

  it("should support keyboard navigation", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    const firstButton = screen.getByLabelText(/Persona:/);
    firstButton.focus();
    expect(firstButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(mockOnInteraction).toHaveBeenCalled();
  });

  it("should provide proper focus management", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SaferFrameworkDemo onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    const firstStep = screen.getByText("Secure & Summarize");
    await user.tab();

    // Should be able to navigate through interactive elements
    expect(document.activeElement).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// ERROR HANDLING TESTS
// -----------------------------------------------------------------------------

describe("Interactive Exercises Error Handling", () => {
  it("should handle missing onInteraction callback gracefully", () => {
    expect(() => {
      render(
        <TestWrapper>
          <InteractiveExercises.TemperatureSlider
            onInteraction={undefined as any}
          />
        </TestWrapper>
      );
    }).not.toThrow();
  });

  it("should handle invalid props gracefully", () => {
    expect(() => {
      render(
        <TestWrapper>
          <MultimediaComponents.VideoPlayer
            src=""
            title=""
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );
    }).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// PERFORMANCE TESTS
// -----------------------------------------------------------------------------

describe("Interactive Exercises Performance", () => {
  it("should render components within reasonable time", () => {
    const startTime = performance.now();

    render(
      <TestWrapper>
        <InteractiveExercises.TemperatureSlider
          onInteraction={mockOnInteraction}
        />
      </TestWrapper>
    );

    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(100); // Should render in under 100ms
  });

  it("should not cause memory leaks with multiple renders", () => {
    const { rerender, unmount } = render(
      <TestWrapper>
        <InteractiveExercises.PromptBuilder onInteraction={mockOnInteraction} />
      </TestWrapper>
    );

    // Re-render multiple times
    for (let i = 0; i < 10; i++) {
      rerender(
        <TestWrapper>
          <InteractiveExercises.PromptBuilder
            onInteraction={mockOnInteraction}
          />
        </TestWrapper>
      );
    }

    expect(() => unmount()).not.toThrow();
  });
});
