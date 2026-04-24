/**
 * Lottie JSON color walker — replaces static fill/stroke colors with a
 * target RGBA tuple. Handles precomp assets and nested shape groups.
 * Only touches static colors (c.a !== 1); animated color keyframes are left
 * untouched since they'd need per-keyframe rewriting.
 *
 * `darkOnly` mode (default true): only replaces colors where all RGB
 * channels are below a threshold (0.1) — dark/black shapes become the
 * accent while light shapes (white highlights, contrast details) stay.
 */

export type LottieRgba = [number, number, number, number];

interface LottieColorProp {
  a?: number;
  k?: number[];
}

interface LottieShape {
  ty: string;
  c?: LottieColorProp;
  it?: LottieShape[];
}

interface LottieLayer {
  ty: number;
  shapes?: LottieShape[];
}

interface LottieAsset {
  layers?: LottieLayer[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LottieData = Record<string, any>;

function isDark(k: number[], threshold = 0.1): boolean {
  return k[0] < threshold && k[1] < threshold && k[2] < threshold;
}

function walkShapes(
  shapes: LottieShape[],
  color: LottieRgba,
  darkOnly: boolean,
) {
  for (const shape of shapes) {
    if (
      (shape.ty === "st" || shape.ty === "fl") &&
      shape.c &&
      shape.c.a !== 1 &&
      shape.c.k
    ) {
      if (!darkOnly || isDark(shape.c.k)) {
        shape.c.k = [...color];
      }
    } else if (shape.ty === "gr" && shape.it) {
      walkShapes(shape.it, color, darkOnly);
    }
  }
}

interface RecolorOptions {
  /** Only replace dark/black colors, preserve light ones. Default true. */
  darkOnly?: boolean;
  /** Strip the glow layer (pulse.json layer 1). */
  matte?: boolean;
  /** Glow layer opacity (0–100). Only used with matte. */
  glowOpacity?: number;
}

/**
 * Cache recolored Lottie clones keyed by source reference + options.
 *
 * `resolveCssColor` allocates a fresh `LottieRgba` tuple every call, which
 * defeats `useMemo` / referential caches at the call-site. We key the clone
 * cache by a stable string built from the numeric values + options so that
 * identical inputs reuse the prior `structuredClone` result. The outer
 * WeakMap keyed on the source `data` keeps imported Lottie JSONs eligible
 * for GC and scopes the inner map per-asset.
 *
 * Inner map bound is small (4): each caller has a single source JSON and
 * typically at most 2 active color tuples (light + dark mode).
 */
const RECOLOR_INNER_MAX = 4;

interface RecolorCacheEntry {
  order: string[];
  byKey: Map<string, LottieData>;
}

const recolorCloneCache = new WeakMap<LottieData, RecolorCacheEntry>();

function formatChannel(n: number): string {
  // 4 decimal places is enough to distinguish any CSS-resolved channel
  // (getComputedStyle returns integer 0-255 for RGB, float for alpha).
  return Number.isFinite(n) ? n.toFixed(4) : "na";
}

function buildRecolorCacheKey(
  rgba: LottieRgba,
  opts: RecolorOptions,
): string {
  const darkOnly = opts.darkOnly ?? true;
  const matte = opts.matte ? 1 : 0;
  const glowOpacity = opts.glowOpacity ?? -1;
  return `${formatChannel(rgba[0])}|${formatChannel(rgba[1])}|${formatChannel(
    rgba[2],
  )}|${formatChannel(rgba[3])}|${darkOnly ? 1 : 0}|${matte}|${glowOpacity}`;
}

export function recolorLottie(
  data: LottieData,
  rgba: LottieRgba,
  opts: RecolorOptions = {},
): LottieData {
  const cacheKey = buildRecolorCacheKey(rgba, opts);
  let entry = recolorCloneCache.get(data);
  if (entry) {
    const cached = entry.byKey.get(cacheKey);
    if (cached) return cached;
  } else {
    entry = { order: [], byKey: new Map() };
    recolorCloneCache.set(data, entry);
  }

  const darkOnly = opts.darkOnly ?? true;
  const clone = structuredClone(data) as LottieData;
  for (const asset of (clone.assets ?? []) as LottieAsset[]) {
    for (const layer of asset.layers ?? []) {
      if (layer.ty === 4) walkShapes(layer.shapes ?? [], rgba, darkOnly);
    }
  }
  for (const layer of (clone.layers ?? []) as LottieLayer[]) {
    if (layer.ty === 4) walkShapes(layer.shapes ?? [], rgba, darkOnly);
  }

  if (opts.matte && clone.layers?.length > 1) {
    const glowLayer = clone.layers[1] as LottieData;
    if (glowLayer.ks?.o) {
      glowLayer.ks.o.k = opts.glowOpacity ?? 0;
    }
  }

  entry.byKey.set(cacheKey, clone);
  entry.order.push(cacheKey);
  if (entry.order.length > RECOLOR_INNER_MAX) {
    const evicted = entry.order.shift();
    if (evicted !== undefined) entry.byKey.delete(evicted);
  }

  return clone;
}

/**
 * Resolve the current computed value of `--mode-accent` as a Lottie RGBA
 * tuple (each channel 0-1). Uses a throwaway element so the browser
 * resolves any nested `var()` references for us.
 */
const FALLBACK_ACCENT: LottieRgba = [0.4, 0.6, 1, 1];

export function resolveCssColor(
  variableName: string,
  fallback: LottieRgba,
): LottieRgba {
  if (typeof document === "undefined") return fallback;
  try {
    const el = document.createElement("div");
    el.style.color = `var(${variableName})`;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    const m = rgb.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/,
    );
    if (!m) return fallback;
    return [
      parseInt(m[1]) / 255,
      parseInt(m[2]) / 255,
      parseInt(m[3]) / 255,
      m[4] == null ? 1 : parseFloat(m[4]),
    ];
  } catch {
    return fallback;
  }
}

export function resolveAccentColor(): LottieRgba {
  return resolveCssColor("--mode-accent", FALLBACK_ACCENT);
}
