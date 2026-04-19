"use client";

import { PopoverSurface, panelTextMutedStyle, panelTextStyle } from "@/features/graph/components/panels/PanelShell";
import type { WikiSearchHitResponse } from "@solemd/api-client/shared/wiki-types";

export const WIKI_SEARCH_SURFACE_WIDTH = 160;

interface WikiSearchResultsSurfaceProps {
  hits: WikiSearchHitResponse[];
  searching: boolean;
  query: string;
  onSelect: (slug: string) => void;
  width?: number;
}

const resultButtonStyle = {
  all: "unset",
  display: "block",
  width: "100%",
  padding: "6px 10px",
  cursor: "pointer",
  boxSizing: "border-box",
} as const;

export function WikiSearchResultsSurface({
  hits,
  searching,
  query,
  onSelect,
  width = WIKI_SEARCH_SURFACE_WIDTH,
}: WikiSearchResultsSurfaceProps) {
  if (hits.length === 0 && !(searching && query.trim().length >= 2)) {
    return null;
  }

  if (hits.length > 0) {
    return (
      <PopoverSurface
        className="absolute right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-lg"
        width={width}
      >
        {hits.map((hit) => (
          <button
            key={hit.slug}
            type="button"
            style={resultButtonStyle}
            onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = "var(--mode-accent-subtle)"; }}
            onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = ""; }}
            onClick={() => onSelect(hit.slug)}
          >
            <div style={panelTextStyle}>{hit.title}</div>
            {hit.headline && (
              <div style={panelTextMutedStyle} className="line-clamp-1">
                {hit.headline}
              </div>
            )}
          </button>
        ))}
      </PopoverSurface>
    );
  }

  return (
    <PopoverSurface
      className="absolute right-0 top-full z-50 mt-0.5 rounded-lg px-2.5 py-1.5"
      width={width}
    >
      <span style={panelTextMutedStyle}>Searching...</span>
    </PopoverSurface>
  );
}
