"use client";

import type { GraphEntityRef } from "@/features/graph/types/entity-service";

export function normalizeWikiSlug(raw: string): string {
  let slug = raw.trim().replace(/^\/+|\/+$/g, "");
  if (slug.toLowerCase().endsWith(".md")) {
    slug = slug.slice(0, -3);
  }
  slug = slug.toLowerCase().replaceAll(" ", "-");
  while (slug.includes("--")) {
    slug = slug.replaceAll("--", "-");
  }
  return slug;
}

export function getEntityWikiSlug(entity: GraphEntityRef): string {
  return `entities/${normalizeWikiSlug(entity.canonicalName)}`;
}
