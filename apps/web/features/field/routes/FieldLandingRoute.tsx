"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";

const FieldLandingPage = dynamic(
  () =>
    import("../surfaces/FieldLandingPage").then((mod) => ({
      default: mod.FieldLandingPage,
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

export function FieldLandingRoute({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  return <FieldLandingPage bundle={bundle} />;
}
