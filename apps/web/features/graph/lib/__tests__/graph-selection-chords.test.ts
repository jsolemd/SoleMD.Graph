import {
  DEFAULT_GRAPH_SELECTION_CHORDS,
  hasGraphSelectionChord,
  readGraphSelectionChords,
} from "../graph-selection-chords";

describe("graph selection chords", () => {
  it("maps Shift to additive selection", () => {
    expect(
      readGraphSelectionChords({
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      }),
    ).toEqual({
      addToSelection: true,
      expandLinks: false,
      throughVolume: false,
    });
  });

  it("maps Meta/Ctrl to link expansion intent", () => {
    expect(
      readGraphSelectionChords({
        shiftKey: false,
        metaKey: true,
        ctrlKey: false,
        altKey: false,
      }),
    ).toEqual({
      addToSelection: false,
      expandLinks: true,
      throughVolume: false,
    });

    expect(
      readGraphSelectionChords({
        shiftKey: false,
        metaKey: false,
        ctrlKey: true,
        altKey: false,
      }),
    ).toEqual({
      addToSelection: false,
      expandLinks: true,
      throughVolume: false,
    });
  });

  it("maps Alt/Option to through-volume selection intent", () => {
    expect(
      readGraphSelectionChords({
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: true,
      }),
    ).toEqual({
      addToSelection: false,
      expandLinks: false,
      throughVolume: true,
    });
  });

  it("detects whether any graph selection chord is active", () => {
    expect(hasGraphSelectionChord(DEFAULT_GRAPH_SELECTION_CHORDS)).toBe(false);
    expect(
      hasGraphSelectionChord({
        addToSelection: true,
        expandLinks: false,
        throughVolume: false,
      }),
    ).toBe(true);
    expect(
      hasGraphSelectionChord({
        addToSelection: false,
        expandLinks: true,
        throughVolume: false,
      }),
    ).toBe(true);
    expect(
      hasGraphSelectionChord({
        addToSelection: false,
        expandLinks: false,
        throughVolume: true,
      }),
    ).toBe(true);
  });
});
