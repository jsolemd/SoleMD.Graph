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
export function getCurrentPageColor(pathname: string | null): string {
  if (!pathname) return navigationLinks[0]?.color ?? "var(--color-soft-blue)";

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
