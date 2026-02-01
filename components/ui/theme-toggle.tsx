// components/ui/theme-toggle.tsx
"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  ANIMATION_VARIANTS,
  HOVER_CSS_TRANSITION,
  STANDARD_EASING,
} from "@/lib/animation-utils";

/**
 * Optimized theme toggle component with proper next-themes integration
 * Syncs with both next-themes and Mantine theme provider
 */
export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Prevent flash during hydration
  if (!mounted) {
    return (
      <ActionIcon
        variant="subtle"
        size="lg"
        radius="md"
        aria-label="Theme toggle loading"
        styles={{
          root: {
            width: "2.5rem",
            height: "2.5rem",
            opacity: 0.5,
          },
        }}
      >
        <Sun className="h-5 w-5" />
      </ActionIcon>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Tooltip
      label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      position="bottom"
      withArrow
      styles={{
        tooltip: {
          backgroundColor: isDark ? "var(--background)" : "var(--color-gray)",
          color: isDark ? "var(--color-gray)" : "var(--background)",
          fontSize: "0.875rem",
        },
      }}
    >
      <motion.div {...ANIMATION_VARIANTS.buttonHover}>
        <ActionIcon
          onClick={toggleTheme}
          variant="subtle"
          size="lg"
          radius="md"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          styles={{
            root: {
              width: "2.5rem",
              height: "2.5rem",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--color-gray)",
              transition: HOVER_CSS_TRANSITION,
              "&:hover": {
                backgroundColor: "transparent",
                color: isDark
                  ? "var(--color-golden-yellow)"
                  : "var(--color-soft-blue)",
                transform: "none !important", // Let Framer Motion handle transforms
              },
            },
          }}
        >
          <motion.div
            initial={false}
            animate={{
              rotate: isDark ? 0 : 180,
              scale: 1,
            }}
            transition={{
              duration: 0.3,
              ease: STANDARD_EASING,
            }}
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </motion.div>
        </ActionIcon>
      </motion.div>
    </Tooltip>
  );
}
