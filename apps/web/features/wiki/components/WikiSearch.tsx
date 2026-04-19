"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import {
  PanelSearchField,
  panelSelectStyles,
} from "@/features/graph/components/panels/PanelShell";
import type { WikiSearchHitResponse } from "@solemd/api-client/shared/wiki-types";
import { searchWikiPagesClient } from "@solemd/api-client/client/wiki-client";
import { WIKI_SEARCH_SURFACE_WIDTH, WikiSearchResultsSurface } from "./WikiSearchResultsSurface";

interface WikiSearchProps {
  onNavigate: (slug: string) => void;
}

/**
 * Clean FTS headline for display. The backend returns ts_headline snippets
 * from raw markdown content_md, so they may contain:
 * - ** markers (StartSel/StopSel from ts_headline)
 * - [[wikilink]] and [[pmid:NNN]] syntax
 * - Markdown heading markers (#)
 * - List markers (- at line start)
 *
 * Strip all of these for clean plain-text display.
 */
function cleanHeadline(headline: string): string {
  return headline
    .replace(/\*\*/g, "")
    .replace(/\[\[pmid:\d+\]\]/gi, "")
    .replace(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function WikiSearch({ onNavigate }: WikiSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [hits, setHits] = useState<WikiSearchHitResponse[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  const isAbortError = useCallback(
    (error: unknown) => error instanceof Error && error.name === "AbortError",
    [],
  );

  // Fetch on debounced query change — request-id guards stale responses.
  // Always bump requestIdRef on every effect run so that close/clear
  // invalidates in-flight requests.
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    if (!open || debouncedQuery.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return () => controller.abort();
    }

    setSearching(true);
    searchWikiPagesClient(debouncedQuery, 20, { signal: controller.signal })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setHits(result.hits);
        setSearching(false);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        if (requestId !== requestIdRef.current) return;
        setHits([]);
        setSearching(false);
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, isAbortError, open]);

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (prev) {
        setQuery("");
        setHits([]);
      }
      return !prev;
    });
  }, []);

  const handleSelect = useCallback(
    (slug: string) => {
      onNavigate(slug);
      setOpen(false);
      setQuery("");
      setHits([]);
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleToggle();
      }
    },
    [handleToggle],
  );

  return (
    <div className="relative">
      <PanelSearchField
        open={open}
        collapsible
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        ariaLabel="Search wiki pages"
        actionLabel={open ? "Close search" : "Search wiki"}
        actionMode={open ? "close" : "search"}
        onAction={handleToggle}
        styles={panelSelectStyles}
        width={WIKI_SEARCH_SURFACE_WIDTH}
        collapsedActionSize={24}
        inputActionSize={16}
      />
      <WikiSearchResultsSurface
        hits={hits.map((hit) => ({
          ...hit,
          headline: hit.headline ? cleanHeadline(hit.headline) : hit.headline,
        }))}
        searching={searching}
        query={debouncedQuery}
        onSelect={handleSelect}
        width={WIKI_SEARCH_SURFACE_WIDTH}
      />
    </div>
  );
}
