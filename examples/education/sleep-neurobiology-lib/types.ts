// Stub types — these pages are scheduled for rebuild.
// See vision.md for the new graph-native architecture.

export type ProcessScenarioId = 'baseline' | string;
export interface ProcessScenario { [key: string]: unknown }
export interface FlipFlopModel { [key: string]: unknown }
export interface ThalamocorticalReference { [key: string]: unknown }
export interface RemSwitchReference { [key: string]: unknown }
export interface EnergyStateReference { [key: string]: unknown }
export interface GlymphaticReference { [key: string]: unknown }
export interface NeurotransmitterReference { [key: string]: unknown }

export interface SleepNeurobiologyReferenceData {
  processScenarios: Record<ProcessScenarioId, ProcessScenario>;
  flipFlop: FlipFlopModel;
  thalamocortical: ThalamocorticalReference;
  remSwitch: RemSwitchReference;
  energyAndPlasticity: EnergyStateReference;
  glymphatic: GlymphaticReference;
  neurotransmitters: NeurotransmitterReference;
}
