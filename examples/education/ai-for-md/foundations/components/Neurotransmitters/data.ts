// @ts-nocheck
import { NeurotransmitterTimelinePoint } from '../../../../../../lib/sleep-neurobiology/types';

export type NeurotransmitterId = 'norepinephrine' | 'acetylcholine' | 'serotonin' | 'dopamine' | 'histamine' | 'gaba' | 'orexin';
export type NucleiId = 'LC' | 'BF' | 'DRN' | 'VTA' | 'TMN' | 'VLPO' | 'MnPO' | 'LH';
export type ReceptorId = 'H1' | 'M1' | 'M2' | 'A1' | 'A2A' | '5HT1A' | '5HT2A' | 'D1' | 'D2' | 'GABAA';

export interface NeurotransmitterInfo {
  id: NeurotransmitterId;
  name: string;
  abbreviation: string;
  color: string;
  role: 'wake_promoting' | 'sleep_promoting' | 'modulatory';
  peakStage: 'wake' | 'nrem' | 'rem';
  baselinePercent: number;
  description: string;
}

export interface BrainNucleus {
  id: NucleiId;
  name: string;
  fullName: string;
  position: { x: number; y: number; z: number };
  role: 'wake_promoting' | 'sleep_promoting' | 'modulatory';
  primaryNeurotransmitters: NeurotransmitterId[];
  firingRateHz: number;
}

export interface NeurotransmitterPathway {
  source: NucleiId;
  target: NucleiId | 'cortex' | 'thalamus' | 'hypothalamus';
  neurotransmitter: NeurotransmitterId;
  strength: number; // 0-1, for chord diagram thickness
  effect: 'excitatory' | 'inhibitory';
  description: string;
}

export interface ReceptorData {
  id: ReceptorId;
  neurotransmitter: NeurotransmitterId;
  name: string;
  densityPmPerMg: number;
  distribution: 'cortical' | 'subcortical' | 'widespread';
  effect: 'excitatory' | 'inhibitory';
}

export interface ScenarioAdjustment {
  neurotransmitter: NeurotransmitterId;
  multiplier: number;
  description: string;
}

export interface NeurotransmitterScenario {
  id: 'baseline' | 'ssri' | 'stimulant' | 'sedative';
  name: string;
  description: string;
  color: string;
  adjustments: ScenarioAdjustment[];
  clinicalNotes: string[];
}

// Neurotransmitter definitions with colors matching the enhancement plan
export const neurotransmitters: NeurotransmitterInfo[] = [
  {
    id: 'norepinephrine',
    name: 'Norepinephrine',
    abbreviation: 'NE',
    color: '#EF4444', // Red
    role: 'wake_promoting',
    peakStage: 'wake',
    baselinePercent: 100,
    description: 'Primary wake-promoting catecholamine from locus coeruleus'
  },
  {
    id: 'acetylcholine',
    name: 'Acetylcholine',
    abbreviation: 'ACh',
    color: '#3B82F6', // Blue
    role: 'modulatory',
    peakStage: 'rem',
    baselinePercent: 100,
    description: 'Cholinergic modulation of arousal and REM sleep'
  },
  {
    id: 'serotonin',
    name: 'Serotonin',
    abbreviation: '5-HT',
    color: '#8B5CF6', // Purple
    role: 'wake_promoting',
    peakStage: 'wake',
    baselinePercent: 100,
    description: 'Monoamine wake promotion and mood regulation'
  },
  {
    id: 'dopamine',
    name: 'Dopamine',
    abbreviation: 'DA',
    color: '#F59E0B', // Amber
    role: 'wake_promoting',
    peakStage: 'wake',
    baselinePercent: 100,
    description: 'Reward and motivation pathways supporting wakefulness'
  },
  {
    id: 'histamine',
    name: 'Histamine',
    abbreviation: 'HA',
    color: '#10B981', // Emerald
    role: 'wake_promoting',
    peakStage: 'wake',
    baselinePercent: 100,
    description: 'Histaminergic arousal from tuberomammillary nucleus'
  },
  {
    id: 'gaba',
    name: 'GABA',
    abbreviation: 'GABA',
    color: '#6366F1', // Indigo
    role: 'sleep_promoting',
    peakStage: 'nrem',
    baselinePercent: 100,
    description: 'Primary inhibitory neurotransmitter promoting sleep'
  },
  {
    id: 'orexin',
    name: 'Orexin/Hypocretin',
    abbreviation: 'ORX',
    color: '#EC4899', // Pink
    role: 'wake_promoting',
    peakStage: 'wake',
    baselinePercent: 100,
    description: 'Neuropeptide stabilizing wake-sleep transitions'
  }
];

// Brain nuclei with 3D positions for the synapse scene
export const brainNuclei: BrainNucleus[] = [
  {
    id: 'LC',
    name: 'LC',
    fullName: 'Locus Coeruleus',
    position: { x: 0, y: -2, z: -3 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['norepinephrine'],
    firingRateHz: 18
  },
  {
    id: 'BF',
    name: 'BF',
    fullName: 'Basal Forebrain',
    position: { x: 1, y: 1, z: 0 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['acetylcholine'],
    firingRateHz: 12
  },
  {
    id: 'DRN',
    name: 'DRN',
    fullName: 'Dorsal Raphe Nucleus',
    position: { x: 0, y: -1, z: -2 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['serotonin'],
    firingRateHz: 14
  },
  {
    id: 'VTA',
    name: 'VTA',
    fullName: 'Ventral Tegmental Area',
    position: { x: -1, y: -1, z: -1 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['dopamine'],
    firingRateHz: 10
  },
  {
    id: 'TMN',
    name: 'TMN',
    fullName: 'Tuberomammillary Nucleus',
    position: { x: -1, y: 0, z: -1 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['histamine'],
    firingRateHz: 15
  },
  {
    id: 'VLPO',
    name: 'VLPO',
    fullName: 'Ventrolateral Preoptic Area',
    position: { x: 1, y: 0, z: 1 },
    role: 'sleep_promoting',
    primaryNeurotransmitters: ['gaba'],
    firingRateHz: 8
  },
  {
    id: 'MnPO',
    name: 'MnPO',
    fullName: 'Median Preoptic Area',
    position: { x: 0, y: 0, z: 1 },
    role: 'sleep_promoting',
    primaryNeurotransmitters: ['gaba'],
    firingRateHz: 7
  },
  {
    id: 'LH',
    name: 'LH',
    fullName: 'Lateral Hypothalamus',
    position: { x: -1, y: 0, z: 0 },
    role: 'wake_promoting',
    primaryNeurotransmitters: ['orexin'],
    firingRateHz: 10
  }
];

// Pathways for chord diagram - based on Scammell 2017 and Brown 2012
export const neurotransmitterPathways: NeurotransmitterPathway[] = [
  // Wake-promoting to sleep-promoting (inhibitory)
  {
    source: 'LC',
    target: 'VLPO',
    neurotransmitter: 'norepinephrine',
    strength: 0.8,
    effect: 'inhibitory',
    description: 'NE suppresses VLPO sleep neurons'
  },
  {
    source: 'DRN',
    target: 'VLPO',
    neurotransmitter: 'serotonin',
    strength: 0.7,
    effect: 'inhibitory',
    description: '5-HT inhibits sleep-promoting VLPO'
  },
  {
    source: 'TMN',
    target: 'VLPO',
    neurotransmitter: 'histamine',
    strength: 0.9,
    effect: 'inhibitory',
    description: 'Histamine strongly inhibits VLPO'
  },

  // Sleep-promoting to wake-promoting (inhibitory)
  {
    source: 'VLPO',
    target: 'LC',
    neurotransmitter: 'gaba',
    strength: 0.95,
    effect: 'inhibitory',
    description: 'VLPO GABA inhibits LC'
  },
  {
    source: 'VLPO',
    target: 'DRN',
    neurotransmitter: 'gaba',
    strength: 0.9,
    effect: 'inhibitory',
    description: 'VLPO GABA inhibits DRN'
  },
  {
    source: 'VLPO',
    target: 'TMN',
    neurotransmitter: 'gaba',
    strength: 0.9,
    effect: 'inhibitory',
    description: 'VLPO GABA inhibits TMN'
  },

  // Orexin stabilization (excitatory)
  {
    source: 'LH',
    target: 'LC',
    neurotransmitter: 'orexin',
    strength: 0.8,
    effect: 'excitatory',
    description: 'Orexin excites LC'
  },
  {
    source: 'LH',
    target: 'DRN',
    neurotransmitter: 'orexin',
    strength: 0.6,
    effect: 'excitatory',
    description: 'Orexin excites DRN'
  },
  {
    source: 'LH',
    target: 'TMN',
    neurotransmitter: 'orexin',
    strength: 1.0,
    effect: 'excitatory',
    description: 'Orexin strongly excites TMN'
  },

  // Cholinergic modulation
  {
    source: 'BF',
    target: 'cortex',
    neurotransmitter: 'acetylcholine',
    strength: 0.7,
    effect: 'excitatory',
    description: 'ACh promotes cortical arousal'
  },

  // Dopaminergic pathways
  {
    source: 'VTA',
    target: 'cortex',
    neurotransmitter: 'dopamine',
    strength: 0.6,
    effect: 'excitatory',
    description: 'DA promotes motivated wakefulness'
  }
];

// Receptor data from autoradiography studies
export const receptorData: ReceptorData[] = [
  {
    id: 'H1',
    neurotransmitter: 'histamine',
    name: 'Histamine H1',
    densityPmPerMg: 1.2,
    distribution: 'cortical',
    effect: 'excitatory'
  },
  {
    id: 'M1',
    neurotransmitter: 'acetylcholine',
    name: 'Muscarinic M1',
    densityPmPerMg: 0.9,
    distribution: 'cortical',
    effect: 'excitatory'
  },
  {
    id: 'M2',
    neurotransmitter: 'acetylcholine',
    name: 'Muscarinic M2',
    densityPmPerMg: 0.6,
    distribution: 'subcortical',
    effect: 'inhibitory'
  },
  {
    id: 'A1',
    neurotransmitter: 'norepinephrine',
    name: 'Alpha-1 Adrenergic',
    densityPmPerMg: 1.5,
    distribution: 'widespread',
    effect: 'excitatory'
  },
  {
    id: 'A2A',
    neurotransmitter: 'norepinephrine',
    name: 'Alpha-2A Adrenergic',
    densityPmPerMg: 0.8,
    distribution: 'subcortical',
    effect: 'inhibitory'
  },
  {
    id: '5HT1A',
    neurotransmitter: 'serotonin',
    name: 'Serotonin 1A',
    densityPmPerMg: 1.1,
    distribution: 'widespread',
    effect: 'inhibitory'
  },
  {
    id: '5HT2A',
    neurotransmitter: 'serotonin',
    name: 'Serotonin 2A',
    densityPmPerMg: 0.7,
    distribution: 'cortical',
    effect: 'excitatory'
  },
  {
    id: 'D1',
    neurotransmitter: 'dopamine',
    name: 'Dopamine D1',
    densityPmPerMg: 0.9,
    distribution: 'cortical',
    effect: 'excitatory'
  },
  {
    id: 'D2',
    neurotransmitter: 'dopamine',
    name: 'Dopamine D2',
    densityPmPerMg: 1.3,
    distribution: 'subcortical',
    effect: 'inhibitory'
  },
  {
    id: 'GABAA',
    neurotransmitter: 'gaba',
    name: 'GABA-A',
    densityPmPerMg: 2.1,
    distribution: 'widespread',
    effect: 'inhibitory'
  }
];

// Pharmacological scenarios with adjustments
export const neurotransmitterScenarios: NeurotransmitterScenario[] = [
  {
    id: 'baseline',
    name: 'Baseline',
    description: 'Normal physiological neurotransmitter cycling',
    color: '#6B7280',
    adjustments: [],
    clinicalNotes: [
      'Natural sleep-wake cycling',
      'Balanced neurotransmitter levels',
      'Normal REM and NREM architecture'
    ]
  },
  {
    id: 'ssri',
    name: 'SSRI Treatment',
    description: 'Selective serotonin reuptake inhibitor effects',
    color: '#8B5CF6',
    adjustments: [
      {
        neurotransmitter: 'serotonin',
        multiplier: 2.0,
        description: 'Increased extracellular 5-HT'
      },
      {
        neurotransmitter: 'norepinephrine',
        multiplier: 0.2,
        description: 'Reduced NE during REM'
      }
    ],
    clinicalNotes: [
      'REM suppression (~30% reduction)',
      'Increased REM latency',
      'Vivid dreams on discontinuation',
      'Sleep fragmentation possible'
    ]
  },
  {
    id: 'stimulant',
    name: 'Stimulant Effects',
    description: 'Amphetamine/methylphenidate-like effects',
    color: '#F59E0B',
    adjustments: [
      {
        neurotransmitter: 'dopamine',
        multiplier: 1.5,
        description: 'Enhanced DA release'
      },
      {
        neurotransmitter: 'norepinephrine',
        multiplier: 1.6,
        description: 'Increased NE activity'
      },
      {
        neurotransmitter: 'acetylcholine',
        multiplier: 1.2,
        description: 'Enhanced ACh signaling'
      }
    ],
    clinicalNotes: [
      'Shortened REM latency',
      'Reduced total sleep time',
      'Increased sleep onset latency',
      'Rebound hypersomnia on withdrawal'
    ]
  },
  {
    id: 'sedative',
    name: 'Sedative/Hypnotic',
    description: 'GABA-ergic enhancement effects',
    color: '#6366F1',
    adjustments: [
      {
        neurotransmitter: 'gaba',
        multiplier: 1.8,
        description: 'Enhanced GABA activity'
      },
      {
        neurotransmitter: 'norepinephrine',
        multiplier: 0.6,
        description: 'Reduced NE activity'
      },
      {
        neurotransmitter: 'histamine',
        multiplier: 0.5,
        description: 'Reduced histamine signaling'
      }
    ],
    clinicalNotes: [
      'Reduced sleep onset latency',
      'Altered sleep architecture',
      'Tolerance development',
      'Withdrawal insomnia'
    ]
  }
];

// Helper functions
export function getNeurotransmitterColor(id: NeurotransmitterId): string {
  return neurotransmitters.find(nt => nt.id === id)?.color ?? '#6B7280';
}

export function getNeurotransmitterInfo(id: NeurotransmitterId): NeurotransmitterInfo | undefined {
  return neurotransmitters.find(nt => nt.id === id);
}

export function getPathwaysForNeurotransmitter(id: NeurotransmitterId): NeurotransmitterPathway[] {
  return neurotransmitterPathways.filter(pathway => pathway.neurotransmitter === id);
}

export function getReceptorsForNeurotransmitter(id: NeurotransmitterId): ReceptorData[] {
  return receptorData.filter(receptor => receptor.neurotransmitter === id);
}

export function applyScenarioAdjustments(
  baselineData: NeurotransmitterTimelinePoint[],
  scenario: NeurotransmitterScenario
): NeurotransmitterTimelinePoint[] {
  if (scenario.id === 'baseline') return baselineData;

  return baselineData.map(point => {
    const adjusted = { ...point };

    scenario.adjustments.forEach(adj => {
      switch (adj.neurotransmitter) {
        case 'norepinephrine':
          adjusted.norepinephrinePercentOfWake *= adj.multiplier;
          break;
        case 'acetylcholine':
          adjusted.acetylcholinePercentOfWake *= adj.multiplier;
          break;
        case 'serotonin':
          adjusted.serotoninPercentOfWake *= adj.multiplier;
          break;
        case 'dopamine':
          adjusted.dopaminePercentOfWake *= adj.multiplier;
          break;
        case 'histamine':
          adjusted.histaminePercentOfWake *= adj.multiplier;
          break;
      }
    });

    return adjusted;
  });
}