/**
 * @fileoverview Content transformation utilities for migrating webapp content
 * @description Automated tools to transform existing AI for MD webapp content
 * to the new SoleMD education module format with validation and integrity checking
 */

import {
  ContentBlock,
  ModuleContent,
  Lesson,
  Assessment,
  TransformationConfig,
  TransformationRule,
  TransformationContext,
  MigrationResult,
  MigrationError,
  MigrationStatistics,
  InteractiveDemoContent,
  AssessmentContent,
  RichTextContent,
  MultimediaContent,
} from "./content-types";

import {
  contentValidator,
  contentSanitizer,
  contentIntegrityChecker,
} from "./content-validation";

// =================================================================================
// WEBAPP CONTENT INTERFACES (Source Format)
// =================================================================================

/**
 * Original webapp component structure
 */
interface WebappComponent {
  id: string;
  htmlPath: string;
  initializers?: string[];
  placeholderId?: string;
  hasData?: boolean;
}

/**
 * Original webapp data structure
 */
interface WebappData {
  [key: string]: any;
}

/**
 * Original webapp step structure (for interactive components)
 */
interface WebappStep {
  id: number;
  title: string;
  icon: string;
  text: string;
  colorVar: string;
}

/**
 * Original webapp interactive demo structure
 */
interface WebappInteractiveDemo {
  steps?: WebappStep[];
  outputs?: Record<string, any>;
  options?: Record<string, any>;
  critiques?: Record<string, string>;
}

// =================================================================================
// CONTENT TRANSFORMER CLASS
// =================================================================================

/**
 * Main content transformation class
 */
export class ContentTransformer {
  private config: TransformationConfig;
  private transformationRules: Map<string, TransformationRule[]> = new Map();

  constructor(config: TransformationConfig) {
    this.config = config;
    this.initializeRules();
  }

  /**
   * Initialize transformation rules
   */
  private initializeRules(): void {
    // Group rules by priority
    const rulesByPriority = this.config.rules.reduce((acc, rule) => {
      const priority = rule.priority || 0;
      if (!acc[priority]) {
        acc[priority] = [];
      }
      acc[priority].push(rule);
      return acc;
    }, {} as Record<number, TransformationRule[]>);

    // Store rules sorted by priority
    Object.keys(rulesByPriority)
      .sort((a, b) => parseInt(b) - parseInt(a)) // Higher priority first
      .forEach((priority) => {
        this.transformationRules.set(
          priority,
          rulesByPriority[parseInt(priority)]
        );
      });
  }

  /**
   * Transform webapp content to module format
   */
  async transformWebappToModule(
    webappComponents: WebappComponent[],
    webappData: Record<string, WebappData>,
    moduleMetadata: Partial<ModuleContent>
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const errors: MigrationError[] = [];
    const warnings: string[] = [];
    const statistics: MigrationStatistics = {
      totalBlocks: 0,
      successfulBlocks: 0,
      failedBlocks: 0,
      processingTime: 0,
      sizeComparison: { before: 0, after: 0 },
    };

    try {
      // Calculate original size
      statistics.sizeComparison.before = JSON.stringify({
        webappComponents,
        webappData,
      }).length;

      // Transform components to lessons
      const lessons: Lesson[] = [];

      for (const component of webappComponents) {
        try {
          const lesson = await this.transformComponentToLesson(
            component,
            webappData[component.id]
          );
          if (lesson) {
            lessons.push(lesson);
            statistics.totalBlocks += lesson.content.length;
            statistics.successfulBlocks += lesson.content.length;
          }
        } catch (error) {
          errors.push({
            type: "transformation",
            message: `Failed to transform component ${component.id}: ${error}`,
            location: component.id,
            severity: "error",
          });
          statistics.failedBlocks++;
        }
      }

      // Create module structure
      const module: ModuleContent = {
        id: moduleMetadata.id || "ai-for-md-foundations",
        title: moduleMetadata.title || "AI for MD Foundations",
        description:
          moduleMetadata.description ||
          "Interactive guide for clinicians to develop AI skills",
        version: moduleMetadata.version || "1.0.0",
        author: moduleMetadata.author || "Dr. Jon Sole",
        estimatedDuration: this.calculateTotalDuration(lessons),
        difficulty: moduleMetadata.difficulty || "intermediate",
        prerequisites: moduleMetadata.prerequisites || [],
        learningOutcomes:
          moduleMetadata.learningOutcomes ||
          this.generateLearningOutcomes(lessons),
        lessons,
        assessments: moduleMetadata.assessments || [],
        resources: moduleMetadata.resources || [],
        configuration:
          moduleMetadata.configuration || this.generateDefaultConfiguration(),
      };

      // Validate the transformed module
      if (this.config.validation.validateTarget) {
        const validationResult = contentValidator.validateModule(module);
        if (!validationResult.isValid) {
          errors.push(
            ...(validationResult.errors || []).map((error) => ({
              type: "validation" as const,
              message: error,
              severity: "error" as const,
            }))
          );
        }
        warnings.push(...(validationResult.warnings || []));
      }

      // Calculate final size and processing time
      statistics.sizeComparison.after = JSON.stringify(module).length;
      statistics.processingTime = Date.now() - startTime;

      return {
        success: errors.filter((e) => e.severity === "error").length === 0,
        content: module,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        statistics,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            type: "system",
            message: `System error during transformation: ${error}`,
            severity: "error",
          },
        ],
        statistics,
      };
    }
  }

  /**
   * Transform individual component to lesson
   */
  private async transformComponentToLesson(
    component: WebappComponent,
    data: WebappData
  ): Promise<Lesson | null> {
    // Skip UI components that aren't educational content
    if (component.id === "nav-progress" || component.id === "scroll-focus") {
      return null;
    }

    const contentBlocks: ContentBlock[] = [];

    // Transform based on component type
    switch (component.id) {
      case "foundations":
        return this.transformFoundationsComponent(component, data);

      case "prompting":
        return this.transformPromptingComponent(component, data);

      case "safer":
        return this.transformSaferComponent(component, data);

      case "expert":
        return this.transformExpertComponent(component, data);

      case "toolkit":
        return this.transformToolkitComponent(component, data);

      case "workflow":
        return this.transformWorkflowComponent(component, data);

      default:
        return this.transformGenericComponent(component, data);
    }
  }

  /**
   * Transform foundations component (container for sub-components)
   */
  private transformFoundationsComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const subComponents = [
      "model-size",
      "tokenizer",
      "context-window",
      "temperature",
      "grounding",
      "llm-flow",
      "cot",
    ];

    const contentBlocks: ContentBlock[] = subComponents.map((subId) => ({
      id: `foundations-${subId}`,
      type: "interactive-demo" as const,
      title: this.getComponentTitle(subId),
      content: {
        demoType: this.mapToInteractiveDemoType(subId),
        config: {
          settings: data || {},
          ui: {
            layout: { width: "100%", height: "auto" },
            animations: { enabled: true, respectReducedMotion: true },
          },
        },
        initialState: this.getInitialState(subId, data),
      },
      metadata: {
        colorTheme: this.getColorTheme(subId),
        estimatedDuration: this.getEstimatedDuration(subId),
        learningObjectives: this.getLearningObjectives(subId),
      },
    }));

    return {
      id: "foundations",
      title: "Understanding the Engine: Core LLM Concepts",
      description:
        "Go hands-on with the core concepts. Use these interactive tools to build an intuitive feel for how to control and apply AI models.",
      duration: contentBlocks.reduce(
        (sum, block) => sum + (block.metadata?.estimatedDuration || 10),
        0
      ),
      content: contentBlocks,
      learningObjectives: [
        "Understand how model size affects capability and speed",
        "Learn how tokenization impacts model behavior",
        "Master the concept of context windows and their limitations",
        "Control creativity vs factuality with temperature settings",
        "Distinguish between grounded and ungrounded AI responses",
        "Understand the internal mechanics of language models",
        "Apply chain-of-thought reasoning for better outputs",
      ],
      takeaway:
        "You've learned the core mechanics. The Big Picture: An AI's output is only as good as its fundamental understanding of the language and context you provide. Garbage in, garbage out.",
    };
  }

  /**
   * Transform prompting component
   */
  private transformPromptingComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const promptBuilderContent: InteractiveDemoContent = {
      id: "prompt-builder-demo",
      type: "interactive-demo",
      title: "Precision Prompting Demo",
      content: {
        demoType: "prompt-builder",
        config: {
          settings: {
            steps: data?.promptBuilderSteps || [],
            combinations: data?.promptCombinations || {},
            critiques: data?.promptCritiques || {},
          },
          ui: {
            layout: { width: "100%", height: "600px" },
            animations: { enabled: true, duration: 300 },
          },
        },
      },
      metadata: {
        colorTheme: {
          primary: "var(--color-warm-coral)",
          background: "var(--c-orange-bg)",
          border: "var(--c-orange-border)",
          text: "var(--c-orange-text)",
        },
        estimatedDuration: 15,
        learningObjectives: [
          "Learn structured prompting methodology",
          "Understand the impact of each prompt component",
          "Practice building expert-level prompts",
        ],
      },
    };

    return {
      id: "prompting",
      title: "A Method for Precision Prompting",
      description:
        "Great AI output comes from great input. This structured method helps you build high-precision prompts.",
      duration: 15,
      content: [promptBuilderContent],
      learningObjectives: [
        "Master the 6-step precision prompting methodology",
        "Understand how each component improves AI output quality",
        "Apply structured prompting to clinical scenarios",
      ],
      takeaway:
        "Now that you understand the mechanics, you see that prompting is how you control them. The Big Picture: A well-structured prompt is like a well-formed clinical question—it guides the AI toward a precise, relevant, and useful answer.",
    };
  }

  /**
   * Transform S.A.F.E.R. component
   */
  private transformSaferComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const saferFrameworkContent: InteractiveDemoContent = {
      id: "safer-framework-demo",
      type: "interactive-demo",
      title: "S.A.F.E.R. Framework Interactive Demo",
      content: {
        demoType: "safer-framework",
        config: {
          settings: {
            steps: data?.saferSteps || [],
            scenario: data?.saferScenario || {},
          },
          ui: {
            layout: { width: "100%", height: "700px" },
            animations: { enabled: true, duration: 400 },
          },
        },
      },
      metadata: {
        colorTheme: {
          primary: "var(--color-fresh-green)",
          background: "var(--c-teal-bg)",
          border: "var(--c-teal-border)",
          text: "var(--c-teal-text)",
        },
        estimatedDuration: 20,
        learningObjectives: [
          "Learn the 5-step S.A.F.E.R. safety framework",
          "Apply safety principles to clinical AI use",
          "Practice responsible AI decision-making",
        ],
      },
    };

    return {
      id: "safer",
      title: "The S.A.F.E.R. Framework",
      description:
        "For safe clinical use, every AI interaction requires a cognitive framework. The S.A.F.E.R. model is a five-step checklist to ensure your use of AI is responsible, ethical, and patient-centered.",
      duration: 20,
      content: [saferFrameworkContent],
      learningObjectives: [
        "Understand the importance of AI safety in clinical practice",
        "Master the S.A.F.E.R. framework for responsible AI use",
        "Apply safety principles to real clinical scenarios",
      ],
      takeaway:
        "You have the technical skills, now you have a safety framework. The Big Picture: Technical skill without a safety framework is dangerous. The S.A.F.E.R. model is your cognitive 'pre-flight checklist' to ensure every AI interaction is responsible and patient-centered.",
    };
  }

  /**
   * Transform expert component
   */
  private transformExpertComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const expertPromptContent: InteractiveDemoContent = {
      id: "expert-prompt-demo",
      type: "interactive-demo",
      title: "Expert-Level Prompting Demonstration",
      content: {
        demoType: "expert-prompt",
        config: {
          settings: data || {},
          ui: {
            layout: { width: "100%", height: "500px" },
          },
        },
      },
      metadata: {
        estimatedDuration: 12,
        learningObjectives: [
          "See the difference between basic and expert prompts",
          "Learn advanced prompting techniques",
          "Understand how to create clinical copilot interactions",
        ],
      },
    };

    return {
      id: "expert",
      title: "Expert-Level Prompting",
      description:
        "See how combining core concepts with precision prompting elevates AI from a simple chatbot to a genuine clinical copilot.",
      duration: 12,
      content: [expertPromptContent],
      learningObjectives: [
        "Distinguish between basic and expert-level prompts",
        "Apply advanced prompting techniques to clinical documentation",
        "Create structured, professional-quality AI outputs",
      ],
      takeaway:
        "You've seen the difference between a simple and an expert prompt. The Big Picture: By combining core concepts and precision prompting, you can elevate the AI from a simple chatbot to a genuine clinical copilot capable of producing high-quality, structured documentation.",
    };
  }

  /**
   * Transform toolkit component
   */
  private transformToolkitComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const toolkitContent: RichTextContent = {
      id: "ai-toolkit-overview",
      type: "rich-text",
      title: "AI Tools for Clinical Practice",
      content: {
        html: this.generateToolkitHTML(data),
        sanitization: {
          allowedTags: [
            "p",
            "h3",
            "h4",
            "ul",
            "li",
            "strong",
            "em",
            "a",
            "div",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
          ],
          stripDangerous: true,
        },
      },
      metadata: {
        estimatedDuration: 10,
        learningObjectives: [
          "Discover specialized AI tools for medical practice",
          "Learn tool selection criteria",
          "Understand integration strategies",
        ],
      },
    };

    return {
      id: "toolkit",
      title: "The AI Toolkit",
      description:
        "Discover specialized tools available for different clinical and research tasks.",
      duration: 10,
      content: [toolkitContent],
      learningObjectives: [
        "Identify appropriate AI tools for specific clinical tasks",
        "Understand the strengths and limitations of different tools",
        "Learn how to integrate AI tools into clinical workflows",
      ],
      takeaway:
        "You've seen the specialized tools available. The Big Picture: Don't use a hammer for a screwdriver's job. Choosing the right tool—from a generalist LLM for brainstorming to a specialist like Elicit for systematic reviews—is fundamental to efficient and reliable work.",
    };
  }

  /**
   * Transform workflow component
   */
  private transformWorkflowComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const workflowContent: InteractiveDemoContent = {
      id: "research-workflow-demo",
      type: "interactive-demo",
      title: "Research Workflow Integration",
      content: {
        demoType: "workflow-timeline",
        config: {
          settings: data || {},
          ui: {
            layout: { width: "100%", height: "600px" },
          },
        },
      },
      metadata: {
        estimatedDuration: 15,
        learningObjectives: [
          "See AI integration throughout the research process",
          "Learn workflow optimization strategies",
          "Understand quality enhancement techniques",
        ],
      },
    };

    return {
      id: "workflow",
      title: "AI-Enhanced Research Workflow",
      description:
        "Walk through the entire research process and see how AI can be integrated at every stage.",
      duration: 15,
      content: [workflowContent],
      learningObjectives: [
        "Understand end-to-end AI integration in research",
        "Learn to optimize research workflows with AI",
        "Apply AI tools throughout the research lifecycle",
      ],
      takeaway:
        "You've walked through the entire research process. The Big Picture: AI isn't a single step; it's a cognitive partner that can be woven into every stage of your workflow, from generating the initial hypothesis to challenging the final draft of your manuscript.",
    };
  }

  /**
   * Transform generic component
   */
  private transformGenericComponent(
    component: WebappComponent,
    data: WebappData
  ): Lesson {
    const content: ContentBlock[] = [
      {
        id: `${component.id}-content`,
        type: "rich-text",
        title: this.getComponentTitle(component.id),
        content: {
          html: `<p>Content for ${component.id} component</p>`,
          sanitization: { stripDangerous: true },
        },
        metadata: {
          estimatedDuration: 5,
        },
      },
    ];

    return {
      id: component.id,
      title: this.getComponentTitle(component.id),
      description: `Educational content for ${component.id}`,
      duration: 5,
      content,
      learningObjectives: [`Learn about ${component.id}`],
    };
  }

  // =================================================================================
  // HELPER METHODS
  // =================================================================================

  /**
   * Get component title from ID
   */
  private getComponentTitle(id: string): string {
    const titles: Record<string, string> = {
      "model-size": "Model Size and Capability",
      tokenizer: "Tokenization and Language Understanding",
      "context-window": "Context Windows and Information Limits",
      temperature: "Temperature and Output Control",
      grounding: "Grounding and Source Attribution",
      "llm-flow": "LLM Internal Flow and Mechanics",
      cot: "Chain-of-Thought Reasoning",
      introduction: "Introduction to AI for Clinicians",
      "guide-intro": "Guide Overview",
      conclusion: "Next Steps and Conclusion",
    };

    return (
      titles[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ")
    );
  }

  /**
   * Map component ID to interactive demo type
   */
  private mapToInteractiveDemoType(id: string): string {
    const mapping: Record<string, string> = {
      "model-size": "model-comparison",
      tokenizer: "tokenizer-demo",
      "context-window": "context-window",
      temperature: "temperature-slider",
      grounding: "grounding-demo",
      "llm-flow": "llm-flow",
      cot: "cot-demo",
    };

    return mapping[id] || id;
  }

  /**
   * Get color theme for component
   */
  private getColorTheme(id: string): any {
    const themes: Record<string, any> = {
      "model-size": {
        primary: "var(--color-soft-blue)",
        background: "var(--c-blue-bg)",
        border: "var(--c-blue-border)",
        text: "var(--c-blue-text)",
      },
      tokenizer: {
        primary: "var(--color-warm-coral)",
        background: "var(--c-orange-bg)",
        border: "var(--c-orange-border)",
        text: "var(--c-orange-text)",
      },
      temperature: {
        primary: "var(--color-fresh-green)",
        background: "var(--c-green-bg)",
        border: "var(--c-green-border)",
        text: "var(--c-green-text)",
      },
    };

    return themes[id] || themes["model-size"];
  }

  /**
   * Get estimated duration for component
   */
  private getEstimatedDuration(id: string): number {
    const durations: Record<string, number> = {
      "model-size": 8,
      tokenizer: 10,
      "context-window": 6,
      temperature: 12,
      grounding: 8,
      "llm-flow": 15,
      cot: 10,
    };

    return durations[id] || 8;
  }

  /**
   * Get learning objectives for component
   */
  private getLearningObjectives(id: string): string[] {
    const objectives: Record<string, string[]> = {
      "model-size": [
        "Understand the relationship between model size and capability",
        "Learn when to use different sized models for clinical tasks",
      ],
      tokenizer: [
        "Understand how tokenization affects model behavior",
        "Learn why medical-trained models feel more reasonable",
      ],
      temperature: [
        "Master temperature control for different clinical scenarios",
        "Balance creativity and factuality in AI outputs",
      ],
    };

    return objectives[id] || [`Learn about ${id}`];
  }

  /**
   * Get initial state for interactive demo
   */
  private getInitialState(id: string, data: any): any {
    // Return component-specific initial state
    return data?.initialState || {};
  }

  /**
   * Generate toolkit HTML from data
   */
  private generateToolkitHTML(data: any): string {
    if (!data || !data.tools) {
      return "<p>AI toolkit information will be displayed here.</p>";
    }

    let html = '<div class="toolkit-content">';

    // Generate tool categories
    Object.entries(data.tools).forEach(([category, tools]: [string, any]) => {
      html += `<h3>${category}</h3><ul>`;
      if (Array.isArray(tools)) {
        tools.forEach((tool: any) => {
          html += `<li><strong>${tool.name}</strong>: ${tool.description}</li>`;
        });
      }
      html += "</ul>";
    });

    html += "</div>";
    return html;
  }

  /**
   * Calculate total duration for lessons
   */
  private calculateTotalDuration(lessons: Lesson[]): number {
    return lessons.reduce((total, lesson) => total + lesson.duration, 0);
  }

  /**
   * Generate learning outcomes from lessons
   */
  private generateLearningOutcomes(lessons: Lesson[]): string[] {
    const outcomes: string[] = [];

    lessons.forEach((lesson) => {
      outcomes.push(...lesson.learningObjectives);
    });

    // Remove duplicates and return
    return [...new Set(outcomes)];
  }

  /**
   * Generate default module configuration
   */
  private generateDefaultConfiguration(): any {
    return {
      theme: {
        primaryColor: "var(--color-fresh-green)",
        customVariables: {
          "--module-primary": "var(--color-fresh-green)",
          "--module-secondary": "var(--color-soft-blue)",
        },
      },
      navigation: {
        style: "sidebar",
        showProgress: true,
        allowRandomAccess: false,
      },
      progressTracking: {
        trackCompletion: true,
        trackTimeSpent: true,
        trackInteractions: true,
        persistProgress: true,
      },
      integration: {
        platformTheme: true,
        platformLayout: true,
        analytics: true,
        authentication: false,
      },
    };
  }
}

// =================================================================================
// CONTENT MIGRATION UTILITIES
// =================================================================================

/**
 * Content migration utility class
 */
export class ContentMigrator {
  private transformer: ContentTransformer;
  private backupData: Map<string, any> = new Map();

  constructor(config: TransformationConfig) {
    this.transformer = new ContentTransformer(config);
  }

  /**
   * Migrate webapp content with backup and rollback support
   */
  async migrateWithBackup(
    webappComponents: WebappComponent[],
    webappData: Record<string, WebappData>,
    moduleMetadata: Partial<ModuleContent>
  ): Promise<MigrationResult> {
    // Create backup
    const backupId = this.createBackup({
      webappComponents,
      webappData,
      moduleMetadata,
    });

    try {
      const result = await this.transformer.transformWebappToModule(
        webappComponents,
        webappData,
        moduleMetadata
      );

      if (!result.success) {
        // Migration failed, backup is available for rollback
        result.warnings = result.warnings || [];
        result.warnings.push(
          `Migration failed. Backup created with ID: ${backupId}`
        );
      }

      return result;
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            type: "system",
            message: `Migration failed with error: ${error}. Backup available: ${backupId}`,
            severity: "error",
          },
        ],
      };
    }
  }

  /**
   * Create backup of original content
   */
  private createBackup(data: any): string {
    const backupId = `backup_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.backupData.set(backupId, {
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)), // Deep copy
    });
    return backupId;
  }

  /**
   * Rollback to backup
   */
  rollback(backupId: string): any | null {
    const backup = this.backupData.get(backupId);
    if (backup) {
      return backup.data;
    }
    return null;
  }

  /**
   * List available backups
   */
  listBackups(): Array<{ id: string; timestamp: string }> {
    return Array.from(this.backupData.entries()).map(([id, backup]) => ({
      id,
      timestamp: backup.timestamp,
    }));
  }

  /**
   * Clean up old backups
   */
  cleanupBackups(olderThanDays: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    for (const [id, backup] of this.backupData.entries()) {
      const backupDate = new Date(backup.timestamp);
      if (backupDate < cutoffDate) {
        this.backupData.delete(id);
      }
    }
  }
}

// =================================================================================
// EXPORTED UTILITIES
// =================================================================================

/**
 * Create default transformation configuration
 */
export function createDefaultTransformationConfig(): TransformationConfig {
  return {
    sourceFormat: "json",
    targetFormat: "react",
    rules: [
      {
        id: "html-to-rich-text",
        sourcePattern: /\.html$/,
        targetTransform: "rich-text",
        priority: 1,
      },
      {
        id: "interactive-components",
        sourcePattern: /\.(ts|js)$/,
        targetTransform: "interactive-demo",
        priority: 2,
      },
    ],
    validation: {
      validateSource: true,
      validateTarget: true,
      strict: false,
      customValidators: [],
    },
  };
}

/**
 * Create content transformer with default configuration
 */
export function createContentTransformer(
  config?: Partial<TransformationConfig>
): ContentTransformer {
  const defaultConfig = createDefaultTransformationConfig();
  const finalConfig = { ...defaultConfig, ...config };
  return new ContentTransformer(finalConfig);
}

/**
 * Create content migrator with default configuration
 */
export function createContentMigrator(
  config?: Partial<TransformationConfig>
): ContentMigrator {
  const defaultConfig = createDefaultTransformationConfig();
  const finalConfig = { ...defaultConfig, ...config };
  return new ContentMigrator(finalConfig);
}
