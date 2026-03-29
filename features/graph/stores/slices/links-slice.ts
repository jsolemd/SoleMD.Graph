import type { StateCreator } from 'zustand'
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

  setRenderLinks: (show) => set({ renderLinks: show }),
  setLinkOpacity: (opacity) => set({ linkOpacity: opacity }),
  setLinkGreyoutOpacity: (opacity) => set({ linkGreyoutOpacity: opacity }),
  setLinkVisibilityDistanceRange: (range) => set({ linkVisibilityDistanceRange: range }),
  setLinkVisibilityMinTransparency: (transparency) => set({ linkVisibilityMinTransparency: transparency }),
  setLinkDefaultWidth: (width) => set({ linkDefaultWidth: width }),
  setCurvedLinks: (curved) => set({ curvedLinks: curved }),
  setLinkDefaultArrows: (arrows) => set({ linkDefaultArrows: arrows }),
  setScaleLinksOnZoom: (scale) => set({ scaleLinksOnZoom: scale }),
})
