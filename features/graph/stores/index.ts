export { useGraphStore } from './graph-store'
export {
  selectBottomClearance,
  selectBottomObstacles,
  useDashboardStore,
} from './dashboard-store'
export type { ActivePanel, PanelId, PromptMode, TableView } from './dashboard-store'

// Side-effect: seed and keep dashboard.wikiRouteIsGraph in sync with the
// wiki store so the dock layout reads it from a single source on frame 1.
import './wiki-route-mirror'
