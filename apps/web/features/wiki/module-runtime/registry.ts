import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { ModuleManifest } from "./types";

interface ModuleRegistration {
  manifest: ModuleManifest;
  load: () => Promise<{ default: ComponentType }>;
  loadContent?: () => Promise<{ default: ComponentType }>;
  Page: LazyExoticComponent<ComponentType>;
  Content?: LazyExoticComponent<ComponentType>;
}

const modulesByWikiPageSlug = new Map<string, ModuleRegistration>();

export function registerModule(
  registration: Omit<ModuleRegistration, "Page" | "Content">,
): void {
  const moduleRegistration: ModuleRegistration = {
    ...registration,
    Page: lazy(registration.load),
    Content: registration.loadContent ? lazy(registration.loadContent) : undefined,
  };

  modulesByWikiPageSlug.set(
    moduleRegistration.manifest.wikiPageSlug,
    moduleRegistration,
  );
}

export function getModuleByWikiPageSlug(
  wikiPageSlug: string,
): ModuleRegistration | undefined {
  return modulesByWikiPageSlug.get(wikiPageSlug);
}
