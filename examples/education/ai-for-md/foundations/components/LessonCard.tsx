"use client";

import { motion } from "framer-motion";
import { CheckCircle, Clock, Play, Lock } from "lucide-react";
import { Button } from "@mantine/core";

/**
 * LessonCard Component
 *
 * A reusable card component for displaying individual lessons within education modules.
 * Features consistent styling, progress indicators, and interactive elements.
 *
 * This component provides a standardized way to present lesson information
 * with proper accessibility and responsive design.
 */

interface Lesson {
  /** Unique identifier for the lesson */
  id: string;

  /** Title of the lesson */
  title: string;

  /** Brief description of the lesson content */
  description: string;

  /** Estimated duration in minutes */
  duration: number;

  /** Whether the lesson is completed */
  completed: boolean;

  /** Whether the lesson is currently accessible */
  locked: boolean;

  /** Optional lesson number for display */
  lessonNumber?: number;

  /** Optional array of learning objectives */
  objectives?: string[];
}

interface LessonCardProps {
  /** The lesson data to display */
  lesson: Lesson;

  /** Callback when the lesson is started/accessed */
  onStart: (lessonId: string) => void;

  /** Whether this card should show entrance animation */
  animate?: boolean;

  /** Animation delay for staggered entrance */
  animationDelay?: number;

  /** Whether to show the lesson number */
  showNumber?: boolean;

  /** Custom CSS classes */
  className?: string;
}

/**
 * LessonCard Component
 *
 * Displays lesson information in a card format with progress indicators,
 * duration, and interactive elements for starting lessons.
 *
 * @param lesson - The lesson data to display
 * @param onStart - Callback when the lesson is started
 * @param animate - Whether to show entrance animation
 * @param animationDelay - Animation delay for staggered entrance
 * @param showNumber - Whether to show the lesson number
 * @param className - Custom CSS classes
 */
export default function LessonCard({
  lesson,
  onStart,
  animate = true,
  animationDelay = 0,
  showNumber = true,
  className = "",
}: LessonCardProps) {
  const educationColor = "var(--color-fresh-green)";

  const handleStart = () => {
    if (!lesson.locked) {
      onStart(lesson.id);
    }
  };

  const getStatusIcon = () => {
    if (lesson.completed) {
      return (
        <CheckCircle className="h-5 w-5" style={{ color: educationColor }} />
      );
    }

    if (lesson.locked) {
      return (
        <Lock
          className="h-5 w-5"
          style={{ color: "var(--foreground)", opacity: 0.4 }}
        />
      );
    }

    return <Play className="h-5 w-5" style={{ color: educationColor }} />;
  };

  const getButtonText = () => {
    if (lesson.completed) return "Review Lesson";
    if (lesson.locked) return "Locked";
    return "Start Lesson";
  };

  return (
    <motion.div
      className={`h-full ${className}`}
      initial={animate ? { opacity: 0, y: 30 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={
        animate
          ? {
              duration: 0.6,
              delay: animationDelay,
              ease: "easeOut",
            }
          : undefined
      }
      whileHover={
        !lesson.locked
          ? {
              y: -4,
              transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
            }
          : undefined
      }
    >
      <div
        className="floating-card p-6 h-full relative"
        style={{
          backgroundColor: "var(--card)",
          borderColor: lesson.completed
            ? `${educationColor}30`
            : "var(--border)",
          opacity: lesson.locked ? 0.6 : 1,
          transition: "all 300ms ease",
        }}
      >
        {/* Lesson Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {showNumber && lesson.lessonNumber && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: lesson.completed
                    ? educationColor
                    : `${educationColor}20`,
                  color: lesson.completed ? "white" : educationColor,
                }}
              >
                {lesson.lessonNumber}
              </div>
            )}

            <div>
              <h3
                className="text-card-title mb-1"
                style={{ color: "var(--foreground)" }}
              >
                {lesson.title}
              </h3>

              <div className="flex items-center gap-2 text-sm">
                <Clock
                  className="h-3 w-3"
                  style={{ color: "var(--foreground)", opacity: 0.5 }}
                />
                <span style={{ color: "var(--foreground)", opacity: 0.5 }}>
                  {lesson.duration} min
                </span>
              </div>
            </div>
          </div>

          {/* Status Icon */}
          <div className="flex-shrink-0">{getStatusIcon()}</div>
        </div>

        {/* Lesson Description */}
        <div className="flex-1 mb-6">
          <p
            className="text-body-small"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            {lesson.description}
          </p>
        </div>

        {/* Learning Objectives (if provided) */}
        {lesson.objectives && lesson.objectives.length > 0 && (
          <div className="mb-6">
            <h4
              className="text-sm font-medium mb-2"
              style={{ color: "var(--foreground)", opacity: 0.8 }}
            >
              You'll Learn:
            </h4>
            <ul className="space-y-1">
              {lesson.objectives.slice(0, 3).map((objective, index) => (
                <li
                  key={index}
                  className="text-xs flex items-start gap-2"
                  style={{ color: "var(--foreground)", opacity: 0.6 }}
                >
                  <div
                    className="w-1 h-1 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: educationColor }}
                  />
                  {objective}
                </li>
              ))}
              {lesson.objectives.length > 3 && (
                <li
                  className="text-xs"
                  style={{ color: educationColor, opacity: 0.8 }}
                >
                  +{lesson.objectives.length - 3} more objectives
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto">
          <Button
            fullWidth
            disabled={lesson.locked}
            onClick={handleStart}
            leftSection={getStatusIcon()}
            styles={{
              root: {
                backgroundColor: lesson.completed
                  ? "transparent"
                  : lesson.locked
                  ? "var(--border)"
                  : educationColor,
                color: lesson.completed
                  ? educationColor
                  : lesson.locked
                  ? "var(--foreground)"
                  : "white",
                border: lesson.completed
                  ? `2px solid ${educationColor}`
                  : "none",
                borderRadius: "0.75rem",
                fontWeight: 600,
                padding: "0.75rem 1rem",
                opacity: lesson.locked ? 0.5 : 1,
                cursor: lesson.locked ? "not-allowed" : "pointer",
                "&:hover": lesson.locked
                  ? {}
                  : {
                      backgroundColor: lesson.completed
                        ? `${educationColor}15`
                        : educationColor,
                      opacity: lesson.completed ? 1 : 0.9,
                      transform: "translateY(-1px)",
                    },
              },
            }}
          >
            {getButtonText()}
          </Button>
        </div>

        {/* Completion Badge */}
        {lesson.completed && (
          <motion.div
            className="absolute -top-2 -right-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: educationColor }}
            >
              <CheckCircle className="h-3 w-3 text-white" />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
