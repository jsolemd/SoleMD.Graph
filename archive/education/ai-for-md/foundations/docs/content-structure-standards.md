# Content Structure Standards for Education Modules

## Overview

This document establishes comprehensive standards for organizing, structuring, and managing educational content within the SoleMD platform. These standards ensure consistency, maintainability, and scalability across all education modules while preserving educational effectiveness.

## Content Architecture Principles

### 1. Hierarchical Organization

```
Module
├── Lessons (Sequential learning units)
│   ├── Content Blocks (Individual learning elements)
│   ├── Assessments (Knowledge validation)
│   └── Resources (Supporting materials)
├── Module-level Assessments
└── Configuration (Theme, navigation, tracking)
```

### 2. Content Block Types

All educational content is organized into standardized content blocks:

- **Text**: Simple text content with formatting options
- **Rich Text**: HTML content with sanitization and validation
- **Interactive Demo**: Hands-on learning experiences
- **Assessment**: Quizzes, evaluations, and knowledge checks
- **Multimedia**: Videos, images, audio, animations
- **Simulation**: Parameter-based interactive simulations
- **Comparison**: Side-by-side content comparisons
- **Step-by-Step**: Sequential guided experiences
- **Clinical Scenario**: Medical case studies and examples
- **Takeaway**: Key learning point summaries

### 3. Metadata Standards

Every content element includes comprehensive metadata:

```typescript
interface ContentMetadata {
  estimatedDuration: number; // Minutes to complete
  difficulty: "beginner" | "intermediate" | "advanced";
  learningObjectives: string[]; // Specific learning goals
  prerequisites: string[]; // Required prior knowledge
  colorTheme: ColorTheme; // Visual consistency
  accessibility: AccessibilityFeatures;
  analytics: AnalyticsConfig; // Tracking configuration
}
```

## File Organization Standards

### Directory Structure

```
app/education/[module-name]/
├── page.tsx                     # Module landing page
├── learn/                       # Interactive learning experience
│   ├── page.tsx                # Learning app entry point
│   ├── layout.tsx              # Module-specific layout
│   └── components/             # Module-specific components
├── lib/                        # Module utilities and data
│   ├── content.ts              # Content management
│   ├── types.ts                # TypeScript definitions
│   ├── validation.ts           # Content validation
│   └── transformation.ts       # Content transformation
├── data/                       # Content data files
│   ├── lessons/                # Individual lesson data
│   ├── assessments/            # Assessment definitions
│   └── resources/              # Additional resources
├── components/                 # Reusable module components
├── docs/                       # Documentation
└── analysis/                   # Migration analysis
```

### Naming Conventions

#### Files and Directories

- **Directories**: kebab-case (`ai-for-md`, `clinical-scenarios`)
- **React Components**: PascalCase (`LessonNavigation.tsx`, `InteractiveContent.tsx`)
- **Utility Files**: kebab-case (`content-validation.ts`, `progress-tracking.ts`)
- **Data Files**: kebab-case with descriptive names (`lesson-01-foundations.json`)

#### Content Identifiers

- **Module IDs**: kebab-case (`ai-for-md-foundations`)
- **Lesson IDs**: kebab-case (`model-size-comparison`)
- **Content Block IDs**: kebab-case with context (`foundations-temperature-slider`)

## Content Data Standards

### Module Definition Structure

```typescript
interface ModuleContent {
  // Core identification
  id: string; // Unique module identifier
  title: string; // Display title
  description: string; // Brief description
  version: string; // Semantic version (1.0.0)
  author: string; // Content author

  // Educational metadata
  estimatedDuration: number; // Total minutes
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[]; // Required prior knowledge
  learningOutcomes: string[]; // What learners will achieve

  // Content structure
  lessons: Lesson[]; // Ordered learning sequence
  assessments: Assessment[]; // Module-level evaluations
  resources: Resource[]; // Supporting materials

  // Configuration
  configuration: ModuleConfiguration;
}
```

### Lesson Structure Standards

```typescript
interface Lesson {
  // Identification
  id: string; // Unique lesson identifier
  title: string; // Display title
  description: string; // Brief description

  // Educational metadata
  duration: number; // Estimated minutes
  learningObjectives: string[]; // Specific goals
  prerequisites?: string[]; // Required prior lessons

  // Content
  content: ContentBlock[]; // Ordered content blocks
  assessments?: AssessmentContent[]; // Lesson-level checks
  takeaway?: string; // Key learning summary

  // Navigation
  navigation?: LessonNavigation; // Custom navigation rules
}
```

### Content Block Standards

```typescript
interface ContentBlock {
  // Core properties
  id: string; // Unique identifier
  type: ContentBlockType; // Block type
  title?: string; // Optional display title
  content: any; // Type-specific content

  // Metadata
  metadata?: ContentMetadata; // Rendering and behavior
  validation?: ValidationRules; // Content integrity rules
}
```

## Interactive Content Standards

### Interactive Demo Configuration

```typescript
interface InteractiveDemoContent {
  type: "interactive-demo";
  content: {
    demoType: InteractiveDemoType; // Specific demo type
    config: InteractiveDemoConfig; // Demo configuration
    initialState?: any; // Starting state
    actions?: DemoAction[]; // Available interactions
  };
}
```

### Supported Interactive Demo Types

- **temperature-slider**: Adjustable creativity/factuality control
- **model-comparison**: Side-by-side model capability comparison
- **tokenizer-demo**: Tokenization visualization and comparison
- **context-window**: Context limitation demonstration
- **prompt-builder**: Step-by-step prompt construction
- **safer-framework**: Clinical AI safety methodology
- **grounding-demo**: Source attribution demonstration
- **cot-demo**: Chain-of-thought reasoning visualization

### Assessment Standards

```typescript
interface AssessmentContent {
  type: "assessment";
  content: {
    assessmentType: AssessmentType; // Question format
    questions: Question[]; // Question array
    scoring?: ScoringConfig; // Scoring rules
    feedback?: FeedbackConfig; // Feedback settings
  };
}
```

### Supported Assessment Types

- **multiple-choice**: Single correct answer from options
- **true-false**: Binary choice questions
- **short-answer**: Text input responses
- **drag-drop**: Interactive element placement
- **matching**: Connect related items
- **scenario-based**: Clinical case analysis
- **practical**: Hands-on skill demonstration

## Content Validation Standards

### Validation Levels

1. **Structure Validation**: Ensures proper data structure and required fields
2. **Content Validation**: Validates content quality and educational value
3. **Security Validation**: Sanitizes HTML and prevents XSS attacks
4. **Accessibility Validation**: Ensures WCAG AA compliance
5. **Clinical Validation**: Validates medical accuracy and safety

### Validation Rules

```typescript
interface ValidationRules {
  required?: string[]; // Required fields
  maxLength?: number; // Content length limits
  allowedTags?: string[]; // HTML tag whitelist
  customValidators?: ValidationFunction[]; // Custom validation
}
```

### Built-in Validators

- **Clinical Content Validator**: Ensures medical accuracy and includes appropriate disclaimers
- **Accessibility Validator**: Checks for alt text, heading hierarchy, and ARIA labels
- **Security Validator**: Sanitizes HTML and removes dangerous content
- **Educational Validator**: Ensures learning objectives and takeaways are present

## Accessibility Standards

### WCAG AA Compliance Requirements

- **Alt Text**: All images must have descriptive alt text
- **Heading Hierarchy**: Proper H1-H6 structure without skipping levels
- **Color Contrast**: Minimum 4.5:1 ratio for normal text, 3:1 for large text
- **Keyboard Navigation**: All interactive elements accessible via keyboard
- **Screen Reader Support**: Proper ARIA labels and semantic HTML
- **Focus Management**: Visible focus indicators and logical tab order

### Implementation Guidelines

```typescript
interface AccessibilityFeatures {
  ariaLabel?: string; // Screen reader label
  altText?: string; // Image alternative text
  keyboardNavigation?: boolean; // Keyboard support
  highContrast?: boolean; // High contrast mode
  reducedMotion?: boolean; // Reduced motion support
}
```

## Internationalization Standards

### Content Structure for i18n

- **Separate Content from Code**: All text content in data files
- **String Keys**: Consistent naming convention for translation keys
- **Context Information**: Provide context for translators
- **Pluralization Support**: Handle singular/plural forms
- **Cultural Adaptation**: Consider cultural differences in examples

### Implementation Pattern

```typescript
interface LocalizedContent {
  [locale: string]: {
    title: string;
    description: string;
    content: ContentBlock[];
    // ... other localized fields
  };
}
```

## Performance Standards

### Content Loading Optimization

- **Lazy Loading**: Load content blocks on demand
- **Code Splitting**: Separate interactive components
- **Asset Optimization**: Compress images and videos
- **Caching Strategy**: Cache static content appropriately
- **Progressive Loading**: Show content as it becomes available

### Size Limitations

- **Text Content**: Maximum 10,000 characters per block
- **HTML Content**: Maximum 50KB per rich text block
- **Images**: Maximum 2MB, optimized for web
- **Videos**: Maximum 100MB, multiple quality options
- **Interactive Demos**: Lazy load heavy components

## Security Standards

### Content Sanitization

- **HTML Sanitization**: Remove dangerous tags and attributes
- **Input Validation**: Validate all user inputs
- **XSS Prevention**: Escape user-generated content
- **CSRF Protection**: Implement CSRF tokens for forms
- **Content Security Policy**: Restrict resource loading

### Allowed HTML Tags

```typescript
const allowedTags = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "a",
  "img",
];
```

### Prohibited Content

- **Script Tags**: No JavaScript execution in content
- **External Resources**: No external iframe or object embeds
- **Event Handlers**: No onclick or other event attributes
- **Dangerous Protocols**: No javascript: or data: URLs
- **Form Elements**: No form inputs in content blocks

## Analytics and Tracking Standards

### Tracking Configuration

```typescript
interface AnalyticsConfig {
  trackCompletion?: boolean; // Track lesson completion
  trackInteractions?: boolean; // Track user interactions
  trackTimeSpent?: boolean; // Track time on content
  customEvents?: string[]; // Custom event tracking
}
```

### Standard Events

- **lesson_started**: User begins a lesson
- **lesson_completed**: User completes a lesson
- **assessment_attempted**: User starts an assessment
- **assessment_completed**: User finishes an assessment
- **interaction_performed**: User interacts with content
- **content_viewed**: User views specific content block

### Privacy Compliance

- **Data Minimization**: Only collect necessary data
- **User Consent**: Obtain consent for tracking
- **Data Retention**: Implement retention policies
- **Anonymization**: Remove PII from analytics data
- **GDPR Compliance**: Support data deletion requests

## Quality Assurance Standards

### Content Review Process

1. **Educational Review**: Verify learning objectives and outcomes
2. **Technical Review**: Ensure proper implementation
3. **Accessibility Review**: Validate WCAG compliance
4. **Security Review**: Check for vulnerabilities
5. **User Testing**: Validate user experience

### Testing Requirements

- **Unit Tests**: Test individual components
- **Integration Tests**: Test complete user journeys
- **Accessibility Tests**: Automated and manual testing
- **Performance Tests**: Load time and interaction testing
- **Cross-browser Tests**: Ensure compatibility

### Documentation Requirements

- **Content Documentation**: Describe educational goals and structure
- **Technical Documentation**: Implementation details and APIs
- **User Documentation**: How to use and navigate content
- **Maintenance Documentation**: Update and troubleshooting guides

## Migration Standards

### Content Migration Process

1. **Analysis**: Analyze existing content structure
2. **Mapping**: Map old structure to new standards
3. **Transformation**: Convert content to new format
4. **Validation**: Ensure content integrity
5. **Testing**: Verify functionality and quality
6. **Deployment**: Release migrated content

### Backup and Rollback

- **Backup Creation**: Create backups before migration
- **Version Control**: Track all content changes
- **Rollback Procedures**: Quick rollback if issues arise
- **Data Integrity**: Verify content after migration

## Future Module Development

### Template Structure

New education modules should follow this template:

```
app/education/[new-module]/
├── page.tsx                     # Landing page
├── learn/                       # Learning experience
├── lib/                         # Utilities and types
├── data/                        # Content data
├── components/                  # Module components
├── docs/                        # Documentation
└── __tests__/                   # Test files
```

### Reusable Components

- **ModuleWrapper**: Consistent module layout
- **LessonNavigation**: Standardized navigation
- **ProgressTracker**: Progress indication
- **InteractiveContent**: Content rendering
- **AssessmentEngine**: Quiz and evaluation system

### Best Practices

- **Start with Learning Objectives**: Define clear educational goals
- **Progressive Complexity**: Build from simple to advanced concepts
- **Interactive Elements**: Include hands-on learning opportunities
- **Regular Assessments**: Validate learning throughout
- **Clear Takeaways**: Summarize key learning points
- **Accessibility First**: Design for all users from the start
- **Performance Conscious**: Optimize for fast loading
- **Mobile Responsive**: Ensure mobile-friendly design

This comprehensive standard ensures that all education modules within the SoleMD platform maintain consistency, quality, and educational effectiveness while providing a scalable foundation for future development.
