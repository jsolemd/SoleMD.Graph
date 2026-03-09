"use client";

import { useState } from "react";
import {
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");
  const mounted = useMounted();
  const [spinCount, setSpinCount] = useState(0);

  const isDark = mounted ? computedColorScheme === "dark" : false;
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip label={label} position="bottom" withArrow>
      <ActionIcon
        onClick={() => {
          setSpinCount((current) => current + 1);
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
            color: "var(--graph-panel-text-dim)",
            transition: "color 200ms ease",
          },
        }}
      >
        <motion.div
          className="flex items-center justify-center"
          animate={{ rotate: spinCount * 360 }}
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
