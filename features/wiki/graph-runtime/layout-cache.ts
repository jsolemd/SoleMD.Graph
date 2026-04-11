// ---------------------------------------------------------------------------
// Layout cache — store settled positions by graph signature
// ---------------------------------------------------------------------------

interface CachedPosition {
  x: number
  y: number
}

type LayoutCacheEntry = Map<string, CachedPosition>

const cache = new Map<string, LayoutCacheEntry>()

const MAX_ENTRIES = 5

export function getCachedPositions(
  signature: string,
): Map<string, CachedPosition> | null {
  return cache.get(signature) ?? null
}

export function setCachedPositions(
  signature: string,
  positions: Map<string, CachedPosition>,
): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_ENTRIES && !cache.has(signature)) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(signature, positions)
}

export function clearLayoutCache(): void {
  cache.clear()
}
