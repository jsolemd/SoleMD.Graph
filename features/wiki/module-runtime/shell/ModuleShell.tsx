"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { Stack } from "@mantine/core";
import type { ModuleManifest } from "@/features/wiki/module-runtime/types";
import { setModuleAccent } from "@/features/wiki/module-runtime/tokens";
import { ModuleHeader } from "./ModuleHeader";
import { ModuleFooter } from "./ModuleFooter";

interface ModuleShellProps {
  manifest: ModuleManifest;
  nextModule?: ModuleManifest;
  children: ReactNode;
}

export function ModuleShell({
  manifest,
  nextModule,
  children,
}: ModuleShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) {
      setModuleAccent(rootRef.current, manifest.accent);
    }
  }, [manifest.accent]);

  return (
    <div ref={rootRef}>
      <Stack gap="xl">
        <ModuleHeader manifest={manifest} />
        <main>{children}</main>
        <ModuleFooter manifest={manifest} nextModule={nextModule} />
      </Stack>
    </div>
  );
}
