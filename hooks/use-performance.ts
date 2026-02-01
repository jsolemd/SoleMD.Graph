/**
 * Performance monitoring hook for SoleMD
 * Tracks component render times, memory usage, and performance metrics
 */

import { useEffect, useRef, useState } from "react";
import { debounce } from "@/lib/utils";

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage?: number;
  componentName?: string;
}

interface UsePerformanceOptions {
  componentName?: string;
  enableMemoryTracking?: boolean;
  logToConsole?: boolean;
}

/**
 * Hook to monitor component performance
 * Tracks render times and optionally memory usage
 *
 * @param options - Configuration options
 * @returns Performance metrics and utilities
 */
export function usePerformance(options: UsePerformanceOptions = {}) {
  const {
    componentName = "Unknown Component",
    enableMemoryTracking = false,
    logToConsole = process.env.NODE_ENV === "development",
  } = options;

  const renderStartTime = useRef<number>(0);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    componentName,
  });

  // Start timing on component mount/update
  useEffect(() => {
    renderStartTime.current = performance.now();
  });

  // Measure render completion
  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;

    const newMetrics: PerformanceMetrics = {
      renderTime,
      componentName,
    };

    // Add memory tracking if enabled and available
    if (enableMemoryTracking && "memory" in performance) {
      const memInfo = (performance as any).memory;
      newMetrics.memoryUsage = memInfo.usedJSHeapSize;
    }

    setMetrics(newMetrics);

    // Log to console in development
    if (logToConsole) {
      console.log(
        `🚀 ${componentName} render time: ${renderTime.toFixed(2)}ms`
      );
      if (newMetrics.memoryUsage) {
        console.log(
          `💾 Memory usage: ${(newMetrics.memoryUsage / 1024 / 1024).toFixed(
            2
          )}MB`
        );
      }
    }
  });

  return {
    metrics,
    startTiming: () => {
      renderStartTime.current = performance.now();
    },
    endTiming: () => {
      return performance.now() - renderStartTime.current;
    },
  };
}

/**
 * Hook to track scroll performance
 * Monitors scroll events and provides throttled callbacks
 */
export function useScrollPerformance(callback?: (scrollY: number) => void) {
  const [scrollY, setScrollY] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = debounce(() => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      setIsScrolling(true);

      callback?.(currentScrollY);

      // Clear scrolling state after scroll ends
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    }, 10);

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [callback]);

  return { scrollY, isScrolling };
}

/**
 * Hook to monitor intersection observer performance
 * Optimized for multiple elements with single observer
 */
export function useIntersectionPerformance(
  elements: Element[],
  options?: IntersectionObserverInit
) {
  const [intersections, setIntersections] = useState<Map<Element, boolean>>(
    new Map()
  );
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (elements.length === 0) return;

    // Create single observer for all elements
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setIntersections((prev) => {
          const newMap = new Map(prev);
          entries.forEach((entry) => {
            newMap.set(entry.target, entry.isIntersecting);
          });
          return newMap;
        });
      },
      {
        threshold: 0.1,
        rootMargin: "50px",
        ...options,
      }
    );

    // Observe all elements
    elements.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [elements, options]);

  return intersections;
}

/**
 * Hook to track component mount/unmount performance
 * Useful for debugging memory leaks and component lifecycle issues
 */
export function useLifecyclePerformance(componentName: string) {
  const mountTime = useRef<number>(0);

  useEffect(() => {
    mountTime.current = performance.now();

    if (process.env.NODE_ENV === "development") {
      console.log(
        `🔄 ${componentName} mounted at ${mountTime.current.toFixed(2)}ms`
      );
    }

    return () => {
      const unmountTime = performance.now();
      const lifespan = unmountTime - mountTime.current;

      if (process.env.NODE_ENV === "development") {
        console.log(
          `💀 ${componentName} unmounted after ${lifespan.toFixed(2)}ms`
        );
      }
    };
  }, [componentName]);

  return {
    getMountTime: () => mountTime.current,
    getLifespan: () => performance.now() - mountTime.current,
  };
}
