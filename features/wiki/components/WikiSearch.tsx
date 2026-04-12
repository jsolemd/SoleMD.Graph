"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Search, X } from "lucide-react";
import {
  PanelIconAction,
  panelSelectStyles,
  panelTextStyle,
  panelTextMutedStyle,
} from "@/features/graph/components/panels/PanelShell";
import type { WikiSearchHitResponse } from "@/lib/engine/wiki-types";
import { searchWikiPagesClient } from "@/features/wiki/lib/wiki-client";

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
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (!prev) {
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
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

  if (!open) {
    return (
      <PanelIconAction
        label="Search wiki"
        icon={<Search size={12} />}
        onClick={handleToggle}
        aria-label="Search wiki"
      />
    );
  }

  return (
    <div className="relative">
      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        size="xs"
        styles={panelSelectStyles}
        rightSection={
          <PanelIconAction
            label="Close search"
            icon={<X size={10} />}
            onClick={handleToggle}
            size={16}
            tooltipDisabled
            aria-label="Close search"
          />
        }
        style={{ width: 160 }}
        aria-label="Search wiki pages"
      />
      {hits.length > 0 && (
        <div
          className="absolute right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg"
          style={{
            width: 240,
            backgroundColor: "var(--graph-panel-bg)",
            boxShadow: "var(--graph-panel-shadow)",
          }}
        >
          {hits.map((hit) => (
            <button
              key={hit.slug}
              type="button"
              style={{
                all: "unset",
                display: "block",
                width: "100%",
                padding: "6px 10px",
                cursor: "pointer",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--mode-accent-subtle)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}
              onClick={() => handleSelect(hit.slug)}
            >
              <div style={panelTextStyle}>{hit.title}</div>
              {hit.headline && (
                <div style={panelTextMutedStyle} className="line-clamp-1">
                  {cleanHeadline(hit.headline)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {searching && hits.length === 0 && debouncedQuery.trim().length >= 2 && (
        <div
          className="absolute right-0 top-full z-50 mt-1 rounded-lg px-2.5 py-1.5"
          style={{
            width: 240,
            backgroundColor: "var(--graph-panel-bg)",
            boxShadow: "var(--graph-panel-shadow)",
          }}
        >
          <span style={panelTextMutedStyle}>Searching...</span>
        </div>
      )}
    </div>
  );
}
