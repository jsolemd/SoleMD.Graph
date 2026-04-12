"use client";

import { useMemo, useState } from "react";
import { ActionIcon, Badge, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { X } from "lucide-react";
import { DEFAULT_INFO_ROWS, type InfoWidgetSlot } from "@/features/graph/lib/info-widgets";
import { deriveColumnInsights, type ColumnInsight } from "@/features/graph/lib/info-analytics";
import { useDashboardStore } from "@/features/graph/stores";
import { formatNumber } from "@/lib/helpers";
import {
  iconBtnStyles,
  panelPillStyles,
  panelScaledPx,
  panelTextDimStyle,
  panelTextStyle,
  panelTypePillStyles,
} from "../../panels/PanelShell";
import type { NumericStatsComparison } from "../info-panel/use-info-widget-data";
import {
  type InfoComparisonFacetRow,
  type InfoComparisonState,
  type InfoHistogramComparison,
} from "./comparison-layers";
import { QueryFacetSummary, QueryInfoHistogram, type HistogramHighlightValue } from "./QueryWidgetVisualizations";
import { queryWidgetThemeVars } from "../widget-theme";

const YEAR_LIKE = new Set(["year", "pageNumber"]);

type StatKey = "min" | "median" | "avg" | "max";

function NumericStatsRow({
  stats,
  column,
  dimmed = false,
  onStatHover,
}: {
  stats: { min: number; median: number; avg: number; max: number };
  column: string;
  dimmed?: boolean;
  onStatHover?: (key: StatKey | null) => void;
}) {
  const isYear = YEAR_LIKE.has(column);
  const fmt = (v: number) =>
    isYear
      ? String(Math.round(v))
      : formatNumber(v, { maximumFractionDigits: 1 });

  const style = dimmed ? panelTextDimStyle : panelTextStyle;
  const hoverStyle = onStatHover ? { cursor: "crosshair" as const } : undefined;
  const sep = (
    <Text component="span" style={{ ...panelTextDimStyle, opacity: 0.5 }}>
      {" · "}
    </Text>
  );

  const statEntries: Array<{ key: StatKey; label: string; value: number }> = [
    { key: "min", label: "MIN", value: stats.min },
    { key: "median", label: "MED", value: stats.median },
    { key: "avg", label: "AVG", value: stats.avg },
    { key: "max", label: "MAX", value: stats.max },
  ];

  return (
    <div style={{ fontVariantNumeric: "tabular-nums" }}>
      {statEntries.map((entry, i) => (
        <Text
          key={entry.key}
          component="span"
          style={{ ...style, ...hoverStyle }}
          onMouseEnter={onStatHover ? () => onStatHover(entry.key) : undefined}
          onMouseLeave={onStatHover ? () => onStatHover(null) : undefined}
        >
          {i > 0 && sep}
          <Text component="span" style={{ ...style, opacity: 0.65 }}>{entry.label} </Text>
          {fmt(entry.value)}
        </Text>
      ))}
    </div>
  );
}

const insightTagStyle = {
  ...panelTextDimStyle,
  fontSize: panelScaledPx(8),
  opacity: 0.8,
  backgroundColor: "var(--graph-panel-input-bg)",
  borderRadius: 3,
  padding: `${panelScaledPx(1)} ${panelScaledPx(4)}`,
} as const;

function InsightAnnotations({ insights }: { insights: ColumnInsight }) {
  // Only show secondary insights not already promoted to the header pill.
  // The pill handles: shape, histogram concentration, dominant value, categorical concentration.
  // Annotations handle: selection/filtered shift, spread extremes.
  const tags: string[] = [];

  if (
    insights.selectionShift?.medianRelativeChange != null &&
    Math.abs(insights.selectionShift.medianRelativeChange) > 0.1
  ) {
    const pct = Math.round(Math.abs(insights.selectionShift.medianRelativeChange) * 100);
    const arrow = insights.selectionShift.medianRelativeChange > 0 ? "↑" : "↓";
    tags.push(`sel median ${arrow}${pct}%`);
  }

  if (
    insights.filteredShift?.medianRelativeChange != null &&
    Math.abs(insights.filteredShift.medianRelativeChange) > 0.1
  ) {
    const pct = Math.round(Math.abs(insights.filteredShift.medianRelativeChange) * 100);
    const arrow = insights.filteredShift.medianRelativeChange > 0 ? "↑" : "↓";
    tags.push(`filtered median ${arrow}${pct}%`);
  }

  if (tags.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag} style={insightTagStyle}>
          {tag}
        </span>
      ))}
    </div>
  );
}

interface QueryWidgetSlotRendererProps {
  slot: InfoWidgetSlot;
  comparisonState: InfoComparisonState;
  prefetchedCategoricalRows?: InfoComparisonFacetRow[] | null;
  prefetchedHistogram?: InfoHistogramComparison | null;
  prefetchedNumericStats?: NumericStatsComparison | null;
}

export function QueryWidgetSlotRenderer({
  slot,
  comparisonState,
  prefetchedCategoricalRows = null,
  prefetchedHistogram = null,
  prefetchedNumericStats = null,
}: QueryWidgetSlotRendererProps) {
  const removeInfoWidget = useDashboardStore((state) => state.removeInfoWidget);
  const [expanded, setExpanded] = useState(false);
  const [highlightedStatKey, setHighlightedStatKey] = useState<StatKey | null>(null);

  const highlightValues = useMemo<HistogramHighlightValue[] | null>(() => {
    if (!highlightedStatKey || !prefetchedNumericStats) return null;
    const activeStats =
      prefetchedNumericStats.selection ??
      prefetchedNumericStats.filtered ??
      prefetchedNumericStats.dataset;
    return [
      {
        value: activeStats[highlightedStatKey],
        label: { min: "MIN", median: "MED", avg: "AVG", max: "MAX" }[highlightedStatKey],
        color: "var(--filter-bar-marker)",
      },
    ];
  }, [highlightedStatKey, prefetchedNumericStats]);

  const insights = useMemo(
    () =>
      deriveColumnInsights({
        column: slot.column,
        kind: slot.kind,
        facetRows: prefetchedCategoricalRows,
        histogram: prefetchedHistogram,
        stats: prefetchedNumericStats,
      }),
    [slot.column, slot.kind, prefetchedCategoricalRows, prefetchedHistogram, prefetchedNumericStats],
  );

  const isCategorical = slot.kind === "facet-summary" || slot.kind === "bars";
  const categoricalCanExpand =
    isCategorical && prefetchedCategoricalRows != null && prefetchedCategoricalRows.length > DEFAULT_INFO_ROWS;
  const categoricalHiddenCount =
    categoricalCanExpand ? prefetchedCategoricalRows!.length - DEFAULT_INFO_ROWS : 0;
  const visibleCount = isCategorical && !expanded ? DEFAULT_INFO_ROWS : undefined;

  const typePillLabel = slot.kind === "histogram" ? "numeric" : "categorical";

  const statsPill = (() => {
    // Histogram: show shape or range
    if (slot.kind === "histogram" && prefetchedHistogram) {
      if (insights.shape && insights.shape.direction !== "symmetric") {
        return insights.shape.direction;
      }
      if (insights.histogramConcentration && insights.histogramConcentration.topNFraction > 0.5) {
        return `top ${insights.histogramConcentration.n} = ${Math.round(insights.histogramConcentration.topNFraction * 100)}%`;
      }
      const bins = prefetchedHistogram.dataset.bins;
      if (bins.length === 0) return null;
      return `${formatNumber(bins[0].min, { maximumFractionDigits: 0 })} – ${formatNumber(bins[bins.length - 1].max, { maximumFractionDigits: 0 })}`;
    }
    // Categorical: show distribution shape (not dominant value — already visible in bars)
    if (isCategorical && prefetchedCategoricalRows) {
      if (insights.categoricalConcentration && insights.categoricalConcentration.topNFraction > 0.5) {
        return `top ${insights.categoricalConcentration.n} = ${Math.round(insights.categoricalConcentration.topNFraction * 100)}%`;
      }
      if (insights.diversity && insights.diversity.normalizedEntropy > 0.85 && insights.diversity.uniqueCount > 3) {
        return "even spread";
      }
      if (insights.diversity && insights.diversity.normalizedEntropy < 0.5 && insights.diversity.uniqueCount > 2) {
        return "concentrated";
      }
      return `${prefetchedCategoricalRows.length} unique`;
    }
    return null;
  })();

  const selectionPill =
    comparisonState.hasSelection && slot.kind === "histogram" && prefetchedHistogram?.selection
      ? `${formatNumber(prefetchedHistogram.selection.totalCount)} sel`
      : comparisonState.hasSelection && isCategorical && prefetchedCategoricalRows
        ? (() => {
            const selCount = prefetchedCategoricalRows.reduce(
              (sum, row) => sum + (row.selectionCount ?? 0), 0,
            );
            return selCount > 0 ? `${formatNumber(selCount)} sel` : null;
          })()
        : null;

  return (
    <div style={queryWidgetThemeVars}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <Text fw={600} className="shrink-0" style={panelTextStyle}>
            {slot.label}
          </Text>
          <Badge size="xs" styles={panelTypePillStyles}>
            {typePillLabel}
          </Badge>
          {statsPill && (
            <Badge size="xs" styles={panelPillStyles}>
              {statsPill}
            </Badge>
          )}
          {selectionPill && (
            <Badge size="xs" styles={panelPillStyles}>
              {selectionPill}
            </Badge>
          )}
        </div>
        <Tooltip label={`Remove ${slot.label}`} position="left" withArrow>
          <ActionIcon
            variant="subtle"
            size={18}
            radius="sm"
            onClick={() => removeInfoWidget(slot.column)}
            aria-label={`Remove ${slot.label} widget`}
            styles={iconBtnStyles}
          >
            <X size={10} />
          </ActionIcon>
        </Tooltip>
      </div>

      {slot.kind === "histogram" ? (
        prefetchedHistogram ? (
          <>
          {prefetchedNumericStats && (
            <div className="mb-1.5">
              <NumericStatsRow
                stats={
                  prefetchedNumericStats.selection ??
                  prefetchedNumericStats.filtered ??
                  prefetchedNumericStats.dataset
                }
                column={slot.column}
                onStatHover={setHighlightedStatKey}
              />
            </div>
          )}
          <QueryInfoHistogram
            bins={prefetchedHistogram.dataset.bins}
            totalCount={prefetchedHistogram.dataset.totalCount}
            column={slot.column}
            comparisonState={comparisonState}
            selectionBins={prefetchedHistogram.selection?.bins ?? null}
            selectionTotalCount={prefetchedHistogram.selection?.totalCount ?? null}
            filteredBins={prefetchedHistogram.filtered?.bins ?? null}
            filteredTotalCount={prefetchedHistogram.filtered?.totalCount ?? null}
            highlightValues={highlightValues}
          />
          <InsightAnnotations insights={insights} />
          </>
        ) : (
          <Text style={panelTextDimStyle}>No numeric data</Text>
        )
      ) : slot.kind === "facet-summary" ? (
        prefetchedCategoricalRows ? (
          <>
            <QueryFacetSummary
              rows={prefetchedCategoricalRows}
              comparisonState={comparisonState}
              visibleCount={visibleCount}
            />
            <InsightAnnotations insights={insights} />
            {categoricalCanExpand && (
              <UnstyledButton
                onClick={() => setExpanded((prev) => !prev)}
                style={panelTextDimStyle}
                className="mt-0.5"
              >
                {expanded ? "show fewer" : `${categoricalHiddenCount} more…`}
              </UnstyledButton>
            )}
          </>
        ) : (
          <Text style={panelTextDimStyle}>No data</Text>
        )
      ) : prefetchedCategoricalRows ? (
        <>
          <QueryFacetSummary
            rows={prefetchedCategoricalRows}
            comparisonState={comparisonState}
            visibleCount={visibleCount}
          />
          <InsightAnnotations insights={insights} />
          {categoricalCanExpand && (
            <UnstyledButton
              onClick={() => setExpanded((prev) => !prev)}
              style={panelTextDimStyle}
              className="mt-0.5"
            >
              {expanded ? "show fewer" : `${categoricalHiddenCount} more…`}
            </UnstyledButton>
          )}
        </>
      ) : (
        <Text style={panelTextDimStyle}>No data</Text>
      )}
    </div>
  );
}
