"use client";

import type { GraphBundle } from "@/features/graph/types";
import { DashboardShellViewport } from "./DashboardShellViewport";
import { useDashboardShellController } from "./use-dashboard-shell-controller";

export function DashboardShellClient({ bundle }: { bundle: GraphBundle }) {
  const state = useDashboardShellController(bundle);
  return <DashboardShellViewport {...state} />;
}
