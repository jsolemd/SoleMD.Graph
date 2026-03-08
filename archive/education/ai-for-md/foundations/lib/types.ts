/**
 * TypeScript Type Definitions for AI for MD Foundations Module
 *
 * This file contains comprehensive type definitions for the education module system.
 * These types ensure type safety and provide clear interfaces for all components.
 */

// =============================================================================
// CORE MODULE TYPES
// =============================================================================

/**
 * Module Configuration Interface
 *
 * Defines the structure for module metadata and configuration.
 * Used for module registration, theming, and navigation setup.
 */
export interface ModuleConfig {
  /** Unique identifier for the module */
  id: string;

  /** Display title of the module */
  title: string;

  /** Brief description of the module */
  description: string;

  /** Module version for tracking updates */
  version: string;

  /** Author or creator of the module */
  author: string;

  /** Estimated completion time in minutes */
  estimatedDuration: number;

  /** Difficulty level of the module */
  difficulty: "beginner" | "intermediate" | "advanced";

  /** Prerequisites for the module */
  prerequisites: string[];

  /** Learning outcomes and objectives */
  learningOutcomes: string[];

  /** Navigation configuration */
  navigation: NavigationConfig;

  /** Theme configuration */
  theme: ThemeConfig;

  /** Module status */
  status: "draft" | "published" | "archived";

  /** Creation and update timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Navigation Configuration Interface
 *
 * Defines navigation settings for modules including breadcrumbs and back navigation.
 */
export interface NavigationConfig {
  /** Custom back navigation URL */
  backUrl?: string;

  /** Custom back navigation label */
  backLabel?: string;

  /** Custom breadcrumb items */
  breadcrumbs?: BreadcrumbItem[];

  /** Whether to show progress in navigation */
  showProgress?: boolean;
}

/**
 * Theme Configuration Interface
 *
 * Defines theming options for modules to maintain design consistency.
 */
export interface ThemeConfig {
  /** Primary color for the module */
  primaryColor: string;

  /** Optional accent color */
  accentColor?: string;

  /** Custom CSS styles */
  customStyles?: Record<string, any>;

  /** Icon component name or configuration */
  icon?: string;
}

/**
 * Breadcrumb Item Interface
 *
 * Defines individual breadcrumb navigation items.
 */
export interface BreadcrumbItem {
  /** Display label for the breadcrumb */
  label: string;

  /** URL for the breadcrumb link */
  href: string;

  /** Whether this is the current page */
  current?: boolean;
}

// =============================================================================
// LESSON AND CONTENT TYPES
// =============================================================================

/**
 * Lesson Interface
 *
 * Defines the structure for individual lessons within a module.
 */
export interface Lesson {
  /** Unique identifier for the lesson */
  id: string;

  /** Title of the lesson */
  title: string;

  /** Brief description of the lesson content */
  description: string;

  /** Estimated duration in minutes */
  duration: number;

  /** Array of content blocks that make up the lesson */
  content: ContentBlock[];

  /** Prerequisites for this lesson */
  prerequisites?: string[];

  /** Learning objectives for this lesson */
  learningObjectives: string[];

  /** Lesson order within the module */
  order: number;

  /** Whether the lesson is published */
  published: boolean;

  /** Optional lesson metadata */
  metadata?: LessonMetadata;
}

/**
 * Lesson Metadata Interface
 *
 * Additional metadata for lessons including tags, difficulty, and resources.
 */
export interface LessonMetadata {
  /** Tags for categorization */
  tags?: string[];

  /** Difficulty level specific to this lesson */
  difficulty?: "beginner" | "intermediate" | "advanced";

  /** Additional resources and references */
  resources?: Resource[];

  /** Estimated reading time in minutes */
  readingTime?: number;

  /** Whether this lesson includes hands-on exercises */
  hasExercises?: boolean;

  /** Whether this lesson includes assessments */
  hasAssessments?: boolean;
}

/**
 * Content Block Interface
 *
 * Defines different types of content that can be included in lessons.
 */
export interface ContentBlock {
  /** Unique identifier for the content block */
  id: string;

  /** Type of content block */
  type: ContentBlockType;

  /** The actual content data */
  content: any;

  /** Optional metadata for the content block */
  metadata?: ContentBlockMetadata;

  /** Order of this block within the lesson */
  order: number;
}

/**
 * Content Block Types
 *
 * Enumeration of supported content block types.
 */
export type ContentBlockType =
  | "text"
  | "video"
  | "audio"
  | "image"
  | "interactive"
  | "quiz"
  | "exercise"
  | "code"
  | "embed"
  | "download";

/**
 * Content Block Metadata Interface
 *
 * Additional metadata for content blocks.
 */
export interface ContentBlockMetadata {
  /** Title or caption for the content */
  title?: string;

  /** Alternative text for accessibility */
  altText?: string;

  /** Transcript for audio/video content */
  transcript?: string;

  /** Whether this content is required */
  required?: boolean;

  /** Estimated time to complete in minutes */
  estimatedTime?: number;

  /** Accessibility features */
  accessibility?: AccessibilityFeatures;
}

/**
 * Accessibility Features Interface
 *
 * Defines accessibility features for content blocks.
 */
export interface AccessibilityFeatures {
  /** Whether screen reader support is available */
  screenReaderSupport?: boolean;

  /** Whether keyboard navigation is supported */
  keyboardNavigation?: boolean;

  /** Whether high contrast mode is supported */
  highContrast?: boolean;

  /** Whether captions are available for video content */
  captions?: boolean;

  /** Whether audio descriptions are available */
  audioDescriptions?: boolean;
}

/**
 * Resource Interface
 *
 * Defines additional resources and materials for lessons.
 */
export interface Resource {
  /** Unique identifier for the resource */
  id: string;

  /** Title of the resource */
  title: string;

  /** Type of resource */
  type: "pdf" | "link" | "video" | "audio" | "document" | "tool";

  /** URL or path to the resource */
  url: string;

  /** Brief description of the resource */
  description?: string;

  /** Whether this resource is downloadable */
  downloadable?: boolean;

  /** File size in bytes (for downloadable resources) */
  fileSize?: number;
}

// =============================================================================
// PROGRESS AND TRACKING TYPES
// =============================================================================

/**
 * User Progress Interface
 *
 * Tracks user progress through modules and lessons.
 */
export interface UserProgress {
  /** User identifier */
  userId: string;

  /** Module identifier */
  moduleId: string;

  /** Current lesson identifier */
  currentLesson: string;

  /** Array of completed lesson IDs */
  completedLessons: string[];

  /** Total time spent in minutes */
  timeSpent: number;

  /** Last access timestamp */
  lastAccessed: Date;

  /** Overall completion percentage */
  completionPercentage: number;

  /** Whether the module is completed */
  isCompleted: boolean;

  /** Current learning streak in days */
  streak?: number;

  /** Achievement badges earned */
  badges?: string[];

  /** Detailed lesson progress */
  lessonProgress: Record<string, LessonProgress>;
}

/**
 * Lesson Progress Interface
 *
 * Tracks progress for individual lessons.
 */
export interface LessonProgress {
  /** Lesson identifier */
  lessonId: string;

  /** Whether the lesson is completed */
  completed: boolean;

  /** Whether the lesson is currently active */
  active: boolean;

  /** Time spent on this lesson in minutes */
  timeSpent: number;

  /** Last access timestamp */
  lastAccessed: Date;

  /** Progress through lesson content (0-100) */
  contentProgress: number;

  /** Completed content block IDs */
  completedBlocks: string[];

  /** Assessment scores for this lesson */
  assessmentScores?: Record<string, number>;
}

/**
 * Progress Statistics Interface
 *
 * Aggregated statistics for progress tracking.
 */
export interface ProgressStats {
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

  /** Average lesson completion time */
  averageCompletionTime?: number;

  /** Most recent activity timestamp */
  lastActivity?: Date;
}

// =============================================================================
// ASSESSMENT AND INTERACTION TYPES
// =============================================================================

/**
 * Assessment Interface
 *
 * Defines quizzes and assessments within modules.
 */
export interface Assessment {
  /** Unique identifier for the assessment */
  id: string;

  /** Type of assessment */
  type: "quiz" | "practical" | "case-study" | "project";

  /** Title of the assessment */
  title: string;

  /** Brief description */
  description?: string;

  /** Array of questions */
  questions: Question[];

  /** Passing score percentage */
  passingScore: number;

  /** Maximum number of attempts allowed */
  maxAttempts: number;

  /** Time limit in minutes (optional) */
  timeLimit?: number;

  /** Whether to show correct answers after completion */
  showAnswers?: boolean;

  /** Whether to provide immediate feedback */
  immediateFeedback?: boolean;
}

/**
 * Question Interface
 *
 * Defines individual questions within assessments.
 */
export interface Question {
  /** Unique identifier for the question */
  id: string;

  /** Type of question */
  type: QuestionType;

  /** The question text */
  question: string;

  /** Answer options (for multiple choice questions) */
  options?: string[];

  /** Correct answer(s) */
  correctAnswer: any;

  /** Explanation for the correct answer */
  explanation: string;

  /** Points awarded for correct answer */
  points: number;

  /** Optional media attachments */
  media?: MediaAttachment[];

  /** Question metadata */
  metadata?: QuestionMetadata;
}

/**
 * Question Types
 *
 * Enumeration of supported question types.
 */
export type QuestionType =
  | "multiple-choice"
  | "multiple-select"
  | "true-false"
  | "short-answer"
  | "long-answer"
  | "drag-drop"
  | "matching"
  | "ordering"
  | "fill-blank"
  | "hotspot";

/**
 * Question Metadata Interface
 *
 * Additional metadata for questions.
 */
export interface QuestionMetadata {
  /** Difficulty level of the question */
  difficulty?: "easy" | "medium" | "hard";

  /** Tags for categorization */
  tags?: string[];

  /** Learning objective this question assesses */
  learningObjective?: string;

  /** Estimated time to answer in minutes */
  estimatedTime?: number;

  /** Whether this question requires critical thinking */
  criticalThinking?: boolean;
}

/**
 * Media Attachment Interface
 *
 * Defines media attachments for questions and content.
 */
export interface MediaAttachment {
  /** Unique identifier for the media */
  id: string;

  /** Type of media */
  type: "image" | "video" | "audio" | "document";

  /** URL or path to the media */
  url: string;

  /** Alternative text for accessibility */
  altText?: string;

  /** Caption or description */
  caption?: string;

  /** File size in bytes */
  fileSize?: number;

  /** MIME type */
  mimeType?: string;
}

/**
 * Interaction Event Interface
 *
 * Defines user interaction events for analytics and tracking.
 */
export interface InteractionEvent {
  /** Type of interaction */
  type: InteractionType;

  /** Event data */
  data: any;

  /** Timestamp of the interaction */
  timestamp: Date;

  /** User identifier */
  userId?: string;

  /** Session identifier */
  sessionId?: string;

  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Interaction Types
 *
 * Enumeration of user interaction types.
 */
export type InteractionType =
  | "lesson_start"
  | "lesson_complete"
  | "content_view"
  | "content_interaction"
  | "assessment_start"
  | "assessment_complete"
  | "question_answer"
  | "navigation"
  | "search"
  | "download"
  | "bookmark"
  | "share";

// =============================================================================
// API AND RESPONSE TYPES
// =============================================================================

/**
 * API Response Interface
 *
 * Standard response format for API calls.
 */
export interface ApiResponse<T = any> {
  /** Whether the request was successful */
  success: boolean;

  /** Response data */
  data?: T;

  /** Error message if unsuccessful */
  error?: string;

  /** Additional metadata */
  metadata?: {
    /** Total count for paginated results */
    total?: number;

    /** Current page number */
    page?: number;

    /** Number of items per page */
    limit?: number;

    /** Whether there are more results */
    hasMore?: boolean;
  };
}

/**
 * Module Content Response Interface
 *
 * Response format for module content API calls.
 */
export interface ModuleContentResponse {
  /** Module configuration */
  module: ModuleConfig;

  /** Array of lessons */
  lessons: Lesson[];

  /** User progress data */
  progress?: UserProgress;

  /** Available assessments */
  assessments?: Assessment[];

  /** Additional resources */
  resources?: Resource[];
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Partial Update Type
 *
 * Utility type for partial updates to interfaces.
 */
export type PartialUpdate<T> = Partial<T> & { id: string };

/**
 * Create Type
 *
 * Utility type for creating new entities (excludes id and timestamps).
 */
export type CreateType<T> = Omit<T, "id" | "createdAt" | "updatedAt">;

/**
 * Update Type
 *
 * Utility type for updating entities (excludes createdAt).
 */
export type UpdateType<T> = Omit<T, "createdAt"> & { updatedAt: Date };

// =============================================================================
// EXPORT ALL TYPES
// =============================================================================

// All types are already exported via their interface declarations above
