import type { GraphMode } from './types'
import type { ActivePanel } from './stores'

/** What chrome/controls each mode makes available in the dashboard. */
export interface ModeLayout {
  /** Show the left toolbar (panel toggles, timeline, data table) */
  showToolbar: boolean
  /** Show the bottom timeline strip */
  showTimeline: boolean
  /** Show the bottom-right stats overlay */
  showStatsBar: boolean
  /** Show canvas controls (fit, select, zoom) */
  showCanvasControls: boolean
  /** Show color/size legends on canvas */
  showLegends: boolean
  /** Show the data table */
  showDataTable: boolean
  /** Which side panels are available to open */
  availablePanels: ActivePanel[]
}

/** Configuration for a single mode. */
export interface ModeConfig {
  key: GraphMode
  label: string
  color: string
  placeholder: string
  layout: ModeLayout
}

/**
 * Mode registry — single source of truth for all mode behavior.
 *
 * To add a new mode or expand an existing one:
 * 1. Add the key to `GraphMode` union in types.ts
 * 2. Add its config entry here
 * 3. DashboardShell and PromptBox automatically pick it up
 */
export const MODES: Record<GraphMode, ModeConfig> = {
  ask: {
    key: 'ask',
    label: 'Ask',
    color: '#a8c5e9', // soft-blue
    placeholder: 'Ask the knowledge graph...',
    layout: {
      showToolbar: false,
      showTimeline: false,
      showStatsBar: true,
      showCanvasControls: false,
      showLegends: false,
      showDataTable: false,
      availablePanels: [],
    },
  },
  explore: {
    key: 'explore',
    label: 'Explore',
    color: '#fbb44e', // golden-yellow
    placeholder: 'Explore the knowledge graph...',
    layout: {
      showToolbar: true,
      showTimeline: true,
      showStatsBar: false,
      showCanvasControls: true,
      showLegends: true,
      showDataTable: true,
      availablePanels: ['config', 'filters', 'info'],
    },
  },
  learn: {
    key: 'learn',
    label: 'Learn',
    color: '#aedc93', // fresh-green
    placeholder: 'Learn from the knowledge graph...',
    layout: {
      showToolbar: false,
      showTimeline: false,
      showStatsBar: true,
      showCanvasControls: false,
      showLegends: false,
      showDataTable: false,
      availablePanels: [],
    },
  },
  write: {
    key: 'write',
    label: 'Write',
    color: '#ffada4', // warm-coral
    placeholder: 'Write with the knowledge graph...',
    layout: {
      showToolbar: false,
      showTimeline: false,
      showStatsBar: true,
      showCanvasControls: false,
      showLegends: false,
      showDataTable: false,
      availablePanels: [],
    },
  },
}

/** Get mode config by key. */
export function getModeConfig(mode: GraphMode): ModeConfig {
  return MODES[mode]
}

/** Ordered list of modes for rendering in PromptBox. */
export const MODE_ORDER: GraphMode[] = ['ask', 'explore', 'learn', 'write']
