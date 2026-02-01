import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes with proper conflict resolution
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 *
 * @param inputs - Array of class values (strings, objects, arrays)
 * @returns Merged and deduplicated class string
 *
 * @example
 * cn("px-4 py-2", "bg-blue-500", { "text-white": true })
 * // Returns: "px-4 py-2 bg-blue-500 text-white"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Debounce function for performance optimization
 * Delays function execution until after specified delay
 *
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function for performance optimization
 * Limits function execution to once per specified interval
 *
 * @param func - Function to throttle
 * @param interval - Interval in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * Format number with proper locale support
 *
 * @param value - Number to format
 * @param options - Intl.NumberFormat options
 * @returns Formatted number string
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat("en-US", options).format(value);
}

/**
 * Format date with proper locale support
 *
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", options).format(new Date(date));
}

/**
 * Check if code is running in browser environment
 * Useful for SSR/hydration checks
 */
export const isBrowser = typeof window !== "undefined";

/**
 * Safe localStorage access with fallback
 * Handles SSR and localStorage unavailability
 */
export const storage = {
  get: (key: string): string | null => {
    if (!isBrowser) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    if (!isBrowser) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  },
  remove: (key: string): void => {
    if (!isBrowser) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  },
};

/**
 * Generate unique ID for components
 * Useful for accessibility and form elements
 */
export function generateId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamp number between min and max values
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 *
 * @param value - Value to check
 * @returns True if value is empty
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// ============================================================================
// Dynamic Page Coloring System
// ============================================================================

/**
 * Interface for navigation link configuration
 * Defines the structure for page-to-color mapping used throughout the SoleMD platform
 *
 * This interface supports the dynamic page-based coloring system that adapts
 * header/footer elements, card icons, and accent colors based on the current page context.
 *
 * @example
 * ```tsx
 * const link: NavigationLink = {
 *   link: "/about",
 *   label: "About",
 *   color: "var(--color-soft-lavender)"
 * };
 * ```
 */
export interface NavigationLink {
  /** The route path for the page (e.g., "/", "/about", "/research") */
  link: string;
  /** Display label for the navigation link */
  label: string;
  /** CSS variable or color value for the page theme (e.g., "var(--color-soft-blue)") */
  color: string;
}

/**
 * Configuration for all navigation links and their associated theme colors
 * This defines the page-to-color mapping for the entire SoleMD application
 *
 * Each page has a unique theme color that represents its content category:
 * - Home: Soft Blue (primary brand color)
 * - About: Soft Lavender (synthesizer identity)
 * - Research: Warm Coral (engagement/discovery)
 * - Education: Fresh Green (learning/growth)
 * - Wiki: Golden Yellow (innovation/knowledge)
 *
 * These colors are applied dynamically to:
 * - Header/footer logo backgrounds
 * - "MD" text in the SoleMD logo
 * - Card icons and accent elements
 * - Navigation active states
 * - CTA buttons and interactive elements
 *
 * @example
 * ```tsx
 * // Use in components that need page-aware styling
 * const pathname = usePathname();
 * const currentPageColor = getCurrentPageColor(pathname);
 *
 * <div style={{ backgroundColor: currentPageColor }}>
 *   Page-themed element
 * </div>
 * ```
 */
export const navigationLinks: NavigationLink[] = [
  {
    link: "/",
    label: "Home",
    color: "var(--color-soft-blue)",
  },
  {
    link: "/about",
    label: "About",
    color: "var(--color-soft-lavender)",
  },
  {
    link: "/research",
    label: "Research",
    color: "var(--color-warm-coral)",
  },
  {
    link: "/education",
    label: "Education",
    color: "var(--color-fresh-green)",
  },
  {
    link: "/wiki",
    label: "Wiki",
    color: "var(--color-golden-yellow)",
  },
];

/**
 * Get the theme color for the current page based on pathname
 * This function enables dynamic page-based coloring throughout the application
 *
 * Supports both exact matches and subpath matching for section-based coloring:
 * - Exact matches: "/", "/about", "/research", "/education", "/wiki"
 * - Subpath matches: "/education/*" uses education color, "/research/*" uses research color, etc.
 *
 * @param pathname - The current page pathname (from usePathname() or router)
 * @returns CSS variable string for the current page's theme color
 *
 * @example
 * ```tsx
 * const pathname = usePathname();
 * const pageColor = getCurrentPageColor(pathname);
 *
 * // Use in component styling
 * <div style={{ backgroundColor: pageColor }}>
 *   Page-themed content
 * </div>
 * ```
 */
export function getCurrentPageColor(pathname: string): string {
  // First try exact match
  const exactMatch = navigationLinks.find((link) => link.link === pathname);
  if (exactMatch) {
    return exactMatch.color;
  }

  // Then try subpath matching for section-based coloring
  const subpathMatch = navigationLinks.find((link) => {
    // Skip home page for subpath matching
    if (link.link === "/") return false;
    return pathname.startsWith(link.link + "/");
  });

  if (subpathMatch) {
    return subpathMatch.color;
  }

  // Default fallback
  return "var(--color-soft-blue)";
}

/**
 * Get navigation link configuration by pathname
 * Useful when you need both the color and other link properties
 *
 * @param pathname - The current page pathname
 * @returns NavigationLink object or undefined if not found
 */
export function getNavigationLink(
  pathname: string
): NavigationLink | undefined {
  return navigationLinks.find((link) => link.link === pathname);
}

/**
 * Check if a given pathname is a valid route in the navigation
 *
 * @param pathname - The pathname to validate
 * @returns True if the pathname exists in navigation links
 */
export function isValidRoute(pathname: string): boolean {
  return navigationLinks.some((link) => link.link === pathname);
}
