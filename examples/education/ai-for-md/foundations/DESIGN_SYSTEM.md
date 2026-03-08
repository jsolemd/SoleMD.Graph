# Education Module Design System Integration

## Overview

This document provides comprehensive guidelines for integrating education modules with the SoleMD design system. It establishes standardized patterns, components, and utilities that ensure consistency across all education modules while maintaining the platform's visual identity.

## Table of Contents

1. [Typography System](#typography-system)
2. [Color System](#color-system)
3. [Layout Patterns](#layout-patterns)
4. [Floating Card System](#floating-card-system)
5. [Animation Patterns](#animation-patterns)
6. [Icon Usage](#icon-usage)
7. [Responsive Design](#responsive-design)
8. [Accessibility Guidelines](#accessibility-guidelines)
9. [Component Examples](#component-examples)
10. [Best Practices](#best-practices)

---

## Typography System

### Standardized Classes

The education modules use standardized typography classes that align with the SoleMD design system:

```tsx
import { TypographyClasses } from './lib/design-patterns';

// Hero and Main Titles
<h1 className={TypographyClasses.heroTitle}>
  AI for MD <span style={{ color: educationColor }}>Foundations</span>
</h1>

// Section Headings
<h2 className={TypographyClasses.sectionTitle}>
  Learning Objectives
</h2>

// Card Titles
<h3 className={TypographyClasses.cardTitle}>
  Lesson 1: Introduction
</h3>

// Body Text
<p className={TypographyClasses.bodyLarge}>
  Main content text
</p>

<p className={TypographyClasses.bodySmall}>
  Supporting text and descriptions
</p>
```

### Text Flow Prevention

**Critical**: Always apply the `text-flow-natural` class to prevent word-by-word text stacking:

```tsx
<div className="text-flow-natural">
  <h1 className="text-hero-title">Your Title Here</h1>
  <p className="text-body-large">Your content here</p>
</div>
```

### Typography Utilities

```tsx
import { TypographyUtils } from "./lib/design-patterns";

// Get specific typography class
const titleClass = TypographyUtils.getClass("heroTitle");

// Combine multiple classes
const combinedClass = TypographyUtils.combine("cardTitle", "textFlowNatural");

// Programmatically prevent text stacking
TypographyUtils.preventTextStacking(element);
```

---

## Color System

### Education Color Palette

The education modules use the Fresh Green theme with CSS variables for automatic light/dark mode support:

```tsx
import { EducationColors, ColorUtils } from "./lib/design-patterns";

// Primary education color
const primaryColor = EducationColors.primary; // var(--color-fresh-green)

// Theme-aware colors
const backgroundColor = EducationColors.background; // var(--background)
const textColor = EducationColors.foreground; // var(--foreground)
const cardColor = EducationColors.card; // var(--card)
const borderColor = EducationColors.border; // var(--border)

// Opacity variants
const subtleText = {
  color: textColor,
  opacity: EducationColors.opacity.subtle,
};
const mutedText = { color: textColor, opacity: EducationColors.opacity.muted };
```

### Color Usage Examples

```tsx
// Icon with education theme
<BrainCircuit
  className="h-6 w-6"
  style={{ color: EducationColors.primary }}
/>

// Background with opacity
<div style={{ backgroundColor: `${EducationColors.primary}15` }}>
  Highlighted content
</div>

// Using color utilities
const iconStyle = ColorUtils.createColorStyle(EducationColors.primary);
const backgroundStyle = ColorUtils.createBackgroundStyle(EducationColors.primary, '20');
```

---

## Layout Patterns

### Container System

```tsx
import { ContainerClasses, LayoutUtils } from './lib/design-patterns';

// Standard content container
<div className={ContainerClasses.contentContainer}>
  <div className={ContainerClasses.gridTwoColumn}>
    {/* Two-column grid content */}
  </div>
</div>

// Hero section
<section className={ContainerClasses.heroPadding}>
  <div className={ContainerClasses.heroContainer}>
    {/* Hero content */}
  </div>
</section>

// Section with standard padding
<section className={ContainerClasses.sectionPadding}>
  {/* Section content */}
</section>
```

### Responsive Grids

```tsx
// Two-column responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16">
  {/* Grid items */}
</div>

// Three-column responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 lg:gap-16">
  {/* Grid items */}
</div>

// Using utilities
const gridClass = LayoutUtils.createGridClass(3);
const sectionProps = LayoutUtils.createSectionWrapper('lesson-content');
```

---

## Floating Card System

### Basic Floating Card

```tsx
import { FloatingCardPatterns, CardUtils } from './lib/design-patterns';

// Standard floating card
<div
  className="floating-card p-8"
  style={{
    backgroundColor: "var(--card)",
    borderColor: "var(--border)",
  }}
>
  Card content
</div>

// Interactive card with hover effects
<motion.div
  className="floating-card p-8"
  style={{
    backgroundColor: "var(--card)",
    borderColor: "var(--border)",
  }}
  whileHover={{
    y: -4,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
  }}
>
  Interactive card content
</motion.div>
```

### Highlighted Cards

```tsx
// Education-themed highlighted card
<div
  className="floating-card p-8"
  style={{
    backgroundColor: `${EducationColors.primary}15`,
    borderColor: `${EducationColors.primary}30`,
  }}
>
  Highlighted content
</div>;

// Using card utilities
const cardProps = CardUtils.createEducationCard(true); // highlighted
const interactiveProps = CardUtils.createInteractiveCard();
```

---

## Animation Patterns

### Standard Animations

```tsx
import { AnimationPatterns, AnimationUtils } from "./lib/design-patterns";

// Standard entrance animation
<motion.div
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: "easeOut" }}
>
  Content
</motion.div>;

// Staggered entrance for multiple items
{
  items.map((item, index) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.1 * index, ease: "easeOut" }}
    >
      {item.content}
    </motion.div>
  ));
}

// Card hover effect
<motion.div
  whileHover={{
    y: -4,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  }}
>
  Hoverable card
</motion.div>;
```

### Progress Bar Animation

```tsx
// Animated progress bar
<div
  className="w-full h-3 rounded-full overflow-hidden"
  style={{ backgroundColor: "var(--border)" }}
>
  <motion.div
    className="h-full rounded-full"
    style={{ backgroundColor: EducationColors.primary }}
    initial={{ width: 0 }}
    animate={{ width: `${progressPercentage}%` }}
    transition={{ duration: 1, ease: "easeOut" }}
  />
</div>
```

### Using Animation Utilities

```tsx
// Get predefined animation props
const entranceProps = AnimationUtils.getAnimationProps("entrance");
const staggeredProps = AnimationUtils.createStaggered(index);
const conditionalProps = AnimationUtils.createConditionalAnimation(
  isVisible,
  "fadeInLeft"
);
```

---

## Icon Usage

### Icon Patterns

```tsx
import { IconPatterns, IconUtils } from './lib/design-patterns';

// Standard icon sizes
<BrainCircuit className={IconUtils.getSize('medium')} />

// Icon in circular container
<div
  className="w-10 h-10 rounded-full flex items-center justify-center"
  style={{ backgroundColor: `${EducationColors.primary}20` }}
>
  <BrainCircuit
    className="h-5 w-5"
    style={{ color: EducationColors.primary }}
  />
</div>

// Icon badge
<div
  className="w-6 h-6 rounded-full flex items-center justify-center"
  style={{ backgroundColor: EducationColors.primary }}
>
  <CheckCircle className="h-3 w-3 text-white" />
</div>
```

### Dynamic Icon Coloring

```tsx
// Icon that adapts to current page color
const getCurrentPageColor = (pathname: string) => {
  // Implementation from design system
  return "var(--color-fresh-green)"; // For education pages
};

<div
  className="w-12 h-12 rounded-xl flex items-center justify-center"
  style={{ backgroundColor: getCurrentPageColor(pathname) }}
>
  <Icon className="h-6 w-6 text-white" />
</div>;
```

---

## Responsive Design

### Breakpoint Usage

```tsx
import { ResponsivePatterns } from './lib/design-patterns';

// Responsive visibility
<div className="block sm:hidden">Mobile only</div>
<div className="hidden sm:block lg:hidden">Tablet only</div>
<div className="hidden lg:block">Desktop only</div>

// Responsive text sizes
<h1 className="text-4xl sm:text-5xl lg:text-6xl">
  Responsive title
</h1>

// Responsive spacing
<section className="py-12 sm:py-16 lg:py-20">
  Responsive section
</section>
```

### Mobile-First Approach

```tsx
// Always design mobile-first, then enhance for larger screens
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
  {/* Responsive grid */}
</div>

// Responsive padding
<div className="p-4 sm:p-6 lg:p-8">
  {/* Content with responsive padding */}
</div>
```

---

## Accessibility Guidelines

### Focus Management

```tsx
import { AccessibilityPatterns } from "./lib/design-patterns";

// Proper focus styling
<button
  onFocus={(e) => {
    e.currentTarget.style.outline = AccessibilityPatterns.focus.outline;
    e.currentTarget.style.outlineOffset =
      AccessibilityPatterns.focus.outlineOffset;
  }}
  onBlur={(e) => {
    e.currentTarget.style.outline = "2px solid transparent";
  }}
>
  Accessible button
</button>;
```

### ARIA Patterns

```tsx
// Progress bar with proper ARIA
<div
  role="progressbar"
  aria-valuenow={completedLessons}
  aria-valuemin={0}
  aria-valuemax={totalLessons}
  aria-label={`Progress: ${completedLessons} of ${totalLessons} lessons completed`}
>
  <div className="progress-bar" />
</div>

// Navigation with proper ARIA
<nav role="navigation" aria-label="Module navigation">
  {/* Navigation items */}
</nav>
```

### Screen Reader Support

```tsx
// Screen reader only text
<span className="sr-only">
  Additional context for screen readers
</span>

// Skip links
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4">
  Skip to main content
</a>
```

---

## Component Examples

### Complete Lesson Card Example

```tsx
import { motion } from "framer-motion";
import { CheckCircle, Clock, Play } from "lucide-react";
import {
  EducationColors,
  TypographyClasses,
  AnimationUtils,
} from "./lib/design-patterns";

interface LessonCardProps {
  lesson: {
    id: string;
    title: string;
    description: string;
    duration: number;
    completed: boolean;
  };
  onStart: (id: string) => void;
  index: number;
}

export function LessonCard({ lesson, onStart, index }: LessonCardProps) {
  const animationProps = AnimationUtils.createStaggered(index);

  return (
    <motion.div
      className="h-full"
      {...animationProps}
      whileHover={{
        y: -4,
        transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
      }}
    >
      <div
        className="floating-card p-8 h-full text-flow-natural"
        style={{
          backgroundColor: "var(--card)",
          borderColor: lesson.completed
            ? `${EducationColors.primary}30`
            : "var(--border)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            className={TypographyClasses.cardTitle}
            style={{ color: "var(--foreground)" }}
          >
            {lesson.title}
          </h3>

          {lesson.completed ? (
            <CheckCircle
              className="h-5 w-5"
              style={{ color: EducationColors.primary }}
            />
          ) : (
            <Play
              className="h-5 w-5"
              style={{ color: EducationColors.primary }}
            />
          )}
        </div>

        {/* Content */}
        <p
          className={TypographyClasses.bodySmall}
          style={{ color: "var(--foreground)", opacity: 0.7 }}
        >
          {lesson.description}
        </p>

        {/* Duration */}
        <div className="flex items-center gap-2 mt-4 mb-6">
          <Clock
            className="h-4 w-4"
            style={{ color: "var(--foreground)", opacity: 0.5 }}
          />
          <span
            className="text-sm"
            style={{ color: "var(--foreground)", opacity: 0.5 }}
          >
            {lesson.duration} min
          </span>
        </div>

        {/* Action Button */}
        <motion.button
          className="w-full py-3 px-4 rounded-lg font-medium"
          style={{
            backgroundColor: lesson.completed
              ? "transparent"
              : EducationColors.primary,
            color: lesson.completed ? EducationColors.primary : "white",
            border: lesson.completed
              ? `2px solid ${EducationColors.primary}`
              : "none",
          }}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onStart(lesson.id)}
        >
          {lesson.completed ? "Review Lesson" : "Start Lesson"}
        </motion.button>
      </div>
    </motion.div>
  );
}
```

### Progress Indicator Example

```tsx
import { motion } from "framer-motion";
import { Trophy, Target } from "lucide-react";
import { EducationColors, TypographyClasses } from "./lib/design-patterns";

interface ProgressIndicatorProps {
  completedLessons: number;
  totalLessons: number;
  moduleTitle: string;
}

export function ProgressIndicator({
  completedLessons,
  totalLessons,
  moduleTitle,
}: ProgressIndicatorProps) {
  const progressPercentage = Math.round(
    (completedLessons / totalLessons) * 100
  );

  return (
    <motion.div
      className="floating-card p-6 text-flow-natural"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3
          className={TypographyClasses.cardTitle}
          style={{ color: "var(--foreground)" }}
        >
          {moduleTitle} Progress
        </h3>

        {progressPercentage === 100 && (
          <Trophy
            className="h-6 w-6"
            style={{ color: EducationColors.primary }}
          />
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--foreground)", opacity: 0.8 }}
          >
            Overall Progress
          </span>
          <span
            className="text-sm font-bold"
            style={{ color: EducationColors.primary }}
          >
            {completedLessons}/{totalLessons} lessons ({progressPercentage}%)
          </span>
        </div>

        <div
          className="w-full h-3 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--border)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: EducationColors.primary }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ backgroundColor: `${EducationColors.primary}20` }}
        >
          <Target
            className="h-6 w-6"
            style={{ color: EducationColors.primary }}
          />
        </div>
        <div
          className="text-2xl font-bold"
          style={{ color: "var(--foreground)" }}
        >
          {progressPercentage}%
        </div>
        <div
          className="text-sm"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          Complete
        </div>
      </div>
    </motion.div>
  );
}
```

---

## Best Practices

### 1. Always Use CSS Variables

```tsx
// ✅ Correct - Uses CSS variables for theme support
style={{ color: "var(--foreground)" }}

// ❌ Incorrect - Hard-coded colors
style={{ color: "#000000" }}
```

### 2. Apply Text Flow Prevention

```tsx
// ✅ Correct - Prevents word stacking
<div className="text-flow-natural">
  <h1 className="text-hero-title">Your Title</h1>
</div>

// ❌ Incorrect - May cause word stacking
<h1 className="text-hero-title">Your Title</h1>
```

### 3. Use Consistent Animation Patterns

```tsx
// ✅ Correct - Standard entrance animation
<motion.div
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8, ease: "easeOut" }}
>

// ❌ Incorrect - Inconsistent animation
<motion.div
  initial={{ opacity: 0, scale: 0.5 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.3, ease: "linear" }}
>
```

### 4. Maintain Accessibility

```tsx
// ✅ Correct - Proper ARIA labels
<button
  aria-label="Start lesson 1"
  onClick={() => startLesson('lesson-1')}
>
  Start Lesson
</button>

// ❌ Incorrect - Missing accessibility
<div onClick={() => startLesson('lesson-1')}>
  Start Lesson
</div>
```

### 5. Use Responsive Design

```tsx
// ✅ Correct - Mobile-first responsive
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">

// ❌ Incorrect - Desktop-first or fixed layout
<div className="grid grid-cols-2 gap-8">
```

### 6. Implement Proper Error Boundaries

```tsx
// ✅ Correct - Error boundary for module components
<ErrorBoundary fallback={<ModuleErrorFallback />}>
  <LessonContent />
</ErrorBoundary>
```

### 7. Optimize Performance

```tsx
// ✅ Correct - Lazy loading for heavy components
const AssessmentEngine = lazy(() => import("./AssessmentEngine"));

// ✅ Correct - Memoization for expensive calculations
const progressPercentage = useMemo(
  () => Math.round((completedLessons / totalLessons) * 100),
  [completedLessons, totalLessons]
);
```

---

## Conclusion

This design system integration ensures that all education modules maintain consistency with the SoleMD platform while providing an excellent learning experience. By following these patterns and guidelines, developers can create education modules that are:

- **Visually Consistent**: Aligned with SoleMD design principles
- **Accessible**: WCAG AA compliant with proper ARIA support
- **Responsive**: Works seamlessly across all device sizes
- **Performant**: Optimized for smooth animations and fast loading
- **Maintainable**: Uses standardized patterns and utilities

For questions or clarifications about these patterns, refer to the main SoleMD design system documentation or consult with the design team.
