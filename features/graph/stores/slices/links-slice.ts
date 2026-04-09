import type { StateCreator } from 'zustand'
import { hasSameRange } from '@/features/graph/lib/helpers'
import type { DashboardState } from '../dashboard-store'

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

  setRenderLinks: (show: boolean) => void
  setLinkOpacity: (opacity: number) => void
  setLinkGreyoutOpacity: (opacity: number) => void
  setLinkVisibilityDistanceRange: (range: [number, number]) => void
  setLinkVisibilityMinTransparency: (transparency: number) => void
  setLinkDefaultWidth: (width: number) => void
  setCurvedLinks: (curved: boolean) => void
  setLinkDefaultArrows: (arrows: boolean) => void
  setScaleLinksOnZoom: (scale: boolean) => void
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
})
