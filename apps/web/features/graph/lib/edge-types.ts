export const EDGE_TIERS = [
  'tier0_chords',
  'tier1_hover',
  'tier2_select',
  'tier3_scope',
  'tier4_clusterDive',
] as const

export type EdgeTier = (typeof EDGE_TIERS)[number]

export const EDGE_SOURCES = ['citation', 'entity'] as const

export type EdgeSource = (typeof EDGE_SOURCES)[number]

export const EDGE_SOURCE_BITMAP = {
  citation: 1,
  entity: 2,
} as const satisfies Record<EdgeSource, number>

export const DEFAULT_EDGE_TIER_ENABLED = {
  tier0_chords: true,
  tier1_hover: true,
  tier2_select: true,
  tier3_scope: true,
  tier4_clusterDive: false,
} as const satisfies Record<EdgeTier, boolean>

export const DEFAULT_EDGE_SOURCE_ENABLED = {
  citation: true,
  entity: true,
} as const satisfies Record<EdgeSource, boolean>

export const DEFAULT_EDGE_TIER_BUDGETS = {
  tier0_chords: 384,
  tier1_hover: 512,
  tier2_select: 2_048,
  tier3_scope: 5_000,
  tier4_clusterDive: 5_000,
} as const satisfies Record<EdgeTier, number>

export const DEFAULT_EDGE_TIER_ALPHAS = {
  tier0_chords: 0.1,
  tier1_hover: 0.45,
  tier2_select: 0.55,
  tier3_scope: 0.28,
  tier4_clusterDive: 0.65,
} as const satisfies Record<EdgeTier, number>
