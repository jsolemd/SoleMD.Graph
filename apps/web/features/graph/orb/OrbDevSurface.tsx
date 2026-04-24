"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";

const OrbDevSurfaceClient = dynamic(
  () =>
    import("./OrbDevSurfaceClient").then((mod) => ({
      default: mod.OrbDevSurfaceClient,
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

export function OrbDevSurface(props: {
  bundle: GraphBundle | null;
  fixturePath?: string | null;
}) {
  return <OrbDevSurfaceClient {...props} />;
}
