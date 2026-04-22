// Authored particle-index sets for the Phase A1 info-9 module-in-module
// walkthrough and the info-8 single-entity spotlight. Indices address the
// blob's 16,384-point cloud and are picked to be deterministic + stable —
// any particle in [0, 16383] is a valid choice; we use a small scattered
// set so the lit particles land at distinct angular positions on the blob
// rather than clumping.
//
// Scope (A1 only): info-8 spotlight + info-9 three-step walkthrough.
// Phase A2 extends this file with Story 1 paper-label indices + Story 2
// entity-label indices; Phase A3 adds the entity-entity edge endpoint
// pairs consumed by FieldConnectionLayer. Do NOT author those here yet —
// A1 ships with just the Sequence focus table.
//
// The symbolic ids (catatonia / nms / delirium / lorazepam) correspond to
// the clinical spine used in `sequenceInfoNineSteps` (field-landing-content.ts).
// Because A1 does not yet render labels, these ids live only as code
// comments; A2 will reveal them via FieldCategoryLabelPool.

const FOCUS_INDEX_CATATONIA = 4917;
const FOCUS_INDEX_NMS = 2094;
const FOCUS_INDEX_DELIRIUM = 10342;

// Paper-particle member indices. Step 1 authors three context papers
// around the catatonia focus; step 2 shows one bridging paper toward NMS;
// step 3 closes with the lorazepam-challenge paper that earns the lever.
const PAPER_INDEX_P4 = 1123;
const PAPER_INDEX_P7 = 3571;
const PAPER_INDEX_P10 = 7208;
const PAPER_INDEX_P5 = 6845;

export interface InfoNineStepFocusEntry {
  readonly focusIndex: number;
  readonly memberIndices: readonly number[];
}

// Ordered by step 1 → 2 → 3. `FieldModuleInModule` writes a 1-based step
// index (1/2/3) into `sceneState.sequenceFocusStep`; BlobController
// subtracts 1 to index this table. Step 0 = inactive (no entry consumed).
export const INFO_NINE_STEP_FOCUS_TABLE: readonly InfoNineStepFocusEntry[] = [
  // Step 1: "Start where the patient is" — catatonia focus with three
  // context papers softly persisting as the article surface.
  {
    focusIndex: FOCUS_INDEX_CATATONIA,
    memberIndices: [PAPER_INDEX_P4, PAPER_INDEX_P7, PAPER_INDEX_P10],
  },
  // Step 2: "Follow the bridges" — focus rotates to NMS; bridges from
  // catatonia + delirium light as edges in Phase A3. One member paper
  // surfaces as the bridging citation.
  {
    focusIndex: FOCUS_INDEX_NMS,
    memberIndices: [PAPER_INDEX_P5],
  },
  // Step 3: "Land on the lever" — focus returns to catatonia with the
  // lorazepam-challenge paper as the single member, the paper that earns
  // the final action.
  {
    focusIndex: FOCUS_INDEX_CATATONIA,
    memberIndices: [PAPER_INDEX_P10],
  },
];

// Sequence info-8 "Living Knowledge" holds a single entity spotlighted
// with its member papers softly persisting. Reuses the catatonia spine
// so the reader's eye is already on the entity the info-9 walkthrough
// opens on, creating a continuous visual narrative.
export const INFO_EIGHT_FOCUS_ENTRY: InfoNineStepFocusEntry = {
  focusIndex: FOCUS_INDEX_CATATONIA,
  memberIndices: [PAPER_INDEX_P4, PAPER_INDEX_P7, PAPER_INDEX_P10],
};

// Symbolic → index map, exported so `FieldModuleInModule` can resolve
// step `focusEntityId` / `memberPaperIds` strings against the same
// authored set. Kept inline here (not cross-file) to keep the authoring
// source of truth in one place.
export const LIT_PARTICLE_INDEX_BY_SYMBOL: Readonly<Record<string, number>> = {
  catatonia: FOCUS_INDEX_CATATONIA,
  nms: FOCUS_INDEX_NMS,
  delirium: FOCUS_INDEX_DELIRIUM,
  p4: PAPER_INDEX_P4,
  p5: PAPER_INDEX_P5,
  p7: PAPER_INDEX_P7,
  p10: PAPER_INDEX_P10,
};
