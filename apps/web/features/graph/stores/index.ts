export { useGraphStore } from './graph-store'
export {
  selectBottomClearance,
  selectBottomObstacles,
  useDashboardStore,
} from './dashboard-store'
export type {
  ActivePanel,
  OrbSelectionTool,
  PanelId,
  PromptMode,
  RendererMode,
  TableView,
} from './dashboard-store'
export { useShellStore } from './shell-store'
export type { LowPowerProfile, ShellState } from './shell-store'

// Side-effect: seed and keep dashboard.wikiRouteIsGraph in sync with the
// wiki store so the dock layout reads it from a single source on frame 1.
import './wiki-route-mirror'
