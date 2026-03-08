import { ClinicalPearl } from './data';

export type FilterCategory = 'all' | 'circadian' | 'pharmacology' | 'behavioral';

export interface FilterState {
  category: FilterCategory;
  searchQuery: string;
  evidenceLevel: number;
}

export interface FilteredResults {
  pearls: ClinicalPearl[];
  totalCount: number;
  categoryCount: Record<FilterCategory, number>;
}

export const defaultFilterState: FilterState = {
  category: 'all',
  searchQuery: '',
  evidenceLevel: 0
};

export function filterPearls(pearls: ClinicalPearl[], filters: FilterState): FilteredResults {
  let filteredPearls = [...pearls];

  // Category filter
  if (filters.category !== 'all') {
    filteredPearls = filteredPearls.filter(pearl => pearl.category === filters.category);
  }

  // Evidence level filter
  if (filters.evidenceLevel > 0) {
    filteredPearls = filteredPearls.filter(
      pearl => pearl.backContent.evidenceLevel.score >= filters.evidenceLevel
    );
  }

  // Search filter with fuzzy matching
  if (filters.searchQuery.trim()) {
    const query = filters.searchQuery.toLowerCase();
    filteredPearls = filteredPearls.filter(pearl => {
      const searchFields = [
        pearl.title,
        pearl.summary,
        pearl.backContent.explanation,
        ...pearl.keywords,
        ...pearl.backContent.interventions,
        ...pearl.backContent.outcomes
      ].join(' ').toLowerCase();

      // Simple fuzzy matching - split query into words and check if all are present
      const queryWords = query.split(/\s+/).filter(word => word.length > 0);
      return queryWords.every(word => searchFields.includes(word));
    });
  }

  // Calculate category counts for the original dataset
  const categoryCount: Record<FilterCategory, number> = {
    all: pearls.length,
    circadian: pearls.filter(p => p.category === 'circadian').length,
    pharmacology: pearls.filter(p => p.category === 'pharmacology').length,
    behavioral: pearls.filter(p => p.category === 'behavioral').length
  };

  return {
    pearls: filteredPearls,
    totalCount: filteredPearls.length,
    categoryCount
  };
}

export function highlightSearchTerms(text: string, searchQuery: string): string {
  if (!searchQuery.trim()) return text;

  const queryWords = searchQuery.toLowerCase().split(/\s+/).filter(word => word.length > 0);
  let highlightedText = text;

  queryWords.forEach(word => {
    const regex = new RegExp(`(${word})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
  });

  return highlightedText;
}

export function getEvidenceLevelColor(score: number): string {
  if (score >= 90) return '#10B981'; // Green - Excellent
  if (score >= 80) return '#3B82F6'; // Blue - Strong
  if (score >= 70) return '#F59E0B'; // Amber - Moderate
  return '#EF4444'; // Red - Limited
}

export function getEvidenceLevelLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Moderate';
  return 'Limited';
}