"use client";

import { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { motion } from "framer-motion";
import {
  BookOpen,
  BoxSelect,
  Camera,
  CircleDot,
  Eye,
  EyeOff,
  Filter,
  GanttChart,
  Info,
  Lock,
  Palette,
  SlidersHorizontal,
  Table2,
  Unlock,
} from "lucide-react";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { RendererToggleButton } from "@/features/graph/components/chrome/RendererToggleButton";
import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import { useDashboardStore } from "@/features/graph/stores";
import type { PanelId } from "@/features/graph/stores";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { densityCssPx } from "@/lib/density";
import { crisp } from "@/lib/motion";
import {
  chromePillSurfaceStyle,
  graphControlBtnStyles,
} from "@/features/graph/components/panels/PanelShell";
import { MotionControlPanel } from "./MotionControlPanel";
import { useOrbSnapshotStore } from "../stores/snapshot-store";

const MOBILE_ICON_SIZE = 40;
const GLYPH_SIZE = 14;
const GLYPH_STROKE = 1.5;

const pillStyle = {
  ...chromePillSurfaceStyle,
  padding: densityCssPx(3),
} as const;

function SubgroupDivider() {
  return (
    <div
      aria-hidden
      className="mx-1 h-5 w-px shrink-0"
      style={{ backgroundColor: "var(--graph-panel-border)" }}
    />
  );
}

interface PillButtonProps {
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
  active?: boolean;
  pressed?: boolean | undefined;
  disabled?: boolean;
  isMobile: boolean;
}

function PillButton({
  icon: Icon,
  label,
  onClick,
  active,
  pressed,
  disabled,
  isMobile,
}: PillButtonProps) {
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
      disabled={disabled}
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
 * 3D opener bar for /graph in orb-renderer mode.
 *
 * Pill 1: [wiki] | [config · filters · info] | [timeline · table] | [theme]
 * Pill 2: [renderer toggle] | [hide UI]
 *
 * Theme sits at the end of pill 1 to mirror the 2D ChromeBar exactly so
 * muscle memory transfers between renderers. Renderer-clean controls are
 * wired here; filters/timeline write renderer-neutral scope state so the
 * field mask and the native 2D map share one filtered point set.
 *
 * Companion: ChromeBar (apps/web/features/graph/components/chrome) is the
 * 2D equivalent; same pill primitives + style helpers so the two stay
 * visually paired.
 */
export function OrbChromeBar() {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";

  const openPanels = useDashboardStore((s) => s.openPanels);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const showTimeline = useDashboardStore((s) => s.showTimeline);
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const tableOpen = useDashboardStore((s) => s.tableOpen);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const currentPointScopeSql = useDashboardStore((s) => s.currentPointScopeSql);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const closePanel = useDashboardStore((s) => s.closePanel);
  const openOnlyPanel = useDashboardStore((s) => s.openOnlyPanel);
  const toggleTable = useDashboardStore((s) => s.toggleTable);
  const toggleTimeline = useDashboardStore((s) => s.toggleTimeline);
  const toggleUiHidden = useDashboardStore((s) => s.toggleUiHidden);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);
  const clearVisibilityScopeClause = useDashboardStore(
    (s) => s.clearVisibilityScopeClause,
  );
  const lockSelection = useDashboardStore((s) => s.lockSelection);
  const unlockSelection = useDashboardStore((s) => s.unlockSelection);
  const orbSelectionTool = useDashboardStore((s) => s.orbSelectionTool);
  const toggleOrbRectangleSelection = useDashboardStore(
    (s) => s.toggleOrbRectangleSelection,
  );
  const showColorLegend = useDashboardStore((s) => s.showColorLegend);
  const setShowColorLegend = useDashboardStore((s) => s.setShowColorLegend);
  const showSizeLegend = useDashboardStore((s) => s.showSizeLegend);
  const setShowSizeLegend = useDashboardStore((s) => s.setShowSizeLegend);
  const snapshotHandle = useOrbSnapshotStore((s) => s.handle);

  const [uiSpinCount, setUiSpinCount] = useState(0);
  const [motionPanelOpen, setMotionPanelOpen] = useState(false);
  const canLockSelection =
    selectedPointCount > 0 || hasCurrentPointScopeSql(currentPointScopeSql);
  const lockButtonDisabled = !selectionLocked && !canLockSelection;

  const handlePanelToggle = useCallback(
    (panel: PanelId) => {
      if (!isMobile) {
        togglePanel(panel);
        return;
      }
      // Mobile keeps a single panel open at a time so the viewport
      // doesn't fight the field substrate for space — same rule the 2D
      // ChromeBar enforces for mobile.
      if (openPanels[panel]) {
        closePanel(panel);
      } else {
        openOnlyPanel(panel);
      }
    },
    [closePanel, isMobile, openOnlyPanel, openPanels, togglePanel],
  );

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

  return (
    <div className="absolute right-3 top-3 z-40 flex flex-col items-end gap-1.5">
      {/* Pill 1 — content openers + table. */}
      <div className="flex items-center gap-0.5 rounded-full" style={pillStyle}>
        <PillButton
          isMobile={isMobile}
          icon={BookOpen}
          label="Wiki"
          onClick={() => handlePanelToggle("wiki")}
          active={openPanels.wiki}
        />

        <SubgroupDivider />

        <PillButton
          isMobile={isMobile}
          icon={SlidersHorizontal}
          label="Configuration"
          onClick={() => handlePanelToggle("config")}
          active={openPanels.config}
        />
        <PillButton
          isMobile={isMobile}
          icon={Filter}
          label="Filters"
          onClick={() => handlePanelToggle("filters")}
          active={openPanels.filters}
        />
        <PillButton
          isMobile={isMobile}
          icon={Info}
          label="Info"
          onClick={() => handlePanelToggle("info")}
          active={openPanels.info}
        />

        <SubgroupDivider />

        <PillButton
          isMobile={isMobile}
          icon={GanttChart}
          label={showTimeline ? "Hide timeline" : "Show timeline"}
          onClick={() => {
            if (showTimeline) {
              clearVisibilityScopeClause(`timeline:${timelineColumn}`);
              setTimelineSelection(undefined);
            }
            toggleTimeline();
          }}
          active={showTimeline}
        />
        <PillButton
          isMobile={isMobile}
          icon={Table2}
          label={tableOpen ? "Hide table" : "Show table"}
          onClick={toggleTable}
          active={tableOpen}
        />

        <SubgroupDivider />

        <ThemeToggle grouped />
      </div>

      {/* Pill 2 — chrome controls (renderer toggle, motion controls, hide UI). */}
      <div className="flex items-center gap-0.5 rounded-full" style={pillStyle}>
        <RendererToggleButton isMobile={isMobile} grouped />

        <SubgroupDivider />

        <PillButton
          isMobile={isMobile}
          icon={BoxSelect}
          label={
            orbSelectionTool === "rectangle"
              ? "Exit rectangle select"
              : "Rectangle select"
          }
          onClick={toggleOrbRectangleSelection}
          active={orbSelectionTool === "rectangle"}
        />
        <PillButton
          isMobile={isMobile}
          icon={selectionLocked ? Lock : Unlock}
          label={selectionLocked ? "Unlock selection" : "Lock selection"}
          onClick={() => {
            if (lockButtonDisabled) return;
            if (selectionLocked) {
              unlockSelection();
            } else {
              lockSelection();
            }
          }}
          active={selectionLocked}
          disabled={lockButtonDisabled}
        />
        <PillButton
          isMobile={isMobile}
          icon={Palette}
          label={showColorLegend ? "Hide highlight legend" : "Show highlight legend"}
          onClick={() => setShowColorLegend(!showColorLegend)}
          active={showColorLegend}
        />
        <PillButton
          isMobile={isMobile}
          icon={CircleDot}
          label={showSizeLegend ? "Hide size legend" : "Show size legend"}
          onClick={() => setShowSizeLegend(!showSizeLegend)}
          active={showSizeLegend}
        />
        <PillButton
          isMobile={isMobile}
          icon={Camera}
          label="Save snapshot"
          onClick={() => snapshotHandle?.captureSnapshot()}
          disabled={!snapshotHandle}
        />

        <SubgroupDivider />

        <MotionControlPanel
          isMobile={isMobile}
          opened={motionPanelOpen}
          onOpenChange={setMotionPanelOpen}
        />

        <SubgroupDivider />

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
    </div>
  );
}
