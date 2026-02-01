"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  CheckCircle,
  Circle,
  Clock,
  Lock,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Lesson, LessonProgress } from "../../lib/types";

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

/**
 * Props for the LessonNavigation component
 *
 * @interface LessonNavigationProps
 */
export interface LessonNavigationProps {
  /** Array of lesson objects with full lesson data */
  lessons: Lesson[];

  /** ID of the currently active lesson */
  currentLessonId: string;

  /** Callback function when lesson selection changes */
  onLessonChange: (lessonId: string) => void;

  /** Array of completed lesson IDs */
  completedLessons: string[];

  /** Optional lesson progress data for detailed progress indicators */
  lessonProgress?: Record<string, LessonProgress>;

  /** Whether the navigation should be collapsible on mobile */
  collapsible?: boolean;

  /** Custom CSS class name */
  className?: string;

  /** Whether to show detailed progress information */
  showDetailedProgress?: boolean;

  /** Whether to show estimated time remaining */
  showTimeEstimates?: boolean;

  /** Custom aria-label for the navigation */
  ariaLabel?: string;
}

/**
 * Internal state for lesson navigation
 */
interface NavigationState {
  isCollapsed: boolean;
  focusedIndex: number;
  isMobile: boolean;
}

// =============================================================================
// LESSON NAVIGATION COMPONENT
// =============================================================================

/**
 * LessonNavigation Component
 *
 * A comprehensive lesson navigation component that provides:
 * - Responsive sidebar navigation with SoleMD floating card styling
 * - Progress indicators using education theme colors
 * - Full keyboard navigation and screen reader support (WCAG AA compliance)
 * - Mobile-responsive collapsible design
 * - Detailed progress tracking integration
 * - Accessibility features including ARIA labels and semantic HTML
 *
 * @example
 * ```tsx
 * <LessonNavigation
 *   lessons={lessons}
 *   currentLessonId="lesson-1"
 *   onLessonChange={handleLessonChange}
 *   completedLessons={["lesson-1", "lesson-2"]}
 *   lessonProgress={progressData}
 *   showDetailedProgress={true}
 *   showTimeEstimates={true}
 * />
 * ```
 *
 * @param props - The component props
 * @returns JSX.Element - The rendered lesson navigation component
 */
export default function LessonNavigation({
  lessons,
  currentLessonId,
  onLessonChange,
  completedLessons,
  lessonProgress = {},
  collapsible = true,
  className = "",
  showDetailedProgress = false,
  showTimeEstimates = true,
  ariaLabel = "Lesson navigation",
}: LessonNavigationProps): JSX.Element {
  // =============================================================================
  // HOOKS AND STATE
  // =============================================================================

  const [state, setState] = useState<NavigationState>({
    isCollapsed: false,
    focusedIndex: -1,
    isMobile: false,
  });

  const navigationRef = useRef<HTMLDivElement>(null);
  const lessonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefersReducedMotion = useReducedMotion();

  // Education theme color
  const educationColor = "var(--color-fresh-green)";

  // =============================================================================
  // RESPONSIVE BEHAVIOR
  // =============================================================================

  /**
   * Handle responsive behavior and mobile detection
   */
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      setState((prev) => ({
        ...prev,
        isMobile,
        isCollapsed: isMobile ? true : prev.isCollapsed,
      }));
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // =============================================================================
  // KEYBOARD NAVIGATION
  // =============================================================================

  /**
   * Handle keyboard navigation within the lesson list
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { key } = event;
      const currentIndex = lessons.findIndex(
        (lesson) => lesson.id === currentLessonId
      );

      switch (key) {
        case "ArrowDown":
          event.preventDefault();
          const nextIndex = Math.min(currentIndex + 1, lessons.length - 1);
          if (nextIndex !== currentIndex) {
            lessonRefs.current[nextIndex]?.focus();
            setState((prev) => ({ ...prev, focusedIndex: nextIndex }));
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          const prevIndex = Math.max(currentIndex - 1, 0);
          if (prevIndex !== currentIndex) {
            lessonRefs.current[prevIndex]?.focus();
            setState((prev) => ({ ...prev, focusedIndex: prevIndex }));
          }
          break;

        case "Enter":
        case " ":
          event.preventDefault();
          if (state.focusedIndex >= 0 && state.focusedIndex < lessons.length) {
            const lesson = lessons[state.focusedIndex];
            if (isLessonAccessible(lesson)) {
              onLessonChange(lesson.id);
            }
          }
          break;

        case "Home":
          event.preventDefault();
          lessonRefs.current[0]?.focus();
          setState((prev) => ({ ...prev, focusedIndex: 0 }));
          break;

        case "End":
          event.preventDefault();
          const lastIndex = lessons.length - 1;
          lessonRefs.current[lastIndex]?.focus();
          setState((prev) => ({ ...prev, focusedIndex: lastIndex }));
          break;

        case "Escape":
          if (state.isMobile && !state.isCollapsed) {
            setState((prev) => ({ ...prev, isCollapsed: true }));
          }
          break;
      }
    },
    [
      lessons,
      currentLessonId,
      state.focusedIndex,
      state.isMobile,
      state.isCollapsed,
      onLessonChange,
    ]
  );

  // =============================================================================
  // LESSON ACCESSIBILITY LOGIC
  // =============================================================================

  /**
   * Check if a lesson is accessible based on prerequisites
   */
  const isLessonAccessible = useCallback(
    (lesson: Lesson): boolean => {
      if (!lesson.prerequisites || lesson.prerequisites.length === 0) {
        return true;
      }
      return lesson.prerequisites.every((prereq) =>
        completedLessons.includes(prereq)
      );
    },
    [completedLessons]
  );

  /**
   * Get lesson status for accessibility and visual indicators
   */
  const getLessonStatus = useCallback(
    (lesson: Lesson) => {
      const isCompleted = completedLessons.includes(lesson.id);
      const isCurrent = lesson.id === currentLessonId;
      const isAccessible = isLessonAccessible(lesson);
      const progress = lessonProgress[lesson.id];

      return {
        isCompleted,
        isCurrent,
        isAccessible,
        progress: progress?.contentProgress || 0,
        timeSpent: progress?.timeSpent || 0,
      };
    },
    [completedLessons, currentLessonId, lessonProgress, isLessonAccessible]
  );

  // =============================================================================
  // TOGGLE FUNCTIONS
  // =============================================================================

  /**
   * Toggle navigation collapse state
   */
  const toggleCollapse = useCallback(() => {
    setState((prev) => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, []);

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  /**
   * Render progress indicator for a lesson
   */
  const renderProgressIndicator = (
    lesson: Lesson,
    status: ReturnType<typeof getLessonStatus>
  ) => {
    const { isCompleted, isCurrent, isAccessible, progress } = status;

    if (isCompleted) {
      return (
        <CheckCircle
          className="h-5 w-5 flex-shrink-0"
          style={{ color: educationColor }}
          aria-hidden="true"
        />
      );
    }

    if (!isAccessible) {
      return (
        <Lock
          className="h-5 w-5 flex-shrink-0"
          style={{ color: "var(--foreground)", opacity: 0.4 }}
          aria-hidden="true"
        />
      );
    }

    if (showDetailedProgress && progress > 0 && progress < 100) {
      return (
        <div className="relative h-5 w-5 flex-shrink-0">
          <Circle
            className="h-5 w-5 absolute"
            style={{ color: "var(--foreground)", opacity: 0.2 }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${educationColor} ${
                progress * 3.6
              }deg, transparent 0deg)`,
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-1 rounded-full"
            style={{ backgroundColor: "var(--card)" }}
            aria-hidden="true"
          />
        </div>
      );
    }

    return (
      <Circle
        className="h-5 w-5 flex-shrink-0"
        style={{
          color: isCurrent ? educationColor : "var(--foreground)",
          opacity: isCurrent ? 1 : 0.4,
        }}
        aria-hidden="true"
      />
    );
  };

  /**
   * Render lesson button
   */
  const renderLessonButton = (lesson: Lesson, index: number) => {
    const status = getLessonStatus(lesson);
    const { isCompleted, isCurrent, isAccessible } = status;

    // Calculate estimated time remaining
    const estimatedTimeRemaining = showTimeEstimates
      ? Math.max(0, lesson.duration - (status.timeSpent || 0))
      : lesson.duration;

    return (
      <motion.button
        key={lesson.id}
        ref={(el) => (lessonRefs.current[index] = el)}
        className={`w-full text-left p-4 rounded-lg transition-all duration-200 flex items-center gap-3 group ${
          !isAccessible ? "cursor-not-allowed" : "cursor-pointer"
        }`}
        style={{
          backgroundColor: isCurrent ? `${educationColor}15` : "transparent",
          borderColor: isCurrent ? `${educationColor}30` : "transparent",
          border: "1px solid",
          opacity: isAccessible ? 1 : 0.6,
        }}
        onClick={() => isAccessible && onLessonChange(lesson.id)}
        onKeyDown={handleKeyDown}
        disabled={!isAccessible}
        aria-current={isCurrent ? "page" : undefined}
        aria-describedby={`lesson-${lesson.id}-description`}
        whileHover={
          prefersReducedMotion || !isAccessible
            ? {}
            : { x: 4, transition: { duration: 0.2 } }
        }
        whileTap={
          prefersReducedMotion || !isAccessible
            ? {}
            : { scale: 0.98, transition: { duration: 0.1 } }
        }
      >
        {/* Progress Indicator */}
        {renderProgressIndicator(lesson, status)}

        {/* Lesson Content */}
        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-sm mb-1"
            style={{
              color: isCurrent ? educationColor : "var(--foreground)",
              opacity: isCurrent ? 1 : 0.9,
            }}
          >
            Lesson {index + 1}
            {isCompleted && (
              <span className="ml-2 text-xs" aria-label="Completed">
                ✓
              </span>
            )}
          </div>

          <div
            className="text-sm font-medium mb-1 line-clamp-2"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
            }}
          >
            {lesson.title}
          </div>

          {/* Time and Progress Information */}
          <div className="flex items-center gap-2 text-xs">
            <div
              className="flex items-center gap-1"
              style={{
                color: "var(--foreground)",
                opacity: 0.6,
              }}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>
                {showTimeEstimates && status.timeSpent > 0
                  ? `${estimatedTimeRemaining} min left`
                  : `${lesson.duration} min`}
              </span>
            </div>

            {showDetailedProgress &&
              status.progress > 0 &&
              status.progress < 100 && (
                <div
                  className="text-xs"
                  style={{
                    color: educationColor,
                    opacity: 0.8,
                  }}
                >
                  {Math.round(status.progress)}% complete
                </div>
              )}
          </div>

          {/* Hidden description for screen readers */}
          <div id={`lesson-${lesson.id}-description`} className="sr-only">
            {lesson.description}
            {!isAccessible && " (Prerequisites not met)"}
            {isCompleted && " (Completed)"}
            {isCurrent && " (Currently active)"}
          </div>
        </div>

        {/* Arrow Indicator */}
        {isCurrent && isAccessible && (
          <ChevronRight
            className="h-4 w-4 flex-shrink-0 group-hover:translate-x-1 transition-transform duration-200"
            style={{ color: educationColor }}
            aria-hidden="true"
          />
        )}
      </motion.button>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <motion.nav
      ref={navigationRef}
      className={`${className} ${
        state.isMobile ? "fixed inset-x-4 top-20 z-50" : ""
      }`}
      role="navigation"
      aria-label={ariaLabel}
      initial={prefersReducedMotion ? {} : { opacity: 0, x: -30 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
      transition={
        prefersReducedMotion ? {} : { duration: 0.6, ease: "easeOut" }
      }
    >
      <div
        className="floating-card overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header with Toggle Button */}
        <div className="flex items-center justify-between p-4 border-b border-opacity-10">
          <h2
            className="text-card-title"
            style={{ color: "var(--foreground)" }}
          >
            Course Navigation
          </h2>

          {collapsible && (
            <button
              className="p-2 rounded-lg transition-colors duration-200 hover:bg-opacity-10"
              style={{
                backgroundColor: "transparent",
                color: "var(--foreground)",
              }}
              onClick={toggleCollapse}
              aria-expanded={!state.isCollapsed}
              aria-controls="lesson-list"
              aria-label={
                state.isCollapsed ? "Expand navigation" : "Collapse navigation"
              }
            >
              {state.isCollapsed ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        {/* Lesson List */}
        <motion.div
          id="lesson-list"
          className="overflow-hidden"
          initial={false}
          animate={{
            height: state.isCollapsed ? 0 : "auto",
            opacity: state.isCollapsed ? 0 : 1,
          }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.3, ease: "easeInOut" }
          }
        >
          <div className="p-4 space-y-2" role="list">
            {lessons.map((lesson, index) => (
              <div key={lesson.id} role="listitem">
                {renderLessonButton(lesson, index)}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Progress Summary */}
        {!state.isCollapsed && (
          <div
            className="p-4 border-t border-opacity-10"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between text-sm">
              <span
                style={{
                  color: "var(--foreground)",
                  opacity: 0.7,
                }}
              >
                Progress
              </span>
              <span
                style={{
                  color: educationColor,
                  fontWeight: 500,
                }}
              >
                {completedLessons.length} of {lessons.length} completed
              </span>
            </div>

            {/* Progress Bar */}
            <div
              className="mt-2 h-2 rounded-full overflow-hidden"
              style={{
                backgroundColor: "var(--border)",
                opacity: 0.3,
              }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: educationColor }}
                initial={{ width: 0 }}
                animate={{
                  width: `${(completedLessons.length / lessons.length) * 100}%`,
                }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.8, ease: "easeOut" }
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Overlay */}
      {state.isMobile && !state.isCollapsed && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={toggleCollapse}
          aria-hidden="true"
        />
      )}
    </motion.nav>
  );
}
