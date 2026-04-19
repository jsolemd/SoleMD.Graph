import { FieldController } from "./FieldController";

// PcbController mirrors Maze's `_m` at scripts.pretty.js:43615-43630.
// Maze's PCB is a horizon-laying bitmap: x rotation -80 degrees, wrapper.z
// scrubbed -200 -> 0 across the section. Scale comes from `scaleFactor:0.5`
// in the preset; the PCB's source height is its rectangle height, not 2.
//
// Scale here honors the preset's sceneScale directly (no sceneUnits
// division) because the bitmap geometry is already sized in CSS pixel
// space, matching Maze's behavior.
export class PcbController extends FieldController {
  updateScale(
    sceneUnits: number,
    sourceHeight: number,
    isMobile: boolean,
  ): number {
    this.sceneUnits = sceneUnits;
    this.isMobile = isMobile;
    const sceneScale = isMobile
      ? this.params.sceneScaleMobile ?? this.params.sceneScale
      : this.params.sceneScale;
    return (sceneUnits / Math.max(sourceHeight, 0.001)) * sceneScale;
  }
}
