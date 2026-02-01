"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  Clock,
  Trophy,
  Target,
  TrendingUp,
  Award,
  Calendar,
  BarChart3,
  AlertCircle,
  BookOpen,
  Zap,
  Star,
} from "lucide-react";
import { UserProgress, ProgressStats, InteractionEvent } from "../../lib/types";
import { ProgressManager, AchievementSystem } from "../../lib/progress";

/**
 * Enhanced Progress Data Interface
 *
 * Extends the basic progress data with comprehensive tracking capabilities
 * for analytics and learning insights.
 */
interface EnhancedProgressData extends UserProgress {
  /** Recent activity timeline */
  recentActivity: ActivityItem[];

  /** Learning velocity metrics */
  velocity: {
    lessonsPerWeek: number;
    averageSessionTime: number;
    consistencyScore: number;
  };

  /** Difficulty tracking */
  difficultyMetrics: {
    strugglingAreas: string[];
    strongAreas: string[];
    averageAttempts: number;
  };

  /** Engagement metrics */
  engagement: {
    totalInteractions: number;
    averageEngagementTime: number;
    dropOffPoints: string[];
  };
}

/**
 * Activity Item Interface
 *
 * Represents individual learning activities for the timeline.
 */
interface ActivityItem {
  id: string;
  type:
    | "lesson_complete"
    | "assessment_passed"
    | "badge_earned"
    | "milestone_reached";
  title: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Analytics Integration Point Interface
 *
 * Defines the structure for analytics data collection.
 */
interface AnalyticsIntegration {
  /** Track user interaction events */
  trackInteraction: (event: InteractionEvent) => void;

  /** Track progress milestones */
  trackMilestone: (milestone: string, data: any) => void;

  /** Track learning difficulties */
  trackDifficulty: (lessonId: string, difficulty: string, context: any) => void;

  /** Track engagement metrics */
  trackEngagement: (sessionData: any) => void;
}

/**
 * Progress Tracker Props Interface
 *
 * Comprehensive props for the enhanced ProgressTracker component.
 */
interface ProgressTrackerProps {
  /** Unique identifier for the module */
  moduleId: string;

  /** Current lesson identifier */
  lessonId: string;

  /** Current user progress data */
  progress: EnhancedProgressData;

  /** Callback for progress updates */
  onProgressUpdate: (progress: EnhancedProgressData) => void;

  /** Analytics integration for tracking */
  analytics?: AnalyticsIntegration;

  /** Whether to show detailed analytics */
  showAnalytics?: boolean;

  /** Whether to show achievement notifications */
  showAchievements?: boolean;

  /** Custom styling options */
  customStyles?: Record<string, any>;

  /** Accessibility options */
  accessibility?: {
    announceProgress?: boolean;
    highContrast?: boolean;
    reducedMotion?: boolean;
  };
}

/**
 * Enhanced ProgressTracker Component
 *
 * A comprehensive progress tracking component that provides:
 * - Visual progress indicators using SoleMD design patterns
 * - Local storage persistence for offline capability
 * - Analytics integration points for learning insights
 * - Achievement system with badges and milestones
 * - Accessibility features for inclusive learning
 * - Real-time progress updates and notifications
 *
 * This component serves as a reusable pattern for all education modules
 * and establishes the foundation for learning analytics and user engagement tracking.
 *
 * @param moduleId - Unique identifier for the module
 * @param lessonId - Current lesson identifier
 * @param progress - Enhanced progress data with analytics
 * @param onProgressUpdate - Callback for progress updates
 * @param analytics - Optional analytics integration
 * @param showAnalytics - Whether to display analytics insights
 * @param showAchievements - Whether to show achievement notifications
 * @param customStyles - Custom styling overrides
 * @param accessibility - Accessibility configuration options
 */
export default function ProgressTracker({
  moduleId,
  lessonId,
  progress,
  onProgressUpdate,
  analytics,
  showAnalytics = true,
  showAchievements = true,
  customStyles = {},
  accessibility = {},
}: ProgressTrackerProps) {
  // =============================================================================
  // STATE AND REFS
  // =============================================================================

  const [progressManager] = useState(() => new ProgressManager());
  const [achievementSystem] = useState(
    () => new AchievementSystem(progressManager)
  );
  const [sessionStartTime] = useState(() => Date.now());
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [recentAchievements, setRecentAchievements] = useState<string[]>([]);
  const [showAchievementNotification, setShowAchievementNotification] =
    useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sessionTimerRef = useRef<NodeJS.Timeout>();
  const progressRef = useRef<HTMLDivElement>(null);

  // =============================================================================
  // CONSTANTS AND COMPUTED VALUES
  // =============================================================================

  const educationColor = "var(--color-fresh-green)";
  const completionPercentage = Math.round(
    (progress.completedLessons.length /
      (progress.lessonProgress
        ? Object.keys(progress.lessonProgress).length
        : 1)) *
      100
  );

  const totalLessons = progress.lessonProgress
    ? Object.keys(progress.lessonProgress).length
    : 0;
  const completedLessons = progress.completedLessons.length;

  // Calculate learning velocity
  const learningVelocity = progress.velocity || {
    lessonsPerWeek: 0,
    averageSessionTime: 0,
    consistencyScore: 0,
  };

  // =============================================================================
  // ANALYTICS AND TRACKING FUNCTIONS
  // =============================================================================

  /**
   * Track user interaction with analytics integration
   */
  const trackInteraction = useCallback(
    (type: string, data: any) => {
      const event: InteractionEvent = {
        type: type as any,
        data,
        timestamp: new Date(),
        userId: progress.userId,
        sessionId: `${moduleId}-${Date.now()}`,
        context: {
          moduleId,
          lessonId,
          sessionTime: currentSessionTime,
        },
      };

      analytics?.trackInteraction(event);
    },
    [analytics, moduleId, lessonId, progress.userId, currentSessionTime]
  );

  /**
   * Track learning difficulties for analytics
   */
  const trackDifficulty = useCallback(
    (difficulty: string, context: any) => {
      analytics?.trackDifficulty(lessonId, difficulty, {
        ...context,
        moduleId,
        userId: progress.userId,
        timestamp: new Date(),
      });
    },
    [analytics, lessonId, moduleId, progress.userId]
  );

  /**
   * Track engagement metrics
   */
  const trackEngagement = useCallback(() => {
    const sessionData = {
      moduleId,
      lessonId,
      userId: progress.userId,
      sessionDuration: currentSessionTime,
      interactionCount: progress.engagement?.totalInteractions || 0,
      completionPercentage,
      timestamp: new Date(),
    };

    analytics?.trackEngagement(sessionData);
  }, [
    analytics,
    moduleId,
    lessonId,
    progress.userId,
    currentSessionTime,
    completionPercentage,
    progress.engagement,
  ]);

  // =============================================================================
  // PROGRESS MANAGEMENT FUNCTIONS
  // =============================================================================

  /**
   * Update progress with persistence and analytics
   */
  const updateProgress = useCallback(
    async (updates: Partial<EnhancedProgressData>) => {
      const updatedProgress = {
        ...progress,
        ...updates,
        lastAccessed: new Date(),
      };

      // Save to local storage
      try {
        await progressManager.initializeProgress(
          progress.userId,
          moduleId,
          totalLessons
        );

        // Track progress update
        trackInteraction("progress_update", {
          previousCompletion: completionPercentage,
          newCompletion: Math.round(
            (updatedProgress.completedLessons.length / totalLessons) * 100
          ),
          updates,
        });

        onProgressUpdate(updatedProgress);
      } catch (error) {
        console.error("Failed to update progress:", error);
        trackDifficulty("progress_save_error", { error: error.message });
      }
    },
    [
      progress,
      progressManager,
      moduleId,
      totalLessons,
      completionPercentage,
      trackInteraction,
      trackDifficulty,
      onProgressUpdate,
    ]
  );

  /**
   * Check for new achievements
   */
  const checkAchievements = useCallback(async () => {
    if (!showAchievements) return;

    try {
      const newBadges = await achievementSystem.checkAchievements();

      if (newBadges.length > 0) {
        setRecentAchievements(newBadges);
        setShowAchievementNotification(true);

        // Track achievement earned
        newBadges.forEach((badge) => {
          analytics?.trackMilestone("badge_earned", {
            badgeId: badge,
            moduleId,
            lessonId,
            userId: progress.userId,
          });
        });

        // Auto-hide notification after 5 seconds
        setTimeout(() => {
          setShowAchievementNotification(false);
        }, 5000);
      }
    } catch (error) {
      console.error("Failed to check achievements:", error);
    }
  }, [
    achievementSystem,
    showAchievements,
    analytics,
    moduleId,
    lessonId,
    progress.userId,
  ]);

  // =============================================================================
  // EFFECTS AND LIFECYCLE
  // =============================================================================

  /**
   * Initialize component and start session tracking
   */
  useEffect(() => {
    setIsVisible(true);

    // Initialize progress manager
    progressManager.initializeProgress(progress.userId, moduleId, totalLessons);

    // Start session timer
    sessionTimerRef.current = setInterval(() => {
      setCurrentSessionTime((prev) => prev + 1);
    }, 60000); // Update every minute

    // Track session start
    trackInteraction("session_start", {
      moduleId,
      lessonId,
      timestamp: new Date(),
    });

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }

      // Track session end
      trackEngagement();
    };
  }, [
    moduleId,
    lessonId,
    progress.userId,
    totalLessons,
    progressManager,
    trackInteraction,
    trackEngagement,
  ]);

  /**
   * Check achievements when progress changes
   */
  useEffect(() => {
    checkAchievements();
  }, [
    progress.completedLessons.length,
    progress.completionPercentage,
    checkAchievements,
  ]);

  /**
   * Announce progress updates for screen readers
   */
  useEffect(() => {
    if (accessibility.announceProgress && progressRef.current) {
      const announcement = `Progress updated: ${completionPercentage}% complete, ${completedLessons} of ${totalLessons} lessons finished`;

      // Create temporary announcement element
      const announcer = document.createElement("div");
      announcer.setAttribute("aria-live", "polite");
      announcer.setAttribute("aria-atomic", "true");
      announcer.className = "sr-only";
      announcer.textContent = announcement;

      document.body.appendChild(announcer);
      setTimeout(() => document.body.removeChild(announcer), 1000);
    }
  }, [
    completionPercentage,
    completedLessons,
    totalLessons,
    accessibility.announceProgress,
  ]);

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  /**
   * Render progress statistics grid
   */
  const renderProgressStats = () => (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* Lessons Completed */}
      <div className="text-center">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
          style={{ backgroundColor: `${educationColor}20` }}
        >
          <CheckCircle className="h-5 w-5" style={{ color: educationColor }} />
        </div>
        <div
          className="text-lg font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {completedLessons}/{totalLessons}
        </div>
        <div
          className="text-xs"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          Lessons
        </div>
      </div>

      {/* Time Spent */}
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
          {Math.floor(progress.timeSpent / 60)}h {progress.timeSpent % 60}m
        </div>
        <div
          className="text-xs"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          Time Spent
        </div>
      </div>
    </div>
  );

  /**
   * Render learning analytics section
   */
  const renderAnalytics = () => {
    if (!showAnalytics) return null;

    return (
      <div
        className="mt-6 pt-6 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <h4
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--foreground)" }}
        >
          Learning Insights
        </h4>

        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Learning Velocity */}
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: educationColor }} />
            <div>
              <div style={{ color: "var(--foreground)", opacity: 0.8 }}>
                {learningVelocity.lessonsPerWeek.toFixed(1)} lessons/week
              </div>
              <div style={{ color: "var(--foreground)", opacity: 0.6 }}>
                Learning Pace
              </div>
            </div>
          </div>

          {/* Consistency Score */}
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" style={{ color: educationColor }} />
            <div>
              <div style={{ color: "var(--foreground)", opacity: 0.8 }}>
                {Math.round(learningVelocity.consistencyScore * 100)}%
              </div>
              <div style={{ color: "var(--foreground)", opacity: 0.6 }}>
                Consistency
              </div>
            </div>
          </div>

          {/* Current Streak */}
          {progress.streak && progress.streak > 0 && (
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: educationColor }} />
              <div>
                <div style={{ color: "var(--foreground)", opacity: 0.8 }}>
                  {progress.streak} days
                </div>
                <div style={{ color: "var(--foreground)", opacity: 0.6 }}>
                  Current Streak
                </div>
              </div>
            </div>
          )}

          {/* Badges Earned */}
          {progress.badges && progress.badges.length > 0 && (
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4" style={{ color: educationColor }} />
              <div>
                <div style={{ color: "var(--foreground)", opacity: 0.8 }}>
                  {progress.badges.length} earned
                </div>
                <div style={{ color: "var(--foreground)", opacity: 0.6 }}>
                  Achievements
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * Render achievement notification
   */
  const renderAchievementNotification = () => (
    <AnimatePresence>
      {showAchievementNotification && recentAchievements.length > 0 && (
        <motion.div
          className="fixed top-4 right-4 z-50 max-w-sm"
          initial={{ opacity: 0, x: 100, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.8 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div
            className="floating-card p-4 shadow-lg"
            style={{
              backgroundColor: "var(--card)",
              borderColor: educationColor,
              borderWidth: "2px",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${educationColor}20` }}
              >
                <Star className="h-5 w-5" style={{ color: educationColor }} />
              </div>
              <div>
                <div
                  className="font-semibold text-sm"
                  style={{ color: educationColor }}
                >
                  Achievement Unlocked!
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--foreground)", opacity: 0.8 }}
                >
                  {achievementSystem.getBadgeInfo(recentAchievements[0]).name}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /**
   * Render completion celebration
   */
  const renderCompletionCelebration = () => {
    if (completionPercentage < 100) return null;

    return (
      <motion.div
        className="text-center p-4 rounded-lg mt-6"
        style={{
          backgroundColor: `${educationColor}15`,
          border: `1px solid ${educationColor}30`,
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <Trophy
          className="h-8 w-8 mx-auto mb-2"
          style={{ color: educationColor }}
        />
        <div className="font-bold text-sm" style={{ color: educationColor }}>
          Module Completed!
        </div>
        <div
          className="text-xs"
          style={{ color: "var(--foreground)", opacity: 0.7 }}
        >
          Congratulations on finishing the Foundations module
        </div>
      </motion.div>
    );
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <>
      <motion.div
        ref={progressRef}
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          ...customStyles,
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
        transition={{
          duration: accessibility.reducedMotion ? 0 : 0.6,
          ease: "easeOut",
        }}
        role="region"
        aria-label="Learning Progress Tracker"
        aria-live="polite"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3
            className="text-card-title"
            style={{ color: "var(--foreground)" }}
          >
            Your Progress
          </h3>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" style={{ color: educationColor }} />
            <span
              className="text-xs"
              style={{ color: "var(--foreground)", opacity: 0.6 }}
            >
              {moduleId
                .split("-")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--foreground)", opacity: 0.8 }}
            >
              Module Completion
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: educationColor }}
            >
              {completionPercentage}%
            </span>
          </div>

          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--border)" }}
            role="progressbar"
            aria-valuenow={completionPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Module completion: ${completionPercentage}%`}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: educationColor }}
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{
                duration: accessibility.reducedMotion ? 0 : 1,
                ease: "easeOut",
              }}
            />
          </div>
        </div>

        {/* Progress Statistics */}
        {renderProgressStats()}

        {/* Learning Analytics */}
        {renderAnalytics()}

        {/* Completion Celebration */}
        {renderCompletionCelebration()}
      </motion.div>

      {/* Achievement Notification */}
      {renderAchievementNotification()}
    </>
  );
}
