"use client";

import { ModuleShell } from "@/features/learn/shell/ModuleShell";
import { manifest } from "./manifest";
import AiForMdsContent from "./content";

export default function AiForMdsModule() {
  return (
    <ModuleShell manifest={manifest}>
      <AiForMdsContent />
    </ModuleShell>
  );
}
