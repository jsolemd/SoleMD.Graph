'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Download, X, BookOpen, Database } from 'lucide-react';
import { useSleepNeurobiologyData } from '../../../../../../hooks/use-sleep-neurobiology-data';
import { clinicalPearlsData, pearlCategories } from './data';
import { filterPearls, FilterCategory, FilterState, defaultFilterState } from './filters';
import { PearlCarousel } from './PearlCarousel';

interface ClinicalPearlsProps {
  className?: string;
}

export function ClinicalPearls({ className = '' }: ClinicalPearlsProps) {
  const sleepData = useSleepNeurobiologyData();
  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [bookmarkedPearls, setBookmarkedPearls] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Load bookmarks from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('clinical-pearls-bookmarks');
    if (saved) {
      try {
        setBookmarkedPearls(new Set(JSON.parse(saved)));
      } catch (error) {
        console.warn('Failed to load bookmarks:', error);
      }
    }
  }, []);

  // Save bookmarks to localStorage
  const saveBookmarks = useCallback((bookmarks: Set<string>) => {
    try {
      localStorage.setItem('clinical-pearls-bookmarks', JSON.stringify([...bookmarks]));
    } catch (error) {
      console.warn('Failed to save bookmarks:', error);
    }
  }, []);

  // Filter pearls based on current state
  const filteredResults = useMemo(() => {
    return filterPearls(clinicalPearlsData, filters);
  }, [filters]);

  // Handle filter changes
  const handleCategoryChange = useCallback((category: FilterCategory) => {
    setFilters(prev => ({ ...prev, category }));
  }, []);

  const handleSearchChange = useCallback((searchQuery: string) => {
    setFilters(prev => ({ ...prev, searchQuery }));
  }, []);

  const handleEvidenceLevelChange = useCallback((evidenceLevel: number) => {
    setFilters(prev => ({ ...prev, evidenceLevel }));
  }, []);

  // Handle bookmarking
  const handleBookmark = useCallback((pearlId: string) => {
    setBookmarkedPearls(prev => {
      const newBookmarks = new Set(prev);
      if (newBookmarks.has(pearlId)) {
        newBookmarks.delete(pearlId);
      } else {
        newBookmarks.add(pearlId);
      }
      saveBookmarks(newBookmarks);
      return newBookmarks;
    });
  }, [saveBookmarks]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters(defaultFilterState);
  }, []);

  // Export bookmarked pearls (placeholder)
  const exportBookmarks = useCallback(() => {
    const bookmarked = clinicalPearlsData.filter(pearl => bookmarkedPearls.has(pearl.id));
    const exportData = {
      exportDate: new Date().toISOString(),
      pearls: bookmarked.map(pearl => ({
        title: pearl.title,
        category: pearl.category,
        summary: pearl.summary,
        explanation: pearl.backContent.explanation,
        evidenceLevel: pearl.backContent.evidenceLevel,
        interventions: pearl.backContent.interventions,
        outcomes: pearl.backContent.outcomes
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-pearls-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bookmarkedPearls]);

  const hasActiveFilters = filters.category !== 'all' || filters.searchQuery.trim() !== '' || filters.evidenceLevel > 0;

  return (
    <div className={`w-full ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <BookOpen size={32} className="text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Clinical Pearls</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Evidence-based insights for sleep medicine practice, backed by peer-reviewed research
            and integrated with neurobiology data.
          </p>
        </motion.div>
      </div>

      {/* Search and Filters */}
      <motion.div
        className="max-w-4xl mx-auto mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {/* Search Bar */}
        <div className="relative mb-4">
          <div
            className={`relative transition-all duration-200 ${
              searchFocused ? 'transform scale-105' : ''
            }`}
          >
            <Search
              size={20}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search clinical pearls..."
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
            />
            {filters.searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Category Chips */}
          <div className="flex flex-wrap gap-2">
            {pearlCategories.map((category) => (
              <motion.button
                key={category.id}
                onClick={() => handleCategoryChange(category.id as FilterCategory)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  filters.category === category.id
                    ? 'text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filters.category === category.id ? category.color : undefined
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {category.label}
                {category.id !== 'all' && (
                  <span className="ml-2 text-xs opacity-75">
                    {filteredResults.categoryCount[category.id as FilterCategory]}
                  </span>
                )}
              </motion.button>
            ))}
          </div>

          {/* Additional Filters Toggle */}
          <motion.button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Filter size={16} />
            Filters
          </motion.button>

          {/* Export Bookmarks */}
          {bookmarkedPearls.size > 0 && (
            <motion.button
              onClick={exportBookmarks}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Download size={16} />
              Export ({bookmarkedPearls.size})
            </motion.button>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <motion.button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Clear all
            </motion.button>
          )}
        </div>

        {/* Expanded Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 rounded-lg p-4 mb-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Evidence Level Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimum Evidence Level
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={filters.evidenceLevel}
                    onChange={(e) => handleEvidenceLevelChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Any ({filters.evidenceLevel}+)</span>
                    <span>Excellent (90+)</span>
                  </div>
                </div>

                {/* Results Summary */}
                <div className="flex items-center">
                  <div className="text-sm text-gray-600">
                    <div className="font-medium">
                      {filteredResults.totalCount} pearl{filteredResults.totalCount !== 1 ? 's' : ''} found
                    </div>
                    <div>
                      {bookmarkedPearls.size} bookmarked
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Carousel */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <PearlCarousel
          pearls={filteredResults.pearls}
          searchQuery={filters.searchQuery}
          onBookmark={handleBookmark}
          bookmarkedPearls={bookmarkedPearls}
          className="min-h-[500px]"
        />
      </motion.div>

      {/* Data Integration Status */}
      <motion.div
        className="text-center mt-12 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Database size={20} className="text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Live Data Integration</h3>
          </div>
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-2">
              <strong>Active Data Sources:</strong> These clinical pearls are dynamically linked to the sleep neurobiology reference dataset,
              pulling real-time metrics from {Object.keys(sleepData.processScenarios).length} process scenarios,
              {sleepData.neurotransmitters.scenarios.length} neurotransmitter profiles,
              and {sleepData.glymphatic.presets.length} glymphatic function presets.
            </p>
            <p>
              <strong>Visualization Consistency:</strong> Sparklines and micro-charts use the same quantitative bounds
              as the main sleep neurobiology modules, ensuring educational coherence across the platform.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              Process Models Active
            </span>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              Neurotransmitter Data Linked
            </span>
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
              Glymphatic Metrics Connected
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}