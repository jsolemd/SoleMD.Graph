# LessonNavigation Component Documentation

## Overview

The `LessonNavigation` component provides a comprehensive sidebar navigation system for educational modules within the SoleMD platform. It features responsive design, accessibility compliance, and seamless integration with the SoleMD design system.

## Features

### Core Functionality

- **Responsive Design**: Adapts to mobile and desktop viewports with collapsible navigation
- **Progress Tracking**: Visual indicators for lesson completion and progress
- **Accessibility**: Full WCAG AA compliance with keyboard navigation and screen reader support
- **Prerequisites**: Automatic handling of lesson prerequisites and access control
- **Theme Integration**: Uses SoleMD education theme colors and design patterns

### Accessibility Features

- **Keyboard Navigation**: Full arrow key, Home, End, Enter, and Escape key support
- **Screen Reader Support**: Comprehensive ARIA labels and semantic HTML
- **Focus Management**: Proper focus indicators and focus trapping
- **High Contrast**: Maintains proper contrast ratios in all themes
- **Reduced Motion**: Respects user's motion preferences

## Usage

### Basic Usage

```tsx
import LessonNavigation from "./components/LessonNavigation";

function LearningModule() {
  const [currentLessonId, setCurrentLessonId] = useState("lesson-1");

  return (
    <LessonNavigation
      lessons={lessons}
      currentLessonId={currentLessonId}
      onLessonChange={setCurrentLessonId}
      completedLessons={["lesson-1", "lesson-2"]}
    />
  );
}
```

### Advanced Usage with Progress Tracking

```tsx
import LessonNavigation from "./components/LessonNavigation";
import { ProgressManager } from "../lib/progress";

function AdvancedLearningModule() {
  const [currentLessonId, setCurrentLessonId] = useState("lesson-1");
  const [progressManager] = useState(new ProgressManager());
  const [lessonProgress, setLessonProgress] = useState({});

  useEffect(() => {
    // Load progress data
    const loadProgress = async () => {
      const progress = await progressManager.loadProgress("user-1", "module-1");
      if (progress) {
        setLessonProgress(progress.lessonProgress);
      }
    };
    loadProgress();
  }, []);

  return (
    <LessonNavigation
      lessons={lessons}
      currentLessonId={currentLessonId}
      onLessonChange={setCurrentLessonId}
      completedLessons={completedLessons}
      lessonProgress={lessonProgress}
      showDetailedProgress={true}
      showTimeEstimates={true}
      collapsible={true}
    />
  );
}
```

## Props API

### Required Props

| Prop               | Type                         | Description                                     |
| ------------------ | ---------------------------- | ----------------------------------------------- |
| `lessons`          | `Lesson[]`                   | Array of lesson objects with full lesson data   |
| `currentLessonId`  | `string`                     | ID of the currently active lesson               |
| `onLessonChange`   | `(lessonId: string) => void` | Callback function when lesson selection changes |
| `completedLessons` | `string[]`                   | Array of completed lesson IDs                   |

### Optional Props

| Prop                   | Type                             | Default               | Description                                        |
| ---------------------- | -------------------------------- | --------------------- | -------------------------------------------------- |
| `lessonProgress`       | `Record<string, LessonProgress>` | `{}`                  | Detailed progress data for each lesson             |
| `collapsible`          | `boolean`                        | `true`                | Whether navigation should be collapsible on mobile |
| `className`            | `string`                         | `""`                  | Custom CSS class name                              |
| `showDetailedProgress` | `boolean`                        | `false`               | Whether to show detailed progress indicators       |
| `showTimeEstimates`    | `boolean`                        | `true`                | Whether to show estimated time remaining           |
| `ariaLabel`            | `string`                         | `"Lesson navigation"` | Custom aria-label for the navigation               |

## Data Types

### Lesson Interface

```typescript
interface Lesson {
  id: string; // Unique identifier
  title: string; // Lesson title
  description: string; // Brief description
  duration: number; // Duration in minutes
  content: ContentBlock[]; // Lesson content blocks
  prerequisites?: string[]; // Required lesson IDs
  learningObjectives: string[]; // Learning objectives
  order: number; // Display order
  published: boolean; // Whether lesson is published
}
```

### LessonProgress Interface

```typescript
interface LessonProgress {
  lessonId: string; // Lesson identifier
  completed: boolean; // Whether lesson is completed
  active: boolean; // Whether lesson is currently active
  timeSpent: number; // Time spent in minutes
  lastAccessed: Date; // Last access timestamp
  contentProgress: number; // Progress percentage (0-100)
  completedBlocks: string[]; // Completed content block IDs
  assessmentScores?: Record<string, number>; // Assessment scores
}
```

## Styling and Theming

### CSS Variables Used

The component uses the following CSS variables from the SoleMD design system:

```css
--color-fresh-green     /* Education theme color */
--card                  /* Card background color */
--border                /* Border color */
--foreground            /* Text color */
--background            /* Background color */
```

### Custom Styling

You can customize the appearance by overriding CSS classes:

```css
.lesson-navigation-custom {
  /* Custom navigation styles */
}

.lesson-navigation-custom .floating-card {
  /* Custom card styles */
}
```

## Keyboard Navigation

### Supported Keys

| Key               | Action                       |
| ----------------- | ---------------------------- |
| `Arrow Down`      | Navigate to next lesson      |
| `Arrow Up`        | Navigate to previous lesson  |
| `Enter` / `Space` | Select focused lesson        |
| `Home`            | Navigate to first lesson     |
| `End`             | Navigate to last lesson      |
| `Escape`          | Collapse navigation (mobile) |

### Focus Management

- Focus is maintained within the navigation component
- Visual focus indicators are provided for all interactive elements
- Focus is properly restored after navigation changes

## Responsive Behavior

### Desktop (≥768px)

- Full sidebar navigation with all features visible
- Hover effects and animations enabled
- Optional collapse functionality

### Mobile (<768px)

- Automatically collapses on load
- Fixed positioning with overlay
- Touch-optimized interactions
- Simplified layout for better usability

## Accessibility Compliance

### WCAG AA Features

- **Contrast Ratios**: All text meets 4.5:1 minimum contrast ratio
- **Touch Targets**: All interactive elements are at least 44px × 44px
- **Focus Indicators**: 2px solid outline with 2px offset
- **Screen Reader Support**: Comprehensive ARIA labels and descriptions
- **Keyboard Navigation**: Full keyboard accessibility
- **Semantic HTML**: Proper use of navigation, list, and button elements

### ARIA Attributes

```html
<nav role="navigation" aria-label="Lesson navigation">
  <button aria-current="page" aria-describedby="lesson-description">
    <!-- Lesson content -->
  </button>
  <div id="lesson-description" class="sr-only">
    <!-- Screen reader description -->
  </div>
</nav>
```

## Performance Considerations

### Optimizations

- **Lazy Loading**: Progress data is loaded on demand
- **Memoization**: Expensive calculations are memoized
- **Reduced Motion**: Respects user's motion preferences
- **Efficient Rendering**: Only re-renders when necessary

### Bundle Size

- Tree-shakeable imports from Lucide React
- Minimal external dependencies
- Optimized for code splitting

## Testing

### Test Coverage

- Unit tests with React Testing Library
- Accessibility testing with jest-axe
- Keyboard navigation testing
- Responsive behavior testing
- Error boundary testing

### Running Tests

```bash
# Run all tests
npm test LessonNavigation

# Run tests in watch mode
npm test LessonNavigation -- --watch

# Run tests with coverage
npm test LessonNavigation -- --coverage
```

## Integration Examples

### With Progress Manager

```tsx
import { ProgressManager } from "../lib/progress";
import LessonNavigation from "./LessonNavigation";

function IntegratedLearning() {
  const progressManager = new ProgressManager();

  const handleLessonChange = async (lessonId: string) => {
    await progressManager.startLesson(lessonId);
    setCurrentLessonId(lessonId);
  };

  return (
    <LessonNavigation
      lessons={lessons}
      currentLessonId={currentLessonId}
      onLessonChange={handleLessonChange}
      completedLessons={completedLessons}
      lessonProgress={progressData}
    />
  );
}
```

### With Analytics Tracking

```tsx
import { ContentAnalytics } from "../lib/content";

function AnalyticsIntegratedNavigation() {
  const analytics = new ContentAnalytics();

  const handleLessonChange = (lessonId: string) => {
    analytics.trackInteraction({
      type: "navigation",
      data: { lessonId, timestamp: new Date() },
      timestamp: new Date(),
    });

    setCurrentLessonId(lessonId);
  };

  return (
    <LessonNavigation
      lessons={lessons}
      currentLessonId={currentLessonId}
      onLessonChange={handleLessonChange}
      completedLessons={completedLessons}
    />
  );
}
```

## Troubleshooting

### Common Issues

1. **Lessons not showing as accessible**

   - Check that prerequisites are correctly defined
   - Verify completedLessons array includes prerequisite lesson IDs

2. **Progress not updating**

   - Ensure lessonProgress prop is being updated
   - Check that progress data structure matches LessonProgress interface

3. **Mobile navigation not collapsing**

   - Verify collapsible prop is set to true
   - Check viewport width detection in responsive hook

4. **Keyboard navigation not working**
   - Ensure proper focus management
   - Check that onKeyDown handlers are properly attached

### Debug Mode

Enable debug logging by setting localStorage:

```javascript
localStorage.setItem("lesson-navigation-debug", "true");
```

## Future Enhancements

### Planned Features

- **Drag and Drop**: Reorder lessons (admin mode)
- **Bookmarks**: Save favorite lessons
- **Search**: Filter lessons by title or content
- **Themes**: Additional color themes beyond education green
- **Offline Support**: Cache navigation state offline

### Extension Points

- Custom progress indicators
- Additional keyboard shortcuts
- Integration with external LMS systems
- Custom lesson metadata display

## Contributing

When contributing to the LessonNavigation component:

1. **Follow Accessibility Guidelines**: Ensure all changes maintain WCAG AA compliance
2. **Test Thoroughly**: Include unit tests for new features
3. **Document Changes**: Update this documentation for any API changes
4. **Performance**: Consider performance impact of new features
5. **Design System**: Maintain consistency with SoleMD design patterns

## Related Components

- **ProgressTracker**: Displays overall module progress
- **InteractiveContent**: Renders lesson content
- **AssessmentEngine**: Handles lesson assessments
- **ModuleWrapper**: Provides module-level layout and theming
