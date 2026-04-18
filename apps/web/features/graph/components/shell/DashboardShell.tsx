"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";

const DashboardShellClient = dynamic(
  () =>
    import("./DashboardShellClient").then((mod) => ({
      default: mod.DashboardShellClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      />
    ),
  }
);

export function DashboardShell({ bundle }: { bundle: GraphBundle }) {
  return <DashboardShellClient bundle={bundle} />;
}
