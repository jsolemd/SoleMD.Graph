# InteractiveContent Component System Documentation

## Overview

The InteractiveContent component system is a comprehensive, flexible content rendering engine designed for educational modules within the SoleMD platform. It supports multiple content types, interactive elements, accessibility features, and provides a foundation for scalable educational experiences.

## Features

### Core Capabilities

- **Multi-Content Type Support**: Handles 15+ different content types including text, multimedia, interactive demos, assessments, and simulations
- **Interactive Elements**: Full Framer Motion integration for smooth animations and user interactions
- **Accessibility First**: WCAG AA compliant with comprehensive ARIA support and semantic HTML
- **Progress Tracking**: Built-in completion tracking and progress visualization
- **Error Handling**: Graceful error handling with user-friendly error messages
- **Responsive Design**: Mobile-first approach with responsive layouts
- **Theme Integration**: Full SoleMD design system integration with education theme colors

### Supported Content Types

1. **Text Content** (`text`)

   - Simple text with formatting options
   - Typography integration with SoleMD design system

2. **Rich Text Content** (`rich-text`)

   - HTML content with sanitization
   - Support for embedded media and formatting

3. **Interactive Demo Content** (`interactive-demo`)

   - Hands-on learning experiences
   - Support for multiple demo types (temperature slider, model comparison, etc.)
   - Configurable actions and parameters

4. **Assessment Content** (`assessment`)

   - Multiple question types (multiple-choice, true/false, short-answer)
   - Scoring and feedback systems
   - Progress tracking through questions
   - Retry functionality

5. **Multimedia Content** (`multimedia`)

   - Video, audio, image, and animation support
   - Captions and transcript support
   - Accessibility features for media content

6. **Simulation Content** (`simulation`)

   - Interactive parameter-based simulations
   - Configurable controls and outputs
   - Real-time state management

7. **Additional Content Types** (extensible)
   - Comparison, step-by-step, flip-card, drag-drop, slider, chat-demo, code-example, clinical-scenario, takeaway

## Component Architecture

### Props Interface

```typescript
interface InteractiveContentProps {
  /** Array of content blocks to render */
  content: ContentBlock[];
  /** Callback for user interactions */
  onInteraction: (interaction: InteractionEvent) => void;
  /** Callback when content is completed */
  onComplete: () => void;
  /** Optional className for styling */
  className?: string;
  /** Whether to show progress indicators */
  showProgress?: boolean;
  /** Current progress (0-100) */
  progress?: number;
}
```

### State Management

The component maintains several state variables for comprehensive interaction tracking:

- `completedBlocks`: Set of completed content block IDs
- `currentBlock`: Currently active content block
- `blockStates`: Individual state for each content block
- `errors`: Error messages for content blocks

### Content Block Structure

Each content block follows a standardized structure:

```typescript
interface ContentBlock {
  id: string; // Unique identifier
  type: ContentBlockType; // Content type
  title?: string; // Optional display title
  content: any; // Type-specific content data
  metadata?: ContentMetadata; // Rendering and behavior metadata
  validation?: ValidationRules; // Content integrity rules
}
```

## Usage Examples

### Basic Text Content

```typescript
const textContent: ContentBlock = {
  id: "intro-text",
  type: "text",
  title: "Introduction to AI in Medicine",
  content: {
    text: "Artificial Intelligence is transforming healthcare...",
    formatting: {
      fontSize: "1.125rem",
      textAlign: "left",
    },
  },
  metadata: {
    estimatedDuration: 2,
    learningObjectives: [
      "Understand the role of AI in modern healthcare",
      "Identify key applications of AI in clinical practice",
    ],
  },
};
```

### Interactive Demo Content

```typescript
const demoContent: ContentBlock = {
  id: "temperature-demo",
  type: "interactive-demo",
  title: "Temperature Parameter Demo",
  content: {
    demoType: "temperature-slider",
    config: {
      settings: {
        minTemp: 0,
        maxTemp: 2,
        defaultTemp: 0.7,
      },
    },
    initialState: {
      temperature: 0.7,
      output: "Balanced creativity and factuality",
    },
    actions: [
      {
        id: "reset",
        label: "Reset to Default",
        type: "click",
        handler: "resetTemperature",
      },
    ],
  },
};
```

### Assessment Content

```typescript
const assessmentContent: ContentBlock = {
  id: "knowledge-check",
  type: "assessment",
  title: "Knowledge Check",
  content: {
    assessmentType: "multiple-choice",
    questions: [
      {
        id: "q1",
        type: "multiple-choice",
        question: "What does temperature control in AI models?",
        options: [
          "Model size",
          "Creativity vs factuality",
          "Processing speed",
          "Memory usage",
        ],
        correctAnswer: "Creativity vs factuality",
        explanation: "Temperature controls the randomness in AI outputs...",
        points: 1,
      },
    ],
    scoring: {
      method: "percentage",
      passingThreshold: 70,
    },
    feedback: {
      showCorrectAnswers: true,
      showExplanations: true,
      immediateScore: true,
    },
  },
};
```

### Component Usage

```tsx
import InteractiveContent from "./components/InteractiveContent";

function LessonPage() {
  const handleInteraction = (interaction: InteractionEvent) => {
    console.log("User interaction:", interaction);
    // Handle analytics, progress tracking, etc.
  };

  const handleComplete = () => {
    console.log("Lesson completed");
    // Navigate to next lesson or show completion
  };

  return (
    <InteractiveContent
      content={lessonContent}
      onInteraction={handleInteraction}
      onComplete={handleComplete}
      showProgress={true}
      className="lesson-content"
    />
  );
}
```

## Accessibility Features

### WCAG AA Compliance

- **Semantic HTML**: Proper heading hierarchy and semantic elements
- **ARIA Labels**: Comprehensive ARIA labeling for screen readers
- **Keyboard Navigation**: Full keyboard accessibility for all interactive elements
- **Focus Management**: Proper focus indicators and tab order
- **Color Contrast**: Meets WCAG AA contrast requirements
- **Alternative Text**: Alt text for all images and media
- **Captions**: Video and audio content includes captions/transcripts

### Screen Reader Support

- Content blocks are properly labeled with `role="article"`
- Progress indicators use `role="progressbar"` with appropriate ARIA attributes
- Interactive elements have descriptive `aria-label` attributes
- Error messages use `role="alert"` for immediate announcement

### Keyboard Navigation

- All interactive elements are keyboard accessible
- Logical tab order throughout content
- Escape key support for dismissing modals/errors
- Arrow key navigation for question options

## Animation and Interactions

### Framer Motion Integration

The component uses Framer Motion for smooth, performant animations:

- **Entrance Animations**: Staggered content block appearances
- **Hover Effects**: Subtle lift effects on interactive elements
- **Progress Animations**: Smooth progress bar transitions
- **State Transitions**: Animated transitions between content states

### Animation Patterns

```typescript
// Entrance animation for content blocks
const entranceAnimation = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: index * 0.1, ease: "easeOut" },
};

// Hover effect for cards
const cardHover = {
  whileHover: {
    y: -2,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
};
```

## Error Handling

### Error Types

- **Content Loading Errors**: Failed to load content data
- **Validation Errors**: Content doesn't meet validation rules
- **Interaction Errors**: Failed user interactions
- **Media Errors**: Failed to load multimedia content

### Error Display

Errors are displayed inline with the content block:

```tsx
{
  hasError && (
    <div role="alert" className="error-display">
      <AlertCircle className="error-icon" />
      <span className="error-message">{hasError}</span>
      <Button onClick={() => clearBlockError(block.id)}>Dismiss</Button>
    </div>
  );
}
```

### Error Recovery

- **Retry Mechanisms**: Automatic retry for transient errors
- **Graceful Degradation**: Fallback content when features fail
- **User Feedback**: Clear error messages with actionable steps
- **Error Clearing**: Users can dismiss errors and retry

## Performance Considerations

### Optimization Strategies

- **Lazy Loading**: Content blocks load as needed
- **Memoization**: Expensive calculations are memoized
- **State Optimization**: Efficient state updates to prevent unnecessary re-renders
- **Animation Performance**: Hardware-accelerated animations using transform properties

### Bundle Size

- **Code Splitting**: Component can be lazy-loaded
- **Tree Shaking**: Only used content type renderers are included
- **Dependency Optimization**: Minimal external dependencies

## Extensibility

### Adding New Content Types

1. **Define Type Interface**: Add new content type to `ContentBlockType`
2. **Create Content Interface**: Define structure in `content-types.ts`
3. **Implement Renderer**: Add rendering function to InteractiveContent
4. **Add Icon Mapping**: Update `getContentIcon` function
5. **Update Documentation**: Document new content type usage

### Example: Adding a New Content Type

```typescript
// 1. Add to ContentBlockType
export type ContentBlockType =
  | "text"
  | "rich-text"
  | "interactive-demo"
  | "assessment"
  | "multimedia"
  | "simulation"
  | "new-content-type"; // Add here

// 2. Define interface
export interface NewContentType extends ContentBlock {
  type: "new-content-type";
  content: {
    // Define content structure
    data: any;
    config: any;
  };
}

// 3. Add renderer function
const renderNewContentType = useCallback(
  (block: NewContentType, index: number) => {
    // Implementation here
  },
  []
);

// 4. Update icon mapping
const iconMap: Record<ContentBlockType, React.ComponentType<any>> = {
  // ... existing mappings
  "new-content-type": NewIcon,
};

// 5. Add to render switch
{
  block.type === "new-content-type" &&
    renderNewContentType(block as NewContentType, index);
}
```

## Testing

### Unit Testing

Test files should cover:

- Content rendering for each type
- User interactions and state changes
- Error handling and recovery
- Accessibility features
- Animation behavior

### Integration Testing

- Complete user journeys through content
- Progress tracking accuracy
- Cross-browser compatibility
- Mobile responsiveness

### Accessibility Testing

- Screen reader compatibility
- Keyboard navigation
- Color contrast validation
- Focus management

## Best Practices

### Content Creation

1. **Clear Learning Objectives**: Each content block should have defined learning goals
2. **Progressive Complexity**: Build from simple to advanced concepts
3. **Interactive Elements**: Include hands-on learning opportunities
4. **Regular Assessments**: Validate learning throughout the content
5. **Accessibility First**: Design for all users from the start

### Performance

1. **Optimize Images**: Compress and properly size media assets
2. **Lazy Load**: Load content as needed to improve initial load time
3. **Minimize State**: Keep component state minimal and focused
4. **Memoize Expensive Operations**: Use React.memo and useMemo appropriately

### Maintenance

1. **Type Safety**: Maintain strict TypeScript typing
2. **Documentation**: Keep documentation updated with changes
3. **Testing**: Maintain comprehensive test coverage
4. **Error Monitoring**: Implement error tracking and monitoring

## Migration from Existing Systems

### From Static Content

1. **Content Analysis**: Analyze existing content structure
2. **Type Mapping**: Map existing content to new content types
3. **Data Transformation**: Convert content to new format
4. **Validation**: Ensure content integrity after migration
5. **Testing**: Verify functionality and educational effectiveness

### From Other Frameworks

1. **Component Analysis**: Identify equivalent functionality
2. **State Migration**: Convert state management patterns
3. **Event Handling**: Map existing event handlers to new system
4. **Styling Migration**: Convert styles to SoleMD design system
5. **Testing**: Comprehensive testing of migrated functionality

## Future Enhancements

### Planned Features

- **Advanced Analytics**: Detailed learning analytics and insights
- **Personalization**: Adaptive content based on user progress
- **Collaboration**: Multi-user collaborative learning features
- **Offline Support**: Content caching for offline access
- **AI Integration**: AI-powered content recommendations

### Extensibility Roadmap

- **Plugin System**: Allow third-party content type plugins
- **Theme Customization**: Advanced theming and branding options
- **Content Management**: Visual content creation and editing tools
- **Integration APIs**: APIs for external system integration

This documentation provides a comprehensive guide for using, extending, and maintaining the InteractiveContent component system within the SoleMD education platform.
