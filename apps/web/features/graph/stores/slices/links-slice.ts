import type { StateCreator } from 'zustand'
import {
  DEFAULT_EDGE_SOURCE_ENABLED,
  DEFAULT_EDGE_TIER_ALPHAS,
  DEFAULT_EDGE_TIER_BUDGETS,
  DEFAULT_EDGE_TIER_ENABLED,
  type EdgeSource,
  type EdgeTier,
} from '@/features/graph/lib/edge-types'
import { hasSameRange } from '@/features/graph/lib/helpers'
import type { DashboardState } from '../dashboard-store'

export {
  EDGE_SOURCES,
  EDGE_SOURCE_BITMAP,
  EDGE_TIERS,
  DEFAULT_EDGE_SOURCE_ENABLED,
  DEFAULT_EDGE_TIER_ALPHAS,
  DEFAULT_EDGE_TIER_BUDGETS,
  DEFAULT_EDGE_TIER_ENABLED,
} from '@/features/graph/lib/edge-types'
export type { EdgeSource, EdgeTier } from '@/features/graph/lib/edge-types'

export interface LinksSlice {
  renderLinks: boolean
  linkOpacity: number
  linkGreyoutOpacity: number
  linkVisibilityDistanceRange: [number, number]
  linkVisibilityMinTransparency: number
  linkDefaultWidth: number
  curvedLinks: boolean
  linkDefaultArrows: boolean
  scaleLinksOnZoom: boolean
  edgeTierEnabled: Record<EdgeTier, boolean>
  edgeSourceEnabled: Record<EdgeSource, boolean>
  edgeTierBudgets: Record<EdgeTier, number>
  edgeTierAlphas: Record<EdgeTier, number>

  setRenderLinks: (show: boolean) => void
  setLinkOpacity: (opacity: number) => void
  setLinkGreyoutOpacity: (opacity: number) => void
  setLinkVisibilityDistanceRange: (range: [number, number]) => void
  setLinkVisibilityMinTransparency: (transparency: number) => void
  setLinkDefaultWidth: (width: number) => void
  setCurvedLinks: (curved: boolean) => void
  setLinkDefaultArrows: (arrows: boolean) => void
  setScaleLinksOnZoom: (scale: boolean) => void
  setEdgeTierEnabled: (tier: EdgeTier, enabled: boolean) => void
  setEdgeSourceEnabled: (source: EdgeSource, enabled: boolean) => void
  setEdgeTierBudget: (tier: EdgeTier, budget: number) => void
  setEdgeTierAlpha: (tier: EdgeTier, alpha: number) => void
}

export const createLinksSlice: StateCreator<DashboardState, [], [], LinksSlice> = (set) => ({
  renderLinks: false,
  linkOpacity: 1.0,
  linkGreyoutOpacity: 0.1,
  linkVisibilityDistanceRange: [50, 150] as [number, number],
  linkVisibilityMinTransparency: 0.25,
  linkDefaultWidth: 1,
  curvedLinks: false,
  linkDefaultArrows: false,
  scaleLinksOnZoom: false,
  edgeTierEnabled: { ...DEFAULT_EDGE_TIER_ENABLED },
  edgeSourceEnabled: { ...DEFAULT_EDGE_SOURCE_ENABLED },
  edgeTierBudgets: { ...DEFAULT_EDGE_TIER_BUDGETS },
  edgeTierAlphas: { ...DEFAULT_EDGE_TIER_ALPHAS },

  setRenderLinks: (show) => set((s) => (
    s.renderLinks === show ? s : { renderLinks: show }
  )),
  setLinkOpacity: (opacity) => set((s) => (
    s.linkOpacity === opacity ? s : { linkOpacity: opacity }
  )),
  setLinkGreyoutOpacity: (opacity) => set((s) => (
    s.linkGreyoutOpacity === opacity ? s : { linkGreyoutOpacity: opacity }
  )),
  setLinkVisibilityDistanceRange: (range) => set((s) => (
    hasSameRange(s.linkVisibilityDistanceRange, range)
      ? s
      : { linkVisibilityDistanceRange: range }
  )),
  setLinkVisibilityMinTransparency: (transparency) => set((s) => (
    s.linkVisibilityMinTransparency === transparency
      ? s
      : { linkVisibilityMinTransparency: transparency }
  )),
  setLinkDefaultWidth: (width) => set((s) => (
    s.linkDefaultWidth === width ? s : { linkDefaultWidth: width }
  )),
  setCurvedLinks: (curved) => set((s) => (
    s.curvedLinks === curved ? s : { curvedLinks: curved }
  )),
  setLinkDefaultArrows: (arrows) => set((s) => (
    s.linkDefaultArrows === arrows ? s : { linkDefaultArrows: arrows }
  )),
  setScaleLinksOnZoom: (scale) => set((s) => (
    s.scaleLinksOnZoom === scale ? s : { scaleLinksOnZoom: scale }
  )),
  setEdgeTierEnabled: (tier, enabled) => set((s) => (
    s.edgeTierEnabled[tier] === enabled
      ? s
      : { edgeTierEnabled: { ...s.edgeTierEnabled, [tier]: enabled } }
  )),
  setEdgeSourceEnabled: (source, enabled) => set((s) => (
    s.edgeSourceEnabled[source] === enabled
      ? s
      : { edgeSourceEnabled: { ...s.edgeSourceEnabled, [source]: enabled } }
  )),
  setEdgeTierBudget: (tier, budget) => set((s) => {
    const normalized = Math.max(0, Math.floor(budget))
    return s.edgeTierBudgets[tier] === normalized
      ? s
      : { edgeTierBudgets: { ...s.edgeTierBudgets, [tier]: normalized } }
  }),
  setEdgeTierAlpha: (tier, alpha) => set((s) => {
    const normalized = Math.max(0, Math.min(1, alpha))
    return s.edgeTierAlphas[tier] === normalized
      ? s
      : { edgeTierAlphas: { ...s.edgeTierAlphas, [tier]: normalized } }
  }),
})
