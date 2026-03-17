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
import { settle } from "@/lib/motion";

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
        variant="transparent"
        size="lg"
        radius="xl"
        className="graph-icon-btn"
        aria-label={label}
        styles={{
          root: {
            color: "var(--graph-panel-text-dim)",
          },
        }}
      >
        <motion.div
          className="flex items-center justify-center"
          animate={{ rotate: spinCount * 360 }}
          transition={settle}
        >
          {isDark ? (
            <Sun />
          ) : (
            <Moon />
          )}
        </motion.div>
      </ActionIcon>
    </Tooltip>
  );
}
