/**
 * Optimized Layout Component for SoleMD
 * Provides performance-optimized layout with error boundaries and monitoring
 */

"use client";

import React, { Suspense } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { usePerformance, useScrollPerformance } from "@/hooks/use-performance";
import { motion, AnimatePresence } from "framer-motion";
// LoadingAnimation removed - using simpler loading states

interface OptimizedLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  sidebar?: React.ReactNode;
  enablePerformanceMonitoring?: boolean;
  className?: string;
}

/**
 * Loading fallback component with SoleMD branding
 */
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div
        className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
        style={{ borderColor: "var(--color-soft-lavender)" }}
      />
      <p style={{ color: "var(--foreground)", opacity: 0.7 }}>
        Loading SoleMD...
      </p>
    </div>
  </div>
);

/**
 * Optimized layout component with performance monitoring and error boundaries
 */
export function OptimizedLayout({
  children,
  header,
  footer,
  sidebar,
  enablePerformanceMonitoring = process.env.NODE_ENV === "development",
  className = "",
}: OptimizedLayoutProps) {
  // Performance monitoring
  const { metrics } = usePerformance({
    componentName: "OptimizedLayout",
    enableMemoryTracking: enablePerformanceMonitoring,
    logToConsole: enablePerformanceMonitoring,
  });

  // Scroll performance monitoring
  const { scrollY, isScrolling } = useScrollPerformance();

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log error in development
        if (process.env.NODE_ENV === "development") {
          console.error("Layout Error:", error, errorInfo);
        }
        // In production, send to error reporting service
      }}
    >
      <div
        className={`min-h-screen flex flex-col ${className}`}
        style={{ backgroundColor: "var(--background)" }}
      >
        {/* Header Section */}
        {header && (
          <ErrorBoundary
            fallback={
              <div className="h-16 bg-red-50 border-b border-red-200 flex items-center justify-center">
                <span className="text-red-600 text-sm">Header Error</span>
              </div>
            }
          >
            <Suspense
              fallback={<div className="h-16 animate-pulse bg-gray-100" />}
            >
              <motion.header
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={`sticky top-0 z-50 transition-all duration-300 ${
                  isScrolling ? "backdrop-blur-md" : ""
                }`}
              >
                {header}
              </motion.header>
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1">
          {/* Sidebar Section */}
          {sidebar && (
            <ErrorBoundary
              fallback={
                <div className="w-64 bg-red-50 border-r border-red-200 flex items-center justify-center">
                  <span className="text-red-600 text-sm">Sidebar Error</span>
                </div>
              }
            >
              <Suspense
                fallback={<div className="w-64 animate-pulse bg-gray-100" />}
              >
                <motion.aside
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="hidden lg:block w-64 border-r border-gray-200 dark:border-gray-700"
                >
                  {sidebar}
                </motion.aside>
              </Suspense>
            </ErrorBoundary>
          )}

          {/* Main Content */}
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="flex-1 overflow-x-hidden"
                style={{
                  minHeight: "calc(100vh - 4rem)", // Account for header height
                }}
              >
                <AnimatePresence mode="wait">{children}</AnimatePresence>
              </motion.main>
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Footer Section */}
        {footer && (
          <ErrorBoundary
            fallback={
              <div className="h-16 bg-red-50 border-t border-red-200 flex items-center justify-center">
                <span className="text-red-600 text-sm">Footer Error</span>
              </div>
            }
          >
            <Suspense
              fallback={<div className="h-16 animate-pulse bg-gray-100" />}
            >
              <motion.footer
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="border-t border-gray-200 dark:border-gray-700"
              >
                {footer}
              </motion.footer>
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Performance Monitor (Development Only) */}
        {enablePerformanceMonitoring &&
          process.env.NODE_ENV === "development" && (
            <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 rounded text-xs font-mono z-50">
              <div>Render: {metrics.renderTime.toFixed(2)}ms</div>
              <div>Scroll: {scrollY}px</div>
              {metrics.memoryUsage && (
                <div>
                  Memory: {(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
                </div>
              )}
            </div>
          )}
      </div>
    </ErrorBoundary>
  );
}

/**
 * Layout variants for different page types
 */
export const LayoutVariants = {
  /**
   * Standard layout with header and footer
   */
  Standard: ({
    children,
    ...props
  }: Omit<OptimizedLayoutProps, "header" | "footer">) => (
    <OptimizedLayout
      header={<div>Header Placeholder</div>}
      footer={<div>Footer Placeholder</div>}
      {...props}
    >
      {children}
    </OptimizedLayout>
  ),

  /**
   * Full-screen layout without header/footer
   */
  Fullscreen: ({
    children,
    ...props
  }: Omit<OptimizedLayoutProps, "header" | "footer">) => (
    <OptimizedLayout {...props}>{children}</OptimizedLayout>
  ),

  /**
   * Dashboard layout with sidebar
   */
  Dashboard: ({ children, ...props }: OptimizedLayoutProps) => (
    <OptimizedLayout
      header={<div>Dashboard Header</div>}
      sidebar={<div>Dashboard Sidebar</div>}
      footer={<div>Dashboard Footer</div>}
      {...props}
    >
      {children}
    </OptimizedLayout>
  ),
};

export default OptimizedLayout;
