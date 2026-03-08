// @ts-nocheck
/**
 * Progress Tracking System for Education Modules
 *
 * This file provides comprehensive progress tracking functionality including
 * user progress management, persistence, analytics, and achievement systems.
 */

import {
  UserProgress,
  LessonProgress,
  ProgressStats,
  InteractionEvent,
} from "./types";

// =============================================================================
// PROGRESS STORAGE INTERFACE
// =============================================================================

/**
 * Progress Storage Interface
 *
 * Defines the interface for storing and retrieving user progress data.
 */
export interface ProgressStorage {
  saveProgress(
    userId: string,
    moduleId: string,
    progress: UserProgress
  ): Promise<void>;
  loadProgress(userId: string, moduleId: string): Promise<UserProgress | null>;
  deleteProgress(userId: string, moduleId: string): Promise<void>;
  getAllUserProgress(userId: string): Promise<UserProgress[]>;
}

/**
 * Local Storage Implementation
 *
 * Stores progress data in browser localStorage for offline capability.
 */
export class LocalProgressStorage implements ProgressStorage {
  private readonly STORAGE_PREFIX = "solemd-progress";

  /**
   * Save user progress to localStorage
   */
  async saveProgress(
    userId: string,
    moduleId: string,
    progress: UserProgress
  ): Promise<void> {
    try {
      const key = this.getStorageKey(userId, moduleId);
      const serializedProgress = JSON.stringify({
        ...progress,
        lastAccessed: progress.lastAccessed.toISOString(),
      });

      localStorage.setItem(key, serializedProgress);

      // Also save to user index for quick retrieval
      await this.updateUserIndex(userId, moduleId);
    } catch (error) {
      console.error("Failed to save progress:", error);
      throw new Error("Unable to save progress data");
    }
  }

  /**
   * Load user progress from localStorage
   */
  async loadProgress(
    userId: string,
    moduleId: string
  ): Promise<UserProgress | null> {
    try {
      const key = this.getStorageKey(userId, moduleId);
      const stored = localStorage.getItem(key);

      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        lastAccessed: new Date(parsed.lastAccessed),
      };
    } catch (error) {
      console.error("Failed to load progress:", error);
      return null;
    }
  }

  /**
   * Delete user progress
   */
  async deleteProgress(userId: string, moduleId: string): Promise<void> {
    try {
      const key = this.getStorageKey(userId, moduleId);
      localStorage.removeItem(key);

      // Remove from user index
      await this.removeFromUserIndex(userId, moduleId);
    } catch (error) {
      console.error("Failed to delete progress:", error);
      throw new Error("Unable to delete progress data");
    }
  }

  /**
   * Get all progress for a user
   */
  async getAllUserProgress(userId: string): Promise<UserProgress[]> {
    try {
      const indexKey = `${this.STORAGE_PREFIX}-index-${userId}`;
      const index = localStorage.getItem(indexKey);

      if (!index) return [];

      const moduleIds = JSON.parse(index);
      const progressList: UserProgress[] = [];

      for (const moduleId of moduleIds) {
        const progress = await this.loadProgress(userId, moduleId);
        if (progress) {
          progressList.push(progress);
        }
      }

      return progressList;
    } catch (error) {
      console.error("Failed to load all user progress:", error);
      return [];
    }
  }

  /**
   * Generate storage key
   */
  private getStorageKey(userId: string, moduleId: string): string {
    return `${this.STORAGE_PREFIX}-${userId}-${moduleId}`;
  }

  /**
   * Update user index for quick module lookup
   */
  private async updateUserIndex(
    userId: string,
    moduleId: string
  ): Promise<void> {
    const indexKey = `${this.STORAGE_PREFIX}-index-${userId}`;
    const existing = localStorage.getItem(indexKey);
    const moduleIds = existing ? JSON.parse(existing) : [];

    if (!moduleIds.includes(moduleId)) {
      moduleIds.push(moduleId);
      localStorage.setItem(indexKey, JSON.stringify(moduleIds));
    }
  }

  /**
   * Remove module from user index
   */
  private async removeFromUserIndex(
    userId: string,
    moduleId: string
  ): Promise<void> {
    const indexKey = `${this.STORAGE_PREFIX}-index-${userId}`;
    const existing = localStorage.getItem(indexKey);

    if (existing) {
      const moduleIds = JSON.parse(existing);
      const filtered = moduleIds.filter((id: string) => id !== moduleId);
      localStorage.setItem(indexKey, JSON.stringify(filtered));
    }
  }
}

// =============================================================================
// PROGRESS MANAGER
// =============================================================================

/**
 * Progress Manager
 *
 * Main class for managing user progress through education modules.
 */
export class ProgressManager {
  private storage: ProgressStorage;
  private currentProgress: UserProgress | null = null;
  private progressListeners: Array<(progress: UserProgress) => void> = [];

  constructor(storage: ProgressStorage = new LocalProgressStorage()) {
    this.storage = storage;
  }

  /**
   * Initialize progress for a user and module
   */
  async initializeProgress(
    userId: string,
    moduleId: string,
    totalLessons: number
  ): Promise<UserProgress> {
    // Check if progress already exists
    const existing = await this.storage.loadProgress(userId, moduleId);
    if (existing) {
      this.currentProgress = existing;
      return existing;
    }

    // Create new progress
    const newProgress: UserProgress = {
      userId,
      moduleId,
      currentLesson: "",
      completedLessons: [],
      timeSpent: 0,
      lastAccessed: new Date(),
      completionPercentage: 0,
      isCompleted: false,
      lessonProgress: {},
    };

    await this.storage.saveProgress(userId, moduleId, newProgress);
    this.currentProgress = newProgress;
    this.notifyListeners(newProgress);

    return newProgress;
  }

  /**
   * Load existing progress
   */
  async loadProgress(
    userId: string,
    moduleId: string
  ): Promise<UserProgress | null> {
    const progress = await this.storage.loadProgress(userId, moduleId);
    this.currentProgress = progress;
    return progress;
  }

  /**
   * Start a lesson
   */
  async startLesson(
    lessonId: string,
    estimatedDuration: number = 30
  ): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    // Update current lesson
    this.currentProgress.currentLesson = lessonId;
    this.currentProgress.lastAccessed = new Date();

    // Initialize lesson progress if not exists
    if (!this.currentProgress.lessonProgress[lessonId]) {
      this.currentProgress.lessonProgress[lessonId] = {
        lessonId,
        completed: false,
        active: true,
        timeSpent: 0,
        lastAccessed: new Date(),
        contentProgress: 0,
        completedBlocks: [],
      };
    } else {
      this.currentProgress.lessonProgress[lessonId].active = true;
      this.currentProgress.lessonProgress[lessonId].lastAccessed = new Date();
    }

    // Mark other lessons as inactive
    Object.keys(this.currentProgress.lessonProgress).forEach((id) => {
      if (id !== lessonId) {
        this.currentProgress!.lessonProgress[id].active = false;
      }
    });

    await this.saveCurrentProgress();
  }

  /**
   * Complete a lesson
   */
  async completeLesson(lessonId: string, timeSpent: number = 0): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    // Mark lesson as completed
    if (!this.currentProgress.completedLessons.includes(lessonId)) {
      this.currentProgress.completedLessons.push(lessonId);
    }

    // Update lesson progress
    if (this.currentProgress.lessonProgress[lessonId]) {
      this.currentProgress.lessonProgress[lessonId].completed = true;
      this.currentProgress.lessonProgress[lessonId].active = false;
      this.currentProgress.lessonProgress[lessonId].contentProgress = 100;
      this.currentProgress.lessonProgress[lessonId].timeSpent += timeSpent;
    }

    // Update total time spent
    this.currentProgress.timeSpent += timeSpent;
    this.currentProgress.lastAccessed = new Date();

    // Update completion percentage
    await this.updateCompletionPercentage();

    await this.saveCurrentProgress();
  }

  /**
   * Update content progress within a lesson
   */
  async updateContentProgress(
    lessonId: string,
    completedBlockId: string,
    progressPercentage: number
  ): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    const lessonProgress = this.currentProgress.lessonProgress[lessonId];
    if (!lessonProgress) {
      throw new Error(`Lesson progress not found for ${lessonId}`);
    }

    // Add completed block if not already included
    if (!lessonProgress.completedBlocks.includes(completedBlockId)) {
      lessonProgress.completedBlocks.push(completedBlockId);
    }

    // Update content progress
    lessonProgress.contentProgress = Math.max(
      lessonProgress.contentProgress,
      progressPercentage
    );
    lessonProgress.lastAccessed = new Date();

    this.currentProgress.lastAccessed = new Date();

    await this.saveCurrentProgress();
  }

  /**
   * Track time spent in a lesson
   */
  async trackTimeSpent(
    lessonId: string,
    additionalTime: number
  ): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    // Update lesson time
    if (this.currentProgress.lessonProgress[lessonId]) {
      this.currentProgress.lessonProgress[lessonId].timeSpent += additionalTime;
    }

    // Update total time
    this.currentProgress.timeSpent += additionalTime;
    this.currentProgress.lastAccessed = new Date();

    await this.saveCurrentProgress();
  }

  /**
   * Record assessment score
   */
  async recordAssessmentScore(
    lessonId: string,
    assessmentId: string,
    score: number
  ): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    const lessonProgress = this.currentProgress.lessonProgress[lessonId];
    if (!lessonProgress) {
      throw new Error(`Lesson progress not found for ${lessonId}`);
    }

    if (!lessonProgress.assessmentScores) {
      lessonProgress.assessmentScores = {};
    }

    lessonProgress.assessmentScores[assessmentId] = score;
    this.currentProgress.lastAccessed = new Date();

    await this.saveCurrentProgress();
  }

  /**
   * Get current progress
   */
  getCurrentProgress(): UserProgress | null {
    return this.currentProgress;
  }

  /**
   * Get progress statistics
   */
  getProgressStats(
    totalLessons: number,
    estimatedTotalTime: number
  ): ProgressStats {
    if (!this.currentProgress) {
      return {
        totalLessons,
        completedLessons: 0,
        totalTimeSpent: 0,
        estimatedTime: estimatedTotalTime,
        averageCompletionTime: 0,
      };
    }

    const completedCount = this.currentProgress.completedLessons.length;
    const averageTime =
      completedCount > 0 ? this.currentProgress.timeSpent / completedCount : 0;

    return {
      totalLessons,
      completedLessons: completedCount,
      totalTimeSpent: this.currentProgress.timeSpent,
      estimatedTime: estimatedTotalTime,
      streak: this.currentProgress.streak,
      badges: this.currentProgress.badges,
      averageCompletionTime: averageTime,
      lastActivity: this.currentProgress.lastAccessed,
    };
  }

  /**
   * Check if lesson is accessible (prerequisites met)
   */
  isLessonAccessible(lessonId: string, prerequisites: string[] = []): boolean {
    if (!this.currentProgress || prerequisites.length === 0) {
      return true;
    }

    return prerequisites.every((prereq) =>
      this.currentProgress!.completedLessons.includes(prereq)
    );
  }

  /**
   * Get next recommended lesson
   */
  getNextLesson(
    allLessons: Array<{ id: string; prerequisites?: string[] }>
  ): string | null {
    if (!this.currentProgress) return allLessons[0]?.id || null;

    // Find first incomplete lesson with met prerequisites
    for (const lesson of allLessons) {
      if (!this.currentProgress.completedLessons.includes(lesson.id)) {
        if (this.isLessonAccessible(lesson.id, lesson.prerequisites)) {
          return lesson.id;
        }
      }
    }

    return null;
  }

  /**
   * Add progress listener
   */
  addProgressListener(listener: (progress: UserProgress) => void): void {
    this.progressListeners.push(listener);
  }

  /**
   * Remove progress listener
   */
  removeProgressListener(listener: (progress: UserProgress) => void): void {
    const index = this.progressListeners.indexOf(listener);
    if (index > -1) {
      this.progressListeners.splice(index, 1);
    }
  }

  /**
   * Reset progress for a module
   */
  async resetProgress(): Promise<void> {
    if (!this.currentProgress) {
      throw new Error("Progress not initialized");
    }

    const { userId, moduleId } = this.currentProgress;

    // Delete existing progress
    await this.storage.deleteProgress(userId, moduleId);

    // Reinitialize
    await this.initializeProgress(userId, moduleId, 0);
  }

  /**
   * Export progress data
   */
  exportProgress(): string {
    if (!this.currentProgress) {
      throw new Error("No progress to export");
    }

    return JSON.stringify(this.currentProgress, null, 2);
  }

  /**
   * Import progress data
   */
  async importProgress(progressData: string): Promise<void> {
    try {
      const progress = JSON.parse(progressData);
      progress.lastAccessed = new Date(progress.lastAccessed);

      // Validate progress structure
      if (!progress.userId || !progress.moduleId) {
        throw new Error("Invalid progress data structure");
      }

      await this.storage.saveProgress(
        progress.userId,
        progress.moduleId,
        progress
      );
      this.currentProgress = progress;
      this.notifyListeners(progress);
    } catch (error) {
      throw new Error("Failed to import progress data");
    }
  }

  /**
   * Update completion percentage
   */
  private async updateCompletionPercentage(): Promise<void> {
    if (!this.currentProgress) return;

    // This would typically be calculated based on total lessons
    // For now, we'll use a simple calculation
    const totalLessons =
      Object.keys(this.currentProgress.lessonProgress).length || 1;
    const completedLessons = this.currentProgress.completedLessons.length;

    this.currentProgress.completionPercentage = Math.round(
      (completedLessons / totalLessons) * 100
    );

    this.currentProgress.isCompleted =
      this.currentProgress.completionPercentage >= 100;
  }

  /**
   * Save current progress
   */
  private async saveCurrentProgress(): Promise<void> {
    if (!this.currentProgress) return;

    await this.storage.saveProgress(
      this.currentProgress.userId,
      this.currentProgress.moduleId,
      this.currentProgress
    );

    this.notifyListeners(this.currentProgress);
  }

  /**
   * Notify progress listeners
   */
  private notifyListeners(progress: UserProgress): void {
    this.progressListeners.forEach((listener) => {
      try {
        listener(progress);
      } catch (error) {
        console.error("Progress listener error:", error);
      }
    });
  }
}

// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

/**
 * Achievement System
 *
 * Manages badges, streaks, and other achievement mechanics.
 */
export class AchievementSystem {
  private progressManager: ProgressManager;

  constructor(progressManager: ProgressManager) {
    this.progressManager = progressManager;
  }

  /**
   * Check and award achievements
   */
  async checkAchievements(): Promise<string[]> {
    const progress = this.progressManager.getCurrentProgress();
    if (!progress) return [];

    const newBadges: string[] = [];
    const currentBadges = progress.badges || [];

    // First lesson completion
    if (
      progress.completedLessons.length >= 1 &&
      !currentBadges.includes("first-lesson")
    ) {
      newBadges.push("first-lesson");
    }

    // Half way there
    if (
      progress.completionPercentage >= 50 &&
      !currentBadges.includes("halfway")
    ) {
      newBadges.push("halfway");
    }

    // Module completion
    if (progress.isCompleted && !currentBadges.includes("module-complete")) {
      newBadges.push("module-complete");
    }

    // Time-based achievements
    if (
      progress.timeSpent >= 120 &&
      !currentBadges.includes("dedicated-learner")
    ) {
      newBadges.push("dedicated-learner");
    }

    // Assessment achievements
    const assessmentScores = Object.values(progress.lessonProgress).flatMap(
      (lesson) => Object.values(lesson.assessmentScores || {})
    );

    if (assessmentScores.length > 0) {
      const averageScore =
        assessmentScores.reduce((sum, score) => sum + score, 0) /
        assessmentScores.length;
      if (averageScore >= 90 && !currentBadges.includes("high-achiever")) {
        newBadges.push("high-achiever");
      }
    }

    // Update progress with new badges
    if (newBadges.length > 0) {
      progress.badges = [...currentBadges, ...newBadges];
      await this.progressManager["saveCurrentProgress"]();
    }

    return newBadges;
  }

  /**
   * Get badge information
   */
  getBadgeInfo(badgeId: string): {
    name: string;
    description: string;
    icon: string;
  } {
    const badges: Record<
      string,
      { name: string; description: string; icon: string }
    > = {
      "first-lesson": {
        name: "Getting Started",
        description: "Completed your first lesson",
        icon: "🎯",
      },
      halfway: {
        name: "Halfway There",
        description: "Completed 50% of the module",
        icon: "⭐",
      },
      "module-complete": {
        name: "Module Master",
        description: "Completed the entire module",
        icon: "🏆",
      },
      "dedicated-learner": {
        name: "Dedicated Learner",
        description: "Spent over 2 hours learning",
        icon: "📚",
      },
      "high-achiever": {
        name: "High Achiever",
        description: "Maintained 90%+ average on assessments",
        icon: "🌟",
      },
    };

    return (
      badges[badgeId] || { name: "Unknown Badge", description: "", icon: "🎖️" }
    );
  }
}

// =============================================================================
// EXPORT PROGRESS UTILITIES
// =============================================================================

// Create default instances
export const defaultProgressManager = new ProgressManager();
export const achievementSystem = new AchievementSystem(defaultProgressManager);

// Export classes for external use
export type { ProgressStorage };
