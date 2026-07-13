import type { FieldSceneState } from "../../scene/visual-presets";
import { getFieldChapterProgress } from "../field-scroll-state";
import {
  createFieldChapterTimeline,
  type FieldChapterValueMap,
} from "../field-chapter-timeline";

// Delirium lecture drive. The blob (the landing orb) is the ONLY particle
// system on the lecture route; every beat of the delirium foundations deck is
// expressed in the field's native motion vocabulary rather than by swapping
// formations:
//
//   morph      0 = orb (sphere)          1 = brain          (uMorph)
//   amplitude  fbm turbulence            (uAmplitude)  — inflammation / agitation
//   frequency  chromatic churn rate      (uFrequency)  — neurochemical storm
//   selection  survival floor            (uSelection)  — how much of the cloud
//              survives (1 = whole brain, lower = thinned / decayed / islands)
//   alpha      cloud opacity             (uAlpha)      — dimming / collapse
//   depth      aMove drift depth         (uDepth)      — crisp brain vs loose orb
//
// The arc follows the deck (foundations = the "WHY" of the four-part
// framework), condensed to what the field can SHOW:
//   hero          the intact orb / living connectome
//   brain         the orb resolves into the brain — acute brain failure
//   burden        dose-dependent decline — the brain thins and dims
//   ratchet       vulnerability + the descending cognitive floor
//   siege         the inflammatory cascade reaches the brain — turbulence
//   disconnect    long-range connectivity fails first — islands, EEG slowing
//   signature     three flood, two drought — the neurochemical churn
//   acetylcholine the cholinergic core deficit — signal-to-noise collapses
//   lever         subtract, restore, reconnect — the brain re-coheres
//   (evidence holds the recovered state; no timeline of its own)

type DeliriumFieldKey =
  | "morph"
  | "amplitude"
  | "frequency"
  | "selection"
  | "alpha"
  | "depth";

export type DeliriumFieldState = FieldChapterValueMap<DeliriumFieldKey>;

// Orb rest state == the landing blob defaults, so the hero reads as the
// familiar landing orb before the first scroll.
const baseState: DeliriumFieldState = {
  morph: 0,
  amplitude: 0.05,
  frequency: 0.5,
  selection: 1,
  alpha: 1,
  depth: 0.3,
};

// brain: the orb condenses into a crisp brain. The orb holds through the hero
// (progress < 0.22), then morphs over 0.22..0.54 so the brain is fully formed
// early in the reading window, not sections later.
const brainTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0.22,
    duration: 0.32,
    to: { morph: 1, amplitude: 0.014, frequency: 0.16, depth: 0.06 },
  },
]);

// burden: dose-dependent decline. The formed brain visibly decays — the
// survival floor drops (~40% culls out, echoing the 40% long-term cognitive
// impairment) and it dims. Slow and heavy.
const burdenTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.5,
    to: { selection: 0.6, alpha: 0.66, amplitude: 0.03, frequency: 0.2 },
  },
]);

// ratchet: vulnerability compounds. A restless, tense hold — a little more
// turbulence, still thinned and dim, as the cognitive floor steps down.
const ratchetTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.5,
    to: { selection: 0.7, alpha: 0.72, amplitude: 0.07, frequency: 0.7 },
  },
]);

// siege: the inflammatory cascade reaches the brain — the whole field roughens
// and swells (DAMPs → cytokines → BBB breach → microglia), then settles a
// little as the siege establishes.
const siegeTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.5,
    to: { selection: 1, alpha: 0.86, amplitude: 0.14, frequency: 1.35, depth: 0.14 },
  },
  { atProgress: 0.5, duration: 0.5, to: { amplitude: 0.1, frequency: 1.05 } },
]);

// disconnect: long-range connectivity fails first. The survival floor drops so
// the cloud fragments into isolated islands, the field quiets, and it dims —
// the EEG-slowing signature of the delirious brain.
const disconnectTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.55,
    to: { selection: 0.55, alpha: 0.6, amplitude: 0.05, frequency: 0.8, depth: 0.06 },
  },
]);

// signature: three flood, two drought. The field churns chromatically — high
// frequency drives the rainbow into fast waves — and partly re-fills as the
// transmitter systems fire out of balance.
const signatureTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.5,
    to: { selection: 0.82, alpha: 0.82, amplitude: 0.12, frequency: 1.7 },
  },
]);

// acetylcholine: the cholinergic core deficit. Signal-to-noise collapses — the
// field dims hard, quiets, and thins again (inattention, the cardinal sign).
const acetylcholineTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.5,
    to: { alpha: 0.48, amplitude: 0.03, selection: 0.6, frequency: 0.6 },
  },
]);

// lever: subtract, restore, reconnect. Network states recover — the whole cloud
// returns, calms to a crisp brain, and brightens fully. Held through the
// closing evidence section.
const leverTimeline = createFieldChapterTimeline<DeliriumFieldKey>([
  {
    atProgress: 0,
    duration: 0.6,
    to: {
      selection: 1,
      alpha: 1,
      amplitude: 0.02,
      frequency: 0.16,
      depth: 0.06,
    },
  },
]);

// Layered sampling: each section's timeline mutates the running state in scroll
// order. A section not yet reached holds progress 0 (no effect); a section
// scrolled past holds progress 1 (its end state), so `morph` stays latched at 1
// through every clinical beat once the brain has formed, and the closing
// evidence section inherits the recovered `lever` state with no timeline of
// its own.
export function resolveDeliriumFieldState(
  sceneState: FieldSceneState,
): DeliriumFieldState {
  const at = (id: string) => getFieldChapterProgress(sceneState, id);
  let next = { ...baseState };
  next = brainTimeline.sample(next, at("section-brain"));
  next = burdenTimeline.sample(next, at("section-burden"));
  next = ratchetTimeline.sample(next, at("section-ratchet"));
  next = siegeTimeline.sample(next, at("section-siege"));
  next = disconnectTimeline.sample(next, at("section-disconnect"));
  next = signatureTimeline.sample(next, at("section-signature"));
  next = acetylcholineTimeline.sample(next, at("section-acetylcholine"));
  next = leverTimeline.sample(next, at("section-lever"));
  return next;
}
