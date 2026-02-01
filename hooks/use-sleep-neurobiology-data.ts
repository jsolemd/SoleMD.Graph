import { useMemo } from 'react';
import {
  ProcessScenarioId,
  SleepNeurobiologyReferenceData,
  ProcessScenario,
  FlipFlopModel,
  ThalamocorticalReference,
  RemSwitchReference,
  EnergyStateReference,
  GlymphaticReference,
  NeurotransmitterReference,
} from '../lib/sleep-neurobiology/types';
import { sleepNeurobiologyReferenceData } from '../lib/sleep-neurobiology/reference';

/**
 * Shared hook returning the canonical mock datasets that power the sleep neurobiology page.
 *
 * Data originates from peer-reviewed ranges encoded in `lib/sleep-neurobiology/reference`.
 */
export const useSleepNeurobiologyData = (): SleepNeurobiologyReferenceData => {
  return useMemo(() => sleepNeurobiologyReferenceData, []);
};

export const useProcessScenario = (scenarioId: ProcessScenarioId = 'baseline'): ProcessScenario => {
  return useMemo(
    () => sleepNeurobiologyReferenceData.processScenarios[scenarioId],
    [scenarioId],
  );
};

export const useProcessScenarios = (): Record<ProcessScenarioId, ProcessScenario> => {
  return useMemo(() => sleepNeurobiologyReferenceData.processScenarios, []);
};

export const useFlipFlopModel = (): FlipFlopModel => {
  return useMemo(() => sleepNeurobiologyReferenceData.flipFlop, []);
};

export const useThalamocorticalReference = (): ThalamocorticalReference => {
  return useMemo(() => sleepNeurobiologyReferenceData.thalamocortical, []);
};

export const useRemSwitchReference = (): RemSwitchReference => {
  return useMemo(() => sleepNeurobiologyReferenceData.remSwitch, []);
};

export const useEnergyAndPlasticityReference = (): EnergyStateReference => {
  return useMemo(() => sleepNeurobiologyReferenceData.energyAndPlasticity, []);
};

export const useGlymphaticReference = (): GlymphaticReference => {
  return useMemo(() => sleepNeurobiologyReferenceData.glymphatic, []);
};

export const useNeurotransmitterReference = (): NeurotransmitterReference => {
  return useMemo(() => sleepNeurobiologyReferenceData.neurotransmitters, []);
};
