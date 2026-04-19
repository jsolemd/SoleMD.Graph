"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";

const AmbientFieldLandingPage = dynamic(
  () =>
    import("../surfaces/AmbientFieldLandingPage").then((mod) => ({
      default: mod.AmbientFieldLandingPage,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-screen"
        style={{ backgroundColor: "var(--background)" }}
      />
    ),
  },
);

export function AmbientFieldLandingRoute({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  return <AmbientFieldLandingPage bundle={bundle} />;
}
