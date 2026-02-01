/**
 * Content Management System for Education Modules
 *
 * This file provides utilities for managing educational content including
 * content loading, validation, transformation, and caching. It supports
 * multiple content formats and provides a consistent API for content access.
 */

import {
  ContentBlock,
  Lesson,
  Assessment,
  Resource,
  ContentBlockType,
  Question,
  InteractionEvent,
} from "./types";

// =============================================================================
// CONTENT LOADING AND MANAGEMENT
// =============================================================================

/**
 * Content Loader Interface
 *
 * Defines the interface for loading different types of educational content.
 */
export interface ContentLoader {
  loadLesson(lessonId: string): Promise<Lesson>;
  loadAssessment(assessmentId: string): Promise<Assessment>;
  loadResource(resourceId: string): Promise<Resource>;
  loadContentBlock(blockId: string): Promise<ContentBlock>;
}

/**
 * Static Content Loader
 *
 * Loads content from static JSON files and local storage.
 * This is the default implementation for the AI for MD Foundations module.
 */
export class StaticContentLoader implements ContentLoader {
  private contentCache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Load lesson content
   */
  async loadLesson(lessonId: string): Promise<Lesson> {
    const cacheKey = `lesson-${lessonId}`;

    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      return this.contentCache.get(cacheKey);
    }

    try {
      // In a real implementation, this would fetch from an API or file system
      const lesson = await this.fetchLessonData(lessonId);
      this.setCacheItem(cacheKey, lesson);
      return lesson;
    } catch (error) {
      console.error(`Failed to load lesson ${lessonId}:`, error);
      throw new Error(`Unable to load lesson content for ${lessonId}`);
    }
  }

  /**
   * Load assessment content
   */
  async loadAssessment(assessmentId: string): Promise<Assessment> {
    const cacheKey = `assessment-${assessmentId}`;

    if (this.isCacheValid(cacheKey)) {
      return this.contentCache.get(cacheKey);
    }

    try {
      const assessment = await this.fetchAssessmentData(assessmentId);
      this.setCacheItem(cacheKey, assessment);
      return assessment;
    } catch (error) {
      console.error(`Failed to load assessment ${assessmentId}:`, error);
      throw new Error(`Unable to load assessment content for ${assessmentId}`);
    }
  }

  /**
   * Load resource content
   */
  async loadResource(resourceId: string): Promise<Resource> {
    const cacheKey = `resource-${resourceId}`;

    if (this.isCacheValid(cacheKey)) {
      return this.contentCache.get(cacheKey);
    }

    try {
      const resource = await this.fetchResourceData(resourceId);
      this.setCacheItem(cacheKey, resource);
      return resource;
    } catch (error) {
      console.error(`Failed to load resource ${resourceId}:`, error);
      throw new Error(`Unable to load resource content for ${resourceId}`);
    }
  }

  /**
   * Load content block
   */
  async loadContentBlock(blockId: string): Promise<ContentBlock> {
    const cacheKey = `block-${blockId}`;

    if (this.isCacheValid(cacheKey)) {
      return this.contentCache.get(cacheKey);
    }

    try {
      const block = await this.fetchContentBlockData(blockId);
      this.setCacheItem(cacheKey, block);
      return block;
    } catch (error) {
      console.error(`Failed to load content block ${blockId}:`, error);
      throw new Error(`Unable to load content block for ${blockId}`);
    }
  }

  /**
   * Fetch lesson data (mock implementation)
   */
  private async fetchLessonData(lessonId: string): Promise<Lesson> {
    // Mock lesson data - in production, this would fetch from API/files
    const mockLessons: Record<string, Lesson> = {
      "lesson-1": {
        id: "lesson-1",
        title: "Introduction to AI in Healthcare",
        description:
          "Overview of artificial intelligence applications in modern healthcare settings.",
        duration: 30,
        content: [
          {
            id: "block-1-1",
            type: "text",
            content: {
              html: "<p>Artificial Intelligence (AI) is revolutionizing healthcare by providing powerful tools that enhance clinical decision-making, improve patient outcomes, and streamline healthcare operations.</p>",
            },
            order: 1,
          },
          {
            id: "block-1-2",
            type: "video",
            content: {
              url: "/videos/ai-healthcare-intro.mp4",
              title: "AI in Healthcare Overview",
              duration: 300,
            },
            metadata: {
              title: "Introduction Video",
              transcript: "Video transcript would be here...",
              captions: true,
            },
            order: 2,
          },
          {
            id: "block-1-3",
            type: "quiz",
            content: {
              questions: [
                {
                  id: "q1",
                  type: "multiple-choice",
                  question: "What is the primary benefit of AI in healthcare?",
                  options: [
                    "Replacing doctors",
                    "Enhancing clinical decision-making",
                    "Reducing healthcare costs",
                    "Automating all medical procedures",
                  ],
                  correctAnswer: "Enhancing clinical decision-making",
                  explanation:
                    "AI primarily serves to enhance and support clinical decision-making rather than replace healthcare professionals.",
                  points: 10,
                },
              ],
            },
            order: 3,
          },
        ],
        prerequisites: [],
        learningObjectives: [
          "Define artificial intelligence in healthcare context",
          "Identify current AI applications in clinical practice",
          "Understand the potential and limitations of medical AI",
        ],
        order: 1,
        published: true,
      },
    };

    const lesson = mockLessons[lessonId];
    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    return lesson;
  }

  /**
   * Fetch assessment data (mock implementation)
   */
  private async fetchAssessmentData(assessmentId: string): Promise<Assessment> {
    const mockAssessments: Record<string, Assessment> = {
      "quiz-1": {
        id: "quiz-1",
        type: "quiz",
        title: "Clinical Decision Support Quiz",
        description:
          "Test your understanding of AI-powered clinical decision support systems.",
        questions: [
          {
            id: "q1",
            type: "multiple-choice",
            question:
              "Which of the following is a key benefit of clinical decision support systems?",
            options: [
              "They replace clinical judgment",
              "They provide evidence-based recommendations",
              "They eliminate the need for medical training",
              "They guarantee perfect diagnoses",
            ],
            correctAnswer: "They provide evidence-based recommendations",
            explanation:
              "Clinical decision support systems enhance clinical judgment by providing evidence-based recommendations, not replacing it.",
            points: 10,
          },
          {
            id: "q2",
            type: "true-false",
            question: "AI systems in healthcare are always 100% accurate.",
            correctAnswer: "False",
            explanation:
              "AI systems, while powerful, are not infallible and should always be used in conjunction with clinical expertise.",
            points: 5,
          },
        ],
        passingScore: 80,
        maxAttempts: 3,
        timeLimit: 15,
        showAnswers: true,
        immediateFeedback: true,
      },
    };

    const assessment = mockAssessments[assessmentId];
    if (!assessment) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    return assessment;
  }

  /**
   * Fetch resource data (mock implementation)
   */
  private async fetchResourceData(resourceId: string): Promise<Resource> {
    const mockResources: Record<string, Resource> = {
      "resource-1": {
        id: "resource-1",
        title: "AI in Healthcare: A Comprehensive Guide",
        type: "pdf",
        url: "/resources/ai-healthcare-guide.pdf",
        description:
          "Comprehensive reference guide covering all aspects of AI in healthcare.",
        downloadable: true,
        fileSize: 2048000,
      },
    };

    const resource = mockResources[resourceId];
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    return resource;
  }

  /**
   * Fetch content block data (mock implementation)
   */
  private async fetchContentBlockData(blockId: string): Promise<ContentBlock> {
    // This would typically fetch individual content blocks
    // For now, return a mock content block
    return {
      id: blockId,
      type: "text",
      content: {
        html: "<p>Content block content would be loaded here.</p>",
      },
      order: 1,
    };
  }

  /**
   * Check if cache item is valid
   */
  private isCacheValid(key: string): boolean {
    if (!this.contentCache.has(key)) return false;

    const expiry = this.cacheExpiry.get(key);
    if (!expiry) return false;

    return Date.now() < expiry;
  }

  /**
   * Set cache item with expiry
   */
  private setCacheItem(key: string, value: any): void {
    this.contentCache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.contentCache.clear();
    this.cacheExpiry.clear();
  }
}

// =============================================================================
// CONTENT VALIDATION
// =============================================================================

/**
 * Content Validator
 *
 * Validates content structure and ensures data integrity.
 */
export class ContentValidator {
  /**
   * Validate lesson content
   */
  static validateLesson(lesson: Lesson): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!lesson.id) errors.push("Lesson ID is required");
    if (!lesson.title) errors.push("Lesson title is required");
    if (!lesson.description) errors.push("Lesson description is required");
    if (!lesson.duration || lesson.duration <= 0)
      errors.push("Valid lesson duration is required");

    // Content validation
    if (!lesson.content || lesson.content.length === 0) {
      errors.push("Lesson must have at least one content block");
    } else {
      lesson.content.forEach((block, index) => {
        const blockErrors = this.validateContentBlock(block);
        if (!blockErrors.valid) {
          errors.push(
            `Content block ${index + 1}: ${blockErrors.errors.join(", ")}`
          );
        }
      });
    }

    // Learning objectives
    if (!lesson.learningObjectives || lesson.learningObjectives.length === 0) {
      errors.push("Lesson must have at least one learning objective");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate content block
   */
  static validateContentBlock(block: ContentBlock): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!block.id) errors.push("Content block ID is required");
    if (!block.type) errors.push("Content block type is required");
    if (!block.content) errors.push("Content block content is required");
    if (typeof block.order !== "number")
      errors.push("Content block order must be a number");

    // Type-specific validation
    switch (block.type) {
      case "text":
        if (!block.content.html && !block.content.markdown) {
          errors.push("Text content must have HTML or Markdown");
        }
        break;
      case "video":
        if (!block.content.url) {
          errors.push("Video content must have a URL");
        }
        break;
      case "quiz":
        if (!block.content.questions || block.content.questions.length === 0) {
          errors.push("Quiz content must have at least one question");
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate assessment
   */
  static validateAssessment(assessment: Assessment): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!assessment.id) errors.push("Assessment ID is required");
    if (!assessment.title) errors.push("Assessment title is required");
    if (!assessment.type) errors.push("Assessment type is required");
    if (!assessment.questions || assessment.questions.length === 0) {
      errors.push("Assessment must have at least one question");
    }
    if (assessment.passingScore < 0 || assessment.passingScore > 100) {
      errors.push("Passing score must be between 0 and 100");
    }
    if (assessment.maxAttempts <= 0) {
      errors.push("Max attempts must be greater than 0");
    }

    // Validate questions
    assessment.questions?.forEach((question, index) => {
      const questionErrors = this.validateQuestion(question);
      if (!questionErrors.valid) {
        errors.push(
          `Question ${index + 1}: ${questionErrors.errors.join(", ")}`
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate question
   */
  static validateQuestion(question: Question): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!question.id) errors.push("Question ID is required");
    if (!question.type) errors.push("Question type is required");
    if (!question.question) errors.push("Question text is required");
    if (
      question.correctAnswer === undefined ||
      question.correctAnswer === null
    ) {
      errors.push("Correct answer is required");
    }
    if (!question.explanation) errors.push("Question explanation is required");
    if (!question.points || question.points <= 0)
      errors.push("Question points must be greater than 0");

    // Type-specific validation
    if (
      question.type === "multiple-choice" ||
      question.type === "multiple-select"
    ) {
      if (!question.options || question.options.length < 2) {
        errors.push("Multiple choice questions must have at least 2 options");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// =============================================================================
// CONTENT TRANSFORMATION
// =============================================================================

/**
 * Content Transformer
 *
 * Transforms content between different formats and structures.
 */
export class ContentTransformer {
  /**
   * Transform legacy content to new format
   */
  static transformLegacyContent(legacyContent: any): ContentBlock[] {
    // This would handle transformation from old webapp format
    // to new education module format
    const blocks: ContentBlock[] = [];

    if (legacyContent.sections) {
      legacyContent.sections.forEach((section: any, index: number) => {
        blocks.push({
          id: `block-${index + 1}`,
          type: this.detectContentType(section),
          content: this.transformSectionContent(section),
          order: index + 1,
          metadata: {
            title: section.title,
            required: section.required || false,
          },
        });
      });
    }

    return blocks;
  }

  /**
   * Detect content type from legacy section
   */
  private static detectContentType(section: any): ContentBlockType {
    if (section.type) return section.type;
    if (section.video) return "video";
    if (section.quiz) return "quiz";
    if (section.exercise) return "exercise";
    if (section.code) return "code";
    return "text";
  }

  /**
   * Transform section content
   */
  private static transformSectionContent(section: any): any {
    switch (this.detectContentType(section)) {
      case "video":
        return {
          url: section.video.url,
          title: section.video.title,
          duration: section.video.duration,
          thumbnail: section.video.thumbnail,
        };
      case "quiz":
        return {
          questions: section.quiz.questions.map((q: any) => ({
            id: q.id || `q-${Math.random().toString(36).substr(2, 9)}`,
            type: q.type || "multiple-choice",
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            points: q.points || 10,
          })),
        };
      default:
        return {
          html: section.content || section.html,
          markdown: section.markdown,
        };
    }
  }

  /**
   * Convert content to accessible format
   */
  static makeContentAccessible(content: ContentBlock): ContentBlock {
    const accessibleContent = { ...content };

    // Add accessibility metadata if missing
    if (!accessibleContent.metadata) {
      accessibleContent.metadata = {};
    }

    // Ensure alt text for images
    if (content.type === "image" && !accessibleContent.metadata.altText) {
      accessibleContent.metadata.altText = "Image content";
    }

    // Ensure transcripts for video/audio
    if (
      (content.type === "video" || content.type === "audio") &&
      !accessibleContent.metadata.transcript
    ) {
      accessibleContent.metadata.transcript = "Transcript not available";
    }

    return accessibleContent;
  }
}

// =============================================================================
// CONTENT ANALYTICS
// =============================================================================

/**
 * Content Analytics
 *
 * Tracks content usage and provides insights for content optimization.
 */
export class ContentAnalytics {
  private interactions: InteractionEvent[] = [];

  /**
   * Track content interaction
   */
  trackInteraction(event: InteractionEvent): void {
    this.interactions.push(event);

    // Store in localStorage for persistence
    try {
      const stored = localStorage.getItem("content-interactions") || "[]";
      const storedInteractions = JSON.parse(stored);
      storedInteractions.push(event);

      // Keep only last 1000 interactions
      if (storedInteractions.length > 1000) {
        storedInteractions.splice(0, storedInteractions.length - 1000);
      }

      localStorage.setItem(
        "content-interactions",
        JSON.stringify(storedInteractions)
      );
    } catch (error) {
      console.warn("Failed to store interaction:", error);
    }
  }

  /**
   * Get content engagement metrics
   */
  getEngagementMetrics(contentId: string): {
    views: number;
    interactions: number;
    averageTimeSpent: number;
    completionRate: number;
  } {
    const contentInteractions = this.interactions.filter(
      (interaction) => interaction.data?.contentId === contentId
    );

    const views = contentInteractions.filter(
      (i) => i.type === "content_view"
    ).length;
    const interactions = contentInteractions.filter(
      (i) => i.type === "content_interaction"
    ).length;
    const completions = contentInteractions.filter(
      (i) => i.type === "lesson_complete"
    ).length;

    // Calculate average time spent (mock calculation)
    const averageTimeSpent =
      contentInteractions.length > 0 ? Math.random() * 300 + 60 : 0; // Mock: 1-5 minutes

    const completionRate = views > 0 ? (completions / views) * 100 : 0;

    return {
      views,
      interactions,
      averageTimeSpent,
      completionRate,
    };
  }

  /**
   * Get popular content
   */
  getPopularContent(limit = 10): Array<{ contentId: string; score: number }> {
    const contentScores = new Map<string, number>();

    this.interactions.forEach((interaction) => {
      const contentId = interaction.data?.contentId;
      if (contentId) {
        const currentScore = contentScores.get(contentId) || 0;
        const scoreIncrement =
          interaction.type === "content_view"
            ? 1
            : interaction.type === "content_interaction"
            ? 2
            : interaction.type === "lesson_complete"
            ? 5
            : 0;
        contentScores.set(contentId, currentScore + scoreIncrement);
      }
    });

    return Array.from(contentScores.entries())
      .map(([contentId, score]) => ({ contentId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

// =============================================================================
// EXPORT CONTENT UTILITIES
// =============================================================================

// Create default instances
export const defaultContentLoader = new StaticContentLoader();
export const contentAnalytics = new ContentAnalytics();

// Export classes and utilities
export {
  StaticContentLoader,
  ContentValidator,
  ContentTransformer,
  ContentAnalytics,
};
