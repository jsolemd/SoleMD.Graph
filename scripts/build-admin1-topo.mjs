#!/usr/bin/env node
/**
 * build-admin1-topo.mjs
 *
 * Downloads Natural Earth 10m admin-1 (states/provinces) GeoJSON,
 * strips to essential properties, converts to TopoJSON with
 * simplification + quantization, and writes to public/data/admin1-50m.json.
 *
 * We use 10m source (not 50m) because the 50m dataset only covers 9 large
 * countries. The 10m dataset has ~4600 admin-1 regions worldwide. We
 * simplify aggressively to keep the output comparable in size to 50m.
 *
 * Usage:  node scripts/build-admin1-topo.mjs
 * Deps:   topojson-server, topojson-simplify (installed via npx if needed)
 */

import { writeFileSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../public/data");
const OUT_FILE = resolve(OUT_DIR, "admin1-50m.json");
const TMP_GEO = resolve(__dirname, "../.tmp-admin1.geojson");

// Natural Earth 10m admin-1 GeoJSON — full global coverage (~4600 features)
const SRC_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

async function main() {
  console.log("Downloading Natural Earth 10m admin-1 GeoJSON (~40MB)...");
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const raw = await res.json();

  console.log(`  ${raw.features.length} features downloaded`);

  // Strip to essential properties only
  const stripped = {
    type: "FeatureCollection",
    features: raw.features
      .filter((f) => f.geometry) // drop null geometries
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          iso_a2: f.properties.iso_a2 ?? null,
          name: f.properties.name ?? null,
          iso_3166_2: f.properties.iso_3166_2 ?? null,
        },
      })),
  };

  console.log(`  ${stripped.features.length} features after filtering`);

  // Write stripped GeoJSON to temp file
  writeFileSync(TMP_GEO, JSON.stringify(stripped));
  const geoSize = statSync(TMP_GEO).size;
  console.log(`  Stripped GeoJSON: ${(geoSize / 1024 / 1024).toFixed(1)} MB`);

  // Convert to TopoJSON → simplify (retain ~5% of arcs) → quantize
  // toposimplify -p 0.005 keeps visually smooth shapes while cutting size ~90%
  console.log("Converting to TopoJSON with simplification...");
  mkdirSync(OUT_DIR, { recursive: true });

  execSync(
    `npx --yes --package=topojson-server --package=topojson-simplify -- ` +
      `geo2topo admin1=${TMP_GEO} | ` +
      `npx --yes --package=topojson-simplify -- toposimplify -p 0.005 -f | ` +
      `npx --yes --package=topojson-simplify -- topoquantize 1e5 > ${OUT_FILE}`,
    { stdio: "inherit", shell: true }
  );

  // Clean up
  try { unlinkSync(TMP_GEO); } catch { /* ok */ }

  // Report size
  const stat = statSync(OUT_FILE);
  console.log(`\nDone! ${OUT_FILE}`);
  console.log(`  Size: ${(stat.size / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
