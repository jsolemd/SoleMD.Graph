"use client";

import { type ReactNode } from "react";
import { Paper, Text } from "@mantine/core";

/* ── Root ── */

interface DemoStageRootProps {
  children: ReactNode;
  className?: string;
  layout?: "horizontal" | "vertical";
}

function DemoStageRoot({
  children,
  className,
  layout = "horizontal",
}: DemoStageRootProps) {
  return (
    <Paper
      radius="lg"
      p="xl"
      style={{ background: "var(--surface)" }}
      className={className}
    >
      <div
        className={`flex gap-6 ${
          layout === "horizontal"
            ? "flex-col md:flex-row md:items-start"
            : "flex-col"
        }`}
      >
        {children}
      </div>
    </Paper>
  );
}

/* ── Controls ── */

interface ControlsProps {
  children: ReactNode;
  className?: string;
}

function Controls({ children, className }: ControlsProps) {
  return (
    <div
      className={`flex flex-col gap-3 md:w-64 md:flex-shrink-0 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/* ── Visualization ── */

interface VisualizationProps {
  children: ReactNode;
  className?: string;
}

function Visualization({ children, className }: VisualizationProps) {
  return (
    <div className={`flex-1 min-w-0 ${className ?? ""}`}>{children}</div>
  );
}

/* ── Annotation ── */

interface AnnotationProps {
  children: ReactNode;
  className?: string;
}

function Annotation({ children, className }: AnnotationProps) {
  return (
    <div
      className={`mt-4 flex gap-2 items-start rounded-lg px-4 py-3 ${className ?? ""}`}
      style={{
        background:
          "color-mix(in srgb, var(--module-accent) 8%, var(--surface))",
        borderLeft: "3px solid var(--module-accent)",
      }}
    >
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        {children}
      </Text>
    </div>
  );
}

/* ── Compound export ── */

export const DemoStage = Object.assign(DemoStageRoot, {
  Controls,
  Visualization,
  Annotation,
});
