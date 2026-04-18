const LATENCY_RING_SIZE = 100;

interface EntityMatchMetricsState {
  requestCount: number;
  abortCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  latencies: number[];
}

const state: EntityMatchMetricsState = {
  requestCount: 0,
  abortCount: 0,
  cacheHitCount: 0,
  cacheMissCount: 0,
  latencies: [],
};

export function recordMatchRequest(): void {
  state.requestCount += 1;
}

export function recordMatchAbort(): void {
  state.abortCount += 1;
}

export function recordMatchCacheHit(): void {
  state.cacheHitCount += 1;
}

export function recordMatchCacheMiss(): void {
  state.cacheMissCount += 1;
}

export function recordMatchLatency(ms: number): void {
  if (state.latencies.length >= LATENCY_RING_SIZE) {
    state.latencies.shift();
  }
  state.latencies.push(ms);
}

export function getMatchMetricsSummary(): {
  requestCount: number;
  abortCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  p50: number | null;
  p95: number | null;
} {
  const sorted = [...state.latencies].sort((a, b) => a - b);
  return {
    requestCount: state.requestCount,
    abortCount: state.abortCount,
    cacheHitCount: state.cacheHitCount,
    cacheMissCount: state.cacheMissCount,
    p50: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : null,
    p95: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : null,
  };
}

export function resetMatchMetrics(): void {
  state.requestCount = 0;
  state.abortCount = 0;
  state.cacheHitCount = 0;
  state.cacheMissCount = 0;
  state.latencies = [];
}

if (process.env.NODE_ENV !== "production") {
  (globalThis as Record<string, unknown>).__entityMatchMetrics = {
    get summary() {
      return getMatchMetricsSummary();
    },
    reset: resetMatchMetrics,
  };
}
