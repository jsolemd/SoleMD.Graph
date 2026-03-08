import {
  NeurotransmitterId,
  NeurotransmitterScenario,
  neurotransmitters,
  neurotransmitterScenarios
} from './data';

export interface NeurotransmitterFilter {
  selectedNeurotransmitter: NeurotransmitterId | 'all';
  selectedScenario: 'baseline' | 'ssri' | 'stimulant' | 'sedative';
  searchQuery: string;
  showReceptors: boolean;
  highlightStage: 'all' | 'wake' | 'nrem' | 'rem';
}

export const defaultFilter: NeurotransmitterFilter = {
  selectedNeurotransmitter: 'all',
  selectedScenario: 'baseline',
  searchQuery: '',
  showReceptors: false,
  highlightStage: 'all'
};

export interface FilteredNeurotransmitterData {
  filteredNeurotransmitters: NeurotransmitterId[];
  activeScenario: NeurotransmitterScenario;
  searchMatches: {
    neurotransmitters: NeurotransmitterId[];
    pathways: number;
    receptors: number;
  };
}

export function applyNeurotransmitterFilters(
  filter: NeurotransmitterFilter
): FilteredNeurotransmitterData {
  // Get active scenario
  const activeScenario = neurotransmitterScenarios.find(s => s.id === filter.selectedScenario)
    ?? neurotransmitterScenarios[0];

  // Filter neurotransmitters
  let filteredNeurotransmitters: NeurotransmitterId[] = neurotransmitters.map(nt => nt.id);

  if (filter.selectedNeurotransmitter !== 'all') {
    filteredNeurotransmitters = [filter.selectedNeurotransmitter];
  }

  // Apply search filtering
  const searchMatches = {
    neurotransmitters: [] as NeurotransmitterId[],
    pathways: 0,
    receptors: 0
  };

  if (filter.searchQuery.trim()) {
    const query = filter.searchQuery.toLowerCase().trim();

    // Search neurotransmitters
    searchMatches.neurotransmitters = neurotransmitters
      .filter(nt =>
        nt.name.toLowerCase().includes(query) ||
        nt.abbreviation.toLowerCase().includes(query) ||
        nt.description.toLowerCase().includes(query) ||
        nt.role.toLowerCase().includes(query)
      )
      .map(nt => nt.id);

    // If we have search matches, further filter the results
    if (searchMatches.neurotransmitters.length > 0 && filter.selectedNeurotransmitter === 'all') {
      filteredNeurotransmitters = searchMatches.neurotransmitters;
    }
  }

  return {
    filteredNeurotransmitters,
    activeScenario,
    searchMatches
  };
}

export function highlightSearchTerms(text: string, searchQuery: string): string {
  if (!searchQuery.trim()) return text;

  const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(word => word.length > 0);
  let highlightedText = text;

  queryWords.forEach(word => {
    const regex = new RegExp(`(${word})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
  });

  return highlightedText;
}

export function getNeurotransmittersByStage(stage: 'wake' | 'nrem' | 'rem'): NeurotransmitterId[] {
  const stageMap: Record<string, NeurotransmitterId[]> = {
    wake: ['norepinephrine', 'serotonin', 'dopamine', 'histamine', 'orexin'],
    nrem: ['gaba'],
    rem: ['acetylcholine']
  };

  return stageMap[stage] || [];
}

export function getConcentrationAtHour(
  neurotransmitter: NeurotransmitterId,
  hour: number,
  timelineData: any[]
): number {
  const dataPoint = timelineData.find(point =>
    Math.abs(point.hour - hour) < 0.25
  );

  if (!dataPoint) return 100; // Default baseline

  switch (neurotransmitter) {
    case 'norepinephrine':
      return dataPoint.norepinephrinePercentOfWake;
    case 'acetylcholine':
      return dataPoint.acetylcholinePercentOfWake;
    case 'serotonin':
      return dataPoint.serotoninPercentOfWake;
    case 'dopamine':
      return dataPoint.dopaminePercentOfWake;
    case 'histamine':
      return dataPoint.histaminePercentOfWake;
    default:
      return 100;
  }
}

export function getScenarioColor(scenarioId: string): string {
  const scenario = neurotransmitterScenarios.find(s => s.id === scenarioId);
  return scenario?.color ?? '#6B7280';
}

export function formatConcentrationValue(value: number): string {
  return `${Math.round(value)}%`;
}

export function getTimeLabel(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function getSleepStageAtHour(hour: number): 'wake' | 'nrem' | 'rem' {
  // Simplified sleep stage mapping based on typical sleep architecture
  if (hour >= 7 && hour < 23) return 'wake';

  // Night sleep (23:00 - 07:00)
  const sleepHour = hour >= 23 ? hour - 23 : hour + 1; // Normalize to sleep onset

  if (sleepHour < 1) return 'nrem'; // First hour is typically NREM
  if (sleepHour >= 1 && sleepHour < 1.5) return 'rem'; // First REM period
  if (sleepHour >= 1.5 && sleepHour < 3.5) return 'nrem'; // Deep sleep
  if (sleepHour >= 3.5 && sleepHour < 4) return 'rem'; // Second REM
  if (sleepHour >= 4 && sleepHour < 6) return 'nrem'; // More NREM
  if (sleepHour >= 6 && sleepHour < 6.5) return 'rem'; // Final REM

  return 'nrem'; // Default to NREM
}

export function getNeurotransmitterPeakHours(neurotransmitter: NeurotransmitterId): number[] {
  const peakMap: Record<NeurotransmitterId, number[]> = {
    norepinephrine: [8, 12, 16, 20], // Wake periods
    acetylcholine: [1.25, 3.75, 6.25], // REM periods
    serotonin: [9, 13, 17, 21], // Wake periods
    dopamine: [10, 14, 18], // Wake motivation peaks
    histamine: [7, 11, 15, 19], // Arousal peaks
    gaba: [23.5, 1, 3, 5], // NREM peaks
    orexin: [8, 16, 20] // Wake stabilization
  };

  return peakMap[neurotransmitter] || [];
}