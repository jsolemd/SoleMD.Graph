import type { ModuleManifest } from "./types";
import type { ComponentType } from "react";

interface ModuleRegistration {
  manifest: ModuleManifest;
  load: () => Promise<{ default: ComponentType }>;
  loadContent?: () => Promise<{ default: ComponentType }>;
}

const modules = new Map<string, ModuleRegistration>();

export function registerModule(registration: ModuleRegistration): void {
  modules.set(registration.manifest.slug, registration);
}

export function getModule(
  slug: string,
): ModuleRegistration | undefined {
  return modules.get(slug);
}

export function listModules(): ModuleManifest[] {
  return Array.from(modules.values()).map((r) => r.manifest);
}
