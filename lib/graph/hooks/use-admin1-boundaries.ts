"use client"

import { useEffect, useState } from "react"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry } from "geojson"

/** Pre-built admin-1 TopoJSON from Natural Earth 10m, simplified.
 *  ~1.5MB raw, ~476KB gzip. Properties: iso_a2, name, iso_3166_2. */
const ADMIN1_URL = "/data/admin1-50m.json"

/** Fetch and cache Natural Earth admin-1 (states/provinces) boundaries as GeoJSON.
 *  Features include `iso_a2` (country code) and `name` (region name) for matching
 *  against geoNode countryCode + region. */
export function useAdmin1Boundaries(): FeatureCollection<Geometry> | null {
  const [geojson, setGeojson] = useState<FeatureCollection<Geometry> | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(ADMIN1_URL)
      .then((res) => res.json())
      .then((topo: Topology) => {
        if (cancelled) return
        const admin1 = feature(topo, topo.objects.admin1) as FeatureCollection<Geometry>
        setGeojson(admin1)
      })
      .catch(() => {
        /* silently fail — choropleth is a visual enhancement, not critical */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return geojson
}
