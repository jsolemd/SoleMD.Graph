# ScrollReveal Animation System

A comprehensive scroll-based animation system built with Framer Motion, designed for the SoleMD platform with performance monitoring, accessibility support, and seamless integration with existing components.

## Features

- ✅ **Directional Animations**: Up, down, left, right reveal animations
- ✅ **Staggered Animations**: Configurable delay and duration for child elements
- ✅ **Performance Monitoring**: Real-time frame rate tracking and optimization
- ✅ **Accessibility**: Respects `prefers-reduced-motion` preferences
- ✅ **Intersection Observer**: Configurable threshold and margin settings
- ✅ **Callback Support**: Animation start and complete event handlers
- ✅ **TypeScript**: Full type safety and IntelliSense support
- ✅ **Integration Ready**: Works seamlessly with FloatingCard and other components

## Components

### ScrollReveal

The main component for scroll-triggered animations.

```tsx
import { ScrollReveal } from "@/components/animations";

<ScrollReveal direction="up" delay={0.2} distance={50}>
  <div>Content that animates into view</div>
</ScrollReveal>;
```

### Usage Examples

For comprehensive examples of ScrollReveal usage, refer to the component implementation in the main pages.

## API Reference

### ScrollReveal Props

| Prop                  | Type                                  | Default    | Description                                  |
| --------------------- | ------------------------------------- | ---------- | -------------------------------------------- |
| `children`            | `ReactNode`                           | -          | Content to animate                           |
| `direction`           | `'up' \| 'down' \| 'left' \| 'right'` | `'up'`     | Animation direction                          |
| `delay`               | `number`                              | `0`        | Initial delay (seconds)                      |
| `duration`            | `number`                              | `0.6`      | Animation duration (seconds)                 |
| `distance`            | `number`                              | `50`       | Distance to animate from (pixels)            |
| `stagger`             | `boolean`                             | `false`    | Enable staggered child animations            |
| `staggerDelay`        | `number`                              | `0.1`      | Delay between staggered animations (seconds) |
| `threshold`           | `number`                              | `0.1`      | Intersection threshold (0-1)                 |
| `margin`              | `string`                              | `'-100px'` | Root margin for intersection observer        |
| `once`                | `boolean`                             | `true`     | Animation triggers only once                 |
| `className`           | `string`                              | `''`       | Additional CSS classes                       |
| `onAnimationStart`    | `() => void`                          | -          | Callback when animation starts               |
| `onAnimationComplete` | `() => void`                          | -          | Callback when animation completes            |

### Performance Hooks

#### useScrollPerformance

Monitors animation performance in real-time.

```tsx
import { useScrollPerformance } from "@/hooks/use-scroll-performance";

const metrics = useScrollPerformance(true);
// Returns: { frameRate, averageFrameTime, droppedFrames, isPerformant }
```

#### getOptimalAnimationSettings

Returns optimized settings based on device performance.

```tsx
import { getOptimalAnimationSettings } from "@/hooks/use-scroll-performance";

const settings = getOptimalAnimationSettings(metrics);
// Returns: { duration, distance, staggerDelay, shouldSimplify }
```

## Usage Examples

### Basic Animation

```tsx
<ScrollReveal direction="up">
  <Card>
    <Text>This card slides up when it enters the viewport</Text>
  </Card>
</ScrollReveal>
```

### Staggered Animation

```tsx
<ScrollReveal stagger={true} staggerDelay={0.1}>
  {items.map((item, index) => (
    <Card key={index}>
      <Text>{item.title}</Text>
    </Card>
  ))}
</ScrollReveal>
```

### Performance Adaptive

```tsx
const metrics = useScrollPerformance(true);
const settings = getOptimalAnimationSettings(metrics);

<ScrollReveal
  duration={settings.duration}
  distance={settings.distance}
  staggerDelay={settings.staggerDelay}
>
  <Card>Adaptive animation based on device performance</Card>
</ScrollReveal>;
```

### Integration with FloatingCard

```tsx
<ScrollReveal direction="up" delay={0.2}>
  <FloatingCard variant="innovation" interactive>
    <Title>Innovation Card</Title>
    <Text>This combines scroll reveal with floating card animations</Text>
  </FloatingCard>
</ScrollReveal>
```

### Custom Callbacks

```tsx
<ScrollReveal
  onAnimationStart={() => console.log("Animation started")}
  onAnimationComplete={() => console.log("Animation completed")}
>
  <Card>Card with lifecycle callbacks</Card>
</ScrollReveal>
```

### Multiple Triggers

```tsx
<ScrollReveal once={false} threshold={0.8}>
  <Card>This animates every time 80% becomes visible</Card>
</ScrollReveal>
```

## Performance Considerations

### Automatic Optimization

The system automatically adapts to device performance:

- **High Performance**: Full animations with standard settings
- **Low Performance**: Reduced duration, distance, and stagger delays
- **Reduced Motion**: Minimal opacity-only animations

### Performance Monitoring

Real-time metrics tracking:

```tsx
const metrics = useScrollPerformance(true);

// Monitor frame rate
console.log(`Current FPS: ${metrics.frameRate}`);

// Check performance health
if (!metrics.isPerformant) {
  console.warn("Animation performance degraded");
}
```

### Best Practices

1. **Use `once={true}`** for most animations to prevent repeated triggers
2. **Limit stagger count** to avoid performance issues with many elements
3. **Monitor performance** in production with the performance hooks
4. **Test on low-end devices** to ensure smooth animations
5. **Respect reduced motion** preferences automatically handled

## Accessibility

### Reduced Motion Support

Automatically respects `prefers-reduced-motion`:

- Reduces animation duration to 0.2s
- Minimizes distance to prevent motion sickness
- Maintains opacity transitions for visual feedback

### Focus Management

- Preserves focus order during animations
- Maintains keyboard navigation
- Supports screen readers with semantic markup

### ARIA Compliance

```tsx
<ScrollReveal>
  <Card role="article" aria-label="Animated content">
    <Text>Accessible animated content</Text>
  </Card>
</ScrollReveal>
```

## Integration with SoleMD Design System

### Brand Colors

Works seamlessly with SoleMD color system:

```tsx
<ScrollReveal direction="up">
  <FloatingCard variant="innovation">
    <div className="bg-golden-yellow/20">Innovation content</div>
  </FloatingCard>
</ScrollReveal>
```

### Theme Support

Automatically adapts to light/dark themes through CSS custom properties.

### Component Integration

Tested and optimized for:

- ✅ FloatingCard
- ✅ Mantine components
- ✅ Tailwind CSS v4
- ✅ Custom UI components

## Testing

### Unit Tests

```bash
npm test scroll-reveal.test.tsx
```

### Performance Tests

```bash
npm test scroll-performance.test.ts
```

### Integration Tests

```bash
npm test scroll-reveal-integration.test.tsx
```

### Test Coverage

- ✅ All animation directions
- ✅ Staggered animations
- ✅ Performance monitoring
- ✅ Accessibility features
- ✅ Component integration
- ✅ Theme compatibility
- ✅ Callback functionality

## Browser Support

- ✅ Chrome 88+
- ✅ Firefox 87+
- ✅ Safari 14+
- ✅ Edge 88+

Uses Intersection Observer API with automatic fallbacks.

## Performance Benchmarks

- **Initialization**: < 10ms
- **Memory Usage**: Stable with proper cleanup
- **Frame Rate**: Maintains 60fps on modern devices
- **Bundle Size**: Minimal impact with tree-shaking

## Troubleshooting

### Common Issues

1. **Animations not triggering**: Check `threshold` and `margin` settings
2. **Performance issues**: Enable performance monitoring and use adaptive settings
3. **Stagger not working**: Ensure children are passed as an array
4. **Reduced motion not working**: Verify browser supports `prefers-reduced-motion`

### Debug Mode

Enable performance monitoring to debug issues:

```tsx
const metrics = useScrollPerformance(true);
console.log("Performance metrics:", metrics);
```

## Contributing

When adding new features:

1. Add comprehensive tests
2. Update TypeScript types
3. Document new props/features
4. Test accessibility compliance
5. Verify performance impact

## License

Part of the SoleMD platform - see project license.
