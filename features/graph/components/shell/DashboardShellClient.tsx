"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import {
  CosmographProvider,
  CosmographRangeColorLegend,
  CosmographSizeLegend,
  CosmographTypeColorLegend,
} from "@cosmograph/react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { GanttChart, Table2 } from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { panelCardClassName, panelCardStyle, panelTextStyle, panelTextDimStyle, iconBtnStyles } from "../panels/PanelShell";
import { getModeConfig } from "@/features/graph/lib/modes";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useGraphBundle } from "@/features/graph/lib/use-graph-bundle";
import { formatBytes, formatNumber } from "@/lib/helpers";
import { GraphCanvas } from "../canvas/GraphCanvas";
import { ModeColorSync } from "./ModeColorSync";
import { Wordmark } from "../chrome/Wordmark";
import { PromptBox } from "../panels/PromptBox";
import { TimelineBar } from "../chrome/TimelineBar";
import { GeoTimeline } from "../chrome/GeoTimeline";
import { StatsBar } from "../chrome/StatsBar";
import { LayerSwitcher } from "../chrome/LayerSwitcher";
import { CanvasControls } from "../explore/CanvasControls";
import { ConfigPanel } from "../explore/ConfigPanel";
import { FiltersPanel } from "../explore/FiltersPanel";
import { GeoFiltersPanel } from "../explore/GeoFiltersPanel";
import { InfoPanel } from "../explore/InfoPanel";
import { QueryPanel } from "../explore/QueryPanel";
import { DataTable } from "../explore/DataTable";
import { GeoColorLegend } from "../chrome/GeoColorLegend";
import { DetailPanel } from "../panels/DetailPanel";
import { AboutPanel } from "../panels/AboutPanel";
import type { GraphBundle } from "@/features/graph/types";

const legendStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--graph-panel-border)",
  backgroundColor: "var(--graph-panel-bg)",
  boxShadow: "var(--graph-panel-shadow)",
  padding: 8,
};


function GraphBundleLoadingState({ bundle }: { bundle: GraphBundle }) {
  const qaPointCount =
    typeof bundle.qaSummary?.["point_count"] === "number"
      ? bundle.qaSummary["point_count"]
      : undefined;
  const qaClusterCount =
    typeof bundle.qaSummary?.["cluster_count"] === "number"
      ? bundle.qaSummary["cluster_count"]
      : undefined;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <div
        className="w-[min(540px,92vw)] rounded-3xl px-6 py-7"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          border: "1px solid var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text
                size="xs"
                fw={700}
                style={{
                  color: "var(--graph-panel-text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Graph Bundle
              </Text>
              <Text
                mt={4}
                size="lg"
                fw={600}
                style={panelTextStyle}
              >
                Loading {bundle.graphName} / {bundle.nodeKind}
              </Text>
            </div>
            <Loader size="sm" color="var(--brand-accent)" />
          </Group>

          <Text size="sm" style={panelTextDimStyle}>
            PostgreSQL resolved the active run. The browser is now mounting the
            checksum-scoped bundle into DuckDB-Wasm.
          </Text>

          <div className="grid grid-cols-2 gap-3">
            <BundleStat label="Run" value={bundle.runId.slice(0, 8)} />
            <BundleStat
              label="Checksum"
              value={bundle.bundleChecksum.slice(0, 12)}
            />
            <BundleStat
              label="Bundle Size"
              value={formatBytes(bundle.bundleBytes)}
            />
            <BundleStat
              label="Tables"
              value={formatNumber(
                Object.keys(bundle.bundleManifest.tables).length
              )}
            />
            <BundleStat
              label="Points"
              value={
                qaPointCount != null
                  ? formatNumber(qaPointCount)
                  : "Loading..."
              }
            />
            <BundleStat
              label="Clusters"
              value={
                qaClusterCount != null
                  ? formatNumber(qaClusterCount)
                  : "Loading..."
              }
            />
          </div>
        </Stack>
      </div>
    </div>
  );
}

function GraphBundleErrorState({ error }: { error: Error }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <div
        className="w-[min(520px,92vw)] rounded-3xl px-6 py-7"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          border: "1px solid var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
        }}
      >
        <Stack gap="md">
          <div>
            <Text
              size="xs"
              fw={700}
              style={{
                color: "var(--graph-panel-text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Graph Bundle
            </Text>
            <Text
              mt={4}
              size="lg"
              fw={600}
              style={panelTextStyle}
            >
              Bundle load failed
            </Text>
          </div>

          <Text size="sm" style={panelTextDimStyle}>
            {error.message}
          </Text>

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            styles={{
              root: {
                alignSelf: "flex-start",
                borderColor: "var(--brand-accent)",
                color: "var(--graph-panel-text)",
              },
            }}
          >
            Reload
          </Button>
        </Stack>
      </div>
    </div>
  );
}

function BundleStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={panelCardClassName}
      style={panelCardStyle}
    >
      <Text
        size="xs"
        fw={600}
        style={{
          color: "var(--graph-panel-text-muted)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        mt={4}
        size="sm"
        fw={600}
        style={panelTextStyle}
      >
        {value}
      </Text>
    </div>
  );
}

/** Height of the timeline bar in px. */
const TIMELINE_HEIGHT = 44;

/** Bottom-left toggle bar for timeline and data table. */
function BottomToolbar() {
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const toggleTable = useDashboardStore((s) => s.toggleTable);

  // Float above whichever bottom widgets are visible
  let bottomOffset = 12;
  if (showTimeline) bottomOffset += TIMELINE_HEIGHT;
  if (tableOpen) bottomOffset += tableHeight;

  return (
    <div
      className="absolute left-3 z-20 flex items-center gap-0.5 transition-[bottom] duration-200"
      style={{ bottom: bottomOffset }}
    >
      <Tooltip label={showTimeline ? "Hide timeline" : "Show timeline"} position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={toggleTimeline}
          aria-pressed={showTimeline}
          aria-label={showTimeline ? "Hide timeline" : "Show timeline"}
        >
          <GanttChart size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tableOpen ? "Hide table" : "Show table"} position="top" withArrow>
        <ActionIcon
          variant="transparent"
          size="lg"
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={toggleTable}
          aria-pressed={tableOpen}
          aria-label={tableOpen ? "Hide table" : "Show table"}
        >
          <Table2 size={16} strokeWidth={1.5} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

export function DashboardShellClient({ bundle }: { bundle: GraphBundle }) {
  const mode = useGraphStore((s) => s.mode);
  const activePanel = useDashboardStore((s) => s.activePanel);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const setPanelsVisible = useDashboardStore((s) => s.setPanelsVisible);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const tableHeight = useDashboardStore((s) => s.tableHeight);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const availableLayers = useDashboardStore((s) => s.availableLayers);
  const pointColorStrategy = useDashboardStore((s) => s.pointColorStrategy);
  const isSelectionLocked = useDashboardStore((s) => s.lockedSelection !== null);
  const isMapLayer = getLayerConfig(activeLayer).rendererType === "maplibre";
  const { canvas, data, error, loading, queries } = useGraphBundle(bundle);

  const promptMinimized = useDashboardStore((s) => s.promptMinimized);
  const { layout } = getModeConfig(mode);
  const isCreate = mode === "create";
  /** Canvas shifts right only when create editor is actually visible (not minimized to pill). */
  const canvasShifted = isCreate && !promptMinimized && !isMapLayer;
  const isContinuousColor = pointColorStrategy === "continuous";

  const setShowTimeline = useDashboardStore((s) => s.setShowTimeline);
  const setTableOpen = useDashboardStore((s) => s.setTableOpen);

  // Auto-show widgets when entering a mode that requests them (e.g. explore)
  useEffect(() => {
    if (layout.autoShowPanels) setPanelsVisible(true);
    if (layout.autoShowTimeline) setShowTimeline(true);
    if (layout.autoShowTable) setTableOpen(true);
  }, [layout.autoShowPanels, layout.autoShowTimeline, layout.autoShowTable, setPanelsVisible, setShowTimeline, setTableOpen]);

  if (error) {
    return <GraphBundleErrorState error={error} />;
  }

  if (loading || !canvas || !data || !queries) {
    return <GraphBundleLoadingState bundle={bundle} />;
  }

  return (
    <CosmographProvider>
      <ModeColorSync />
      <div
        className="fixed inset-0"
        style={{ backgroundColor: "var(--graph-bg)" }}
      >
        {/* Graph canvas — always full viewport; in create mode shift right
            so the graph centers in the visible area beside the editor. */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            transform: canvasShifted ? "translateX(min(280px, 22.5vw))" : undefined,
            transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <GraphCanvas canvas={canvas} data={data} />
        </div>

        {/* UI overlays — Wordmark always renders; it gates its own children via uiHidden */}
        <Wordmark />

        {/* About panel — always available via wordmark click */}
        <AnimatePresence>
          {!uiHidden && activePanel === "about" && <AboutPanel />}
        </AnimatePresence>

        {/* Left-side panels — available in all modes when panel bar is visible */}
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "config" && (
            <ConfigPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "filters" && (
            isMapLayer
              ? <GeoFiltersPanel geoNodes={data.geoNodes} />
              : <FiltersPanel />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "info" && (
            <InfoPanel data={data} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && panelsVisible && activePanel === "query" && (
            <QueryPanel
              bundle={bundle}
              runReadOnlyQuery={queries.runReadOnlyQuery}
            />
          )}
        </AnimatePresence>

        {/* Right-side detail panel — always available on point click */}
        <AnimatePresence>
          {!uiHidden && <DetailPanel bundle={bundle} queries={queries} data={data} />}
        </AnimatePresence>

        {/* Legends — right side, stacked, shift above bottom widgets (Cosmograph only) */}
        {!uiHidden && !isMapLayer && (showColorLegend || showSizeLegend) && (
          <div
            className="absolute right-4 z-30 flex flex-col gap-2 transition-[bottom] duration-200"
            style={{
              bottom: 16
                + (showTimeline ? TIMELINE_HEIGHT : 0)
                + (tableOpen ? tableHeight : 0),
            }}
          >
            {showSizeLegend && (
              <CosmographSizeLegend
                selectOnClick={!isSelectionLocked}
                style={legendStyle}
              />
            )}
            {showColorLegend && (
              isContinuousColor ? (
                <CosmographRangeColorLegend style={legendStyle} />
              ) : (
                <CosmographTypeColorLegend
                  selectOnClick={!isSelectionLocked}
                  style={legendStyle}
                />
              )
            )}
          </div>
        )}

        {/* Geo color legend — custom since Cosmograph legends are gated to non-map layers */}
        {!uiHidden && isMapLayer && showColorLegend && (
          <div
            className="absolute right-4 z-30 transition-[bottom] duration-200"
            style={{
              bottom: 16
                + (showTimeline ? TIMELINE_HEIGHT : 0)
                + (tableOpen ? tableHeight : 0),
            }}
          >
            <GeoColorLegend geoNodes={data.geoNodes} />
          </div>
        )}

        {/* Canvas controls (selection tools) — Cosmograph only, MapLibre has no lasso/rectangle select */}
        <AnimatePresence>
          {!uiHidden && panelsVisible && !isMapLayer && <CanvasControls />}
        </AnimatePresence>

        {/* Bottom widgets — overlay on top of graph, pinned to bottom edge */}
        <AnimatePresence>
          {!uiHidden && showTimeline && (
            isMapLayer
              ? <GeoTimeline geoNodes={data.geoNodes} />
              : <TimelineBar />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!uiHidden && tableOpen && (
            <DataTable nodes={activeLayer === 'paper' ? data.paperNodes : activeLayer === 'geo' ? data.geoNodes : data.nodes} />
          )}
        </AnimatePresence>

        {/* Bottom-left toggle bar for timeline & table */}
        {!uiHidden && panelsVisible && <BottomToolbar />}

        {!uiHidden && <PromptBox bundle={bundle} />}
        {!uiHidden && (layout.showStatsBar || availableLayers.length > 1) && (
          <div className="absolute right-3 top-[52px] z-40 flex flex-col items-end gap-1.5">
            {layout.showStatsBar && (
              <StatsBar stats={activeLayer === 'paper' && data.paperStats ? data.paperStats : activeLayer === 'geo' && data.geoStats ? data.geoStats : data.stats} />
            )}
            {availableLayers.length > 1 && <LayerSwitcher layers={availableLayers} />}
          </div>
        )}
      </div>
    </CosmographProvider>
  );
}
