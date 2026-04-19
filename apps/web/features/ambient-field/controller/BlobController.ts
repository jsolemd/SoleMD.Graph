import { FieldController, type FieldControllerInit } from "./FieldController";

export interface BlobHotspotState {
  opacity: number;
  maxNumber: number;
  onlyReds: number;
  interval: number;
}

// BlobController mirrors Maze's `mm` at scripts.pretty.js:43257-43526.
// Phase 6 keeps the hotspot state container here; the full DOM pool
// rebuild lands in Phase 7 when `AmbientFieldHotspotRing` + the lifecycle
// controller come online. Chapter scroll scrub lands in Phase 8.
export class BlobController extends FieldController {
  hotspotState: BlobHotspotState = {
    opacity: 0,
    maxNumber: 0,
    onlyReds: 0,
    interval: 2000,
  };

  constructor(init: FieldControllerInit) {
    super(init);
  }
}
