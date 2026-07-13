"use client";

import dynamic from "next/dynamic";
import { ShellVariantProvider } from "@/features/graph/components/shell/ShellVariantContext";
import { useShellVariant } from "@/features/graph/components/shell/use-shell-variant";
import { FieldRuntimeShell } from "../renderer/FieldRuntimeShell";
import { FieldLandingLoadingShell } from "./FieldLandingLoadingShell";

const FieldDeliriumPage = dynamic(
  () =>
    import("../surfaces/FieldDeliriumPage").then((mod) => ({
      default: mod.FieldDeliriumPage,
    })),
  {
    ssr: false,
    loading: FieldLandingLoadingShell,
  },
);

export function FieldDeliriumRoute() {
  const shellVariant = useShellVariant();

  return (
    <ShellVariantProvider value={shellVariant}>
      <FieldRuntimeShell mode="landing">
        <FieldDeliriumPage />
      </FieldRuntimeShell>
    </ShellVariantProvider>
  );
}
