'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Settings, Eye, EyeOff, Grid3X3, BarChart3, Atom } from 'lucide-react';
import { useNeurotransmitterReference } from '../../../../../../hooks/use-sleep-neurobiology-data';
import {
  NeurotransmitterId,
  neurotransmitters,
  neurotransmitterScenarios,
  NeurotransmitterScenario
} from './data';
import {
  NeurotransmitterFilter,
  defaultFilter,
  applyNeurotransmitterFilters,
  highlightSearchTerms
} from './filters';
import { ChordMap } from './ChordMap';
import { TimelinePanel } from './TimelinePanel';
import { ReceptorGrid } from './ReceptorGrid';
import { SynapseScene } from './SynapseScene';

interface NeurotransmittersProps {
  className?: string;
}

type ViewMode = 'overview' | 'pathways' | 'timeline' | 'receptors' | 'synapse';

export function Neurotransmitters({ className = '' }: NeurotransmittersProps) {
  const neurotransmitterData = useNeurotransmitterReference();

  // State management
  const [filter, setFilter] = useState<NeurotransmitterFilter>(defaultFilter);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [highlightedNeurotransmitter, setHighlightedNeurotransmitter] = useState<NeurotransmitterId | null>(null);
  const [activeNucleus, setActiveNucleus] = useState<string | null>(null);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply filters
  const filteredData = useMemo(() => {
    return applyNeurotransmitterFilters(filter);
  }, [filter]);

  // Handle filter changes
  const handleNeurotransmitterSelect = useCallback((neurotransmitter: NeurotransmitterId | 'all') => {
    setFilter(prev => ({ ...prev, selectedNeurotransmitter: neurotransmitter }));
  }, []);

  const handleScenarioChange = useCallback((scenarioId: 'baseline' | 'ssri' | 'stimulant' | 'sedative') => {
    setFilter(prev => ({ ...prev, selectedScenario: scenarioId }));
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setFilter(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const handleStageHighlight = useCallback((stage: 'all' | 'wake' | 'nrem' | 'rem') => {
    setFilter(prev => ({ ...prev, highlightStage: stage }));
  }, []);

  // View management
  const viewModes = [
    { id: 'overview', label: 'Overview', icon: Grid3X3, description: 'Combined view with key visualizations' },
    { id: 'pathways', label: 'Pathways', icon: Atom, description: 'Neural pathway chord diagram' },
    { id: 'timeline', label: 'Timeline', icon: BarChart3, description: 'Concentration curves over time' },
    { id: 'receptors', label: 'Receptors', icon: Grid3X3, description: 'Receptor density and activity' },
    { id: 'synapse', label: '3D Synapse', icon: Eye, description: 'Interactive 3D visualization' }
  ] as const;

  const clearFilters = useCallback(() => {
    setFilter(defaultFilter);
    setHighlightedNeurotransmitter(null);
    setActiveNucleus(null);
  }, []);

  const hasActiveFilters = filter.selectedNeurotransmitter !== 'all' ||
    filter.selectedScenario !== 'baseline' ||
    filter.searchQuery.trim() !== '' ||
    filter.highlightStage !== 'all';

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
            <Atom size={32} className="text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-900">Neurotransmitter Atlas</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Interactive biochemical pathways and concentration dynamics across sleep-wake cycles,
            with pharmacological scenario modeling and receptor mapping.
          </p>
        </motion.div>
      </div>

      {/* Controls */}
      <motion.div
        className="max-w-6xl mx-auto mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search neurotransmitters, pathways, receptors..."
            value={filter.searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-500"
          />
        </div>

        {/* Primary Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Neurotransmitter Selector */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleNeurotransmitterSelect('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                filter.selectedNeurotransmitter === 'all'
                  ? 'bg-gray-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({neurotransmitters.length})
            </button>
            {neurotransmitters.map(nt => (
              <button
                key={nt.id}
                onClick={() => handleNeurotransmitterSelect(nt.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  filter.selectedNeurotransmitter === nt.id
                    ? 'text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filter.selectedNeurotransmitter === nt.id ? nt.color : undefined
                }}
              >
                {nt.abbreviation}
              </button>
            ))}
          </div>

          {/* Scenario Selector */}
          <div className="flex gap-2">
            {neurotransmitterScenarios.map(scenario => (
              <button
                key={scenario.id}
                onClick={() => handleScenarioChange(scenario.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  filter.selectedScenario === scenario.id
                    ? 'text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: filter.selectedScenario === scenario.id ? scenario.color : undefined
                }}
              >
                {scenario.name}
              </button>
            ))}
          </div>

          {/* Advanced Controls Toggle */}
          <button
            onClick={() => setShowAdvancedControls(!showAdvancedControls)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <Settings size={16} />
            <span className="text-sm">Advanced</span>
          </button>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Advanced Controls */}
        <AnimatePresence>
          {showAdvancedControls && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-50 rounded-lg p-4 mb-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sleep Stage Highlight */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Highlight Sleep Stage
                  </label>
                  <select
                    value={filter.highlightStage}
                    onChange={(e) => handleStageHighlight(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Stages</option>
                    <option value="wake">Wake</option>
                    <option value="nrem">NREM Sleep</option>
                    <option value="rem">REM Sleep</option>
                  </select>
                </div>

                {/* Receptor Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Options
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filter.showReceptors}
                      onChange={(e) => setFilter(prev => ({ ...prev, showReceptors: e.target.checked }))}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Show Receptor Details</span>
                  </label>
                </div>

                {/* Motion Settings */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accessibility
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={reducedMotion}
                      onChange={(e) => setReducedMotion(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Reduce Motion</span>
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View Mode Tabs */}
        <div className="flex flex-wrap gap-2">
          {viewModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                viewMode === mode.id
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <mode.icon size={16} />
              {mode.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div
        className="max-w-7xl mx-auto"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        {viewMode === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Chord Diagram */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Neural Pathways</h3>
              <ChordMap
                selectedNeurotransmitter={filter.selectedNeurotransmitter}
                width={400}
                height={400}
                onNeurotransmitterHover={setHighlightedNeurotransmitter}
                reducedMotion={reducedMotion}
              />
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Concentration Timeline</h3>
              <TimelinePanel
                timelineData={neurotransmitterData.baseline}
                selectedNeurotransmitter={filter.selectedNeurotransmitter}
                activeScenario={filteredData.activeScenario}
                highlightedNeurotransmitter={highlightedNeurotransmitter}
                width={500}
                height={300}
                onNeurotransmitterClick={handleNeurotransmitterSelect}
                reducedMotion={reducedMotion}
              />
            </div>

            {/* 3D Scene */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">3D Synaptic Visualization</h3>
                <SynapseScene
                  selectedNeurotransmitter={filter.selectedNeurotransmitter}
                  activeNucleus={activeNucleus}
                  onNucleusClick={setActiveNucleus}
                  reducedMotion={reducedMotion}
                />
              </div>
            </div>
          </div>
        )}

        {viewMode === 'pathways' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Neural Pathway Network</h3>
            <ChordMap
              selectedNeurotransmitter={filter.selectedNeurotransmitter}
              width={800}
              height={600}
              onNeurotransmitterHover={setHighlightedNeurotransmitter}
              reducedMotion={reducedMotion}
            />
          </div>
        )}

        {viewMode === 'timeline' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Concentration Timeline</h3>
            <TimelinePanel
              timelineData={neurotransmitterData.baseline}
              selectedNeurotransmitter={filter.selectedNeurotransmitter}
              activeScenario={filteredData.activeScenario}
              highlightedNeurotransmitter={highlightedNeurotransmitter}
              width={1000}
              height={500}
              onNeurotransmitterClick={handleNeurotransmitterSelect}
              showSleepStages={true}
              reducedMotion={reducedMotion}
            />
          </div>
        )}

        {viewMode === 'receptors' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Receptor Mapping</h3>
            <ReceptorGrid
              selectedNeurotransmitter={filter.selectedNeurotransmitter}
              reducedMotion={reducedMotion}
            />
          </div>
        )}

        {viewMode === 'synapse' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">3D Synaptic Environment</h3>
            <SynapseScene
              selectedNeurotransmitter={filter.selectedNeurotransmitter}
              activeNucleus={activeNucleus}
              onNucleusClick={setActiveNucleus}
              showParticles={true}
              reducedMotion={reducedMotion}
            />
          </div>
        )}
      </motion.div>

      {/* Information Panel */}
      <motion.div
        className="max-w-4xl mx-auto mt-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Atom size={20} className="text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Live Data Integration</h3>
          </div>

          <div className="text-sm text-gray-700 leading-relaxed space-y-2">
            <p>
              <strong>Active Scenario:</strong> {filteredData.activeScenario.description}
            </p>
            <p>
              <strong>Data Sources:</strong> Pulling from {neurotransmitterData.scenarios.length} pharmacological scenarios,
              {Object.keys(neurotransmitterData.receptorDensityPmPerMg).length} receptor types,
              and {neurotransmitterData.baseline.length} temporal data points.
            </p>
            <p>
              <strong>Visualization Fidelity:</strong> Concentration curves use human microdialysis data,
              receptor densities from autoradiography studies, and pathway strengths from electrophysiology.
            </p>
          </div>

          {/* Current scenario clinical notes */}
          {filteredData.activeScenario.clinicalNotes.length > 0 && (
            <div className="mt-4 p-4 bg-white bg-opacity-50 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Clinical Considerations:</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                {filteredData.activeScenario.clinicalNotes.map((note, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-purple-500 mr-2">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}