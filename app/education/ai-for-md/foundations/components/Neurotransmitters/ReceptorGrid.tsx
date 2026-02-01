'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LinePath, Bar } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { curveMonotoneX } from '@visx/curve';
import { Tooltip, useTooltip, defaultStyles } from '@visx/tooltip';
import {
  NeurotransmitterId,
  ReceptorData,
  receptorData,
  getNeurotransmitterColor,
  getNeurotransmitterInfo
} from './data';

interface ReceptorGridProps {
  selectedNeurotransmitter?: NeurotransmitterId | 'all';
  highlightedReceptor?: string | null;
  onReceptorClick?: (receptorId: string) => void;
  className?: string;
  reducedMotion?: boolean;
}

interface ReceptorCardProps {
  receptor: ReceptorData;
  isHighlighted: boolean;
  onClick: () => void;
  reducedMotion: boolean;
}

function generateSparklineData(receptor: ReceptorData): number[] {
  // Generate synthetic activity data based on receptor properties
  const baseActivity = receptor.densityPmPerMg;
  const variation = receptor.effect === 'excitatory' ? 0.3 : 0.2;

  return Array.from({ length: 24 }, (_, hour) => {
    // Simulate circadian variation
    let activity = baseActivity;

    // Different patterns for different neurotransmitter systems
    if (receptor.neurotransmitter === 'norepinephrine') {
      // Higher during wake hours
      activity *= hour >= 7 && hour < 23 ? 1.0 + 0.3 * Math.sin((hour - 7) * Math.PI / 16) : 0.3;
    } else if (receptor.neurotransmitter === 'acetylcholine') {
      // Peaks during REM (simplified to specific hours)
      const remHours = [1.5, 3.5, 6.5];
      const isRem = remHours.some(remHour => Math.abs(hour - remHour) < 0.5);
      activity *= isRem ? 1.8 : 0.7;
    } else if (receptor.neurotransmitter === 'serotonin') {
      // High during wake, low during sleep
      activity *= hour >= 7 && hour < 23 ? 1.0 : 0.3;
    } else if (receptor.neurotransmitter === 'histamine') {
      // Strong wake promotion
      activity *= hour >= 7 && hour < 23 ? 1.2 : 0.1;
    } else if (receptor.neurotransmitter === 'gaba') {
      // Higher during sleep
      activity *= hour < 7 || hour >= 23 ? 1.4 : 0.6;
    }

    // Add some noise
    activity *= 1 + (Math.random() - 0.5) * variation;

    return Math.max(0, activity);
  });
}

function ReceptorCard({ receptor, isHighlighted, onClick, reducedMotion }: ReceptorCardProps) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip();

  const sparklineData = useMemo(() => generateSparklineData(receptor), [receptor]);
  const neurotransmitterInfo = getNeurotransmitterInfo(receptor.neurotransmitter);

  const sparklineWidth = 80;
  const sparklineHeight = 30;

  const xScale = scaleLinear({
    domain: [0, sparklineData.length - 1],
    range: [0, sparklineWidth]
  });

  const yScale = scaleLinear({
    domain: [Math.min(...sparklineData), Math.max(...sparklineData)],
    range: [sparklineHeight, 0]
  });

  const sparklinePoints = sparklineData.map((value, index) => ({
    x: xScale(index) ?? 0,
    y: yScale(value) ?? 0
  }));

  const handleMouseEnter = (event: React.MouseEvent) => {
    showTooltip({
      tooltipLeft: event.clientX,
      tooltipTop: event.clientY,
      tooltipData: {
        receptor,
        neurotransmitterInfo,
        peakActivity: Math.max(...sparklineData),
        avgActivity: sparklineData.reduce((a, b) => a + b, 0) / sparklineData.length
      }
    });
  };

  return (
    <>
      <motion.div
        className={`
          bg-white rounded-lg border-2 p-4 cursor-pointer transition-all duration-200
          ${isHighlighted
            ? 'border-blue-500 shadow-lg scale-105'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
          }
        `}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={hideTooltip}
        whileHover={!reducedMotion ? { scale: 1.02 } : undefined}
        whileTap={!reducedMotion ? { scale: 0.98 } : undefined}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reducedMotion ? 0.1 : 0.3,
          ease: 'easeOut'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getNeurotransmitterColor(receptor.neurotransmitter) }}
            />
            <h3 className="font-semibold text-sm text-gray-900">
              {receptor.name}
            </h3>
          </div>
          <div className={`
            px-2 py-1 rounded text-xs font-medium
            ${receptor.effect === 'excitatory'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
            }
          `}>
            {receptor.effect === 'excitatory' ? 'Exc' : 'Inh'}
          </div>
        </div>

        {/* Sparkline */}
        <div className="mb-3">
          <svg width={sparklineWidth} height={sparklineHeight}>
            <LinePath
              data={sparklinePoints}
              x={d => d.x}
              y={d => d.y}
              stroke={getNeurotransmitterColor(receptor.neurotransmitter)}
              strokeWidth={1.5}
              curve={curveMonotoneX}
              opacity={0.8}
            />
            {/* Peak indicators */}
            {sparklinePoints.map((point, index) => {
              const value = sparklineData[index];
              const isPeak = value === Math.max(...sparklineData);
              return isPeak ? (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={2}
                  fill={getNeurotransmitterColor(receptor.neurotransmitter)}
                  stroke="white"
                  strokeWidth={1}
                />
              ) : null;
            })}
          </svg>
        </div>

        {/* Stats */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Density:</span>
            <span className="font-medium text-gray-700">
              {receptor.densityPmPerMg.toFixed(1)} pmol/mg
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Distribution:</span>
            <span className="font-medium text-gray-700 capitalize">
              {receptor.distribution}
            </span>
          </div>
        </div>

        {/* Neurotransmitter indicator */}
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            {neurotransmitterInfo?.abbreviation}
          </div>
        </div>
      </motion.div>

      {/* Tooltip */}
      {tooltipOpen && tooltipData && (
        <Tooltip
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '280px'
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  backgroundColor: getNeurotransmitterColor(tooltipData.receptor.neurotransmitter)
                }}
              />
              <span className="font-semibold text-gray-900">
                {tooltipData.receptor.name}
              </span>
            </div>

            <div className="text-sm text-gray-600 space-y-1">
              <div>
                <strong>Neurotransmitter:</strong> {tooltipData.neurotransmitterInfo?.name}
              </div>
              <div>
                <strong>Effect:</strong> {tooltipData.receptor.effect}
              </div>
              <div>
                <strong>Distribution:</strong> {tooltipData.receptor.distribution}
              </div>
            </div>

            <div className="text-sm text-gray-600 space-y-1 border-t pt-2">
              <div>
                <strong>Peak Activity:</strong> {tooltipData.peakActivity.toFixed(2)} pmol/mg
              </div>
              <div>
                <strong>Avg Activity:</strong> {tooltipData.avgActivity.toFixed(2)} pmol/mg
              </div>
            </div>

            <div className="text-xs text-gray-500 border-t pt-2">
              Activity pattern based on circadian neurotransmitter release
            </div>
          </div>
        </Tooltip>
      )}
    </>
  );
}

export function ReceptorGrid({
  selectedNeurotransmitter = 'all',
  highlightedReceptor,
  onReceptorClick,
  className = '',
  reducedMotion = false
}: ReceptorGridProps) {
  // Filter receptors based on selection
  const filteredReceptors = useMemo(() => {
    if (selectedNeurotransmitter === 'all') {
      return receptorData;
    }
    return receptorData.filter(receptor => receptor.neurotransmitter === selectedNeurotransmitter);
  }, [selectedNeurotransmitter]);

  // Group receptors by neurotransmitter for better organization
  const groupedReceptors = useMemo(() => {
    const groups: Record<string, ReceptorData[]> = {};
    filteredReceptors.forEach(receptor => {
      const nt = receptor.neurotransmitter;
      if (!groups[nt]) groups[nt] = [];
      groups[nt].push(receptor);
    });
    return groups;
  }, [filteredReceptors]);

  if (filteredReceptors.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 text-gray-500 ${className}`}>
        <div className="text-center">
          <div className="text-lg font-medium mb-2">No receptors found</div>
          <div className="text-sm">Try selecting a different neurotransmitter</div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {selectedNeurotransmitter === 'all' ? (
        // Grouped view
        <div className="space-y-6">
          {Object.entries(groupedReceptors).map(([neurotransmitterId, receptors]) => {
            const neurotransmitterInfo = getNeurotransmitterInfo(neurotransmitterId as NeurotransmitterId);
            return (
              <div key={neurotransmitterId}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: getNeurotransmitterColor(neurotransmitterId as NeurotransmitterId) }}
                  />
                  <h3 className="text-lg font-semibold text-gray-900">
                    {neurotransmitterInfo?.name} Receptors
                  </h3>
                  <span className="text-sm text-gray-500">
                    ({receptors.length} receptor{receptors.length !== 1 ? 's' : ''})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {receptors.map(receptor => (
                    <ReceptorCard
                      key={receptor.id}
                      receptor={receptor}
                      isHighlighted={highlightedReceptor === receptor.id}
                      onClick={() => onReceptorClick?.(receptor.id)}
                      reducedMotion={reducedMotion}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Single neurotransmitter view
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: getNeurotransmitterColor(selectedNeurotransmitter) }}
            />
            <h3 className="text-xl font-semibold text-gray-900">
              {getNeurotransmitterInfo(selectedNeurotransmitter)?.name} Receptors
            </h3>
            <span className="text-sm text-gray-500">
              ({filteredReceptors.length} receptor{filteredReceptors.length !== 1 ? 's' : ''})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredReceptors.map(receptor => (
              <ReceptorCard
                key={receptor.id}
                receptor={receptor}
                isHighlighted={highlightedReceptor === receptor.id}
                onClick={() => onReceptorClick?.(receptor.id)}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Receptor Summary</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Total Receptors</div>
            <div className="text-xl font-semibold text-gray-900">
              {filteredReceptors.length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Excitatory</div>
            <div className="text-xl font-semibold text-green-600">
              {filteredReceptors.filter(r => r.effect === 'excitatory').length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Inhibitory</div>
            <div className="text-xl font-semibold text-red-600">
              {filteredReceptors.filter(r => r.effect === 'inhibitory').length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Avg Density</div>
            <div className="text-xl font-semibold text-gray-900">
              {(filteredReceptors.reduce((sum, r) => sum + r.densityPmPerMg, 0) / filteredReceptors.length).toFixed(1)}
              <span className="text-sm text-gray-500 ml-1">pmol/mg</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}