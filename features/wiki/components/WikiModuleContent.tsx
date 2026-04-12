"use client";

import React, { Suspense } from "react";
import { Skeleton, Stack } from "@mantine/core";
import { EntityHighlightZone } from "@/features/graph/components/entities/EntityHighlightZone";
import type { ComponentType, LazyExoticComponent } from "react";

// Side-effect: register all modules so getModule finds them
import "@/features/learn/modules/ai-for-mds/register";

import { getModule } from "@/features/learn/registry";

interface WikiModuleContentProps {
  /** Wiki slug (e.g. "modules/ai-for-mds") or module slug ("ai-for-mds") */
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

/** Wiki pages store modules under "modules/{slug}" but the learn registry
 *  uses the bare slug. Try both so callers can pass either form. */
export function resolveModule(slug: string) {
  return getModule(slug) ?? getModule(slug.replace(/^modules\//, ""));
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
  const registration = resolveModule(slug);

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
    <Suspense fallback={<ModuleLoadingSkeleton />}>
      <EntityHighlightZone>
        {moduleContent}
      </EntityHighlightZone>
    </Suspense>
  );
}
