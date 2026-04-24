"use client";

import React, { Suspense } from "react";
import { Skeleton, Stack } from "@mantine/core";
import { EntityHighlightZone } from "@/features/graph/components/entities/EntityHighlightZone";
import type { ComponentType, LazyExoticComponent } from "react";

// Side-effect: register all inline wiki modules once for the wiki shell.
import "@/features/wiki/modules/register-all";

import { getModuleByWikiPageSlug } from "@/features/wiki/module-runtime/registry";
import { WikiModuleErrorBoundary } from "@/features/wiki/components/WikiModuleErrorBoundary";

interface WikiModuleContentProps {
  /** Canonical wiki page slug (e.g. "modules/ai-for-mds") */
  slug: string;
  withShell?: boolean;
}

type ModuleLoader = () => Promise<{ default: ComponentType }>;

const lazyModuleCache = new WeakMap<
  ModuleLoader,
  LazyExoticComponent<ComponentType>
>();

function ModuleLoadingSkeleton() {
  return (
    <Stack gap="md" className="px-4 py-6">
      <Skeleton height={32} width="50%" radius="md" />
      <Skeleton height={16} width="35%" radius="md" />
      <Skeleton height={200} radius="md" />
      <Skeleton height={160} radius="md" />
    </Stack>
  );
}

export function getWikiModule(wikiPageSlug: string) {
  return getModuleByWikiPageSlug(wikiPageSlug);
}

function getLazyModuleComponent(
  loader: ModuleLoader,
): LazyExoticComponent<ComponentType> {
  const cached = lazyModuleCache.get(loader);
  if (cached) return cached;

  const component = React.lazy(loader);
  lazyModuleCache.set(loader, component);
  return component;
}

export function WikiModuleContent({ slug, withShell = false }: WikiModuleContentProps) {
  const registration = getWikiModule(slug);

  if (!registration) {
    return (
      <div className="px-4 py-6 text-center" style={{ color: "var(--text-secondary)" }}>
        Module &ldquo;{slug}&rdquo; not found
      </div>
    );
  }

  const loader = withShell
    ? registration.load
    : (registration.loadContent ?? registration.load);
  const moduleContent = React.createElement(getLazyModuleComponent(loader));

  return (
    <WikiModuleErrorBoundary resetKey={slug}>
      <Suspense fallback={<ModuleLoadingSkeleton />}>
        <EntityHighlightZone>
          <div className={withShell ? "wiki-module-panel" : undefined}>{moduleContent}</div>
        </EntityHighlightZone>
      </Suspense>
    </WikiModuleErrorBoundary>
  );
}
