"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { ActionIcon } from "@mantine/core";
import { X } from "lucide-react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { APP_CHROME_PX, densityCssPx } from "@/lib/density";
import type { WikiGraphNode } from "@/lib/engine/wiki-types";

const UNCATEGORIZED = "Other";

function categoryKey(node: WikiGraphNode): string {
  return node.entity_type ?? node.semantic_group ?? UNCATEGORIZED;
}

export function WikiBrowseSheet() {
  const browseOpen = useWikiStore((s) => s.browseOpen);
  const setBrowseOpen = useWikiStore((s) => s.setBrowseOpen);
  const graphData = useWikiStore((s) => s.graphData);
  const navigateToPage = useWikiStore((s) => s.navigateToPage);

  const groupedPages = useMemo(() => {
    const pages = (graphData?.nodes ?? []).filter(
      (n): n is WikiGraphNode & { slug: string } =>
        n.kind === "page" && !!n.slug,
    );
    const map = new Map<string, typeof pages>();
    for (const page of pages) {
      const key = categoryKey(page);
      const list = map.get(key);
      if (list) list.push(page);
      else map.set(key, [page]);
    }
    const ordered = Array.from(map.entries())
      .map(([key, list]) => ({
        key,
        pages: list.slice().sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        if (a.key === UNCATEGORIZED) return 1;
        if (b.key === UNCATEGORIZED) return -1;
        return a.key.localeCompare(b.key);
      });
    return ordered;
  }, [graphData]);

  if (!browseOpen || typeof document === "undefined") return null;

  const handleOpen = (slug: string) => {
    setBrowseOpen(false);
    navigateToPage(slug);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9997] flex items-stretch justify-center"
      style={{ backgroundColor: "var(--graph-overlay-scrim)" }}
      onClick={() => setBrowseOpen(false)}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--surface)] sm:my-6 sm:h-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-[1rem] sm:shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b border-[var(--border-default)] px-4"
          style={{ height: densityCssPx(44) }}
        >
          <div
            className="font-semibold"
            style={{ color: "var(--graph-panel-text)" }}
          >
            Browse pages
          </div>
          <ActionIcon
            variant="subtle"
            size={APP_CHROME_PX.toolbarIcon}
            radius="xl"
            onClick={() => setBrowseOpen(false)}
            aria-label="Close browse"
            style={{ color: "var(--graph-panel-text-muted)" }}
          >
            <X size={14} />
          </ActionIcon>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groupedPages.length === 0 && (
            <div
              className="py-8 text-center text-sm"
              style={{ color: "var(--graph-panel-text-muted)" }}
            >
              No pages available.
            </div>
          )}
          {groupedPages.map(({ key, pages }) => (
            <section key={key} className="mb-4">
              <h3
                className="mb-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--graph-panel-text-muted)" }}
              >
                {key}
              </h3>
              <ul className="flex flex-col">
                {pages.map((page) => (
                  <li key={page.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(page.slug)}
                      className="w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--graph-panel-hover-bg)]"
                      style={{ color: "var(--graph-panel-text)" }}
                    >
                      {page.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
