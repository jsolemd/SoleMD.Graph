"use client";

import type { CSSProperties } from "react";
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
import { crisp } from "@/lib/motion";
import {
  chromeFlushSurfaceStyle,
  graphControlBtnStyles,
  type ChromeSurfaceMode,
} from "../panels/PanelShell";

const pillToggleStyle: CSSProperties = {
  "--graph-control-idle-bg": "var(--graph-prompt-bg)",
  border: "calc(1px * var(--app-density, 0.8)) solid transparent",
  boxShadow: "var(--graph-prompt-shadow)",
} as CSSProperties;

export default function ThemeToggle({
  grouped = false,
  surfaceMode = "pill",
}: {
  grouped?: boolean;
  surfaceMode?: ChromeSurfaceMode;
}) {
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
        style={
          grouped || surfaceMode === "flush"
            ? chromeFlushSurfaceStyle
            : pillToggleStyle
        }
        styles={graphControlBtnStyles}
      >
        <motion.div
          className="flex items-center justify-center"
          animate={{ rotate: spinCount * 360 }}
          transition={crisp}
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
