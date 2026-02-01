/**
 * Module Configuration System for Education Modules
 *
 * This file provides a comprehensive configuration system for education modules
 * that enables scalable module development, consistent theming, and flexible
 * content management across the SoleMD platform.
 */

import {
  ModuleConfig,
  NavigationConfig,
  ThemeConfig,
  Lesson,
  Assessment,
  Resource,
  BreadcrumbItem,
} from "./types";

// =============================================================================
// AI FOR MD FOUNDATIONS MODULE CONFIGURATION
// =============================================================================

/**
 * AI for MD Foundations Module Configuration
 *
 * This configuration defines all aspects of the AI for MD Foundations module
 * including metadata, navigation, theming, and content structure.
 */
export const aiForMdFoundationsConfig: ModuleConfig = {
  // Basic Module Information
  id: "ai-for-md-foundations",
  title: "AI for MD Foundations",
  description:
    "Master the fundamentals of artificial intelligence in healthcare and learn how to leverage AI tools to enhance your clinical practice. This comprehensive module provides the essential foundation for understanding AI applications in modern medicine.",
  version: "1.0.0",
  author: "Dr. Jon Sole",

  // Learning Specifications
  estimatedDuration: 180, // 3 hours in minutes
  difficulty: "beginner",
  prerequisites: [
    "Basic understanding of clinical practice",
    "Familiarity with electronic health records",
    "Interest in healthcare technology",
  ],
  learningOutcomes: [
    "Understand core AI concepts and terminology in healthcare context",
    "Identify practical AI applications in clinical decision-making",
    "Navigate ethical considerations in AI implementation",
    "Use AI tools to enhance clinical workflow efficiency",
    "Evaluate AI-generated recommendations critically",
    "Implement responsible AI practices in healthcare settings",
  ],

  // Navigation Configuration
  navigation: {
    backUrl: "/education/ai-for-md",
    backLabel: "Back to AI for MD",
    breadcrumbs: [
      { label: "Education", href: "/education" },
      { label: "AI for MD", href: "/education/ai-for-md" },
      {
        label: "Foundations",
        href: "/education/ai-for-md/foundations",
        current: true,
      },
    ],
    showProgress: true,
  },

  // Theme Configuration
  theme: {
    primaryColor: "var(--color-fresh-green)",
    accentColor: "var(--color-soft-blue)",
    icon: "BrainCircuit",
    customStyles: {
      badgeBackground: "var(--color-fresh-green)15",
      badgeBorder: "var(--color-fresh-green)30",
      highlightBackground: "var(--color-fresh-green)10",
    },
  },

  // Module Status and Timestamps
  status: "published",
  createdAt: new Date("2024-01-15"),
  updatedAt: new Date("2024-02-01"),
};

// =============================================================================
// MODULE CONFIGURATION UTILITIES
// =============================================================================

/**
 * Module Configuration Manager
 *
 * Provides utilities for working with module configurations,
 * including validation, theme application, and content management.
 */
export class ModuleConfigManager {
  private config: ModuleConfig;

  constructor(config: ModuleConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate module configuration
   */
  private validateConfig(): void {
    const required = ["id", "title", "description", "version", "author"];
    const missing = required.filter(
      (field) => !this.config[field as keyof ModuleConfig]
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing required configuration fields: ${missing.join(", ")}`
      );
    }

    if (this.config.estimatedDuration <= 0) {
      throw new Error("Estimated duration must be greater than 0");
    }

    if (
      !["beginner", "intermediate", "advanced"].includes(this.config.difficulty)
    ) {
      throw new Error("Difficulty must be beginner, intermediate, or advanced");
    }
  }

  /**
   * Get module metadata
   */
  getMetadata() {
    return {
      id: this.config.id,
      title: this.config.title,
      description: this.config.description,
      version: this.config.version,
      author: this.config.author,
      estimatedDuration: this.config.estimatedDuration,
      difficulty: this.config.difficulty,
      status: this.config.status,
    };
  }

  /**
   * Get navigation configuration
   */
  getNavigationConfig(): NavigationConfig {
    return this.config.navigation;
  }

  /**
   * Get theme configuration
   */
  getThemeConfig(): ThemeConfig {
    return this.config.theme;
  }

  /**
   * Get learning outcomes
   */
  getLearningOutcomes(): string[] {
    return this.config.learningOutcomes;
  }

  /**
   * Get prerequisites
   */
  getPrerequisites(): string[] {
    return this.config.prerequisites;
  }

  /**
   * Generate breadcrumb navigation
   */
  generateBreadcrumbs(currentPath?: string): BreadcrumbItem[] {
    const baseBreadcrumbs = this.config.navigation.breadcrumbs || [];

    if (
      currentPath &&
      currentPath !== this.config.navigation.breadcrumbs?.[2]?.href
    ) {
      return [
        ...baseBreadcrumbs.map((item) => ({ ...item, current: false })),
        { label: "Current", href: currentPath, current: true },
      ];
    }

    return baseBreadcrumbs;
  }

  /**
   * Get theme CSS variables
   */
  getThemeVariables(): Record<string, string> {
    const theme = this.config.theme;
    return {
      "--module-primary-color": theme.primaryColor,
      "--module-accent-color": theme.accentColor || theme.primaryColor,
      "--module-badge-bg":
        theme.customStyles?.badgeBackground || `${theme.primaryColor}15`,
      "--module-badge-border":
        theme.customStyles?.badgeBorder || `${theme.primaryColor}30`,
      "--module-highlight-bg":
        theme.customStyles?.highlightBackground || `${theme.primaryColor}10`,
    };
  }

  /**
   * Generate module statistics
   */
  generateStats(lessons: Lesson[] = []): {
    duration: number;
    lessons: number;
    participants: number;
  } {
    return {
      duration: Math.ceil(this.config.estimatedDuration / 60), // Convert to hours
      lessons: lessons.length || 6, // Default lesson count
      participants: 150, // Mock participant count
    };
  }
}

// =============================================================================
// CONTENT MANAGEMENT PATTERNS
// =============================================================================

/**
 * Content Configuration Interface
 *
 * Defines the structure for organizing and managing module content.
 */
export interface ContentConfig {
  /** Module identifier */
  moduleId: string;

  /** Content version */
  version: string;

  /** Content structure */
  structure: {
    lessons: LessonConfig[];
    assessments: AssessmentConfig[];
    resources: ResourceConfig[];
  };

  /** Content metadata */
  metadata: {
    lastUpdated: Date;
    contentHash: string;
    language: string;
    accessibility: {
      screenReaderSupport: boolean;
      keyboardNavigation: boolean;
      highContrast: boolean;
      captions: boolean;
    };
  };
}

/**
 * Lesson Configuration Interface
 */
export interface LessonConfig {
  id: string;
  title: string;
  description: string;
  duration: number;
  order: number;
  contentPath: string;
  objectives: string[];
  prerequisites?: string[];
  assessments?: string[];
  resources?: string[];
}

/**
 * Assessment Configuration Interface
 */
export interface AssessmentConfig {
  id: string;
  title: string;
  type: "quiz" | "practical" | "case-study";
  lessonId?: string;
  configPath: string;
  passingScore: number;
  maxAttempts: number;
  timeLimit?: number;
}

/**
 * Resource Configuration Interface
 */
export interface ResourceConfig {
  id: string;
  title: string;
  type: "pdf" | "link" | "video" | "audio" | "document" | "tool";
  url: string;
  description?: string;
  downloadable: boolean;
  fileSize?: number;
  lessonIds?: string[];
}

/**
 * AI for MD Foundations Content Configuration
 */
export const aiForMdFoundationsContentConfig: ContentConfig = {
  moduleId: "ai-for-md-foundations",
  version: "1.0.0",

  structure: {
    lessons: [
      {
        id: "lesson-1",
        title: "Introduction to AI in Healthcare",
        description:
          "Overview of artificial intelligence applications in modern healthcare settings.",
        duration: 30,
        order: 1,
        contentPath: "/content/lessons/lesson-1.json",
        objectives: [
          "Define artificial intelligence in healthcare context",
          "Identify current AI applications in clinical practice",
          "Understand the potential and limitations of medical AI",
        ],
      },
      {
        id: "lesson-2",
        title: "AI Terminology and Concepts",
        description:
          "Essential terminology and core concepts for understanding AI systems.",
        duration: 25,
        order: 2,
        contentPath: "/content/lessons/lesson-2.json",
        objectives: [
          "Master key AI terminology",
          "Understand machine learning fundamentals",
          "Distinguish between different AI approaches",
        ],
        prerequisites: ["lesson-1"],
      },
      {
        id: "lesson-3",
        title: "Clinical Decision Support Systems",
        description:
          "How AI enhances clinical decision-making and diagnostic accuracy.",
        duration: 35,
        order: 3,
        contentPath: "/content/lessons/lesson-3.json",
        objectives: [
          "Understand clinical decision support systems",
          "Evaluate AI-generated recommendations",
          "Integrate AI insights into clinical workflow",
        ],
        prerequisites: ["lesson-1", "lesson-2"],
        assessments: ["quiz-1"],
      },
      {
        id: "lesson-4",
        title: "Ethical AI in Healthcare",
        description:
          "Navigate ethical challenges and ensure responsible AI deployment.",
        duration: 40,
        order: 4,
        contentPath: "/content/lessons/lesson-4.json",
        objectives: [
          "Identify ethical considerations in medical AI",
          "Understand bias and fairness in AI systems",
          "Implement responsible AI practices",
        ],
        prerequisites: ["lesson-3"],
      },
      {
        id: "lesson-5",
        title: "Hands-on AI Tools",
        description:
          "Practice with real AI tools that can be integrated into clinical workflow.",
        duration: 35,
        order: 5,
        contentPath: "/content/lessons/lesson-5.json",
        objectives: [
          "Use practical AI tools for healthcare",
          "Evaluate tool effectiveness and reliability",
          "Integrate AI tools into daily practice",
        ],
        prerequisites: ["lesson-4"],
        assessments: ["practical-1"],
      },
      {
        id: "lesson-6",
        title: "Future of AI in Medicine",
        description:
          "Explore emerging trends and future applications of AI in healthcare.",
        duration: 15,
        order: 6,
        contentPath: "/content/lessons/lesson-6.json",
        objectives: [
          "Understand emerging AI technologies",
          "Prepare for future AI developments",
          "Plan for continuous learning in AI",
        ],
        prerequisites: ["lesson-5"],
        assessments: ["final-assessment"],
      },
    ],

    assessments: [
      {
        id: "quiz-1",
        title: "Clinical Decision Support Quiz",
        type: "quiz",
        lessonId: "lesson-3",
        configPath: "/content/assessments/quiz-1.json",
        passingScore: 80,
        maxAttempts: 3,
        timeLimit: 15,
      },
      {
        id: "practical-1",
        title: "AI Tools Practical Exercise",
        type: "practical",
        lessonId: "lesson-5",
        configPath: "/content/assessments/practical-1.json",
        passingScore: 75,
        maxAttempts: 2,
      },
      {
        id: "final-assessment",
        title: "Foundations Final Assessment",
        type: "case-study",
        lessonId: "lesson-6",
        configPath: "/content/assessments/final-assessment.json",
        passingScore: 85,
        maxAttempts: 2,
        timeLimit: 45,
      },
    ],

    resources: [
      {
        id: "resource-1",
        title: "AI in Healthcare: A Comprehensive Guide",
        type: "pdf",
        url: "/resources/ai-healthcare-guide.pdf",
        description:
          "Comprehensive reference guide covering all aspects of AI in healthcare.",
        downloadable: true,
        fileSize: 2048000, // 2MB
        lessonIds: ["lesson-1", "lesson-2"],
      },
      {
        id: "resource-2",
        title: "FDA AI/ML Guidance",
        type: "link",
        url: "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices",
        description: "Official FDA guidance on AI/ML-enabled medical devices.",
        downloadable: false,
        lessonIds: ["lesson-4"],
      },
      {
        id: "resource-3",
        title: "AI Ethics Checklist",
        type: "document",
        url: "/resources/ai-ethics-checklist.pdf",
        description:
          "Practical checklist for ensuring ethical AI implementation.",
        downloadable: true,
        fileSize: 512000, // 512KB
        lessonIds: ["lesson-4"],
      },
    ],
  },

  metadata: {
    lastUpdated: new Date("2024-02-01"),
    contentHash: "sha256:abc123def456",
    language: "en-US",
    accessibility: {
      screenReaderSupport: true,
      keyboardNavigation: true,
      highContrast: true,
      captions: true,
    },
  },
};

// =============================================================================
// CONFIGURATION UTILITIES
// =============================================================================

/**
 * Content Configuration Manager
 *
 * Manages content configuration and provides utilities for content organization.
 */
export class ContentConfigManager {
  private contentConfig: ContentConfig;

  constructor(contentConfig: ContentConfig) {
    this.contentConfig = contentConfig;
  }

  /**
   * Get lesson configuration by ID
   */
  getLessonConfig(lessonId: string): LessonConfig | undefined {
    return this.contentConfig.structure.lessons.find(
      (lesson) => lesson.id === lessonId
    );
  }

  /**
   * Get all lesson configurations ordered by sequence
   */
  getAllLessons(): LessonConfig[] {
    return this.contentConfig.structure.lessons.sort(
      (a, b) => a.order - b.order
    );
  }

  /**
   * Get assessment configuration by ID
   */
  getAssessmentConfig(assessmentId: string): AssessmentConfig | undefined {
    return this.contentConfig.structure.assessments.find(
      (assessment) => assessment.id === assessmentId
    );
  }

  /**
   * Get assessments for a specific lesson
   */
  getLessonAssessments(lessonId: string): AssessmentConfig[] {
    return this.contentConfig.structure.assessments.filter(
      (assessment) => assessment.lessonId === lessonId
    );
  }

  /**
   * Get resources for a specific lesson
   */
  getLessonResources(lessonId: string): ResourceConfig[] {
    return this.contentConfig.structure.resources.filter((resource) =>
      resource.lessonIds?.includes(lessonId)
    );
  }

  /**
   * Get module statistics
   */
  getModuleStats() {
    const lessons = this.contentConfig.structure.lessons;
    const totalDuration = lessons.reduce(
      (sum, lesson) => sum + lesson.duration,
      0
    );

    return {
      totalLessons: lessons.length,
      totalDuration,
      totalAssessments: this.contentConfig.structure.assessments.length,
      totalResources: this.contentConfig.structure.resources.length,
    };
  }

  /**
   * Validate lesson prerequisites
   */
  validatePrerequisites(lessonId: string, completedLessons: string[]): boolean {
    const lesson = this.getLessonConfig(lessonId);
    if (!lesson || !lesson.prerequisites) return true;

    return lesson.prerequisites.every((prereq) =>
      completedLessons.includes(prereq)
    );
  }

  /**
   * Get next available lesson
   */
  getNextLesson(
    currentLessonId: string,
    completedLessons: string[]
  ): LessonConfig | null {
    const lessons = this.getAllLessons();
    const currentIndex = lessons.findIndex(
      (lesson) => lesson.id === currentLessonId
    );

    if (currentIndex === -1 || currentIndex === lessons.length - 1) return null;

    for (let i = currentIndex + 1; i < lessons.length; i++) {
      const nextLesson = lessons[i];
      if (this.validatePrerequisites(nextLesson.id, completedLessons)) {
        return nextLesson;
      }
    }

    return null;
  }
}

// =============================================================================
// EXPORT CONFIGURATION INSTANCES
// =============================================================================

// Create configuration manager instances
export const aiForMdFoundationsManager = new ModuleConfigManager(
  aiForMdFoundationsConfig
);
export const aiForMdContentManager = new ContentConfigManager(
  aiForMdFoundationsContentConfig
);

// Export configuration objects
export { aiForMdFoundationsConfig, aiForMdFoundationsContentConfig };

// =============================================================================
// CONFIGURATION FACTORY
// =============================================================================

/**
 * Configuration Factory
 *
 * Factory functions for creating new module configurations.
 */
export class ConfigurationFactory {
  /**
   * Create a new module configuration template
   */
  static createModuleTemplate(
    id: string,
    title: string,
    description: string
  ): Partial<ModuleConfig> {
    return {
      id,
      title,
      description,
      version: "1.0.0",
      author: "SoleMD Education Team",
      estimatedDuration: 120,
      difficulty: "beginner",
      prerequisites: [],
      learningOutcomes: [],
      navigation: {
        backUrl: "/education",
        backLabel: "Back to Education",
        showProgress: true,
      },
      theme: {
        primaryColor: "var(--color-fresh-green)",
        icon: "BookOpen",
      },
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create a new content configuration template
   */
  static createContentTemplate(moduleId: string): Partial<ContentConfig> {
    return {
      moduleId,
      version: "1.0.0",
      structure: {
        lessons: [],
        assessments: [],
        resources: [],
      },
      metadata: {
        lastUpdated: new Date(),
        contentHash: "",
        language: "en-US",
        accessibility: {
          screenReaderSupport: true,
          keyboardNavigation: true,
          highContrast: true,
          captions: false,
        },
      },
    };
  }
}
