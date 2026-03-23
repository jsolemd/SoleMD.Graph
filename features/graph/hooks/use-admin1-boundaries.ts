"use client"

import { useEffect, useState } from "react"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry } from "geojson"

/** Pre-built admin-1 TopoJSON from Natural Earth 10m, simplified.
 *  ~1.5MB raw, ~476KB gzip. Properties: iso_a2, name, iso_3166_2. */
const ADMIN1_URL = "/data/admin1-50m.json"

let cachedPromise: Promise<FeatureCollection<Geometry>> | null = null

function fetchAdmin1(): Promise<FeatureCollection<Geometry>> {
  if (!cachedPromise) {
    cachedPromise = fetch(ADMIN1_URL)
      .then((res) => res.json())
      .then((topo: Topology) => feature(topo, topo.objects.admin1) as FeatureCollection<Geometry>)
      .catch((err) => {
        cachedPromise = null
        throw err
      })
  }
  return cachedPromise
}

/** Fetch and cache Natural Earth admin-1 (states/provinces) boundaries as GeoJSON.
 *  Features include `iso_a2` (country code) and `name` (region name) for matching
 *  against geoNode countryCode + region. */
export function useAdmin1Boundaries(): FeatureCollection<Geometry> | null {
  const [geojson, setGeojson] = useState<FeatureCollection<Geometry> | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchAdmin1()
      .then((admin1) => {
        if (!cancelled) setGeojson(admin1)
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') console.warn('Failed to load admin-1 boundaries:', err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return geojson
}
