"use client";

import dynamic from "next/dynamic";
import type { GraphBundle } from "@solemd/graph";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import { FieldRuntimeShell } from "../renderer/FieldRuntimeShell";
import { FieldLandingLoadingShell } from "./FieldLandingLoadingShell";

const FieldLandingPage = dynamic(
  () =>
    import("../surfaces/FieldLandingPage").then((mod) => ({
      default: mod.FieldLandingPage,
    })),
  {
    ssr: false,
    loading: FieldLandingLoadingShell,
  },
);

export function FieldLandingRoute({
  bundle,
}: {
  bundle: GraphBundle | null;
}) {
  const shellVariant = useShellVariant();

  return (
    <ShellVariantProvider value={shellVariant}>
      <FieldRuntimeShell mode="landing">
        <FieldLandingPage bundle={bundle} />
      </FieldRuntimeShell>
    </ShellVariantProvider>
  );
}
