"use client";

import { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  BrainCircuit,
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
            <Tooltip label="About SoleMD" position="right" withArrow>
              <button
                type="button"
                className="graph-icon-btn flex cursor-pointer items-center gap-2 rounded-2xl border-0 px-3 py-1.5 transition-[background-color,box-shadow,opacity] hover:opacity-80"
                style={{ backgroundColor: "var(--graph-control-idle-bg, transparent)", boxShadow: "inset 0 0 0 1px var(--graph-control-idle-border, transparent)" }}
                onClick={() => togglePanel("about")}
                aria-label="About SoleMD"
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300"
                  style={{ backgroundColor: modeColor }}
                >
                  <BrainCircuit size={15} color="white" />
                </div>
                <span
                  className="text-lg font-semibold select-none"
                  style={{ color: "var(--graph-wordmark-text)" }}
                >
                  Sole
                  <span
                    className="transition-colors duration-300"
                    style={{ color: modeColor }}
                  >
                    MD
                  </span>
                </span>
              </button>
            </Tooltip>
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
