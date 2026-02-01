# Interactive Exercises Implementation Guide

## Overview

This document provides comprehensive guidance for implementing and extending the interactive exercise system in the AI for MD education module. The system includes migrated components from the original webapp with enhanced SoleMD design integration and improved accessibility.

## Architecture

### Component Structure

```
learn/components/
├── InteractiveExercises.tsx     # Core interactive exercises
├── SaferFrameworkDemo.tsx       # SAFER framework demonstration
├── MultimediaContent.tsx        # Enhanced media components
└── InteractiveContent.tsx       # Main content renderer
```

### Design Patterns

All interactive exercises follow these established patterns:

- **SoleMD Design System Integration**: Uses education theme colors, typography classes, and floating card patterns
- **Accessibility First**: WCAG AA compliance with proper ARIA labels, keyboard navigation, and screen reader support
- **Responsive Design**: Mobile-first approach with consistent breakpoints
- **Animation Standards**: Framer Motion animations with reduced motion support
- **Error Handling**: Graceful degradation and user-friendly error messages

## Interactive Exercise Components

### 1. Temperature Slider

**Purpose**: Demonstrates the relationship between AI temperature settings and output creativity vs. factuality.

**Features**:

- Visual thermometer with real-time updates
- Color-coded temperature levels (blue=factual, yellow=balanced, red=creative)
- Dynamic response generation based on temperature
- Accessibility: Full keyboard navigation and screen reader support

**Usage**:

```tsx
<InteractiveExercises.TemperatureSlider
  onInteraction={(data) => handleInteraction(data)}
  className="mb-6"
/>
```

**Interaction Events**:

- `temperature_changed`: Fired when user adjusts temperature
- Contains: `temperature` (0-1), `response` (string), `timestamp`

### 2. Prompt Builder

**Purpose**: Interactive tool for building expert-level AI prompts using structured methodology.

**Features**:

- Sequential component addition (Persona → Goal → Context → Format → Constraint)
- Real-time prompt preview and AI response simulation
- Critique panel with analysis of prompt quality
- Visual feedback for component selection

**Usage**:

```tsx
<InteractiveExercises.PromptBuilder
  onInteraction={(data) => handleInteraction(data)}
  className="mb-6"
/>
```

**Interaction Events**:

- `prompt_part_added`: When user adds a prompt component
- `prompt_builder_reset`: When user resets the builder

### 3. Model Size Simulator

**Purpose**: Explores the relationship between model size and task performance across different clinical scenarios.

**Features**:

- Model selection (Small 7B, Medium 13B, Large 70B)
- Clinical task selection (Summary, Differential, Literature Review)
- Performance visualization with quality and speed metrics
- Explanatory feedback for each combination

**Usage**:

```tsx
<InteractiveExercises.ModelSizeSimulator
  onInteraction={(data) => handleInteraction(data)}
  className="mb-6"
/>
```

**Interaction Events**:

- `model_simulation`: Contains model, task, and performance data

### 4. SAFER Framework Demo

**Purpose**: Interactive demonstration of the S.A.F.E.R. clinical AI safety framework.

**Features**:

- Step-by-step workflow animation
- Real-time chat interface simulation
- Triage board for AI output evaluation
- Risk assessment and verification workflow
- Commentary panel with contextual guidance

**Usage**:

```tsx
<SaferFrameworkDemo
  onInteraction={(data) => handleInteraction(data)}
  className="mb-6"
/>
```

**Interaction Events**:

- `safer_step_completed`: When each SAFER step is completed
- `safer_demo_reset`: When demo is reset

## Enhanced Multimedia Components

### 1. Video Player

**Features**:

- Custom controls with accessibility support
- Chapter navigation
- Captions and transcript support
- Playback speed control
- Fullscreen capability
- Progress tracking

**Usage**:

```tsx
<MultimediaComponents.VideoPlayer
  src="/path/to/video.mp4"
  title="Educational Video"
  captions={[
    {
      language: "en",
      label: "English",
      src: "/path/to/captions.vtt",
      default: true,
    },
  ]}
  transcript="Video transcript content..."
  chapters={[
    { time: 0, title: "Introduction", description: "Overview of concepts" },
    { time: 120, title: "Main Content", description: "Detailed explanation" },
  ]}
  onInteraction={(data) => handleInteraction(data)}
/>
```

### 2. Audio Player

**Features**:

- Waveform visualization
- Chapter navigation
- Transcript support
- Playback controls
- Speed adjustment

**Usage**:

```tsx
<MultimediaComponents.AudioPlayer
  src="/path/to/audio.mp3"
  title="Educational Audio"
  transcript="Audio transcript..."
  onInteraction={(data) => handleInteraction(data)}
/>
```

### 3. Interactive Image

**Features**:

- Zoom functionality
- Clickable annotations
- Accessibility descriptions
- Responsive scaling

**Usage**:

```tsx
<MultimediaComponents.InteractiveImage
  src="/path/to/image.jpg"
  alt="Educational diagram"
  title="Clinical Process Diagram"
  annotations={[
    {
      x: 50, // Percentage from left
      y: 30, // Percentage from top
      title: "Key Point",
      description: "Detailed explanation of this element",
    },
  ]}
  onInteraction={(data) => handleInteraction(data)}
/>
```

## Integration with InteractiveContent

The main `InteractiveContent` component automatically routes to appropriate interactive exercises based on content block configuration:

```tsx
// In content configuration
{
  id: "temperature-demo",
  type: "interactive-demo",
  title: "Temperature Control Exercise",
  content: {
    demoType: "temperature-slider", // Routes to TemperatureSlider
    config: {},
    initialState: {},
    actions: []
  }
}
```

**Supported Demo Types**:

- `temperature-slider`
- `prompt-builder`
- `model-size-simulator`
- `safer-framework`

## Accessibility Implementation

### WCAG AA Compliance

All components implement:

- **Keyboard Navigation**: Full functionality without mouse
- **Screen Reader Support**: Proper ARIA labels and semantic HTML
- **Focus Management**: Logical tab order and visible focus indicators
- **Color Contrast**: Minimum 4.5:1 ratio for normal text
- **Reduced Motion**: Respects `prefers-reduced-motion` setting

### Example Accessibility Features

```tsx
// Proper ARIA labeling
<Slider
  value={temperature}
  onChange={handleTemperatureChange}
  aria-label="Temperature slider"
  aria-valuetext={`Temperature: ${temperature.toFixed(2)} (${getTemperatureLabel(temperature)})`}
/>

// Keyboard event handling
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label="Add persona component to prompt"
>
  Persona
</button>

// Screen reader announcements
<div
  role="status"
  aria-live="polite"
  className="sr-only"
>
  {isProcessing ? "Generating AI response..." : "Response ready"}
</div>
```

## Error Handling Patterns

### Graceful Degradation

```tsx
// Handle missing onInteraction callback
const handleInteraction = useCallback(
  (data: any) => {
    try {
      onInteraction?.(data);
    } catch (error) {
      console.error("Interaction handler error:", error);
      // Continue functioning without breaking
    }
  },
  [onInteraction]
);

// Handle component errors
const [error, setError] = useState<string | null>(null);

if (error) {
  return (
    <div className="error-fallback" role="alert">
      <AlertCircle className="h-5 w-5 text-red-500" />
      <span>Unable to load interactive exercise. Please try refreshing.</span>
      <Button onClick={() => setError(null)}>Retry</Button>
    </div>
  );
}
```

### Loading States

```tsx
// Show loading during async operations
{
  isLoading ? (
    <div className="flex items-center justify-center py-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <RefreshCw
          className="h-5 w-5"
          style={{ color: EducationColors.primary }}
        />
      </motion.div>
      <span className="ml-2">Processing...</span>
    </div>
  ) : (
    <div>{content}</div>
  );
}
```

## Performance Optimization

### Code Splitting

Interactive exercises are loaded dynamically to improve initial page load:

```tsx
const InteractiveExercises = lazy(() => import("./InteractiveExercises"));
const SaferFrameworkDemo = lazy(() => import("./SaferFrameworkDemo"));

// Usage with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <InteractiveExercises.TemperatureSlider onInteraction={handleInteraction} />
</Suspense>;
```

### Memory Management

```tsx
// Cleanup event listeners and timers
useEffect(() => {
  const timer = setTimeout(() => {
    // Animation or delayed action
  }, 1000);

  return () => {
    clearTimeout(timer);
  };
}, []);

// Debounce frequent updates
const debouncedUpdate = useMemo(
  () =>
    debounce((value: number) => {
      onInteraction({ type: "value_changed", value });
    }, 300),
  [onInteraction]
);
```

## Testing Strategy

### Unit Tests

```tsx
// Test user interactions
it("should handle temperature changes", async () => {
  const mockOnInteraction = jest.fn();
  const user = userEvent.setup();

  render(<TemperatureSlider onInteraction={mockOnInteraction} />);

  const slider = screen.getByLabelText("Temperature slider");
  await user.type(slider, "0.8");

  expect(mockOnInteraction).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "temperature_changed",
      temperature: 0.8,
    })
  );
});

// Test accessibility
it("should be keyboard navigable", async () => {
  const user = userEvent.setup();
  render(<PromptBuilder onInteraction={jest.fn()} />);

  await user.tab();
  expect(screen.getByLabelText(/Persona/)).toHaveFocus();

  await user.keyboard("{Enter}");
  // Verify interaction occurred
});
```

### Visual Testing

```tsx
// Playwright visual regression tests
test("temperature slider visual states", async ({ page }) => {
  await page.goto("/education/ai-for-md/foundations/learn");

  // Test different temperature levels
  await page.locator('[aria-label="Temperature slider"]').fill("0.8");
  await expect(page.locator(".temperature-display")).toHaveScreenshot(
    "temperature-creative.png"
  );
});
```

## Extension Guidelines

### Adding New Interactive Exercises

1. **Create Component**: Follow the established patterns in `InteractiveExercises.tsx`
2. **Add Integration**: Update the `renderInteractiveDemoContent` function in `InteractiveContent.tsx`
3. **Implement Tests**: Add comprehensive test coverage
4. **Update Documentation**: Document the new exercise in this guide

### Example New Exercise Structure

```tsx
interface NewExerciseProps {
  onInteraction: (data: any) => void;
  className?: string;
  config?: any; // Exercise-specific configuration
}

export function NewExercise({
  onInteraction,
  className = "",
  config,
}: NewExerciseProps) {
  // State management
  const [exerciseState, setExerciseState] = useState(initialState);

  // Interaction handler
  const handleUserAction = useCallback(
    (actionData: any) => {
      // Update local state
      setExerciseState(newState);

      // Report interaction
      onInteraction({
        type: "new_exercise_action",
        data: actionData,
        timestamp: new Date(),
      });
    },
    [onInteraction]
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Exercise UI */}
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {/* Exercise content */}
      </div>
    </div>
  );
}
```

## Best Practices

### Design Consistency

- Use `EducationColors.primary` for primary actions and highlights
- Apply `TypographyClasses` for consistent text styling
- Implement `FloatingCardPatterns` for container styling
- Follow `AnimationPatterns` for motion design

### User Experience

- Provide immediate visual feedback for all interactions
- Include loading states for async operations
- Implement progressive disclosure for complex interfaces
- Offer clear reset/restart functionality

### Code Quality

- Use TypeScript for type safety
- Implement comprehensive error boundaries
- Follow React hooks best practices
- Maintain consistent naming conventions
- Document all public interfaces with JSDoc

### Performance

- Lazy load heavy components
- Debounce frequent updates
- Optimize re-renders with React.memo and useMemo
- Clean up resources in useEffect cleanup functions

## Migration Notes

### From Original Webapp

The interactive exercises have been enhanced from the original webapp with:

- **Improved Accessibility**: Full WCAG AA compliance
- **Better Error Handling**: Graceful degradation and user feedback
- **Enhanced Animations**: Smooth, purposeful motion design
- **Mobile Optimization**: Touch-friendly interactions
- **Design Integration**: Consistent with SoleMD design system
- **Performance Optimization**: Reduced bundle size and faster loading

### Breaking Changes

- Event handler signatures have been standardized
- CSS classes have been updated to use SoleMD design tokens
- Some component props have been renamed for consistency
- Animation timing has been adjusted for better UX

## Troubleshooting

### Common Issues

1. **Animations not working**: Check Framer Motion installation and imports
2. **Styling inconsistencies**: Verify design pattern imports and CSS variable usage
3. **Accessibility warnings**: Run axe-core tests and fix ARIA issues
4. **Performance issues**: Profile with React DevTools and optimize re-renders

### Debug Tools

```tsx
// Enable debug mode for interaction tracking
const DEBUG_INTERACTIONS = process.env.NODE_ENV === "development";

const handleInteraction = useCallback(
  (data: any) => {
    if (DEBUG_INTERACTIONS) {
      console.log("Interactive Exercise Event:", data);
    }
    onInteraction?.(data);
  },
  [onInteraction]
);
```

## Future Enhancements

### Planned Features

- **Analytics Integration**: Track learning effectiveness
- **Personalization**: Adapt difficulty based on user performance
- **Collaboration**: Multi-user interactive exercises
- **AI Integration**: Dynamic content generation
- **Offline Support**: Progressive Web App capabilities

### Extension Points

- **Custom Themes**: Support for institution-specific branding
- **Plugin System**: Third-party exercise integration
- **Content Management**: Dynamic exercise configuration
- **Assessment Integration**: Formal evaluation and scoring
- **Progress Tracking**: Detailed learning analytics

This guide provides the foundation for maintaining and extending the interactive exercise system while ensuring consistency, accessibility, and performance across the AI for MD education module.
