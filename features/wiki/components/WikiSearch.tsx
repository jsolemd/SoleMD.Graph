"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Search, X } from "lucide-react";
import {
  iconBtnStyles,
  panelSelectStyles,
  panelTextStyle,
  panelTextMutedStyle,
} from "@/features/graph/components/panels/PanelShell";
import { searchWikiPages } from "@/app/actions/wiki";
import type { WikiSearchHitResponse } from "@/lib/engine/wiki-types";

interface WikiSearchProps {
  onNavigate: (slug: string) => void;
}

/**
 * The backend returns ts_headline with StartSel=**, StopSel=** markers.
 * Strip the markers and render as plain text — never inject as HTML.
 */
function stripHeadlineMarkers(headline: string): string {
  return headline.replace(/\*\*/g, "");
}

export function WikiSearch({ onNavigate }: WikiSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [hits, setHits] = useState<WikiSearchHitResponse[]>([]);
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch on debounced query change — request-id guards stale responses.
  // Always bump requestIdRef on every effect run so that close/clear
  // invalidates in-flight requests.
  useEffect(() => {
    const requestId = ++requestIdRef.current;

    if (!open || debouncedQuery.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchWikiPages(debouncedQuery)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setHits(result.hits);
        setSearching(false);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setHits([]);
        setSearching(false);
      });
  }, [debouncedQuery, open]);

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
      <Tooltip label="Search wiki" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={handleToggle}
          aria-label="Search wiki"
        >
          <Search size={12} />
        </ActionIcon>
      </Tooltip>
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
          <ActionIcon
            variant="transparent"
            size={16}
            onClick={handleToggle}
            styles={iconBtnStyles}
            aria-label="Close search"
          >
            <X size={10} />
          </ActionIcon>
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
            border: "1px solid var(--graph-panel-border)",
            boxShadow: "var(--graph-panel-shadow)",
          }}
        >
          {hits.map((hit) => (
            <button
              key={hit.slug}
              type="button"
              className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--graph-panel-input-bg)]"
              onClick={() => handleSelect(hit.slug)}
            >
              <div style={panelTextStyle}>{hit.title}</div>
              {hit.headline && (
                <div style={panelTextMutedStyle} className="line-clamp-1">
                  {stripHeadlineMarkers(hit.headline)}
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
            border: "1px solid var(--graph-panel-border)",
          }}
        >
          <span style={panelTextMutedStyle}>Searching...</span>
        </div>
      )}
    </div>
  );
}
