import { create } from 'zustand'
import type { WikiGraphResponse } from '@/lib/engine/wiki-types'
import { fetchWikiGraphClient } from '@/features/wiki/lib/wiki-client'

// ---------------------------------------------------------------------------
// Route model
// ---------------------------------------------------------------------------

export type WikiRoute =
  | { kind: "graph" }
  | { kind: "page"; slug: string }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface WikiState {
  currentRoute: WikiRoute
  routeHistory: WikiRoute[]
  historyIndex: number

  graphData: WikiGraphResponse | null
  graphReleaseId: string | null
  graphLoading: boolean
  graphError: string | null
  globalGraphOpen: boolean
  tocOpen: boolean
  localGraphPopped: boolean
  fullscreenAnim: string | null

  navigateToPage: (slug: string) => void
  navigateToGraph: () => void
  goBack: () => void
  goForward: () => void
  fetchGraphData: (graphReleaseId: string, opts?: { force?: boolean }) => Promise<void>
  setGlobalGraphOpen: (open: boolean) => void
  setTocOpen: (open: boolean) => void
  setLocalGraphPopped: (popped: boolean) => void
  setFullscreenAnim: (name: string | null) => void
  reset: () => void
}

const GRAPH_HOME: WikiRoute = { kind: "graph" }

function routesEqual(a: WikiRoute, b: WikiRoute): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "page" && b.kind === "page") return a.slug === b.slug
  return true
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWikiStore = create<WikiState>((set, get) => ({
  currentRoute: GRAPH_HOME,
  routeHistory: [GRAPH_HOME],
  historyIndex: 0,

  graphData: null,
  graphReleaseId: null,
  graphLoading: false,
  graphError: null,
  globalGraphOpen: false,
  tocOpen: false,
  localGraphPopped: false,
  fullscreenAnim: null,

  navigateToPage: (slug) =>
    set((s) => {
      const target: WikiRoute = { kind: "page", slug }
      if (routesEqual(s.currentRoute, target)) return s
      const trimmed = s.routeHistory.slice(0, s.historyIndex + 1)
      return {
        currentRoute: target,
        routeHistory: [...trimmed, target],
        historyIndex: trimmed.length,
      }
    }),

  navigateToGraph: () =>
    set((s) => {
      if (s.currentRoute.kind === "graph") return s
      const trimmed = s.routeHistory.slice(0, s.historyIndex + 1)
      return {
        currentRoute: GRAPH_HOME,
        routeHistory: [...trimmed, GRAPH_HOME],
        historyIndex: trimmed.length,
      }
    }),

  goBack: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s
      const newIndex = s.historyIndex - 1
      return {
        currentRoute: s.routeHistory[newIndex],
        historyIndex: newIndex,
      }
    }),

  goForward: () =>
    set((s) => {
      if (s.historyIndex >= s.routeHistory.length - 1) return s
      const newIndex = s.historyIndex + 1
      return {
        currentRoute: s.routeHistory[newIndex],
        historyIndex: newIndex,
      }
    }),

  fetchGraphData: async (graphReleaseId, opts) => {
    const state = get()
    if (state.graphLoading) return
    // Refetch if release changed or force requested; no-op if same release + data exists
    const releaseChanged = state.graphReleaseId !== graphReleaseId
    if (state.graphData && !releaseChanged && !opts?.force) return

    set({ graphLoading: true, graphError: null })
    try {
      const data = await fetchWikiGraphClient(graphReleaseId)
      set({ graphData: data, graphReleaseId: graphReleaseId, graphLoading: false })
    } catch (err) {
      set({
        graphError: err instanceof Error ? err.message : 'Failed to load wiki graph',
        graphLoading: false,
      })
    }
  },

  setGlobalGraphOpen: (open) => set({ globalGraphOpen: open }),
  setTocOpen: (open) => set({ tocOpen: open }),
  setLocalGraphPopped: (popped) => set({ localGraphPopped: popped }),
  setFullscreenAnim: (name) => set({ fullscreenAnim: name }),

  reset: () =>
    set({
      currentRoute: GRAPH_HOME,
      routeHistory: [GRAPH_HOME],
      historyIndex: 0,
      globalGraphOpen: false,
      tocOpen: false,
      localGraphPopped: false,
      fullscreenAnim: null,
      // graphData is intentionally preserved across resets
    }),
}))
