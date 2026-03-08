"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@mantine/core";
import { ArrowLeft, Home, ChevronRight } from "lucide-react";

/**
 * ModuleWrapper Component
 *
 * A reusable wrapper component for education modules that provides:
 * - Consistent integration with SoleMD header/footer
 * - Education theme (Fresh Green) styling
 * - Breadcrumb navigation hierarchy
 * - Module-specific layout and styling
 * - Progress tracking integration
 *
 * This component serves as the foundation for all education modules,
 * ensuring consistent design and functionality across the platform.
 */

interface BreadcrumbItem {
  label: string;
  href: string;
  current?: boolean;
}

interface ModuleWrapperProps {
  /** The main content to render within the module wrapper */
  children: React.ReactNode;

  /** The title of the current module */
  moduleTitle: string;

  /** The current lesson or section name (optional) */
  currentLesson?: string;

  /** Total number of lessons in the module */
  totalLessons: number;

  /** Number of completed lessons */
  completedLessons: number;

  /** Custom breadcrumb items (optional, will use default if not provided) */
  breadcrumbs?: BreadcrumbItem[];

  /** Whether to show the progress indicator */
  showProgress?: boolean;

  /** Custom back navigation URL (optional) */
  backUrl?: string;

  /** Custom back navigation label (optional) */
  backLabel?: string;

  /** Additional CSS classes for the wrapper */
  className?: string;
}

/**
 * ModuleWrapper Component
 *
 * Provides a consistent wrapper for education modules with SoleMD design system integration.
 * Includes breadcrumb navigation, progress tracking, and theme-aware styling.
 *
 * @param children - The main content to render within the module
 * @param moduleTitle - The title of the current module
 * @param currentLesson - The current lesson or section name
 * @param totalLessons - Total number of lessons in the module
 * @param completedLessons - Number of completed lessons
 * @param breadcrumbs - Custom breadcrumb items
 * @param showProgress - Whether to show the progress indicator
 * @param backUrl - Custom back navigation URL
 * @param backLabel - Custom back navigation label
 * @param className - Additional CSS classes for the wrapper
 */
export default function ModuleWrapper({
  children,
  moduleTitle,
  currentLesson,
  totalLessons,
  completedLessons,
  breadcrumbs,
  showProgress = true,
  backUrl,
  backLabel,
  className = "",
}: ModuleWrapperProps) {
  const pathname = usePathname();

  // Education theme color
  const educationColor = "var(--color-fresh-green)";

  // Calculate progress percentage
  const progressPercentage =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Default breadcrumbs based on current path
  const defaultBreadcrumbs: BreadcrumbItem[] = [
    { label: "Education", href: "/education" },
    { label: "AI for MD", href: "/education/ai-for-md" },
    {
      label: "Foundations",
      href: "/education/ai-for-md/foundations",
      current: true,
    },
  ];

  const activeBreadcrumbs = breadcrumbs || defaultBreadcrumbs;

  // Default back navigation
  const defaultBackUrl = "/education/ai-for-md";
  const defaultBackLabel = "Back to AI for MD";

  const activeBackUrl = backUrl || defaultBackUrl;
  const activeBackLabel = backLabel || defaultBackLabel;

  return (
    <div
      className={`min-h-screen ${className}`}
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Module Header */}
      <section className="pt-24 pb-8" id="module-header">
        <div className="content-container">
          <motion.div
            className="text-flow-natural"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Back Navigation */}
            <div className="mb-6">
              <Link href={activeBackUrl}>
                <Button
                  size="md"
                  leftSection={<ArrowLeft className="h-4 w-4" />}
                  styles={{
                    root: {
                      backgroundColor: educationColor,
                      color: "white",
                      borderRadius: "2rem",
                      fontWeight: 600,
                      padding: "0.75rem 1.5rem",
                      border: "none",
                      "&:hover": {
                        backgroundColor: educationColor,
                        opacity: 0.9,
                        transform: "translateY(-1px)",
                      },
                    },
                  }}
                >
                  {activeBackLabel}
                </Button>
              </Link>
            </div>

            {/* Breadcrumb Navigation */}
            <nav className="mb-6" aria-label="Breadcrumb">
              <div className="flex items-center gap-2 text-sm">
                {activeBreadcrumbs.map((item, index) => (
                  <div key={item.href} className="flex items-center gap-2">
                    {index > 0 && (
                      <ChevronRight
                        className="h-3 w-3"
                        style={{ color: "var(--foreground)", opacity: 0.4 }}
                      />
                    )}
                    {item.current ? (
                      <span
                        className="font-medium"
                        style={{ color: "var(--foreground)", opacity: 0.8 }}
                        aria-current="page"
                      >
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        className="hover:underline transition-colors duration-200"
                        style={{ color: educationColor }}
                      >
                        {item.label}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </nav>

            {/* Module Title Section */}
            <div className="mb-6">
              <h1
                className="text-section-title mb-2"
                style={{ color: "var(--foreground)" }}
              >
                {moduleTitle}
              </h1>

              {currentLesson && (
                <p
                  className="text-body-large"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  {currentLesson}
                </p>
              )}
            </div>

            {/* Progress Indicator */}
            {showProgress && totalLessons > 0 && (
              <motion.div
                className="floating-card p-4"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)", opacity: 0.8 }}
                  >
                    Module Progress
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: educationColor }}
                  >
                    {completedLessons}/{totalLessons} lessons (
                    {progressPercentage}%)
                  </span>
                </div>

                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--border)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: educationColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Module Content */}
      <main className="pb-20">
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* Module Footer (Optional Enhancement Area) */}
      <footer
        className="py-8 border-t"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="content-container">
          <div className="flex items-center justify-between">
            <div
              className="text-sm"
              style={{ color: "var(--foreground)", opacity: 0.6 }}
            >
              Part of the SoleMD Education Platform
            </div>

            {showProgress && (
              <div className="text-sm" style={{ color: educationColor }}>
                {progressPercentage === 100
                  ? "Module Complete!"
                  : `${progressPercentage}% Complete`}
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Type Definitions for Module Wrapper
 *
 * These interfaces define the structure for module configuration
 * and can be extended for future module types.
 */

export interface ModuleConfig {
  /** Unique identifier for the module */
  id: string;

  /** Display title of the module */
  title: string;

  /** Brief description of the module */
  description: string;

  /** Module version for tracking updates */
  version: string;

  /** Author or creator of the module */
  author: string;

  /** Estimated completion time in minutes */
  estimatedDuration: number;

  /** Difficulty level of the module */
  difficulty: "beginner" | "intermediate" | "advanced";

  /** Prerequisites for the module */
  prerequisites: string[];

  /** Learning outcomes and objectives */
  learningOutcomes: string[];

  /** Navigation configuration */
  navigation: {
    backUrl?: string;
    backLabel?: string;
    breadcrumbs?: BreadcrumbItem[];
  };

  /** Theme configuration */
  theme: {
    primaryColor: string;
    accentColor?: string;
    customStyles?: Record<string, any>;
  };
}

export interface ModuleProgress {
  /** User identifier */
  userId: string;

  /** Module identifier */
  moduleId: string;

  /** Current lesson or section */
  currentLesson: string;

  /** Array of completed lesson IDs */
  completedLessons: string[];

  /** Total time spent in minutes */
  timeSpent: number;

  /** Last access timestamp */
  lastAccessed: Date;

  /** Overall completion percentage */
  completionPercentage: number;

  /** Whether the module is completed */
  isCompleted: boolean;
}
