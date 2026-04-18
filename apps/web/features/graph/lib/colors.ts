import { NOISE_COLOR, NOISE_COLOR_LIGHT } from './brand-colors'
import type {
  ColorSchemeName,
  ColorTheme,
  PointColorStrategy,
} from '@/features/graph/config'

/**
 * Canonical graph render theme.
 *
 * The Cosmograph canvas always receives the native "dark" palette so theme
 * toggles never invalidate pointColorBy / pointColorPalette and trigger a
 * large DuckDB re-read. Light mode is a post-process CSS filter.
 */
export const GRAPH_RENDER_COLOR_THEME = 'dark' as const satisfies ColorTheme

/**
 * Native Cosmograph palette catalog.
 *
 * Source of truth:
 * - Cosmograph showcase palette dropdown
 * - showcase bundle source from `run.cosmograph.app`
 *
 * Keep the public option order aligned with the showcase so our UI matches
 * Cosmograph's naming and presentation. A few older internal schemes remain in
 * the type union for compatibility, but they are not exposed in the selector.
 */
export const COSMOGRAPH_COLOR_SCHEME_ORDER = [
  'seasons',
  'candy',
  'easy',
  'default',
  'warm',
  'evening',
  'bombay',
  'koi',
  'august',
  'scenery',
  'mango',
  'ember',
  'cranberry',
  'autumn',
  'dream',
  'vitamins',
  'confetti',
  'rainbow',
  'crayons',
  'vivid',
  'timo',
  'tropical',
  'tulips',
  'forestlake',
  'enchant',
  'woop',
  'unicorn',
  'tolvibrant',
  'bright',
  'vibrant',
  'okabeito',
  'tableau10',
  'tailoring',
  'vibrant2',
  'spectral',
  'classic',
  'royal',
  'warm2',
  'twilight',
  'turbo',
] as const satisfies readonly ColorSchemeName[]

const COLOR_SCHEME_LABELS: Partial<Record<ColorSchemeName, string>> = {
  forestlake: 'Forest Lake',
  tolvibrant: 'Tol Vibrant',
  okabeito: 'Okabe-Ito',
  tableau10: 'Tableau 10',
  vibrant2: 'Neon Spectrum',
  warm2: 'Radiant',
}

export const COLOR_SCHEME_OPTIONS = COSMOGRAPH_COLOR_SCHEME_ORDER.map((scheme) => ({
  value: scheme,
  label: COLOR_SCHEME_LABELS[scheme] ?? scheme.charAt(0).toUpperCase() + scheme.slice(1),
})) satisfies ReadonlyArray<{ value: ColorSchemeName; label: string }>

const COLOR_PALETTES: Record<ColorSchemeName, readonly string[]> = {
  default: [
    '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
    '#6a4c93', '#1982c4', '#8ac926', '#ffca3a', '#ff595e',
    '#3dc1d3', '#f15bb5', '#00bbf9', '#00f5d4', '#9b5de5',
  ],
  seasons: ['#2e9599', '#f7dc68', '#f46c3f', '#a7226f'],
  candy: ['#7f58af', '#64c5eb', '#e84d8a', '#feb326'],
  easy: ['#ff5a30', '#8253fb', '#ffcc33', '#00f5f3'],
  warm: [
    'rgb(110, 64, 170)',
    'rgb(210, 62, 167)',
    'rgb(255, 94, 99)',
    'rgb(239, 167, 47)',
    'rgb(175, 240, 91)',
  ],
  evening: ['#3b3686', '#767ae6', '#edba40', '#e28c33', '#e0652b'],
  bombay: ['#11439F', '#297EE8', '#95C6C9', '#FFDDBF', '#FECE5A'],
  koi: ['#6065bd', '#9ad5fd', '#ec7a59', '#f3ab78', '#fdf1d8'],
  august: ['#337A58', '#F77830', '#DB565D', '#FBCF38', '#377375'],
  scenery: ['#1f4e5a', '#009c8e', '#ffdb6a', '#ffa658', '#ea5f40'],
  mango: ['#10bdde', '#00c7bb', '#50c97f', '#a4c13d', '#f2ab1d'],
  ember: ['#642d37', '#c0350f', '#f3904b', '#f7c767', '#b89dbb'],
  cranberry: ['#643958', '#9d446a', '#f67989', '#c1a194', '#456e66'],
  autumn: ['#7f3d1d', '#cc8034', '#f1b63e', '#979d77', '#606e55'],
  dream: ['#e2e0ac', '#e5a292', '#5c7f9f', '#ae6d8d', '#504c76'],
  vitamins: ['#59e6cd', '#cae79d', '#ffdc8a', '#ff8075', '#d5aade'],
  confetti: ['#73c6e9', '#c2bdf4', '#7cc09d', '#eebb58', '#ee6641'],
  rainbow: ['#6a4c93', '#1982c4', '#8ac926', '#ffca3a', '#ff595e'],
  crayons: ['#5fa55a', '#01b4bc', '#f6d51f', '#fa8925', '#fa5457'],
  vivid: ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9', '#00f5d4'],
  timo: ['#9900ff', '#3cdcb0', '#ffd200', '#ff508c', '#5ad2ff'],
  tropical: ['#7f95e4', '#1ac1b9', '#fbd160', '#f9447f', '#fcb8d9', '#ff8017'],
  tulips: ['#f4c209', '#d9a9e2', '#ff99ad', '#4baa71', '#99d9e0', '#ff8c5a'],
  forestlake: ['#026c96', '#288da9', '#7bc3bf', '#ffe3ad', '#fda46f', '#db806b'],
  enchant: ['#3467d4', '#c0c7fb', '#f6c0d8', '#f34e9d', '#fa9a74', '#fae5c6'],
  woop: ['#8a69d4', '#e7bd4f', '#02befe', '#00c6a0', '#f88cd5', '#fc4d44'],
  unicorn: ['#8635d5', '#f24982', '#f98617', '#f9c823', '#2dc574', '#006cdc'],
  tableau10: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f'],
  tolvibrant: ['#EE7733', '#0077BB', '#EE3377', '#33BBEE', '#CC3311', '#009988'],
  okabeito: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
  bright: ['#DD7670', '#D78AB5', '#94B1E1', '#44D1D1', '#7CE195', '#E2E062'],
  vibrant: ['#9481ff', '#70d5ff', '#ff70a6', '#ff9770', '#ffd670', '#e9ff70'],
  tailoring: ['#ffd275', '#ff8042', '#ff2929', '#3378ff', '#63b6ff', '#00b380', '#804fff', '#ff8bb7', '#f5c3bd'],
  vibrant2: ['#9b5de5', '#c65ccd', '#f15bb5', '#f8a07b', '#fee440', '#7fd09d', '#00bbf9', '#00d8e7', '#00f5d4'],
  spectral: [
    'rgb(158, 1, 66)',
    'rgb(219, 73, 74)',
    'rgb(248, 142, 83)',
    'rgb(254, 210, 129)',
    'rgb(251, 248, 176)',
    'rgb(213, 238, 159)',
    'rgb(137, 207, 165)',
    'rgb(70, 150, 179)',
    'rgb(94, 79, 162)',
  ],
  classic: ['#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926', '#52a675', '#1982c4', '#4267ac', '#6a4c93', '#b5a6c9'],
  royal: ['#54478c', '#2c699a', '#048ba8', '#0db39e', '#16db93', '#83e377', '#b9e769', '#efea5a', '#f1c453', '#f29e4c'],
  warm2: [
    'rgb(110, 64, 170)',
    'rgb(155, 61, 179)',
    'rgb(200, 61, 172)',
    'rgb(238, 67, 149)',
    'rgb(255, 83, 117)',
    'rgb(255, 107, 83)',
    'rgb(255, 140, 56)',
    'rgb(232, 176, 46)',
    'rgb(201, 211, 58)',
    'rgb(175, 240, 91)',
  ],
  twilight: ['#025c7f', '#027b96', '#069aa4', '#51b7aa', '#87d1ac', '#c0e9af', '#fef8be', '#ffe1a5', '#ffc991', '#ffb085', '#fb9481'],
  turbo: [
    'rgb(62, 123, 247)',
    'rgb(41, 175, 236)',
    'rgb(40, 217, 193)',
    'rgb(67, 244, 143)',
    'rgb(117, 254, 99)',
    'rgb(177, 243, 67)',
    'rgb(230, 214, 48)',
    'rgb(255, 170, 36)',
    'rgb(255, 117, 27)',
    'rgb(222, 64, 17)',
    'rgb(172, 24, 5)',
    'rgb(144, 12, 0)',
  ],

  // Legacy internal schemes retained so persisted user state does not break.
  cool: [
    '#74b9ff', '#0984e3', '#a29bfe', '#6c5ce7', '#81ecec',
    '#00cec9', '#55efc4', '#00b894', '#dfe6e9', '#b2bec3',
    '#636e72', '#2d3436', '#a8e6cf', '#88d8b0', '#7ec8e3',
    '#3dc1d3', '#4a69bd', '#6a89cc', '#82ccdd', '#60a3bc',
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
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return { h: 0, s: 0, l: 50 }
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

/** Convert a CSS color string to an RGBA tuple for graph color accessors. */
export function hexToRgba(
  color: string,
  alpha = 160,
): [number, number, number, number] {
  const rgba = color.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i
  )
  if (rgba) {
    const [, r, g, b, a] = rgba
    return [
      Number.parseInt(r, 10),
      Number.parseInt(g, 10),
      Number.parseInt(b, 10),
      a ? Math.round(Number.parseFloat(a) * 255) : alpha,
    ]
  }

  if (!/^#[0-9a-f]{6}$/i.test(color)) return [128, 128, 128, alpha]

  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return [r, g, b, alpha]
}

/**
 * Boost color saturation and darken for visibility on light backgrounds.
 * Handles hex (#RRGGBB) and rgba() strings; returns hex.
 */
export function boostForLight(color: string): string {
  const [r, g, b] = hexToRgba(color, 255)
  const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  const { h, s, l } = hexToHsl(hex)
  // Pull saturation toward 85% by 35% of gap; darken by 18%
  const boostedS = Math.min(s + (85 - s) * 0.35, 92)
  const boostedL = Math.max(l * 0.82, 18)
  return hslToHex(h, boostedS, boostedL)
}

export function getPaletteColors(
  schemeName: ColorSchemeName,
  theme: ColorTheme = 'dark',
): string[] {
  const raw = COLOR_PALETTES[schemeName]
  return theme === 'light' ? raw.map(boostForLight) : [...raw]
}

export function getGraphPaletteColors(schemeName: ColorSchemeName): string[] {
  return getPaletteColors(schemeName, GRAPH_RENDER_COLOR_THEME)
}

export function resolvePaletteSelection(
  colorColumn: string,
  colorStrategy: PointColorStrategy,
  colorScheme: ColorSchemeName,
  colorTheme: ColorTheme
): { colorColumn: string; colorStrategy: PointColorStrategy } {
  if (colorColumn === 'hexColor' && colorScheme !== 'default') {
    return {
      colorColumn: 'clusterId',
      colorStrategy: 'categorical',
    }
  }

  if (colorColumn === 'hexColor' && colorTheme === 'light') {
    return {
      colorColumn: 'hexColorLight',
      colorStrategy,
    }
  }

  return {
    colorColumn,
    colorStrategy,
  }
}

export function resolveGraphPaletteSelection(
  colorColumn: string,
  colorStrategy: PointColorStrategy,
  colorScheme: ColorSchemeName,
): { colorColumn: string; colorStrategy: PointColorStrategy } {
  return resolvePaletteSelection(
    colorColumn,
    colorStrategy,
    colorScheme,
    GRAPH_RENDER_COLOR_THEME,
  )
}

export function getGraphClusterColor(clusterId: number): string {
  return getClusterColor(clusterId, GRAPH_RENDER_COLOR_THEME)
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
