import type { MantineColorsTuple } from "@mantine/core"

export const brandPastelVarNameByKey = {
  "soft-blue": "--color-soft-blue",
  "muted-indigo": "--color-muted-indigo",
  "golden-yellow": "--color-golden-yellow",
  "fresh-green": "--color-fresh-green",
  "warm-coral": "--color-warm-coral",
  "soft-pink": "--color-soft-pink",
  "soft-lavender": "--color-soft-lavender",
  paper: "--color-paper",
  teal: "--color-teal",
} as const

export type BrandPastelKey = keyof typeof brandPastelVarNameByKey

export const brandPastelFallbackHexByKey: Record<BrandPastelKey, string> = {
  "soft-blue": "#a8c5e9",
  "muted-indigo": "#747caa",
  "golden-yellow": "#e5c799",
  "fresh-green": "#aedc93",
  "warm-coral": "#ffada4",
  "soft-pink": "#e0aed8",
  "soft-lavender": "#d8bee9",
  paper: "#d4c5a0",
  teal: "#7ecfb0",
}

export function brandPastelCssVar(key: BrandPastelKey): string {
  return `var(${brandPastelVarNameByKey[key]})`
}

export const moduleAccentCssVar = `var(--module-accent, ${brandPastelCssVar("soft-blue")})`

export const themeViewportColorByScheme = {
  light: "#f8f9fa",
  dark: "#0a0a0f",
} as const

export const mantineBrandColorsTuple: MantineColorsTuple = [
  "#eef3f9",
  "#dce7f4",
  "#c9dcef",
  "#a8c5e9",
  "#92b3d7",
  "#7c9fc5",
  "#668bb3",
  "#5077a1",
  "#3a638f",
  "#244f7d",
]

export const mantineNeutralColorsTuple: MantineColorsTuple = [
  "#fafafa",
  "#f5f5f5",
  "#eaedf0",
  "#d1d5db",
  "#9ca3af",
  "#6b7280",
  "#5c5f66",
  "#4b5563",
  "#374151",
  "#1f2937",
]

export const themeSurfaceFallbackHexByKey = {
  white: "#ffffff",
  black: "#1a1b1e",
} as const

export const extendedPastelVarNameByKey = {
  seafoam: "--color-seafoam",
  amber: "--color-amber",
  sky: "--color-sky",
  rose: "--color-rose",
  mint: "--color-mint",
  orchid: "--color-orchid",
  maize: "--color-maize",
  powder: "--color-powder",
  peach: "--color-peach",
  sage: "--color-sage",
  plum: "--color-plum",
  pear: "--color-pear",
} as const

export type ExtendedPastelKey = keyof typeof extendedPastelVarNameByKey

export function extendedPastelCssVar(key: ExtendedPastelKey): string {
  return `var(${extendedPastelVarNameByKey[key]})`
}

export const dotTocPastelColorSequence = [
  brandPastelCssVar("soft-blue"),
  brandPastelCssVar("golden-yellow"),
  brandPastelCssVar("fresh-green"),
  brandPastelCssVar("warm-coral"),
  brandPastelCssVar("muted-indigo"),
  brandPastelCssVar("soft-pink"),
  extendedPastelCssVar("seafoam"),
  brandPastelCssVar("paper"),
  brandPastelCssVar("soft-lavender"),
  extendedPastelCssVar("amber"),
  extendedPastelCssVar("sky"),
  extendedPastelCssVar("rose"),
  extendedPastelCssVar("mint"),
  extendedPastelCssVar("orchid"),
  extendedPastelCssVar("maize"),
  extendedPastelCssVar("powder"),
  extendedPastelCssVar("peach"),
  extendedPastelCssVar("sage"),
  extendedPastelCssVar("plum"),
  extendedPastelCssVar("pear"),
] as const

export type SemanticColorKey =
  | "diso"
  | "chem"
  | "gene"
  | "anat"
  | "phys"
  | "proc"
  | "section"
  | "paper"
  | "module"
  | "default"

export const semanticColorVarNameByKey: Record<SemanticColorKey, string> = {
  diso: "--color-semantic-disorder",
  chem: "--color-semantic-chemical",
  gene: "--color-semantic-gene",
  anat: "--color-semantic-anatomy",
  phys: "--color-semantic-physiology",
  proc: "--color-semantic-procedure",
  section: "--color-semantic-section",
  paper: "--color-semantic-paper",
  module: "--color-semantic-module",
  default: "--color-semantic-physiology",
}

export const semanticColorFallbackHexByKey: Record<SemanticColorKey, string> = {
  diso: "#f6b39b",
  chem: "#aedc93",
  gene: "#d79ece",
  anat: "#e5c799",
  phys: "#9fcfe8",
  proc: "#d8bee9",
  section: "#746fc0",
  paper: "#d4c5a0",
  module: "#7ecfb0",
  default: "#9fcfe8",
}

export function semanticColorCssVar(key: SemanticColorKey): string {
  const varName = semanticColorVarNameByKey[key]
  const fallback = semanticColorFallbackHexByKey[key]
  return `var(${varName}, ${fallback})`
}

export const entityTypeSemanticColorKeyByType: Record<string, SemanticColorKey> = {
  disease: "diso",
  chemical: "chem",
  gene: "gene",
  receptor: "gene",
  anatomy: "anat",
  network: "phys",
  "biological process": "phys",
  species: "proc",
  module: "module",
}

export const entityTypeCssColorByType: Record<string, string> = Object.fromEntries(
  Object.entries(entityTypeSemanticColorKeyByType).map(([entityType, semanticKey]) => [
    entityType,
    semanticColorCssVar(semanticKey),
  ]),
)
