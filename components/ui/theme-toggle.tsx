"use client";

import { useState, useEffect, useRef } from "react";
import {
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");
  const [mounted, setMounted] = useState(false);
  const spins = useRef(0);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? computedColorScheme === "dark" : false;
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip label={label} position="bottom" withArrow>
      <ActionIcon
        onClick={() => {
          spins.current += 1;
          toggleColorScheme();
        }}
        variant="subtle"
        size="lg"
        radius="xl"
        aria-label={label}
        styles={{
          root: {
            width: "2.5rem",
            height: "2.5rem",
            color: "var(--text-tertiary)",
            transition: "color 200ms ease",
          },
        }}
      >
        <motion.div
          className="flex items-center justify-center"
          animate={{ rotate: spins.current * 360 }}
          transition={{ type: "spring", stiffness: 260, damping: 25 }}
        >
          {isDark ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </motion.div>
      </ActionIcon>
    </Tooltip>
  );
}
