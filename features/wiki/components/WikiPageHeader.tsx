"use client";

import { Text } from "@mantine/core";
import {
  PanelInlineLoader,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelCardClassName,
  panelCardStyle,
  panelChromeStyle,
  panelStatValueStyle,
  panelTextDimStyle,
  panelTextMutedStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { OpenModuleCTA } from "./elements/OpenModuleCTA";
import { countWikiPageGraphRefs } from "@/features/wiki/lib/wiki-page-graph";
import type {
  WikiPageContextResponse,
  WikiPageResponse,
} from "@/lib/engine/wiki-types";
import { formatNumber } from "@/lib/helpers";

interface WikiPageHeaderProps {
  page: WikiPageResponse;
  pageContext: WikiPageContextResponse | null;
  pageContextLoading: boolean;
  pageContextError: string | null;
  canShowPageOnGraph: boolean;
  onShowPageOnGraph: () => void;
  onOpenGlobalGraph: () => void;
  onPaperClick: (graphPaperRef: string) => void;
}

export function WikiPageHeader({
  page,
  pageContext,
  pageContextLoading,
  pageContextError,
  canShowPageOnGraph,
  onShowPageOnGraph,
  onOpenGlobalGraph,
  onPaperClick,
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {entityTypeLabel && <MetaPill label={entityTypeLabel} />}
            {sectionLabel && <MetaPill label={toTitleCase(sectionLabel)} />}
          </div>
          <h2
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--graph-panel-text)" }}
          >
            {page.title}
          </h2>
          {page.summary && (
            <Text style={panelTextStyle} className="mt-1 max-w-prose">
              {page.summary}
            </Text>
          )}
        </div>
      </div>

      {page.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {page.tags.map((tag) => (
            <span
              key={tag}
              className={panelAccentCardClassName}
              style={{
                ...panelAccentCardStyle,
                padding: "1px 6px",
                fontSize: 9,
                borderRadius: 999,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <StatCard
          label="Evidence papers"
          value={
            evidencePaperCount > 0 ? formatNumber(evidencePaperCount) : "0"
          }
          footnote={
            featuredPmids.length > 0 ? "curated page set" : "all cited on page"
          }
        />
        <StatCard
          label="Corpus papers"
          value={corpusPaperCount}
          loading={isEntityPage && pageContextLoading}
          footnote={resolveContextFootnote({
            enabled: isEntityPage,
            loading: pageContextLoading,
            error: pageContextError,
            readyLabel: "entity-wide backend count",
          })}
        />
        <StatCard
          label="Graph papers"
          value={graphPaperCount}
          loading={isEntityPage && pageContextLoading}
          footnote={resolveContextFootnote({
            enabled: isEntityPage,
            loading: pageContextLoading,
            error: pageContextError,
            readyLabel: "available in current graph",
          })}
        />
        <StatCard
          label="Linked pages"
          value={formatNumber(page.outgoing_links.length)}
          footnote="wiki relationships"
        />
      </div>

      {isModulePage && (
        <OpenModuleCTA moduleSlug={page.slug} />
      )}

      {isEntityPage && pageContextLoading && (
        <div className={panelCardClassName} style={panelCardStyle}>
          <div className="flex items-center justify-between gap-2">
            <Text style={{ ...panelTextMutedStyle, ...panelChromeStyle }}>
              Backend context
            </Text>
            <PanelInlineLoader />
          </div>
          <Text style={panelTextDimStyle}>
            The wiki page content is ready; entity-wide counts and graph papers
            will appear when the API response arrives.
          </Text>
        </div>
      )}

      {isEntityPage && !pageContextLoading && pageContextError && (
        <div className={panelCardClassName} style={panelCardStyle}>
          <Text style={{ ...panelTextMutedStyle, ...panelChromeStyle }}>
            Backend context
          </Text>
          <Text style={panelTextStyle}>Context unavailable</Text>
          <Text style={panelTextDimStyle}>{pageContextError}</Text>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionButton
          label={
            canShowPageOnGraph
              ? `Show ${formatNumber(evidencePaperCount)} on graph`
              : "No graph-ready papers"
          }
          active={canShowPageOnGraph}
          disabled={!canShowPageOnGraph}
          onClick={onShowPageOnGraph}
        />
        <ActionButton label="Open graph view" onClick={onOpenGlobalGraph} />
      </div>

      {topGraphPapers.length > 0 && (
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
            {topGraphPapers.map((paper) => (
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
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  footnote,
  loading = false,
}: {
  label: string;
  value: string;
  footnote: string;
  loading?: boolean;
}) {
  return (
    <div className={panelCardClassName} style={panelCardStyle}>
      <Text style={{ ...panelTextMutedStyle, ...panelChromeStyle }}>
        {label}
      </Text>
      {loading ? (
        <span className="inline-flex min-h-[14px] items-center">
          <PanelInlineLoader />
        </span>
      ) : (
        <Text style={{ ...panelTextStyle, ...panelStatValueStyle }}>
          {value}
        </Text>
      )}
      <Text style={panelTextDimStyle}>{footnote}</Text>
    </div>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span
      className={panelCardClassName}
      style={{
        ...panelCardStyle,
        padding: "1px 6px",
        fontSize: 9,
        borderRadius: 999,
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${panelCardClassName} transition-opacity hover:brightness-105 disabled:cursor-default disabled:opacity-50`}
      style={{
        ...(active ? panelAccentCardStyle : panelCardStyle),
        cursor: disabled ? "default" : "pointer",
        padding: "4px 8px",
      }}
      onClick={onClick}
      disabled={disabled}
    >
      <Text style={panelTextStyle}>{label}</Text>
    </button>
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

function resolveContextFootnote({
  enabled,
  loading,
  error,
  readyLabel,
}: {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  readyLabel: string;
}): string {
  if (!enabled) {
    return "not entity-scoped";
  }
  if (loading) {
    return "awaiting backend context";
  }
  if (error) {
    return "backend context unavailable";
  }
  return readyLabel;
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
