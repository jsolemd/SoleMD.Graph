"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

/**
 * Props for the ScrollIndicator component
 */
export interface ScrollIndicatorProps {
  /** Show only on specific pages */
  showOnPages?: string[];
  /** Hide after user scrolls this many pixels */
  hideAfterScroll?: number;
  /** Size of the indicator */
  size?: "sm" | "md" | "lg";
}

/**
 * ScrollIndicator component with Lottie animation
 *
 * Features:
 * - Dynamically positioned at bottom of viewport
 * - Mobile optimized with proper safe areas
 * - Auto-hides after user starts scrolling
 * - Uses Lottie animation for smooth scroll indication
 * - Responsive sizing for different screen sizes
 *
 * @example
 * ```tsx
 * <ScrollIndicator
 *   showOnPages={["/"]}
 *   hideAfterScroll={100}
 *   size="md"
 * />
 * ```
 */
export function ScrollIndicator({
  showOnPages = ["/"],
  hideAfterScroll = 150,
  size = "md",
}: ScrollIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [initialPosition, setInitialPosition] = useState(0);

  // Size configurations
  const sizeConfig = {
    sm: { width: 40, height: 60, bottom: 120 },
    md: { width: 50, height: 75, bottom: 140 },
    lg: { width: 60, height: 90, bottom: 160 },
  };

  const config = sizeConfig[size];

  useEffect(() => {
    // Set current path
    setCurrentPath(window.location.pathname);

    // Check if we should show on current page
    const shouldShow = showOnPages.includes(window.location.pathname);
    if (!shouldShow) return;

    // Calculate initial position (bottom of current viewport)
    const initialTop = window.innerHeight - config.bottom;
    setInitialPosition(initialTop);

    // Simple context awareness: Don't show if user is at bottom of page
    const checkContextAndShow = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Check if user is at or near the bottom of the page (within 100px)
      const isAtBottom = scrollY + windowHeight >= documentHeight - 100;

      // Only show if NOT at bottom of page
      if (!isAtBottom) {
        setIsVisible(true);
      }
    };

    // Check context after a small delay to ensure accurate scroll position
    setTimeout(checkContextAndShow, 100);

    // Hide on scroll - but respect context awareness
    const handleScroll = () => {
      const scrollY = window.scrollY;

      // Hide if we've scrolled past the hideAfterScroll threshold
      // OR if we've scrolled past where the indicator physically appears
      if (scrollY > hideAfterScroll || scrollY > initialTop) {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [showOnPages, hideAfterScroll, config.bottom]);

  // Don't render if not on specified pages
  if (!showOnPages.includes(currentPath)) {
    return null;
  }

  const handleClick = () => {
    // Smooth scroll to next section
    const nextSection = document.querySelector('[id="sections"]');
    if (nextSection) {
      nextSection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      // Fallback: scroll down by viewport height
      window.scrollBy({
        top: window.innerHeight,
        behavior: "smooth",
      });
    }
  };

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute z-40 left-1/2 transform -translate-x-1/2 cursor-pointer flex flex-col items-center"
              style={{
                top: `${initialPosition}px`,
              }}
              onClick={handleClick}
            >
              {/* DotLottie React Component */}
              <div
                style={{
                  width: `${config.width}px`,
                  height: `${config.height}px`,
                }}
              >
                <DotLottieReact
                  src="/animations/lottie-scroll-down.json"
                  loop
                  autoplay
                  style={{
                    width: "100%",
                    height: "100%",
                    filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.1))",
                  }}
                />
              </div>

              {/* Text row below animation */}
              <div className="mt-2 whitespace-nowrap">
                <span
                  className="text-xs font-light tracking-wide"
                  style={{
                    color: "var(--foreground)",
                    opacity: 0.7,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Scroll to explore
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
