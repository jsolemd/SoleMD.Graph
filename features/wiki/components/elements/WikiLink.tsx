"use client";

import type { WikiLinkProps } from "@/features/wiki/lib/markdown-pipeline";

/**
 * Inline wiki link — navigates within the panel.
 * Accent-colored, no external navigation.
 */
export function WikiLink({ slug, children, onNavigate }: WikiLinkProps) {
  return (
    <button
      type="button"
      className="wiki-link"
      onClick={() => onNavigate(slug)}
      title={slug}
    >
      {children}
    </button>
  );
}
