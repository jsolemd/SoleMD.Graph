import {
  getPaletteColors,
  getClusterColor,
  buildClusterColors,
  type ColorTheme,
} from '@/lib/graph/colors'

const HEX_RE = /^#[0-9a-f]{6}$/i

describe('getPaletteColors', () => {
  it('returns different colors for light vs dark theme on default palette', () => {
    const dark = getPaletteColors('default', 'dark')
    const light = getPaletteColors('default', 'light')
    expect(dark).not.toEqual(light)
    expect(dark).toHaveLength(light.length)
  })

  it('defaults to dark theme (backward-compat)', () => {
    const implicit = getPaletteColors('default')
    const explicit = getPaletteColors('default', 'dark')
    expect(implicit).toEqual(explicit)
  })

  it('does NOT adjust scientific palettes', () => {
    for (const name of ['spectral', 'viridis', 'plasma', 'turbo'] as const) {
      const dark = getPaletteColors(name, 'dark')
      const light = getPaletteColors(name, 'light')
      expect(dark).toEqual(light)
    }
  })

  it('adjusts warm and cool palettes for light theme', () => {
    expect(getPaletteColors('warm', 'dark')).not.toEqual(getPaletteColors('warm', 'light'))
    expect(getPaletteColors('cool', 'dark')).not.toEqual(getPaletteColors('cool', 'light'))
  })

  it('returns valid hex values for all palettes and themes', () => {
    const palettes = ['default', 'warm', 'cool', 'spectral', 'viridis', 'plasma', 'turbo'] as const
    const themes: ColorTheme[] = ['light', 'dark']
    for (const palette of palettes) {
      for (const theme of themes) {
        const colors = getPaletteColors(palette, theme)
        for (const color of colors) {
          expect(color).toMatch(HEX_RE)
        }
      }
    }
  })

  it('returns a new array copy each call (no shared mutation)', () => {
    const a = getPaletteColors('default', 'dark')
    const b = getPaletteColors('default', 'dark')
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

describe('getClusterColor', () => {
  it('returns noise color for cluster 0 in dark theme', () => {
    expect(getClusterColor(0, 'dark')).toBe('#555555')
  })

  it('returns light noise color for cluster 0 in light theme', () => {
    expect(getClusterColor(0, 'light')).toBe('#999999')
  })

  it('returns the correct palette entry for cluster 1 (dark)', () => {
    const palette = getPaletteColors('default', 'dark')
    expect(getClusterColor(1, 'dark')).toBe(palette[1])
  })

  it('returns theme-appropriate cluster colors', () => {
    const dark = getClusterColor(1, 'dark')
    const light = getClusterColor(1, 'light')
    expect(dark).toMatch(HEX_RE)
    expect(light).toMatch(HEX_RE)
    expect(dark).not.toEqual(light)
  })

  it('wraps around at palette boundary', () => {
    const palette = getPaletteColors('default', 'dark')
    expect(getClusterColor(20, 'dark')).toBe(palette[0])
    expect(getClusterColor(21, 'dark')).toBe(palette[1])
  })

  it('handles very large clusterId', () => {
    const color = getClusterColor(1000, 'dark')
    expect(color).toMatch(HEX_RE)
  })

  it('returns noise color for negative clusterId', () => {
    expect(getClusterColor(-1, 'dark')).toBe('#555555')
    expect(getClusterColor(-1, 'light')).toBe('#999999')
  })

  it('defaults to dark theme', () => {
    expect(getClusterColor(1)).toEqual(getClusterColor(1, 'dark'))
  })
})

describe('buildClusterColors', () => {
  const nodes = [
    { clusterId: 0 },
    { clusterId: 1 },
    { clusterId: 3 },
    { clusterId: 1 },
  ]

  it('produces correct mapping for dark theme', () => {
    const colors = buildClusterColors(nodes, 'dark')
    expect(Object.keys(colors).map(Number).sort()).toEqual([0, 1, 3])
    expect(colors[0]).toBe('#555555')
    for (const hex of Object.values(colors)) {
      expect(hex).toMatch(HEX_RE)
    }
  })

  it('produces correct mapping for light theme', () => {
    const colors = buildClusterColors(nodes, 'light')
    expect(Object.keys(colors).map(Number).sort()).toEqual([0, 1, 3])
    expect(colors[0]).toBe('#999999')
    for (const hex of Object.values(colors)) {
      expect(hex).toMatch(HEX_RE)
    }
  })

  it('light and dark mappings differ for non-noise clusters', () => {
    const dark = buildClusterColors(nodes, 'dark')
    const light = buildClusterColors(nodes, 'light')
    expect(dark[1]).not.toEqual(light[1])
    expect(dark[3]).not.toEqual(light[3])
  })

  it('returns empty record for empty nodes array', () => {
    expect(buildClusterColors([], 'dark')).toEqual({})
    expect(buildClusterColors([], 'light')).toEqual({})
  })

  it('defaults to dark theme', () => {
    const implicit = buildClusterColors(nodes)
    const explicit = buildClusterColors(nodes, 'dark')
    expect(implicit).toEqual(explicit)
  })
})
