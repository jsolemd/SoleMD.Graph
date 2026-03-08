"use client";

import { useState, useEffect } from "react";
import { ActionIcon, Tooltip, useMantineColorScheme, useComputedColorScheme } from "@mantine/core";
import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import {
  ANIMATION_VARIANTS,
  HOVER_CSS_TRANSITION,
  STANDARD_EASING,
} from "@/lib/animation-utils";

export default function ThemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before mount, render a consistent "light" state to avoid hydration mismatch
  const isDark = mounted ? computedColorScheme === "dark" : false;

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
          onClick={toggleColorScheme}
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
                transform: "none !important",
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
