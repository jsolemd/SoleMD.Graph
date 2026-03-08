import type { ColorSchemeName } from './types'

const CLUSTER_PALETTE = [
  '#a8c5e9', '#aedc93', '#fbb44e', '#ffada4', '#eda8c4',
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

export function getPaletteColors(schemeName: ColorSchemeName): string[] {
  return [...COLOR_PALETTES[schemeName]]
}

export function getClusterColor(clusterId: number): string {
  if (clusterId === 0) return '#555555' // noise (HDBSCAN cluster 0)
  return CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length]
}
