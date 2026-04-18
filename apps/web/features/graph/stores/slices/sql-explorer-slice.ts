import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'
import type { GraphQueryResult } from "@solemd/graph"

export const DEFAULT_SQL_EXPLORER_QUERY = `SELECT
  cluster_id,
  label,
  member_count,
  paper_count
FROM graph_clusters
ORDER BY member_count DESC
LIMIT 10`

export interface SqlExplorerSlice {
  sqlExplorerQuery: string
  sqlExplorerResult: GraphQueryResult | null
  sqlExplorerError: string | null

  setSqlExplorerQuery: (query: string) => void
  setSqlExplorerResult: (result: GraphQueryResult | null) => void
  setSqlExplorerError: (error: string | null) => void
  resetSqlExplorer: () => void
}

export const createSqlExplorerSlice: StateCreator<DashboardState, [], [], SqlExplorerSlice> = (set) => ({
  sqlExplorerQuery: DEFAULT_SQL_EXPLORER_QUERY,
  sqlExplorerResult: null,
  sqlExplorerError: null,

  setSqlExplorerQuery: (query) => set((s) => (
    s.sqlExplorerQuery === query ? s : { sqlExplorerQuery: query }
  )),
  setSqlExplorerResult: (result) => set({ sqlExplorerResult: result }),
  setSqlExplorerError: (error) => set({ sqlExplorerError: error }),
  resetSqlExplorer: () => set({
    sqlExplorerQuery: DEFAULT_SQL_EXPLORER_QUERY,
    sqlExplorerResult: null,
    sqlExplorerError: null,
  }),
})
