"use client";

import { Text } from "@mantine/core";
import { Orbit } from "lucide-react";
import {
  PanelIconAction,
  PanelInlineLoader,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelCardClassName,
  panelCardStyle,
  panelChromeStyle,
  panelScaledPx,
  panelTextDimStyle,
  panelTextMutedStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { OpenModuleCTA } from "./elements/OpenModuleCTA";
import { countWikiPageGraphRefs } from "@/features/wiki/lib/wiki-page-graph";
import type {
  WikiPagePaperResponse,
  WikiPageContextResponse,
  WikiPageResponse,
} from "@solemd/api-client/shared/wiki-types";
import { formatNumber } from "@/lib/helpers";

interface WikiPageHeaderProps {
  page: WikiPageResponse;
  pageContext: WikiPageContextResponse | null;
  pageContextLoading: boolean;
  pageContextError: string | null;
  canShowPageOnGraph: boolean;
  onShowPageOnGraph: () => void;
  onPaperClick: (graphPaperRef: string) => void;
  showTopGraphPapers?: boolean;
}

export function WikiPageHeader({
  page,
  pageContext,
  pageContextLoading,
  pageContextError,
  canShowPageOnGraph,
  onShowPageOnGraph,
  onPaperClick,
  showTopGraphPapers = true,
}: WikiPageHeaderProps) {
  const featuredPmids = page.featured_pmids ?? [];
  const paperPmids = page.paper_pmids ?? [];
  const evidencePaperCount =
    countWikiPageGraphRefs(page) || featuredPmids.length || paperPmids.length;
  const entityTypeLabel = page.entity_type ?? null;
  const sectionLabel =
    page.section_slug?.split("/").pop()?.replace(/-/g, " ") ?? null;
  const isEntityPage = page.page_kind === "entity";
  const isModulePage = page.page_kind === "module";
  const topGraphPapers = pageContext?.top_graph_papers ?? [];
  const corpusPaperCount = formatContextCount(
    pageContext?.total_corpus_paper_count,
    {
      enabled: isEntityPage,
      error: pageContextError,
    },
  );
  const graphPaperCount = formatContextCount(
    pageContext?.total_graph_paper_count,
    {
      enabled: isEntityPage,
      error: pageContextError,
    },
  );

  const statParts = [
    evidencePaperCount > 0 ? `${formatNumber(evidencePaperCount)} evidence` : null,
    isEntityPage ? (pageContextLoading ? null : `${corpusPaperCount} corpus`) : null,
    isEntityPage ? (pageContextLoading ? null : `${graphPaperCount} graph`) : null,
    `${formatNumber(page.outgoing_links.length)} linked`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Title row: pills + title + action icons */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {entityTypeLabel && <MetaPill label={entityTypeLabel} entityType={page.entity_type} />}
            {sectionLabel && <MetaPill label={toTitleCase(sectionLabel)} />}
          </div>
          <h2
            className="mt-1 font-semibold leading-snug"
            style={{
              color: "var(--graph-panel-text)",
              fontSize: panelScaledPx(15),
            }}
          >
            {page.title}
          </h2>
          {page.summary && (
            <Text style={panelTextStyle} className="mt-0.5 max-w-prose">
              {page.summary}
            </Text>
          )}
        </div>

        {canShowPageOnGraph && (
          <PanelIconAction
            label={`Show ${formatNumber(evidencePaperCount)} on graph`}
            icon={<Orbit size={12} />}
            onClick={onShowPageOnGraph}
            className="graph-icon-btn shrink-0"
            aria-label="Show on graph"
          />
        )}
      </div>

      {page.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {page.tags.map((tag) => (
            <span
              key={tag}
              className={panelAccentCardClassName}
              style={{
                ...panelAccentCardStyle,
                padding: `${panelScaledPx(1)} ${panelScaledPx(6)}`,
                fontSize: panelScaledPx(9),
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Inline stats — dot-separated, matching info panel pattern */}
      <div style={panelTextDimStyle}>
        {statParts.join(" · ")}
        {isEntityPage && pageContextLoading && (
          <> · <PanelInlineLoader /></>
        )}
      </div>

      {isEntityPage && !pageContextLoading && pageContextError && (
        <Text style={panelTextDimStyle}>Context unavailable</Text>
      )}

      {isModulePage && (
        <OpenModuleCTA />
      )}

      {showTopGraphPapers && (
        <WikiTopGraphPapers
          papers={topGraphPapers}
          onPaperClick={onPaperClick}
        />
      )}
    </div>
  );
}

export function WikiTopGraphPapers({
  papers,
  onPaperClick,
}: {
  papers: WikiPagePaperResponse[];
  onPaperClick: (graphPaperRef: string) => void;
}) {
  if (papers.length === 0) {
    return null;
  }

  return (
    <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
      <div className="flex items-center justify-between gap-2">
        <Text style={{ ...panelTextMutedStyle, ...panelChromeStyle }}>
          Top graph papers
        </Text>
        <Text style={panelTextDimStyle}>
          Highest-citation papers already in the current graph release.
        </Text>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {papers.map((paper) => (
          <button
            key={`${paper.pmid}:${paper.graph_paper_ref ?? "none"}`}
            type="button"
            className={`${panelCardClassName} text-left transition-colors hover:brightness-105`}
            style={{
              ...panelCardStyle,
              cursor: paper.graph_paper_ref ? "pointer" : "default",
            }}
            onClick={() => {
              if (paper.graph_paper_ref) {
                onPaperClick(paper.graph_paper_ref);
              }
            }}
            disabled={paper.graph_paper_ref == null}
          >
            <div className="flex items-start justify-between gap-2">
              <Text style={panelTextStyle} className="min-w-0 flex-1">
                {paper.title || `PMID ${paper.pmid}`}
              </Text>
              <Text style={panelTextDimStyle}>PMID {paper.pmid}</Text>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {paper.year != null && (
                <Text style={panelTextDimStyle}>{paper.year}</Text>
              )}
              {paper.venue && (
                <Text style={panelTextDimStyle}>{paper.venue}</Text>
              )}
              {paper.citation_count != null && (
                <Text style={panelTextDimStyle}>
                  {formatNumber(paper.citation_count)} citations
                </Text>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetaPill({ label, entityType }: { label: string; entityType?: string | null }) {
  const hasEntityAccent = entityType != null;
  return (
    <span
      className={panelCardClassName}
      data-entity-type={entityType?.toLowerCase()}
      style={{
        ...(hasEntityAccent
          ? {
              backgroundColor: "color-mix(in srgb, var(--entity-accent, var(--graph-panel-input-bg)) 25%, var(--graph-panel-input-bg))",
              border: "1px solid color-mix(in srgb, var(--entity-accent, var(--graph-panel-border)) 40%, var(--graph-panel-border))",
              color: "var(--graph-panel-text)",
            }
          : panelCardStyle),
        padding: `${panelScaledPx(1)} ${panelScaledPx(6)}`,
        fontSize: panelScaledPx(9),
        borderRadius: 999,
      }}
    >
      {label}
    </span>
  );
}

function formatContextCount(
  value: number | null | undefined,
  {
    enabled,
    error,
  }: {
    enabled: boolean;
    error: string | null;
  },
): string {
  if (!enabled) {
    return "-";
  }
  if (error) {
    return "Unavailable";
  }
  return formatCount(value);
}

function formatCount(value: number | null | undefined): string {
  if (value == null) {
    return "-";
  }
  return formatNumber(value);
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
