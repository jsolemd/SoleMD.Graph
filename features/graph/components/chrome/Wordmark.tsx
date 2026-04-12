"use client";

import { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Eye,
  EyeOff,
  Filter,
  Info,
  LayoutPanelLeft,
  SlidersHorizontal,
} from "lucide-react";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import { getModeConfig } from "@/features/graph/lib/modes";
import { iconBtnStyles } from "../panels/PanelShell";
import { crisp, chromeToggle } from "@/lib/motion";
import type { PanelId } from "@/features/graph/stores";
import { useGraphControlContrast } from "./use-graph-control-contrast";
import { BrandWordmarkButton } from "./BrandWordmarkButton";

const PANEL_REGISTRY: Record<
  string,
  { icon: typeof SlidersHorizontal; label: string }
> = {
  config: { icon: SlidersHorizontal, label: "Configuration" },
  filters: { icon: Filter, label: "Filters" },
  info: { icon: Info, label: "Info" },
  wiki: { icon: BookOpen, label: "Wiki" },
};

export function Wordmark() {
  const mode = useGraphStore((s) => s.mode);
  const openPanels = useDashboardStore((s) => s.openPanels);
  const panelsVisible = useDashboardStore((s) => s.panelsVisible);
  const uiHidden = useDashboardStore((s) => s.uiHidden);
  const toggleUiHidden = useDashboardStore((s) => s.toggleUiHidden);
  const togglePanel = useDashboardStore((s) => s.togglePanel);
  const togglePanelsVisible = useDashboardStore((s) => s.togglePanelsVisible);
  const modeConfig = getModeConfig(mode);
  const modeColor = modeConfig.color;
  const panelItems = modeConfig.layout.availablePanels
    .filter((p): p is Exclude<PanelId, 'about'> => p !== 'about' && p in PANEL_REGISTRY)
    .map((panel) => ({ panel, ...PANEL_REGISTRY[panel] }));
  const [spinCount, setSpinCount] = useState(0);
  const { contrastAttr, contrastBlurClass } = useGraphControlContrast();

  return (
    <>
      {/* Left: logo + panel icon row */}
      <div
        className={`absolute top-3 left-3 z-40 flex flex-col gap-2 ${contrastBlurClass}`}
        {...contrastAttr}
      >
        <div className="flex items-center gap-3">
          {!uiHidden && (
            <BrandWordmarkButton
              accentColor={modeColor}
              onClick={() => togglePanel("about")}
            />
          )}
        </div>

        <AnimatePresence>
          {panelsVisible && !uiHidden && (
            <motion.div
              className="flex items-center gap-0.5"
              {...chromeToggle}
            >
              {panelItems.map(({ panel, icon: Icon, label }) => {
                const isActive = openPanels[panel];
                return (
                  <Tooltip key={panel} label={label} position="bottom" withArrow>
                    <ActionIcon
                      variant="transparent"
                      size="lg"
                      radius="xl"
                      className="graph-icon-btn"
                      styles={iconBtnStyles}
                      onClick={() => togglePanel(panel)}
                      aria-pressed={isActive}
                      aria-label={label}
                    >
                      <Icon />
                    </ActionIcon>
                  </Tooltip>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: global chrome only (panels, hide-ui, theme) */}
      <div
        className={`absolute right-3 top-3 z-40 flex items-center gap-0.5 ${contrastBlurClass}`}
        {...contrastAttr}
      >
        {!uiHidden && (
          <Tooltip
            label={panelsVisible ? "Hide panels" : "Show panels"}
            position="bottom"
            withArrow
          >
            <ActionIcon
              variant="transparent"
              size="lg"
              radius="xl"
              className="graph-icon-btn"
              styles={iconBtnStyles}
              onClick={togglePanelsVisible}
              aria-pressed={panelsVisible}
              aria-label={panelsVisible ? "Hide panels" : "Show panels"}
            >
              <LayoutPanelLeft />
            </ActionIcon>
          </Tooltip>
        )}

        <Tooltip
          label={uiHidden ? "Show graph UI" : "Hide graph UI"}
          position="bottom"
          withArrow
        >
          <ActionIcon
            variant="transparent"
            size="lg"
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={() => {
              setSpinCount((current) => current + 1);
              toggleUiHidden();
            }}
            aria-label={uiHidden ? "Show graph UI" : "Hide graph UI"}
          >
            <motion.div
              className="flex items-center justify-center"
              animate={{ rotate: spinCount * 360 }}
              transition={crisp}
            >
              {uiHidden ? <Eye /> : <EyeOff />}
            </motion.div>
          </ActionIcon>
        </Tooltip>

        <div className="mx-1 h-5 w-px" style={{ backgroundColor: "var(--graph-panel-border)" }} />

        <ThemeToggle />
      </div>
    </>
  );
}
