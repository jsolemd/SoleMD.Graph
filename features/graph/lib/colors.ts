import { NOISE_COLOR, NOISE_COLOR_LIGHT } from './brand-colors'
import type { ColorSchemeName, ColorTheme } from '@/features/graph/types'

export type { ColorTheme } from '@/features/graph/types'

const CLUSTER_PALETTE = [
  '#a8c5e9', '#aedc93', '#e5c799', '#ffada4', '#eda8c4',
  '#8dd3c7', '#b8a9c9', '#fdb462', '#80b1d3', '#d9d9d9',
  '#bc80bd', '#ccebc5', '#ffed6f', '#fb8072', '#bebada',
  '#e5c494', '#b3de69', '#fccde5', '#d9ef8b', '#a6cee3',
] as const

const COLOR_PALETTES: Record<ColorSchemeName, readonly string[]> = {
  default: CLUSTER_PALETTE,
  warm: [
    '#ff6b6b', '#ff8e72', '#ffb347', '#ffd93d', '#ffe066',
    '#ff9ff3', '#f368e0', '#ee5a24', '#fa8231', '#fd9644',
    '#e55039', '#eb3b5a', '#fc5c65', '#fed330', '#f7b731',
    '#e1b12c', '#f39c12', '#d35400', '#e74c3c', '#c0392b',
  ],
  cool: [
    '#74b9ff', '#0984e3', '#a29bfe', '#6c5ce7', '#81ecec',
    '#00cec9', '#55efc4', '#00b894', '#dfe6e9', '#b2bec3',
    '#636e72', '#2d3436', '#a8e6cf', '#88d8b0', '#7ec8e3',
    '#3dc1d3', '#4a69bd', '#6a89cc', '#82ccdd', '#60a3bc',
  ],
  spectral: [
    '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf',
    '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2',
    '#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b',
    '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2',
  ],
  viridis: [
    '#440154', '#482777', '#3e4989', '#31688e', '#26828e',
    '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725',
    '#440154', '#482777', '#3e4989', '#31688e', '#26828e',
    '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725',
  ],
  plasma: [
    '#0d0887', '#3b049a', '#7201a8', '#a21fa7', '#cc4778',
    '#e8685d', '#f89441', '#fec029', '#f0f921', '#fcffa4',
    '#0d0887', '#3b049a', '#7201a8', '#a21fa7', '#cc4778',
    '#e8685d', '#f89441', '#fec029', '#f0f921', '#fcffa4',
  ],
  turbo: [
    '#23171b', '#4a0c6b', '#781c81', '#a52c7a', '#cf4446',
    '#ed6925', '#fb9b06', '#f7cf39', '#cff05e', '#a0fc3c',
    '#62f46e', '#31d298', '#13a8b0', '#1a7fad', '#265998',
    '#2f3877', '#271a45', '#ed6925', '#fb9b06', '#f7cf39',
  ],
}

/** Palettes that are perceptually uniform — never adjust for theme. */
const SCIENTIFIC_PALETTES: ReadonlySet<ColorSchemeName> = new Set([
  'spectral', 'viridis', 'plasma', 'turbo',
])

/* ---------- HSL helpers ---------- */

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, color)))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Boost saturation and reduce lightness so pastel colors pop on light
 * backgrounds. Clamps prevent over-saturation or overly dark results.
 */
function adjustForLightTheme(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, Math.min(s + 25, 92), Math.max(l - 16, 32))
}

/* ---------- RGBA helper ---------- */

/** Convert a hex color string to an RGBA tuple for deck.gl accessors. */
export function hexToRgba(
  hex: string,
  alpha = 160,
): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b, alpha]
}

/* ---------- Public API ---------- */

export function getPaletteColors(
  schemeName: ColorSchemeName,
  theme: ColorTheme = 'dark',
): string[] {
  const source = COLOR_PALETTES[schemeName]
  if (theme === 'light' && !SCIENTIFIC_PALETTES.has(schemeName)) {
    return source.map(adjustForLightTheme)
  }
  return [...source]
}

export function getClusterColor(
  clusterId: number,
  theme: ColorTheme = 'dark',
): string {
  if (clusterId <= 0) return theme === 'light' ? NOISE_COLOR_LIGHT : NOISE_COLOR
  const palette = getPaletteColors('default', theme)
  return palette[clusterId % palette.length]
}

export function buildClusterColors(
  nodes: ReadonlyArray<{ clusterId: number }>,
  theme: ColorTheme = 'dark',
): Record<number, string> {
  const palette = getPaletteColors('default', theme)
  const noiseColor = theme === 'light' ? NOISE_COLOR_LIGHT : NOISE_COLOR
  const colors: Record<number, string> = {}
  for (const node of nodes) {
    if (!(node.clusterId in colors)) {
      colors[node.clusterId] = node.clusterId <= 0
        ? noiseColor
        : palette[node.clusterId % palette.length]
    }
  }
  return colors
}
