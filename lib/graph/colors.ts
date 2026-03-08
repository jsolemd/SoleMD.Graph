const CLUSTER_PALETTE = [
  '#a8c5e9', '#aedc93', '#fbb44e', '#ffada4', '#eda8c4',
  '#8dd3c7', '#b8a9c9', '#fdb462', '#80b1d3', '#d9d9d9',
  '#bc80bd', '#ccebc5', '#ffed6f', '#fb8072', '#bebada',
  '#e5c494', '#b3de69', '#fccde5', '#d9ef8b', '#a6cee3',
] as const

export function getClusterColor(clusterId: number): string {
  if (clusterId === 0) return '#555555' // noise points (HDBSCAN cluster 0)
  return CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length]
}
