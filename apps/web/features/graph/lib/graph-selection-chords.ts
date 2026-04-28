export interface GraphSelectionChordState {
  addToSelection: boolean;
  expandLinks: boolean;
  throughVolume: boolean;
}

export const DEFAULT_GRAPH_SELECTION_CHORDS: GraphSelectionChordState = {
  addToSelection: false,
  expandLinks: false,
  throughVolume: false,
};

type ModifierEvent = Pick<
  MouseEvent | PointerEvent | KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function readGraphSelectionChords(
  event: ModifierEvent,
): GraphSelectionChordState {
  return {
    addToSelection: event.shiftKey,
    expandLinks: event.metaKey || event.ctrlKey,
    throughVolume: event.altKey,
  };
}

export function hasGraphSelectionChord(
  chords: GraphSelectionChordState,
): boolean {
  return chords.addToSelection || chords.expandLinks || chords.throughVolume;
}
