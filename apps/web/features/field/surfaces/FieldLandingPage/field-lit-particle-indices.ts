// Authored particle-index set for the info-8 single-entity spotlight.
// Indices address the blob's 16,384-point cloud and are picked to be
// deterministic + stable — any particle in [0, 16383] is a valid choice;
// we use a small scattered set so the lit particles land at distinct
// angular positions on the blob rather than clumping.
//
// Phase A2 extends this file with Story 1 paper-label indices + Story 2
// entity-label indices; Phase A3 adds the entity-entity edge endpoint
// pairs consumed by FieldConnectionLayer. Do NOT author those here yet.

const FOCUS_INDEX_CATATONIA = 4917;
const PAPER_INDEX_P4 = 1123;
const PAPER_INDEX_P7 = 3571;
const PAPER_INDEX_P10 = 7208;

export interface InfoNineStepFocusEntry {
  readonly focusIndex: number;
  readonly memberIndices: readonly number[];
}

// Sequence info-8 "Living Knowledge" holds a single entity spotlighted
// with its member papers softly persisting. The Sequence keyframe keeps
// focusActive on through info-9 so the same entry carries into the
// chapter closer.
export const INFO_EIGHT_FOCUS_ENTRY: InfoNineStepFocusEntry = {
  focusIndex: FOCUS_INDEX_CATATONIA,
  memberIndices: [PAPER_INDEX_P4, PAPER_INDEX_P7, PAPER_INDEX_P10],
};
