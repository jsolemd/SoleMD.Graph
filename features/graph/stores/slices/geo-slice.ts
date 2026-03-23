import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

/** Geographic selection at country or region level from choropleth click. */
export interface GeoSelection {
  level: 'country' | 'region'
  countryCode: string       // iso_a2
  countryName: string       // Natural Earth "admin"
  regionName?: string       // geoNode.region value (for filters + display)
  polygonName?: string      // Natural Earth polygon "name" (for outline highlight)
}

export interface GeoSlice {
  // Geo filter state — parallel to Cosmograph's crossfilter but driven manually
  geoFilters: Record<string, string[] | [number, number]>
  setGeoFilter: (column: string, value: string[] | [number, number] | null) => void
  clearGeoFilters: () => void

  // Geo selection — country/region level from choropleth click
  geoSelection: GeoSelection | null
  setGeoSelection: (sel: GeoSelection | null) => void
}

export const createGeoSlice: StateCreator<DashboardState, [], [], GeoSlice> = (set) => ({
  geoFilters: {},
  setGeoFilter: (column, value) =>
    set((s) => {
      if (value === null) {
        const next = { ...s.geoFilters }
        delete next[column]
        return { geoFilters: next }
      }
      return { geoFilters: { ...s.geoFilters, [column]: value } }
    }),
  clearGeoFilters: () => set({ geoFilters: {} }),

  geoSelection: null,
  setGeoSelection: (sel) =>
    set(() => {
      if (!sel) return { geoSelection: null, geoFilters: {} }
      const filters: Record<string, string[]> = { countryCode: [sel.countryCode] }
      if (sel.level === 'region' && sel.regionName) {
        filters.region = [sel.regionName]
      }
      return { geoSelection: sel, geoFilters: filters }
    }),
})
