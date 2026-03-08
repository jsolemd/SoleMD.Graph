"use client";

import { motion } from "framer-motion";
import { CheckCircle, Circle, Clock, Trophy, Target } from "lucide-react";

/**
 * ProgressIndicator Component
 *
 * A comprehensive progress indicator for education modules that displays:
 * - Overall module progress
 * - Individual lesson completion status
 * - Time tracking and estimates
 * - Achievement indicators
 * - Visual progress representations
 *
 * This component provides detailed progress feedback to learners
 * and can be customized for different module types.
 */

interface LessonProgress {
  /** Lesson identifier */
  id: string;

  /** Lesson title */
  title: string;

  /** Whether the lesson is completed */
  completed: boolean;

  /** Whether the lesson is currently active */
  active: boolean;

  /** Time spent on this lesson in minutes */
  timeSpent?: number;
}

interface ProgressStats {
  /** Total lessons in the module */
  totalLessons: number;

  /** Number of completed lessons */
  completedLessons: number;

  /** Total time spent in minutes */
  totalTimeSpent: number;

  /** Estimated total time in minutes */
  estimatedTime: number;

  /** Current learning streak in days */
  streak?: number;

  /** Achievement badges earned */
  badges?: string[];
}

interface ProgressIndicatorProps {
  /** Array of lesson progress data */
  lessons: LessonProgress[];

  /** Overall progress statistics */
  stats: ProgressStats;

  /** Module title for context */
  moduleTitle: string;

  /** Whether to show detailed lesson breakdown */
  showLessonDetails?: boolean;

  /** Whether to show time tracking */
  showTimeTracking?: boolean;

  /** Whether to show achievements */
  showAchievements?: boolean;

  /** Callback when a lesson is selected */
  onLessonSelect?: (lessonId: string) => void;

  /** Custom CSS classes */
  className?: string;
}

/**
 * ProgressIndicator Component
 *
 * Displays comprehensive progress information for education modules
 * with visual indicators, statistics, and interactive elements.
 *
 * @param lessons - Array of lesson progress data
 * @param stats - Overall progress statistics
 * @param moduleTitle - Module title for context
 * @param showLessonDetails - Whether to show detailed lesson breakdown
 * @param showTimeTracking - Whether to show time tracking
 * @param showAchievements - Whether to show achievements
 * @param onLessonSelect - Callback when a lesson is selected
 * @param className - Custom CSS classes
 */
export default function ProgressIndicator({
  lessons,
  stats,
  moduleTitle,
  showLessonDetails = true,
  showTimeTracking = true,
  showAchievements = true,
  onLessonSelect,
  className = "",
}: ProgressIndicatorProps) {
  const educationColor = "var(--color-fresh-green)";

  // Calculate progress percentage
  const progressPercentage =
    stats.totalLessons > 0
      ? Math.round((stats.completedLessons / stats.totalLessons) * 100)
      : 0;

  // Calculate time progress
  const timeProgressPercentage =
    stats.estimatedTime > 0
      ? Math.min(
          Math.round((stats.totalTimeSpent / stats.estimatedTime) * 100),
          100
        )
      : 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Main Progress Card */}
      <motion.div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3
              className="text-card-title mb-1"
              style={{ color: "var(--foreground)" }}
            >
              {moduleTitle} Progress
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Track your learning journey
            </p>
          </div>

          {progressPercentage === 100 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <Trophy className="h-8 w-8" style={{ color: educationColor }} />
            </motion.div>
          )}
        </div>

        {/* Main Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--foreground)", opacity: 0.8 }}
            >
              Overall Progress
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: educationColor }}
            >
              {stats.completedLessons}/{stats.totalLessons} lessons (
              {progressPercentage}%)
            </span>
          </div>

          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--border)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: educationColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Progress Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Completion Rate */}
          <div className="text-center">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
              style={{ backgroundColor: `${educationColor}20` }}
            >
              <Target className="h-5 w-5" style={{ color: educationColor }} />
            </div>
            <div
              className="text-lg font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {progressPercentage}%
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--foreground)", opacity: 0.6 }}
            >
              Complete
            </div>
          </div>

          {/* Time Spent */}
          {showTimeTracking && (
            <div className="text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: `${educationColor}20` }}
              >
                <Clock className="h-5 w-5" style={{ color: educationColor }} />
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {Math.floor(stats.totalTimeSpent / 60)}h{" "}
                {stats.totalTimeSpent % 60}m
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--foreground)", opacity: 0.6 }}
              >
                Time Spent
              </div>
            </div>
          )}

          {/* Streak */}
          {showAchievements && stats.streak && (
            <div className="text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: `${educationColor}20` }}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: educationColor }}
                >
                  🔥
                </span>
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {stats.streak}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--foreground)", opacity: 0.6 }}
              >
                Day Streak
              </div>
            </div>
          )}

          {/* Badges */}
          {showAchievements && stats.badges && stats.badges.length > 0 && (
            <div className="text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: `${educationColor}20` }}
              >
                <Trophy className="h-5 w-5" style={{ color: educationColor }} />
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: "var(--foreground)" }}
              >
                {stats.badges.length}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--foreground)", opacity: 0.6 }}
              >
                {stats.badges.length === 1 ? "Badge" : "Badges"}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Lesson Details */}
      {showLessonDetails && lessons.length > 0 && (
        <motion.div
          className="floating-card p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        >
          <h4
            className="text-card-title mb-4"
            style={{ color: "var(--foreground)" }}
          >
            Lesson Progress
          </h4>

          <div className="space-y-3">
            {lessons.map((lesson, index) => (
              <motion.div
                key={lesson.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                  onLessonSelect ? "cursor-pointer hover:bg-opacity-50" : ""
                }`}
                style={{
                  backgroundColor: lesson.active
                    ? `${educationColor}15`
                    : "transparent",
                  borderColor: lesson.active
                    ? `${educationColor}30`
                    : "transparent",
                  border: "1px solid",
                }}
                onClick={() => onLessonSelect?.(lesson.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.1 * index,
                  ease: "easeOut",
                }}
                whileHover={onLessonSelect ? { x: 4 } : undefined}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {lesson.completed ? (
                    <CheckCircle
                      className="h-5 w-5"
                      style={{ color: educationColor }}
                    />
                  ) : (
                    <Circle
                      className="h-5 w-5"
                      style={{
                        color: lesson.active
                          ? educationColor
                          : "var(--foreground)",
                        opacity: lesson.active ? 1 : 0.4,
                      }}
                    />
                  )}
                </div>

                {/* Lesson Info */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-medium text-sm truncate"
                    style={{
                      color: lesson.active
                        ? educationColor
                        : "var(--foreground)",
                      opacity: lesson.active ? 1 : 0.8,
                    }}
                  >
                    {lesson.title}
                  </div>

                  {lesson.timeSpent && (
                    <div
                      className="text-xs"
                      style={{
                        color: "var(--foreground)",
                        opacity: 0.5,
                      }}
                    >
                      {lesson.timeSpent} min spent
                    </div>
                  )}
                </div>

                {/* Progress Indicator */}
                <div className="flex-shrink-0">
                  {lesson.completed && (
                    <div
                      className="text-xs font-medium"
                      style={{ color: educationColor }}
                    >
                      Complete
                    </div>
                  )}

                  {lesson.active && !lesson.completed && (
                    <div
                      className="text-xs font-medium"
                      style={{ color: educationColor }}
                    >
                      Current
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Completion Message */}
      {progressPercentage === 100 && (
        <motion.div
          className="floating-card p-6 text-center"
          style={{
            backgroundColor: `${educationColor}15`,
            borderColor: `${educationColor}30`,
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
        >
          <Trophy
            className="h-12 w-12 mx-auto mb-4"
            style={{ color: educationColor }}
          />

          <h3
            className="text-card-title mb-2"
            style={{ color: educationColor }}
          >
            Module Completed! 🎉
          </h3>

          <p
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.8 }}
          >
            Congratulations on completing the {moduleTitle} module. You've
            mastered all the key concepts and are ready for the next challenge!
          </p>
        </motion.div>
      )}
    </div>
  );
}
