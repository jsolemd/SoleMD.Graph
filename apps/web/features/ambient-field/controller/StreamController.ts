import { FieldController } from "./FieldController";

// StreamController mirrors Maze's `ug` at scripts.pretty.js:49326-49345.
// Maze's stream model uses an aspect-driven scale so the conveyor reads
// consistently across viewport widths:
//
//   scale = 250 * (innerW/innerH) / (1512/748)   // desktop
//   scale = 168                                   // mobile
//
// We reproduce that formula while still honoring sceneScale on top so the
// preset can tune overall visibility without touching the aspect math.
const MAZE_REFERENCE_ASPECT = 1512 / 748;
const MAZE_DESKTOP_BASE = 250;
const MAZE_MOBILE_BASE = 168;

export class StreamController extends FieldController {
  updateScale(
    _sceneUnits: number,
    _sourceHeight: number,
    isMobile: boolean,
  ): number {
    this.isMobile = isMobile;
    const sceneScale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    if (isMobile) return MAZE_MOBILE_BASE * sceneScale;
    if (typeof window === "undefined") return MAZE_DESKTOP_BASE * sceneScale;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return MAZE_DESKTOP_BASE * (aspect / MAZE_REFERENCE_ASPECT) * sceneScale;
  }
}
