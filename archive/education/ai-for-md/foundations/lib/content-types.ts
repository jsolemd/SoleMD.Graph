/**
 * @fileoverview Content type definitions for educational modules
 * @description Comprehensive TypeScript interfaces for all educational content types
 * supporting multiple interactive learning experiences within the SoleMD platform
 */

// =================================================================================
// CORE CONTENT INTERFACES
// =================================================================================

/**
 * Base interface for all content blocks in the education system
 */
export interface ContentBlock {
  /** Unique identifier for the content block */
  id: string;
  /** Type of content block */
  type: ContentBlockType;
  /** Display title for the content */
  title?: string;
  /** Content data - structure varies by type */
  content: any;
  /** Metadata for rendering and behavior */
  metadata?: ContentMetadata;
  /** Validation rules for content integrity */
  validation?: ValidationRules;
}

/**
 * Supported content block types for educational modules
 */
export type ContentBlockType =
  | "text"
  | "rich-text"
  | "interactive-demo"
  | "assessment"
  | "multimedia"
  | "simulation"
  | "comparison"
  | "step-by-step"
  | "flip-card"
  | "drag-drop"
  | "slider"
  | "chat-demo"
  | "code-example"
  | "clinical-scenario"
  | "takeaway";

/**
 * Metadata for content blocks
 */
export interface ContentMetadata {
  /** Estimated time to complete in minutes */
  estimatedDuration?: number;
  /** Difficulty level */
  difficulty?: "beginner" | "intermediate" | "advanced";
  /** Learning objectives */
  learningObjectives?: string[];
  /** Prerequisites */
  prerequisites?: string[];
  /** Color theme for visual consistency */
  colorTheme?: ColorTheme;
  /** Accessibility features */
  accessibility?: AccessibilityFeatures;
  /** Analytics tracking */
  analytics?: AnalyticsConfig;
}

/**
 * Color theme configuration for content blocks
 */
export interface ColorTheme {
  /** Primary color variable name */
  primary: string;
  /** Background color variable */
  background: string;
  /** Border color variable */
  border: string;
  /** Text color variable */
  text: string;
}

/**
 * Accessibility configuration for content blocks
 */
export interface AccessibilityFeatures {
  /** ARIA label for screen readers */
  ariaLabel?: string;
  /** Alternative text for visual elements */
  altText?: string;
  /** Keyboard navigation support */
  keyboardNavigation?: boolean;
  /** High contrast mode support */
  highContrast?: boolean;
  /** Reduced motion support */
  reducedMotion?: boolean;
}

/**
 * Analytics configuration for tracking user interactions
 */
export interface AnalyticsConfig {
  /** Track completion events */
  trackCompletion?: boolean;
  /** Track interaction events */
  trackInteractions?: boolean;
  /** Track time spent */
  trackTimeSpent?: boolean;
  /** Custom event tracking */
  customEvents?: string[];
}

/**
 * Validation rules for content integrity
 */
export interface ValidationRules {
  /** Required fields */
  required?: string[];
  /** Content length limits */
  maxLength?: number;
  /** Allowed HTML tags for rich content */
  allowedTags?: string[];
  /** Custom validation functions */
  customValidators?: ValidationFunction[];
}

/**
 * Custom validation function type
 */
export type ValidationFunction = (content: any) => ValidationResult;

/**
 * Validation result interface
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Error messages if validation failed */
  errors?: string[];
  /** Warning messages */
  warnings?: string[];
}

// =================================================================================
// SPECIFIC CONTENT TYPE INTERFACES
// =================================================================================

/**
 * Text content block for simple text display
 */
export interface TextContent extends ContentBlock {
  type: "text";
  content: {
    /** Plain text content */
    text: string;
    /** Text formatting options */
    formatting?: TextFormatting;
  };
}

/**
 * Rich text content with HTML support
 */
export interface RichTextContent extends ContentBlock {
  type: "rich-text";
  content: {
    /** HTML content */
    html: string;
    /** Sanitization options */
    sanitization?: SanitizationOptions;
  };
}

/**
 * Interactive demonstration content
 */
export interface InteractiveDemoContent extends ContentBlock {
  type: "interactive-demo";
  content: {
    /** Demo type */
    demoType: InteractiveDemoType;
    /** Demo configuration */
    config: InteractiveDemoConfig;
    /** Initial state */
    initialState?: any;
    /** Available actions */
    actions?: DemoAction[];
  };
}

/**
 * Assessment content for quizzes and evaluations
 */
export interface AssessmentContent extends ContentBlock {
  type: "assessment";
  content: {
    /** Assessment type */
    assessmentType: AssessmentType;
    /** Questions */
    questions: Question[];
    /** Scoring configuration */
    scoring?: ScoringConfig;
    /** Feedback configuration */
    feedback?: FeedbackConfig;
  };
}

/**
 * Multimedia content for videos, images, audio
 */
export interface MultimediaContent extends ContentBlock {
  type: "multimedia";
  content: {
    /** Media type */
    mediaType: "video" | "audio" | "image" | "animation";
    /** Media source */
    src: string;
    /** Alternative sources for different formats */
    sources?: MediaSource[];
    /** Captions/subtitles */
    captions?: Caption[];
    /** Transcript */
    transcript?: string;
  };
}

/**
 * Simulation content for interactive simulations
 */
export interface SimulationContent extends ContentBlock {
  type: "simulation";
  content: {
    /** Simulation type */
    simulationType: SimulationType;
    /** Simulation parameters */
    parameters: SimulationParameters;
    /** Available controls */
    controls?: SimulationControl[];
    /** Output configuration */
    outputs?: SimulationOutput[];
  };
}

// =================================================================================
// LESSON AND MODULE INTERFACES
// =================================================================================

/**
 * Individual lesson within a module
 */
export interface Lesson {
  /** Unique lesson identifier */
  id: string;
  /** Lesson title */
  title: string;
  /** Brief description */
  description: string;
  /** Estimated duration in minutes */
  duration: number;
  /** Content blocks that make up the lesson */
  content: ContentBlock[];
  /** Prerequisites for this lesson */
  prerequisites?: string[];
  /** Learning objectives */
  learningObjectives: string[];
  /** Assessment elements */
  assessments?: AssessmentContent[];
  /** Takeaway message */
  takeaway?: string;
  /** Navigation configuration */
  navigation?: LessonNavigation;
}

/**
 * Assessment configuration for lessons and modules
 */
export interface Assessment {
  /** Unique assessment identifier */
  id: string;
  /** Assessment type */
  type: AssessmentType;
  /** Assessment title */
  title: string;
  /** Questions */
  questions: Question[];
  /** Passing score (0-1) */
  passingScore: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** Time limit in minutes */
  timeLimit?: number;
  /** Feedback configuration */
  feedback?: FeedbackConfig;
}

/**
 * Complete module definition
 */
export interface ModuleContent {
  /** Unique module identifier */
  id: string;
  /** Module title */
  title: string;
  /** Module description */
  description: string;
  /** Module version */
  version: string;
  /** Author information */
  author: string;
  /** Estimated total duration */
  estimatedDuration: number;
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Prerequisites */
  prerequisites: string[];
  /** Learning outcomes */
  learningOutcomes: string[];
  /** Lessons in order */
  lessons: Lesson[];
  /** Module-level assessments */
  assessments: Assessment[];
  /** Additional resources */
  resources: Resource[];
  /** Module configuration */
  configuration: ModuleConfiguration;
}

// =================================================================================
// SUPPORTING INTERFACES
// =================================================================================

/**
 * Text formatting options
 */
export interface TextFormatting {
  /** Font size */
  fontSize?: string;
  /** Font weight */
  fontWeight?: string;
  /** Text alignment */
  textAlign?: "left" | "center" | "right" | "justify";
  /** Text color */
  color?: string;
  /** Background color */
  backgroundColor?: string;
}

/**
 * HTML sanitization options
 */
export interface SanitizationOptions {
  /** Allowed HTML tags */
  allowedTags?: string[];
  /** Allowed attributes */
  allowedAttributes?: Record<string, string[]>;
  /** Strip dangerous content */
  stripDangerous?: boolean;
}

/**
 * Interactive demo types
 */
export type InteractiveDemoType =
  | "temperature-slider"
  | "model-comparison"
  | "tokenizer-demo"
  | "context-window"
  | "prompt-builder"
  | "safer-framework"
  | "grounding-demo"
  | "cot-demo";

/**
 * Interactive demo configuration
 */
export interface InteractiveDemoConfig {
  /** Demo-specific settings */
  settings: Record<string, any>;
  /** UI configuration */
  ui?: UIConfiguration;
  /** Behavior configuration */
  behavior?: BehaviorConfiguration;
}

/**
 * Demo action definition
 */
export interface DemoAction {
  /** Action identifier */
  id: string;
  /** Action label */
  label: string;
  /** Action type */
  type: "click" | "drag" | "input" | "select";
  /** Action handler */
  handler: string;
  /** Action parameters */
  parameters?: Record<string, any>;
}

/**
 * Assessment types
 */
export type AssessmentType =
  | "multiple-choice"
  | "true-false"
  | "short-answer"
  | "drag-drop"
  | "matching"
  | "scenario-based"
  | "practical";

/**
 * Question interface for assessments
 */
export interface Question {
  /** Question identifier */
  id: string;
  /** Question type */
  type: AssessmentType;
  /** Question text */
  question: string;
  /** Answer options (for multiple choice) */
  options?: string[];
  /** Correct answer */
  correctAnswer: any;
  /** Explanation for the answer */
  explanation: string;
  /** Points awarded for correct answer */
  points: number;
  /** Hints available */
  hints?: string[];
}

/**
 * Scoring configuration
 */
export interface ScoringConfig {
  /** Scoring method */
  method: "points" | "percentage" | "pass-fail";
  /** Passing threshold */
  passingThreshold: number;
  /** Partial credit allowed */
  partialCredit?: boolean;
  /** Time bonus */
  timeBonus?: boolean;
}

/**
 * Feedback configuration
 */
export interface FeedbackConfig {
  /** Show correct answers */
  showCorrectAnswers: boolean;
  /** Show explanations */
  showExplanations: boolean;
  /** Show score immediately */
  immediateScore: boolean;
  /** Custom feedback messages */
  customMessages?: Record<string, string>;
}

/**
 * Media source for different formats
 */
export interface MediaSource {
  /** Source URL */
  src: string;
  /** Media type */
  type: string;
  /** Quality label */
  quality?: string;
}

/**
 * Caption/subtitle information
 */
export interface Caption {
  /** Language code */
  language: string;
  /** Caption file URL */
  src: string;
  /** Caption label */
  label: string;
  /** Default caption */
  default?: boolean;
}

/**
 * Simulation types
 */
export type SimulationType =
  | "parameter-adjustment"
  | "scenario-simulation"
  | "process-visualization"
  | "outcome-prediction";

/**
 * Simulation parameters
 */
export interface SimulationParameters {
  /** Parameter definitions */
  parameters: Parameter[];
  /** Initial values */
  initialValues: Record<string, any>;
  /** Constraints */
  constraints?: Record<string, any>;
}

/**
 * Parameter definition for simulations
 */
export interface Parameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: "number" | "string" | "boolean" | "select";
  /** Display label */
  label: string;
  /** Default value */
  defaultValue: any;
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Step size (for numbers) */
  step?: number;
  /** Options (for select) */
  options?: string[];
}

/**
 * Simulation control interface
 */
export interface SimulationControl {
  /** Control identifier */
  id: string;
  /** Control type */
  type: "button" | "slider" | "input" | "toggle";
  /** Control label */
  label: string;
  /** Control action */
  action: string;
}

/**
 * Simulation output configuration
 */
export interface SimulationOutput {
  /** Output identifier */
  id: string;
  /** Output type */
  type: "text" | "chart" | "visualization" | "table";
  /** Output label */
  label: string;
  /** Output format */
  format?: string;
}

/**
 * Lesson navigation configuration
 */
export interface LessonNavigation {
  /** Show previous/next buttons */
  showNavigation: boolean;
  /** Allow skipping */
  allowSkipping: boolean;
  /** Require completion */
  requireCompletion: boolean;
  /** Custom navigation labels */
  customLabels?: Record<string, string>;
}

/**
 * Resource definition
 */
export interface Resource {
  /** Resource identifier */
  id: string;
  /** Resource title */
  title: string;
  /** Resource type */
  type: "document" | "link" | "video" | "tool" | "reference";
  /** Resource URL */
  url: string;
  /** Resource description */
  description?: string;
  /** Download available */
  downloadable?: boolean;
}

/**
 * Module configuration
 */
export interface ModuleConfiguration {
  /** Theme configuration */
  theme: ModuleTheme;
  /** Navigation configuration */
  navigation: ModuleNavigation;
  /** Progress tracking */
  progressTracking: ProgressTracking;
  /** Integration settings */
  integration: IntegrationSettings;
}

/**
 * Module theme configuration
 */
export interface ModuleTheme {
  /** Primary color */
  primaryColor: string;
  /** Secondary color */
  secondaryColor?: string;
  /** Custom CSS variables */
  customVariables?: Record<string, string>;
}

/**
 * Module navigation configuration
 */
export interface ModuleNavigation {
  /** Navigation style */
  style: "sidebar" | "tabs" | "breadcrumb" | "stepper";
  /** Show progress indicator */
  showProgress: boolean;
  /** Allow random access */
  allowRandomAccess: boolean;
}

/**
 * Progress tracking configuration
 */
export interface ProgressTracking {
  /** Track lesson completion */
  trackCompletion: boolean;
  /** Track time spent */
  trackTimeSpent: boolean;
  /** Track interactions */
  trackInteractions: boolean;
  /** Persist progress */
  persistProgress: boolean;
}

/**
 * Integration settings for SoleMD platform
 */
export interface IntegrationSettings {
  /** Platform theme integration */
  platformTheme: boolean;
  /** Header/footer integration */
  platformLayout: boolean;
  /** Analytics integration */
  analytics: boolean;
  /** Authentication integration */
  authentication: boolean;
}

/**
 * UI configuration for interactive elements
 */
export interface UIConfiguration {
  /** Layout settings */
  layout?: LayoutSettings;
  /** Animation settings */
  animations?: AnimationSettings;
  /** Responsive settings */
  responsive?: ResponsiveSettings;
}

/**
 * Behavior configuration for interactive elements
 */
export interface BehaviorConfiguration {
  /** Auto-advance settings */
  autoAdvance?: boolean;
  /** Timeout settings */
  timeout?: number;
  /** Retry settings */
  retryAllowed?: boolean;
  /** Save state */
  saveState?: boolean;
}

/**
 * Layout settings for UI components
 */
export interface LayoutSettings {
  /** Component width */
  width?: string;
  /** Component height */
  height?: string;
  /** Padding */
  padding?: string;
  /** Margin */
  margin?: string;
}

/**
 * Animation settings for UI components
 */
export interface AnimationSettings {
  /** Enable animations */
  enabled: boolean;
  /** Animation duration */
  duration?: number;
  /** Animation easing */
  easing?: string;
  /** Reduced motion support */
  respectReducedMotion?: boolean;
}

/**
 * Responsive settings for UI components
 */
export interface ResponsiveSettings {
  /** Breakpoints */
  breakpoints?: Record<string, string>;
  /** Mobile-specific settings */
  mobile?: Record<string, any>;
  /** Tablet-specific settings */
  tablet?: Record<string, any>;
  /** Desktop-specific settings */
  desktop?: Record<string, any>;
}

// =================================================================================
// CONTENT TRANSFORMATION INTERFACES
// =================================================================================

/**
 * Content transformation configuration
 */
export interface TransformationConfig {
  /** Source format */
  sourceFormat: "json" | "html" | "markdown" | "custom";
  /** Target format */
  targetFormat: "react" | "json" | "html";
  /** Transformation rules */
  rules: TransformationRule[];
  /** Validation settings */
  validation: ValidationSettings;
}

/**
 * Transformation rule definition
 */
export interface TransformationRule {
  /** Rule identifier */
  id: string;
  /** Source pattern to match */
  sourcePattern: string | RegExp;
  /** Target transformation */
  targetTransform: string | TransformFunction;
  /** Rule priority */
  priority?: number;
  /** Conditions for applying rule */
  conditions?: RuleCondition[];
}

/**
 * Transformation function type
 */
export type TransformFunction = (
  source: any,
  context: TransformationContext
) => any;

/**
 * Rule condition for conditional transformations
 */
export interface RuleCondition {
  /** Condition type */
  type: "exists" | "equals" | "contains" | "matches";
  /** Field to check */
  field: string;
  /** Expected value */
  value: any;
}

/**
 * Transformation context
 */
export interface TransformationContext {
  /** Source data */
  source: any;
  /** Current transformation state */
  state: Record<string, any>;
  /** Transformation options */
  options: Record<string, any>;
}

/**
 * Validation settings for transformations
 */
export interface ValidationSettings {
  /** Validate before transformation */
  validateSource: boolean;
  /** Validate after transformation */
  validateTarget: boolean;
  /** Strict validation mode */
  strict: boolean;
  /** Custom validators */
  customValidators?: ValidationFunction[];
}

/**
 * Migration result interface
 */
export interface MigrationResult {
  /** Migration success status */
  success: boolean;
  /** Migrated content */
  content?: ModuleContent;
  /** Migration errors */
  errors?: MigrationError[];
  /** Migration warnings */
  warnings?: string[];
  /** Migration statistics */
  statistics?: MigrationStatistics;
}

/**
 * Migration error interface
 */
export interface MigrationError {
  /** Error type */
  type: "validation" | "transformation" | "content" | "system";
  /** Error message */
  message: string;
  /** Error location */
  location?: string;
  /** Error severity */
  severity: "error" | "warning" | "info";
}

/**
 * Migration statistics
 */
export interface MigrationStatistics {
  /** Total content blocks processed */
  totalBlocks: number;
  /** Successfully migrated blocks */
  successfulBlocks: number;
  /** Failed blocks */
  failedBlocks: number;
  /** Processing time */
  processingTime: number;
  /** Content size before/after */
  sizeComparison: {
    before: number;
    after: number;
  };
}
