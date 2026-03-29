export const LIGHT_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth.json";
export const DARK_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";
export const INITIAL_VIEW = { longitude: 0, latitude: 30, zoom: 1.8 } as const;

/** Must match the Source's clusterMaxZoom prop — used in canExpand check */
export const CLUSTER_MAX_ZOOM = 17;

/** MapLibre opacity expression — dims features not in the active selection set. */
export function selectionOpacity(
  hl: Set<number> | null, sel: Set<number> | null,
  active: number, dim: number, base: number,
): unknown[] | number {
  const set = hl ?? sel;
  if (!set) return base;
  return ["match", ["get", "index"], [...set], active, dim];
}
