import type { GraphMode } from '@/features/graph/config'
import type { PanelId, PromptMode } from '@/features/graph/stores'
import {
  brandPastelFallbackHexByKey,
  brandPastelVarNameByKey,
} from '@/lib/theme/pastel-tokens'

/** What chrome/controls each mode makes available in the dashboard. */
export interface ModeLayout {
  /** Auto-show the panel bar when entering this mode */
  autoShowPanels: boolean
  /** Auto-show the timeline when entering this mode */
  autoShowTimeline: boolean
  /** Auto-show the data table when entering this mode */
  autoShowTable: boolean
  /** Show the bottom timeline strip */
  showTimeline: boolean
  /** Show canvas controls (selection tools) */
  showCanvasControls: boolean
  /** Show color/size legends on canvas */
  showLegends: boolean
  /** Show the data table */
  showDataTable: boolean
  /** Default prompt size when entering this graph mode */
  defaultPromptMode: PromptMode
  /** Which side panels are available to open */
  availablePanels: PanelId[]
  /** Panels to auto-open when entering this mode. */
  defaultOpenPanels?: PanelId[]
}

/** Configuration for a single mode. */
export interface ModeConfig {
  key: GraphMode
  label: string
  /** Hero color hex — used for PromptBox toggles and Mantine `color` props. */
  color: string
  /**
   * CSS variable name (without `var()`) that holds this mode's color.
   * Must reference a variable defined in globals.css with light/dark variants.
   * ModeColorSync sets `--mode-accent: var(<colorVar>)` on the root element.
   */
  colorVar: string
  placeholder: string
  layout: ModeLayout
}

/** All modes share the same panel set — colors adapt via --mode-accent. */
const SHARED_PANELS: PanelId[] = ['config', 'filters', 'info', 'query', 'wiki']

/**
 * Mode registry — single source of truth for all mode behavior.
 *
 * To add a new mode or expand an existing one:
 * 1. Add the key to `GraphMode` union in config.ts
 * 2. Add its config entry here
 * 3. DashboardShell and PromptBox automatically pick it up
 */
export const MODES: Record<GraphMode, ModeConfig> = {
  ask: {
    key: 'ask',
    label: 'Ask',
    color: brandPastelFallbackHexByKey['soft-blue'],
    colorVar: brandPastelVarNameByKey['soft-blue'],
    placeholder: 'Ask the knowledge graph...',
    layout: {
      autoShowPanels: false,
      autoShowTimeline: false,
      autoShowTable: false,
      showTimeline: true,
      showCanvasControls: true,
      showLegends: true,
      showDataTable: true,
      defaultPromptMode: 'normal',
      availablePanels: SHARED_PANELS,
    },
  },
  explore: {
    key: 'explore',
    label: 'Explore',
    color: brandPastelFallbackHexByKey['golden-yellow'],
    colorVar: brandPastelVarNameByKey['golden-yellow'],
    placeholder: 'Explore the knowledge graph...',
    layout: {
      autoShowPanels: true,
      autoShowTimeline: false,
      autoShowTable: false,
      showTimeline: true,
      showCanvasControls: true,
      showLegends: true,
      showDataTable: true,
      defaultPromptMode: 'collapsed',
      availablePanels: SHARED_PANELS,
    },
  },
  learn: {
    key: 'learn',
    label: 'Learn',
    color: brandPastelFallbackHexByKey['fresh-green'],
    colorVar: brandPastelVarNameByKey['fresh-green'],
    placeholder: 'Learn from the knowledge graph...',
    layout: {
      autoShowPanels: false,
      autoShowTimeline: false,
      autoShowTable: false,
      showTimeline: true,
      showCanvasControls: true,
      showLegends: true,
      showDataTable: true,
      defaultPromptMode: 'normal',
      availablePanels: SHARED_PANELS,
      defaultOpenPanels: ['wiki'],
    },
  },
  create: {
    key: 'create',
    label: 'Create',
    color: brandPastelFallbackHexByKey['warm-coral'],
    colorVar: brandPastelVarNameByKey['warm-coral'],
    placeholder: 'Create with the knowledge graph...',
    layout: {
      autoShowPanels: false,
      autoShowTimeline: false,
      autoShowTable: false,
      showTimeline: true,
      showCanvasControls: true,
      showLegends: true,
      showDataTable: true,
      defaultPromptMode: 'maximized',
      availablePanels: SHARED_PANELS,
    },
  },
}

/** Get mode config by key. */
export function getModeConfig(mode: GraphMode): ModeConfig {
  return MODES[mode]
}

/** Ordered list of modes for rendering in PromptBox. */
export const MODE_ORDER: GraphMode[] = ['ask', 'explore', 'learn', 'create']
