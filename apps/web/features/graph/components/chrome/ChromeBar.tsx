"use client";

import { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Camera,
  Eye,
  EyeOff,
  Filter,
  GanttChart,
  Info,
  LayoutPanelLeft,
  LocateFixed,
  MousePointerSquareDashed,
  Palette,
  Share2,
  SlidersHorizontal,
  Table2,
  Tag,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { RendererToggleButton } from "./RendererToggleButton";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { getLayerConfig } from "@/features/graph/lib/layers";
import {
  clearSelectionClause,
  createSelectionSource,
} from "@/features/graph/lib/cosmograph-selection";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import {
  useGraphCamera,
  useGraphExport,
  useGraphInstance,
  useGraphSelection,
} from "@/features/graph/cosmograph";
import { densityCssPx } from "@/lib/density";
import { crisp } from "@/lib/motion";
import {
  chromePillSurfaceStyle,
  graphControlBtnStyles,
} from "../panels/PanelShell";
import { useShellVariantContext } from "../shell/ShellVariantContext";
import type { PanelId } from "@/features/graph/stores";

/** Panel openers rendered in pill 1. */
const PANEL_REGISTRY: Record<
  string,
  { icon: typeof SlidersHorizontal; label: string }
> = {
  config: { icon: SlidersHorizontal, label: "Configuration" },
  filters: { icon: Filter, label: "Filters" },
  info: { icon: Info, label: "Info" },
  wiki: { icon: BookOpen, label: "Wiki" },
};

const PANEL_ORDER: ReadonlyArray<Exclude<PanelId, "about">> = [
  "wiki",
  "info",
  "filters",
  "config",
];

type MenuId = "view" | "display" | "selection" | "chrome";

const MOBILE_ICON_SIZE = 40;
const GLYPH_SIZE = 14;
const GLYPH_STROKE = 1.5;

function SubgroupDivider() {
  return (
    <div
      aria-hidden
      className="mx-1 h-5 w-px shrink-0"
      style={{ backgroundColor: "var(--graph-panel-border)" }}
    />
  );
}

const pillStyle = {
  ...chromePillSurfaceStyle,
  padding: densityCssPx(3),
} as const;

const trayPillStyle = {
  ...chromePillSurfaceStyle,
  padding: densityCssPx(8),
  borderRadius: densityCssPx(20),
} as const;

const trayGridStyle = (columns: number) => ({
  display: "grid",
  gap: densityCssPx(8),
  gridTemplateColumns: `repeat(${columns}, max-content)`,
  justifyContent: "center",
  justifyItems: "center",
}) as const;

/** Selection tray uses flex so conditional Lock/Clear buttons don't leave
 *  empty grid gaps reserved on the right before they appear. Items flow
 *  left-to-right, the tray pill grows naturally as buttons pop in. */
const selectionTrayFlexStyle = {
  display: "flex",
  gap: densityCssPx(8),
  alignItems: "center",
  justifyContent: "center",
} as const;

interface PillButtonProps {
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
  active?: boolean;
  pressed?: boolean | undefined;
  isMobile: boolean;
}

function PillButton({ icon: Icon, label, onClick, active, pressed, isMobile }: PillButtonProps) {
  const btn = (
    <ActionIcon
      variant="transparent"
      size={isMobile ? MOBILE_ICON_SIZE : "lg"}
      radius="xl"
      className="graph-icon-btn"
      styles={graphControlBtnStyles}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ?? pressed}
    >
      <Icon size={GLYPH_SIZE} strokeWidth={GLYPH_STROKE} />
    </ActionIcon>
  );

  if (isMobile) return btn;

  return (
    <Tooltip label={label} position="bottom" withArrow>
      {btn}
    </Tooltip>
  );
}

/**
 * Top-right chrome bar — identical structure across mobile and desktop so
 * muscle memory transfers between devices.
 *
 * Pill 1: [wiki] | [config · filter · info] | [timeline · table] | [theme]
 * Pill 2: [View] | [Display] | [Selection] | [Chrome]
 *
 * Pill 2's four menus each drop the SAME persistent tray container below
 * pill 2. The tray stays mounted while any menu is open and swaps its
 * inner contents keyed on the active menu — no flex re-layout of the
 * column, so switching menus doesn't visibly jump the tray's Y position.
 * The outer `layout` prop animates tray width between menus with
 * different item counts.
 *
 * Selection tray embeds `data-chrome-selection-portal` which CanvasControls
 * portals Rect/Lasso/Lock/Clear into.
 */
export function ChromeBar() {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const mode = useGraphStore((s) => s.mode);
  const selectedNode = useGraphStore((s) => s.selectedNode);

  const openPanels = useDashboardStore((s) => s.openPanels);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const togglePanelsVisible = useDashboardStore((s) => s.togglePanelsVisible);
  const toggleUiHidden = useDashboardStore((s) => s.toggleUiHidden);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const closePanel = useDashboardStore((s) => s.closePanel);
  const openOnlyPanel = useDashboardStore((s) => s.openOnlyPanel);

  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const clearVisibilityScopeClause = useDashboardStore((s) => s.clearVisibilityScopeClause);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const toggleTable = useDashboardStore((s) => s.toggleTable);

  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const connectedSelect = useDashboardStore((s) => s.connectedSelect);
  const toggleConnectedSelect = useDashboardStore((s) => s.toggleConnectedSelect);
  const renderLinks = useDashboardStore((s) => s.renderLinks);
  const setRenderLinks = useDashboardStore((s) => s.setRenderLinks);
  const showPointLabels = useDashboardStore((s) => s.showPointLabels);
  const setShowPointLabels = useDashboardStore((s) => s.setShowPointLabels);
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const setShowColorLegend = useDashboardStore((s) => s.setShowColorLegend);

  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);

  const cosmograph = useGraphInstance();
  const { fitView, fitViewByIndices, zoomToPoint } = useGraphCamera();
  const { selectPoint, getSelectedPointIndices } = useGraphSelection();
  const { captureScreenshot } = useGraphExport();

  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null);
  const [uiSpinCount, setUiSpinCount] = useState(0);

  const modeConfig = getModeConfig(mode);
  const availablePanels = new Set(modeConfig.layout.availablePanels);
  const panelItems = PANEL_ORDER
    .filter((panel) => availablePanels.has(panel) && panel in PANEL_REGISTRY)
    .map((panel) => ({ panel, ...PANEL_REGISTRY[panel] }));
  const wikiItem = panelItems.find((item) => item.panel === "wiki");
  const dataPanels = panelItems.filter((item) => item.panel !== "wiki");

  const layerHasLinks = getLayerConfig(activeLayer).hasLinks;

  const toggleMenu = useCallback((menu: MenuId) => {
    setActiveMenu((current) => (current === menu ? null : menu));
  }, []);

  const handlePanelToggle = useCallback(
    (panel: PanelId) => {
      setActiveMenu(null);
      if (!isMobile) {
        togglePanel(panel);
        return;
      }
      if (openPanels[panel]) {
        closePanel(panel);
      } else {
        openOnlyPanel(panel);
      }
    },
    [closePanel, isMobile, openOnlyPanel, openPanels, togglePanel],
  );

  const handleTimelineToggle = useCallback(() => {
    setActiveMenu(null);
    if (showTimeline) {
      clearSelectionClause(
        cosmograph?.pointsSelection,
        createSelectionSource(`timeline:${timelineColumn}`),
      );
      clearVisibilityScopeClause(`timeline:${timelineColumn}`);
      setTimelineSelection(undefined);
    }
    toggleTimeline();
  }, [
    clearVisibilityScopeClause,
    cosmograph,
    setTimelineSelection,
    showTimeline,
    timelineColumn,
    toggleTimeline,
  ]);

  const handleTableToggle = useCallback(() => {
    setActiveMenu(null);
    toggleTable();
  }, [toggleTable]);

  const handleFitView = useCallback(() => {
    const selected = getSelectedPointIndices();
    if (selected.length === 1) {
      zoomToPoint(selected[0], 250);
      return;
    }
    if (selected.length > 1) {
      fitViewByIndices(selected, 250, 0.1);
      return;
    }
    fitView(250, 0.1);
  }, [fitView, fitViewByIndices, getSelectedPointIndices, zoomToPoint]);

  const handleLinksToggle = useCallback(() => {
    if (selectedNode) {
      const turningOn = !connectedSelect;
      toggleConnectedSelect();
      selectPoint(selectedNode.index, false, turningOn);
      return;
    }
    setRenderLinks(!renderLinks);
  }, [
    connectedSelect,
    renderLinks,
    selectPoint,
    selectedNode,
    setRenderLinks,
    toggleConnectedSelect,
  ]);

  const linksButtonActive = selectedNode ? connectedSelect : renderLinks;
  const linksButtonLabel = selectedNode
    ? connectedSelect
      ? "Hide connected nodes"
      : "Show connected nodes"
    : renderLinks
      ? "Hide links"
      : "Show links";

  const selectionMenuActive =
    activeMenu === "selection"
    || selectedPointCount > 0
    || selectionLocked
    || hasCurrentPointScopeSql(currentPointScopeSql);

  if (uiHidden) {
    return (
      <div
        className="absolute right-3 top-3 z-40 flex items-center gap-0.5 rounded-full"
        style={pillStyle}
      >
        <PillButton
          isMobile={isMobile}
          icon={Eye}
          label="Show graph UI"
          onClick={() => {
            setUiSpinCount((c) => c + 1);
            toggleUiHidden();
          }}
        />
      </div>
    );
  }

  const showPanelOpeners = panelsVisible && (wikiItem || dataPanels.length > 0);

  const renderTrayContent = () => {
    if (activeMenu === "view") {
      return (
        <div style={trayGridStyle(2)}>
          <PillButton
            isMobile={isMobile}
            icon={LocateFixed}
            label="Fit view"
            onClick={() => {
              handleFitView();
              setActiveMenu(null);
            }}
          />
          <PillButton
            isMobile={isMobile}
            icon={Camera}
            label="Save screenshot"
            onClick={() => {
              captureScreenshot();
              setActiveMenu(null);
            }}
          />
        </div>
      );
    }
    if (activeMenu === "display") {
      const columns = layerHasLinks ? 3 : 2;
      return (
        <div style={trayGridStyle(columns)}>
          <PillButton
            isMobile={isMobile}
            icon={Tag}
            label={showPointLabels ? "Hide labels" : "Show labels"}
            onClick={() => setShowPointLabels(!showPointLabels)}
            active={showPointLabels}
          />
          <PillButton
            isMobile={isMobile}
            icon={Palette}
            label={showColorLegend ? "Hide legend" : "Show legend"}
            onClick={() => setShowColorLegend(!showColorLegend)}
            active={showColorLegend}
          />
          {layerHasLinks && (
            <PillButton
              isMobile={isMobile}
              icon={Share2}
              label={linksButtonLabel}
              onClick={handleLinksToggle}
              active={linksButtonActive}
            />
          )}
        </div>
      );
    }
    if (activeMenu === "selection") {
      return <div data-chrome-selection-portal style={selectionTrayFlexStyle} />;
    }
    if (activeMenu === "chrome") {
      return (
        <div style={trayGridStyle(2)}>
          <PillButton
            isMobile={isMobile}
            icon={LayoutPanelLeft}
            label={panelsVisible ? "Hide panels" : "Show panels"}
            onClick={togglePanelsVisible}
            pressed={!panelsVisible}
          />
          <ActionIcon
            variant="transparent"
            size={isMobile ? MOBILE_ICON_SIZE : "lg"}
            radius="xl"
            className="graph-icon-btn"
            styles={graphControlBtnStyles}
            onClick={() => {
              setUiSpinCount((c) => c + 1);
              toggleUiHidden();
            }}
            aria-label="Hide graph UI"
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{ rotate: uiSpinCount * 360 }}
              transition={crisp}
            >
              <EyeOff size={GLYPH_SIZE} strokeWidth={GLYPH_STROKE} />
            </motion.div>
          </ActionIcon>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="absolute right-3 top-3 z-40 flex flex-col items-end gap-1.5">
      {/* Pill 1 — content + theme. */}
      <div className="flex items-center gap-0.5 rounded-full" style={pillStyle}>
        {showPanelOpeners && wikiItem && (
          <PillButton
            isMobile={isMobile}
            icon={wikiItem.icon}
            label={wikiItem.label}
            onClick={() => handlePanelToggle(wikiItem.panel)}
            active={openPanels[wikiItem.panel]}
          />
        )}

        {showPanelOpeners && wikiItem && dataPanels.length > 0 && <SubgroupDivider />}

        {showPanelOpeners && dataPanels.map((item) => (
          <PillButton
            key={item.panel}
            isMobile={isMobile}
            icon={item.icon}
            label={item.label}
            onClick={() => handlePanelToggle(item.panel)}
            active={openPanels[item.panel]}
          />
        ))}

        {showPanelOpeners && <SubgroupDivider />}

        <PillButton
          isMobile={isMobile}
          icon={GanttChart}
          label={showTimeline ? "Hide timeline" : "Show timeline"}
          onClick={handleTimelineToggle}
          active={showTimeline}
        />

        <PillButton
          isMobile={isMobile}
          icon={Table2}
          label={tableOpen ? "Hide table" : "Show table"}
          onClick={handleTableToggle}
          active={tableOpen}
        />

        <SubgroupDivider />

        <ThemeToggle grouped />
      </div>

      {/* Pill 2 — renderer toggle + four grouped menu icons (same on mobile + desktop). */}
      <div className="flex items-center gap-0.5 rounded-full" style={pillStyle}>
        <RendererToggleButton isMobile={isMobile} grouped />

        <SubgroupDivider />

        <PillButton
          isMobile={isMobile}
          icon={LocateFixed}
          label="View"
          onClick={() => toggleMenu("view")}
          active={activeMenu === "view"}
        />
        <PillButton
          isMobile={isMobile}
          icon={Tag}
          label="Display"
          onClick={() => toggleMenu("display")}
          active={activeMenu === "display"}
        />
        <PillButton
          isMobile={isMobile}
          icon={MousePointerSquareDashed}
          label="Selection"
          onClick={() => toggleMenu("selection")}
          active={selectionMenuActive}
        />
        <PillButton
          isMobile={isMobile}
          icon={EyeOff}
          label="Chrome"
          onClick={() => toggleMenu("chrome")}
          active={activeMenu === "chrome"}
        />
      </div>

      {/* Persistent tray slot — swaps contents without re-flexing the column. */}
      <AnimatePresence>
        {activeMenu !== null && (
          <motion.div
            key="menu-tray"
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ scale: crisp, opacity: { duration: 0.1 } }}
            style={trayPillStyle}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeMenu}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
              >
                {renderTrayContent()}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
