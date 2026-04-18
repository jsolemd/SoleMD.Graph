import {
  boostForLight,
  buildClusterColors,
  getClusterColor,
  getGraphClusterColor,
  getGraphPaletteColors,
  getPaletteColors,
  resolveGraphPaletteSelection,
  resolvePaletteSelection,
} from "../colors";
import type { ColorTheme } from "@/features/graph/types";

const CSS_COLOR_RE = /^(#[0-9a-f]{6}|rgb\(|rgba\()/i;

describe("getPaletteColors", () => {
  it("boosts light theme palettes from the native dark palette", () => {
    for (const name of ["default", "warm", "royal", "turbo"] as const) {
      const dark = getPaletteColors(name, "dark");
      const light = getPaletteColors(name, "light");
      expect(light).toEqual(dark.map(boostForLight));
    }
  });

  it("defaults to dark theme (backward-compat)", () => {
    const implicit = getPaletteColors("default");
    const explicit = getPaletteColors("default", "dark");
    expect(implicit).toEqual(explicit);
  });

  it("returns valid CSS colors for representative palettes and themes", () => {
    const palettes = ["default", "warm", "royal", "spectral", "tableau10", "turbo"] as const;
    const themes: ColorTheme[] = ["light", "dark"];
    for (const palette of palettes) {
      for (const theme of themes) {
        const colors = getPaletteColors(palette, theme);
        for (const color of colors) {
          expect(color).toMatch(CSS_COLOR_RE);
        }
      }
    }
  });

  it("returns a new array copy each call (no shared mutation)", () => {
    const a = getPaletteColors("default", "dark");
    const b = getPaletteColors("default", "dark");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("graph render palette helpers", () => {
  it("keep render palettes pinned to the native dark palette", () => {
    const renderPalette = getGraphPaletteColors("rainbow");
    const darkPalette = getPaletteColors("rainbow", "dark");
    const lightPalette = getPaletteColors("rainbow", "light");

    expect(renderPalette).toEqual(darkPalette);
    expect(renderPalette).not.toEqual(lightPalette);
  });

  it("keeps direct hex colors on the canonical render column", () => {
    expect(
      resolvePaletteSelection("hexColor", "direct", "default", "light"),
    ).toEqual({
      colorColumn: "hexColorLight",
      colorStrategy: "direct",
    });

    expect(
      resolveGraphPaletteSelection("hexColor", "direct", "default"),
    ).toEqual({
      colorColumn: "hexColor",
      colorStrategy: "direct",
    });
  });

  it("preserves native categorical fallback for non-default direct schemes", () => {
    expect(
      resolveGraphPaletteSelection("hexColor", "direct", "rainbow"),
    ).toEqual({
      colorColumn: "clusterId",
      colorStrategy: "categorical",
    });
  });
});

describe("getClusterColor", () => {
  it("returns noise color for cluster 0 in dark theme", () => {
    expect(getClusterColor(0, "dark")).toBe("#555555");
  });

  it("returns light noise color for cluster 0 in light theme", () => {
    expect(getClusterColor(0, "light")).toBe("#999999");
  });

  it("returns the correct palette entry for cluster 1 in both themes", () => {
    expect(getClusterColor(1, "dark")).toBe(getPaletteColors("default", "dark")[1]);
    expect(getClusterColor(1, "light")).toBe(getPaletteColors("default", "light")[1]);
  });

  it("returns theme-appropriate cluster colors", () => {
    const dark = getClusterColor(1, "dark");
    const light = getClusterColor(1, "light");
    expect(dark).toMatch(CSS_COLOR_RE);
    expect(light).toMatch(CSS_COLOR_RE);
    expect(dark).not.toEqual(light);
  });

  it("wraps around at palette boundary", () => {
    const palette = getPaletteColors("default", "dark");
    expect(getClusterColor(20, "dark")).toBe(palette[0]);
    expect(getClusterColor(21, "dark")).toBe(palette[1]);
  });

  it("handles very large clusterId", () => {
    const color = getClusterColor(1000, "dark");
    expect(color).toMatch(CSS_COLOR_RE);
  });

  it("returns noise color for negative clusterId", () => {
    expect(getClusterColor(-1, "dark")).toBe("#555555");
    expect(getClusterColor(-1, "light")).toBe("#999999");
  });

  it("defaults to dark theme", () => {
    expect(getClusterColor(1)).toEqual(getClusterColor(1, "dark"));
  });
});

describe("getGraphClusterColor", () => {
  it("matches the graph render palette instead of the UI theme palette", () => {
    expect(getGraphClusterColor(1)).toEqual(getPaletteColors("default", "dark")[1]);
    expect(getGraphClusterColor(1)).not.toEqual(getPaletteColors("default", "light")[1]);
  });
});

describe("buildClusterColors", () => {
  const nodes = [
    { clusterId: 0 },
    { clusterId: 1 },
    { clusterId: 3 },
    { clusterId: 1 },
  ];

  it("produces correct mapping for dark theme", () => {
    const colors = buildClusterColors(nodes, "dark");
    expect(Object.keys(colors).map(Number).sort()).toEqual([0, 1, 3]);
    expect(colors[0]).toBe("#555555");
    for (const color of Object.values(colors)) {
      expect(color).toMatch(CSS_COLOR_RE);
    }
  });

  it("produces correct mapping for light theme", () => {
    const colors = buildClusterColors(nodes, "light");
    expect(Object.keys(colors).map(Number).sort()).toEqual([0, 1, 3]);
    expect(colors[0]).toBe("#999999");
    for (const color of Object.values(colors)) {
      expect(color).toMatch(CSS_COLOR_RE);
    }
  });

  it("light and dark mappings diverge for non-noise clusters", () => {
    const dark = buildClusterColors(nodes, "dark");
    const light = buildClusterColors(nodes, "light");
    expect(dark[1]).not.toEqual(light[1]);
    expect(dark[3]).not.toEqual(light[3]);
  });

  it("returns empty record for empty nodes array", () => {
    expect(buildClusterColors([], "dark")).toEqual({});
    expect(buildClusterColors([], "light")).toEqual({});
  });

  it("defaults to dark theme", () => {
    const implicit = buildClusterColors(nodes);
    const explicit = buildClusterColors(nodes, "dark");
    expect(implicit).toEqual(explicit);
  });
});
