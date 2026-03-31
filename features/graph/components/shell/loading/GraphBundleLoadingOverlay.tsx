"use client";

import { useState } from "react";
import {
  ActionIcon,
  Loader,
  Text,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { settle } from "@/lib/motion";
import type { GraphBundle, GraphBundleLoadProgress } from "@/features/graph/types";

function getUserFriendlyMessage(
  stage: GraphBundleLoadProgress["stage"] | undefined,
  canvasReady: boolean,
): string {
  if (canvasReady) return "Rendering...";
  switch (stage) {
    case "resolving":
      return "Connecting...";
    case "views":
      return "Preparing tables...";
    case "points":
      return "Loading points...";
    case "clusters":
      return "Organizing clusters...";
    case "facets":
      return "Building facets...";
    case "hydrating":
      return "Preparing layout...";
    case "ready":
      return "Rendering...";
    default:
      return "Loading...";
  }
}

export function GraphBundleLoadingOverlay({
  bundle,
  progress,
  canvasReady,
}: {
  bundle: GraphBundle;
  progress: GraphBundleLoadProgress | null;
  canvasReady: boolean;
}) {
  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("light");
  const mounted = useMounted();
  const [spinCount, setSpinCount] = useState(0);

  const isDark = mounted ? computedColorScheme === "dark" : false;
  const themeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  const rawPercent = progress?.percent ?? 0;
  const percent = canvasReady
    ? Math.max(rawPercent, 95)
    : Math.max(0, Math.min(100, rawPercent));

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5"
      style={{ backgroundColor: "var(--graph-bg)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      {/* Theme toggle — top-right corner */}
      <div className="absolute right-3 top-3">
        <Tooltip label={themeLabel} position="bottom" withArrow>
          <ActionIcon
            onClick={() => {
              setSpinCount((c) => c + 1);
              toggleColorScheme();
            }}
            variant="transparent"
            size="lg"
            radius="xl"
            className="graph-icon-btn"
            aria-label={themeLabel}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{ rotate: spinCount * 360 }}
              transition={settle}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.div>
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Branding + graph name */}
      <div className="flex flex-col items-center gap-1">
        <Text
          size="xs"
          fw={600}
          style={{
            color: "var(--text-tertiary)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          SoleMD
        </Text>
        <Text size="md" fw={500} style={{ color: "var(--text-primary)" }}>
          {bundle.graphName}
        </Text>
        <Text
          size="10px"
          style={{
            color: "var(--text-tertiary)",
            letterSpacing: "0.04em",
          }}
        >
          Powered by Semantic Scholar
        </Text>
      </div>

      {/* Progress bar + status */}
      <div className="flex w-[min(280px,70vw)] flex-col items-center gap-3">
        <div
          className="w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--graph-panel-border)", height: 4 }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              backgroundColor: "var(--brand-accent)",
              transition: "width 300ms ease",
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Loader size={12} color="var(--text-tertiary)" />
          <Text size="xs" style={{ color: "var(--text-tertiary)" }}>
            {getUserFriendlyMessage(progress?.stage, canvasReady)}
          </Text>
        </div>
      </div>
    </motion.div>
  );
}
