// @ts-nocheck
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  FileText,
  HelpCircle,
  Code,
  Image,
  Volume2,
  Download,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Check,
  X,
  Lightbulb,
  AlertCircle,
  BookOpen,
  Target,
  Zap,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@mantine/core";

// Import types from content-types.ts
import type {
  ContentBlock,
  ContentBlockType,
  InteractionEvent,
  TextContent,
  RichTextContent,
  InteractiveDemoContent,
  AssessmentContent,
  MultimediaContent,
  SimulationContent,
  Question,
  QuestionType,
} from "../../lib/content-types";

// Import design patterns
import {
  EducationColors,
  AnimationPatterns,
  TypographyClasses,
  FloatingCardPatterns,
  IconPatterns,
  AccessibilityPatterns,
} from "../../lib/design-patterns";

// Import interactive exercise components
import InteractiveExercises from "./InteractiveExercises";
import SaferFrameworkDemo from "./SaferFrameworkDemo";
import MultimediaComponents from "./MultimediaContent";

/**
 * Props for the InteractiveContent component
 */
interface InteractiveContentProps {
  /** Array of content blocks to render */
  content: ContentBlock[];
  /** Callback for user interactions */
  onInteraction: (interaction: InteractionEvent) => void;
  /** Callback when content is completed */
  onComplete: () => void;
  /** Optional className for styling */
  className?: string;
  /** Whether to show progress indicators */
  showProgress?: boolean;
  /** Current progress (0-100) */
  progress?: number;
}

/**
 * InteractiveContent Component
 *
 * A comprehensive content rendering system that supports multiple educational content types
 * including text, multimedia, interactive demos, assessments, and simulations.
 *
 * Features:
 * - Flexible content block system supporting 10+ content types
 * - Interactive elements with Framer Motion animations
 * - Full accessibility support with ARIA labels and semantic HTML
 * - Responsive design with mobile-first approach
 * - Progress tracking and completion states
 * - Error handling and graceful degradation
 *
 * @param content - Array of content blocks to render
 * @param onInteraction - Callback for user interactions
 * @param onComplete - Callback when content is completed
 * @param className - Optional CSS classes
 * @param showProgress - Whether to show progress indicators
 * @param progress - Current progress percentage
 */
export default function InteractiveContent({
  content,
  onInteraction,
  onComplete,
  className = "",
  showProgress = false,
  progress = 0,
}: InteractiveContentProps) {
  // State management for interactive elements
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(
    new Set()
  );
  const [currentBlock, setCurrentBlock] = useState<string | null>(null);
  const [blockStates, setBlockStates] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Refs for accessibility and focus management
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Education theme color
  const educationColor = EducationColors.primary;

  /**
   * Get appropriate icon for content type
   */
  const getContentIcon = useCallback((type: ContentBlockType) => {
    const iconMap: Record<ContentBlockType, React.ComponentType<any>> = {
      text: FileText,
      "rich-text": BookOpen,
      "interactive-demo": Zap,
      assessment: HelpCircle,
      multimedia: Play,
      simulation: Settings,
      comparison: Eye,
      "step-by-step": Target,
      "flip-card": RotateCcw,
      "drag-drop": Code,
      slider: Settings,
      "chat-demo": HelpCircle,
      "code-example": Code,
      "clinical-scenario": AlertCircle,
      takeaway: Lightbulb,
    };
    return iconMap[type] || FileText;
  }, []);

  /**
   * Handle content block interaction
   */
  const handleBlockInteraction = useCallback(
    (blockId: string, interactionType: string, data?: any) => {
      const interaction: InteractionEvent = {
        type: interactionType,
        data: { blockId, ...data },
        timestamp: new Date(),
      };

      onInteraction(interaction);

      // Update block state if needed
      if (data?.state) {
        setBlockStates((prev) => ({
          ...prev,
          [blockId]: { ...prev[blockId], ...data.state },
        }));
      }

      // Mark block as completed if appropriate
      if (interactionType === "content_completed") {
        setCompletedBlocks((prev) => new Set([...prev, blockId]));
      }
    },
    [onInteraction]
  );

  /**
   * Handle errors in content blocks
   */
  const handleBlockError = useCallback((blockId: string, error: string) => {
    setErrors((prev) => ({ ...prev, [blockId]: error }));
    console.error(`Content block error (${blockId}):`, error);
  }, []);

  /**
   * Clear error for a specific block
   */
  const clearBlockError = useCallback((blockId: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[blockId];
      return newErrors;
    });
  }, []);

  /**
   * Render text content block
   */
  const renderTextContent = useCallback((block: TextContent, index: number) => {
    // Handle missing or invalid content gracefully
    if (!block.content || typeof block.content !== "object") {
      return (
        <div className="text-flow-natural">
          <div
            className={TypographyClasses.bodyLarge}
            style={{ color: "var(--foreground)", opacity: 0.8 }}
          >
            Content not available
          </div>
        </div>
      );
    }

    const { text, formatting } = block.content;

    return (
      <div className="text-flow-natural">
        <div
          className={TypographyClasses.bodyLarge}
          style={{
            color: "var(--foreground)",
            opacity: 0.8,
            ...formatting,
          }}
        >
          {text || "Content not available"}
        </div>
      </div>
    );
  }, []);

  /**
   * Render rich text content block
   */
  const renderRichTextContent = useCallback(
    (block: RichTextContent, index: number) => {
      const { html, sanitization } = block.content;

      return (
        <div className="text-flow-natural">
          <div
            className={TypographyClasses.bodyLarge}
            style={{ color: "var(--foreground)", opacity: 0.8 }}
            dangerouslySetInnerHTML={{ __html: html }}
            role="region"
            aria-label="Rich text content"
          />
        </div>
      );
    },
    []
  );

  /**
   * Render interactive demo content block
   */
  const renderInteractiveDemoContent = useCallback(
    (block: InteractiveDemoContent, index: number) => {
      const { demoType, config, initialState, actions } = block.content;
      const blockState = blockStates[block.id] || initialState || {};

      // Handle specific interactive demo types with enhanced components
      switch (demoType) {
        case "temperature-slider":
          return (
            <InteractiveExercises.TemperatureSlider
              onInteraction={(data) =>
                handleBlockInteraction(
                  block.id,
                  "temperature_interaction",
                  data
                )
              }
              className="mb-4"
            />
          );

        case "prompt-builder":
          return (
            <InteractiveExercises.PromptBuilder
              onInteraction={(data) =>
                handleBlockInteraction(
                  block.id,
                  "prompt_builder_interaction",
                  data
                )
              }
              className="mb-4"
            />
          );

        case "model-size-simulator":
          return (
            <InteractiveExercises.ModelSizeSimulator
              onInteraction={(data) =>
                handleBlockInteraction(
                  block.id,
                  "model_simulation_interaction",
                  data
                )
              }
              className="mb-4"
            />
          );

        case "safer-framework":
          return (
            <SaferFrameworkDemo
              onInteraction={(data) =>
                handleBlockInteraction(block.id, "safer_interaction", data)
              }
              className="mb-4"
            />
          );

        default:
          // Fallback for generic interactive demos
          return (
            <div
              className="p-6 rounded-lg"
              style={{ backgroundColor: `${educationColor}10` }}
              role="application"
              aria-label={`Interactive demo: ${demoType}`}
            >
              <div className="text-center mb-4">
                <Zap
                  className="h-8 w-8 mx-auto mb-3"
                  style={{ color: educationColor }}
                  aria-hidden="true"
                />
                <h3
                  className={TypographyClasses.cardTitle}
                  style={{ color: "var(--foreground)" }}
                >
                  {block.title || `${demoType} Demo`}
                </h3>
              </div>

              {/* Demo-specific rendering would go here */}
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-4 mb-4">
                <p className="text-sm text-center opacity-70">
                  Interactive {demoType} demo will be rendered here
                </p>
                {/* Placeholder for actual demo implementation */}
              </div>

              {/* Demo actions */}
              {actions && actions.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {actions.map((action) => (
                    <Button
                      key={action.id}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleBlockInteraction(block.id, "demo_action", {
                          action: action.id,
                          parameters: action.parameters,
                        })
                      }
                      style={{
                        borderColor: educationColor,
                        color: educationColor,
                      }}
                      aria-label={`${action.label} action`}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
      }
    },
    [blockStates, educationColor, handleBlockInteraction]
  );

  /**
   * Render assessment content block
   */
  const renderAssessmentContent = useCallback(
    (block: AssessmentContent, index: number) => {
      const { assessmentType, questions, scoring, feedback } = block.content;
      const [currentQuestion, setCurrentQuestion] = useState(0);
      const [answers, setAnswers] = useState<Record<string, any>>({});
      const [showResults, setShowResults] = useState(false);

      const handleAnswerSubmit = (questionId: string, answer: any) => {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));

        if (currentQuestion < questions.length - 1) {
          setCurrentQuestion((prev) => prev + 1);
        } else {
          setShowResults(true);
          handleBlockInteraction(block.id, "assessment_completed", {
            answers,
            score: calculateScore(answers, questions),
          });
        }
      };

      const calculateScore = (
        answers: Record<string, any>,
        questions: Question[]
      ) => {
        let correct = 0;
        questions.forEach((q) => {
          if (answers[q.id] === q.correctAnswer) {
            correct++;
          }
        });
        return (correct / questions.length) * 100;
      };

      if (showResults) {
        const score = calculateScore(answers, questions);
        const passed = score >= (scoring?.passingThreshold || 70);

        return (
          <div
            className="p-6 rounded-lg text-center"
            style={{ backgroundColor: `${educationColor}10` }}
            role="region"
            aria-label="Assessment results"
          >
            <div className="mb-4">
              {passed ? (
                <Check
                  className="h-12 w-12 mx-auto mb-3 text-green-500"
                  aria-hidden="true"
                />
              ) : (
                <X
                  className="h-12 w-12 mx-auto mb-3 text-red-500"
                  aria-hidden="true"
                />
              )}
            </div>
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              Assessment Complete
            </h3>
            <p className="text-lg font-semibold mb-2">
              Score: {Math.round(score)}%
            </p>
            <p className="text-sm opacity-70 mb-4">
              {passed
                ? "Congratulations! You passed."
                : "Please review and try again."}
            </p>
            {!passed && (
              <Button
                onClick={() => {
                  setCurrentQuestion(0);
                  setAnswers({});
                  setShowResults(false);
                }}
                style={{ backgroundColor: educationColor }}
                aria-label="Retry assessment"
              >
                Try Again
              </Button>
            )}
          </div>
        );
      }

      const question = questions[currentQuestion];
      if (!question) return null;

      return (
        <div
          className="p-6 rounded-lg"
          style={{ backgroundColor: `${educationColor}10` }}
          role="region"
          aria-label={`Assessment question ${currentQuestion + 1} of ${
            questions.length
          }`}
        >
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-sm font-medium"
                style={{ color: educationColor }}
              >
                Question {currentQuestion + 1} of {questions.length}
              </span>
              <div
                className="h-2 bg-gray-200 rounded-full flex-1 ml-4"
                role="progressbar"
                aria-valuenow={currentQuestion + 1}
                aria-valuemin={1}
                aria-valuemax={questions.length}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: educationColor,
                    width: `${
                      ((currentQuestion + 1) / questions.length) * 100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          <h3
            className={TypographyClasses.cardTitle}
            style={{ color: "var(--foreground)" }}
            id={`question-${question.id}`}
          >
            {question.question}
          </h3>

          {/* Render question based on type */}
          {question.type === "multiple-choice" && question.options && (
            <div
              className="space-y-2 mt-4"
              role="radiogroup"
              aria-labelledby={`question-${question.id}`}
            >
              {question.options.map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className="flex items-center p-3 rounded-lg cursor-pointer hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                  role="radio"
                  aria-checked={answers[question.id] === option}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: e.target.value,
                      }))
                    }
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center"
                    style={{ borderColor: educationColor }}
                  >
                    {answers[question.id] === option && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: educationColor }}
                      />
                    )}
                  </div>
                  <span className="text-sm">{option}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === "true-false" && (
            <div
              className="flex gap-4 mt-4"
              role="radiogroup"
              aria-labelledby={`question-${question.id}`}
            >
              {["True", "False"].map((option) => (
                <Button
                  key={option}
                  variant={
                    answers[question.id] === option ? "filled" : "outline"
                  }
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [question.id]: option }))
                  }
                  style={{
                    backgroundColor:
                      answers[question.id] === option
                        ? educationColor
                        : "transparent",
                    borderColor: educationColor,
                    color:
                      answers[question.id] === option
                        ? "white"
                        : educationColor,
                  }}
                  aria-pressed={answers[question.id] === option}
                >
                  {option}
                </Button>
              ))}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={() =>
                setCurrentQuestion(Math.max(0, currentQuestion - 1))
              }
              disabled={currentQuestion === 0}
              leftSection={<ChevronLeft size={16} />}
              aria-label="Previous question"
            >
              Previous
            </Button>
            <Button
              onClick={() => {
                if (answers[question.id] !== undefined) {
                  handleAnswerSubmit(question.id, answers[question.id]);
                }
              }}
              disabled={answers[question.id] === undefined}
              style={{ backgroundColor: educationColor }}
              rightSection={
                currentQuestion === questions.length - 1 ? (
                  <Check size={16} />
                ) : (
                  <ChevronRight size={16} />
                )
              }
              aria-label={
                currentQuestion === questions.length - 1
                  ? "Submit assessment"
                  : "Next question"
              }
            >
              {currentQuestion === questions.length - 1 ? "Submit" : "Next"}
            </Button>
          </div>
        </div>
      );
    },
    [blockStates, educationColor, handleBlockInteraction]
  );

  /**
   * Render multimedia content block
   */
  const renderMultimediaContent = useCallback(
    (block: MultimediaContent, index: number) => {
      const { mediaType, src, sources, captions, transcript } = block.content;

      // Use enhanced multimedia components
      switch (mediaType) {
        case "video":
          return (
            <MultimediaComponents.VideoPlayer
              src={src}
              title={block.title}
              captions={captions}
              transcript={transcript}
              chapters={block.metadata?.chapters}
              onInteraction={(data) =>
                handleBlockInteraction(block.id, "video_interaction", data)
              }
            />
          );

        case "audio":
          return (
            <MultimediaComponents.AudioPlayer
              src={src}
              title={block.title}
              transcript={transcript}
              chapters={block.metadata?.chapters}
              onInteraction={(data) =>
                handleBlockInteraction(block.id, "audio_interaction", data)
              }
            />
          );

        case "image":
          return (
            <MultimediaComponents.InteractiveImage
              src={src}
              alt={
                block.metadata?.accessibility?.altText ||
                block.title ||
                "Educational image"
              }
              title={block.title}
              annotations={block.metadata?.annotations}
              onInteraction={(data) =>
                handleBlockInteraction(block.id, "image_interaction", data)
              }
            />
          );

        default:
          // Fallback for unsupported media types
          return (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden">
                <div
                  className="p-8 text-center"
                  style={{ backgroundColor: `${educationColor}10` }}
                >
                  <div className="text-sm opacity-70">
                    Unsupported media type: {mediaType}
                  </div>
                </div>
              </div>
            </div>
          );
      }
    },
    [educationColor, handleBlockInteraction]
  );

  /**
   * Render simulation content block
   */
  const renderSimulationContent = useCallback(
    (block: SimulationContent, index: number) => {
      const { simulationType, parameters, controls, outputs } = block.content;
      const [simState, setSimState] = useState(parameters.initialValues || {});

      return (
        <div
          className="p-6 rounded-lg"
          style={{ backgroundColor: `${educationColor}10` }}
          role="application"
          aria-label={`Simulation: ${simulationType}`}
        >
          <div className="text-center mb-6">
            <Settings
              className="h-8 w-8 mx-auto mb-3"
              style={{ color: educationColor }}
              aria-hidden="true"
            />
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              {block.title || `${simulationType} Simulation`}
            </h3>
          </div>

          {/* Simulation controls */}
          {controls && controls.length > 0 && (
            <div className="space-y-4 mb-6">
              <h4
                className="font-medium text-sm"
                style={{ color: educationColor }}
              >
                Controls
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {controls.map((control) => (
                  <div key={control.id} className="space-y-2">
                    <label className="block text-sm font-medium">
                      {control.label}
                    </label>
                    {control.type === "slider" && (
                      <input
                        type="range"
                        className="w-full"
                        onChange={(e) => {
                          const newState = {
                            ...simState,
                            [control.id]: e.target.value,
                          };
                          setSimState(newState);
                          handleBlockInteraction(
                            block.id,
                            "simulation_parameter_changed",
                            {
                              parameter: control.id,
                              value: e.target.value,
                              state: newState,
                            }
                          );
                        }}
                        aria-label={control.label}
                      />
                    )}
                    {control.type === "button" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleBlockInteraction(
                            block.id,
                            "simulation_action",
                            {
                              action: control.action,
                            }
                          )
                        }
                        style={{ backgroundColor: educationColor }}
                        aria-label={control.label}
                      >
                        {control.label}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Simulation output */}
          <div className="bg-white/50 dark:bg-black/20 rounded-lg p-4">
            <p className="text-sm text-center opacity-70">
              Simulation output will be displayed here
            </p>
            {/* Placeholder for actual simulation rendering */}
          </div>
        </div>
      );
    },
    [blockStates, educationColor, handleBlockInteraction]
  );

  /**
   * Render a single content block
   */
  const renderContentBlock = useCallback(
    (block: ContentBlock, index: number) => {
      const Icon = getContentIcon(block.type);
      const isCompleted = completedBlocks.has(block.id);
      const hasError = errors[block.id];

      return (
        <motion.div
          key={block.id}
          ref={(el) => (contentRefs.current[block.id] = el)}
          className="floating-card p-8 mb-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: hasError ? "var(--color-warm-coral)" : "var(--border)",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
          whileHover={{
            y: -2,
            transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
          }}
          role="article"
          aria-labelledby={`content-${block.id}-title`}
        >
          {/* Content Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${educationColor}20` }}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" style={{ color: educationColor }} />
              </div>
              <div>
                <span
                  id={`content-${block.id}-title`}
                  className="text-sm font-medium capitalize"
                  style={{ color: educationColor }}
                >
                  {block.title || `${block.type.replace("-", " ")} Content`}
                </span>
                {block.metadata?.estimatedDuration && (
                  <div className="text-xs opacity-60">
                    ~{block.metadata.estimatedDuration} min
                  </div>
                )}
              </div>
            </div>
            {isCompleted && (
              <Check
                className="h-5 w-5 text-green-500"
                aria-label="Content completed"
              />
            )}
          </div>

          {/* Error Display */}
          {hasError && (
            <div
              className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700 dark:text-red-300">
                  {hasError}
                </span>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => clearBlockError(block.id)}
                  aria-label="Dismiss error"
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
          )}

          {/* Content Body */}
          <div className="text-flow-natural">
            {block.type === "text" &&
              renderTextContent(block as TextContent, index)}
            {block.type === "rich-text" &&
              renderRichTextContent(block as RichTextContent, index)}
            {block.type === "interactive-demo" &&
              renderInteractiveDemoContent(
                block as InteractiveDemoContent,
                index
              )}
            {block.type === "assessment" &&
              renderAssessmentContent(block as AssessmentContent, index)}
            {block.type === "multimedia" &&
              renderMultimediaContent(block as MultimediaContent, index)}
            {block.type === "simulation" &&
              renderSimulationContent(block as SimulationContent, index)}

            {/* Fallback for unsupported content types */}
            {![
              "text",
              "rich-text",
              "interactive-demo",
              "assessment",
              "multimedia",
              "simulation",
            ].includes(block.type) && (
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: `${educationColor}10` }}
              >
                <Icon
                  className="h-8 w-8 mx-auto mb-3"
                  style={{ color: educationColor }}
                  aria-hidden="true"
                />
                <div
                  className="font-medium mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  {block.type
                    .replace("-", " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}{" "}
                  Content
                </div>
                <div
                  className="text-sm"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  This content type will be implemented in future updates
                </div>
              </div>
            )}
          </div>

          {/* Learning Objectives */}
          {block.metadata?.learningObjectives &&
            block.metadata.learningObjectives.length > 0 && (
              <div
                className="mt-4 p-3 rounded-lg"
                style={{ backgroundColor: `${educationColor}05` }}
              >
                <h4
                  className="text-sm font-medium mb-2"
                  style={{ color: educationColor }}
                >
                  Learning Objectives
                </h4>
                <ul className="text-sm space-y-1">
                  {block.metadata.learningObjectives.map((objective, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Target
                        className="h-3 w-3 mt-0.5 flex-shrink-0"
                        style={{ color: educationColor }}
                      />
                      <span>{objective}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Interaction Button */}
          {!isCompleted && (
            <div className="flex justify-end mt-6">
              <motion.div
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <Button
                  onClick={() => {
                    handleBlockInteraction(block.id, "content_interaction", {
                      blockType: block.type,
                    });
                  }}
                  style={{ backgroundColor: educationColor }}
                  aria-label={`Interact with ${block.type} content`}
                >
                  {block.type === "assessment"
                    ? "Start Assessment"
                    : block.type === "multimedia"
                    ? "View Media"
                    : block.type === "interactive-demo"
                    ? "Try Demo"
                    : block.type === "simulation"
                    ? "Run Simulation"
                    : "Continue"}
                </Button>
              </motion.div>
            </div>
          )}
        </motion.div>
      );
    },
    [
      completedBlocks,
      errors,
      educationColor,
      getContentIcon,
      handleBlockInteraction,
      clearBlockError,
      renderTextContent,
      renderRichTextContent,
      renderInteractiveDemoContent,
      renderAssessmentContent,
      renderMultimediaContent,
      renderSimulationContent,
    ]
  );

  // Calculate overall completion percentage
  const completionPercentage =
    content.length > 0 ? (completedBlocks.size / content.length) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`space-y-6 ${className}`}
      role="main"
      aria-label="Interactive educational content"
    >
      {/* Progress Indicator */}
      {showProgress && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: educationColor }}
            >
              Progress
            </span>
            <span className="text-sm opacity-70">
              {completedBlocks.size} of {content.length} completed
            </span>
          </div>
          <div
            className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={completionPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Content progress: ${Math.round(
              completionPercentage
            )}%`}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: educationColor }}
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      )}

      {/* Content Blocks */}
      {content.length > 0 ? (
        content.map((block, index) => renderContentBlock(block, index))
      ) : (
        <div
          className="text-center py-12"
          role="status"
          aria-label="No content available"
        >
          <BookOpen
            className="h-12 w-12 mx-auto mb-4 opacity-50"
            aria-hidden="true"
          />
          <p className="text-lg opacity-70">No content available</p>
        </div>
      )}

      {/* Completion Section */}
      {content.length > 0 && completionPercentage === 100 && (
        <motion.div
          className="text-center pt-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="mb-4">
            <Check
              className="h-16 w-16 mx-auto mb-4 text-green-500"
              aria-hidden="true"
            />
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              All Content Completed!
            </h3>
            <p className="text-sm opacity-70 mb-6">
              Great job! You've completed all the content in this section.
            </p>
          </div>
          <motion.div
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <Button
              size="lg"
              onClick={onComplete}
              style={{ backgroundColor: educationColor }}
              aria-label="Complete lesson and continue"
            >
              Complete Lesson
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Partial Completion Button */}
      {content.length > 0 &&
        completionPercentage > 0 &&
        completionPercentage < 100 && (
          <motion.div
            className="text-center pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: content.length * 0.1 }}
          >
            <motion.div
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <Button
                variant="outline"
                size="lg"
                onClick={onComplete}
                style={{ borderColor: educationColor, color: educationColor }}
                aria-label="Continue to next section"
              >
                Continue ({Math.round(completionPercentage)}% Complete)
              </Button>
            </motion.div>
          </motion.div>
        )}
    </div>
  );
}
