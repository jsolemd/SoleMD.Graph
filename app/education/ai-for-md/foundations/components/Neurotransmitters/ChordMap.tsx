'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Group } from '@visx/group';
import { Arc } from '@visx/shape';
import { scaleOrdinal } from '@visx/scale';
import { Chord, Ribbon } from '@visx/chord';
import { LinearGradient } from '@visx/gradient';
import { Tooltip, useTooltip, defaultStyles } from '@visx/tooltip';
import {
  NeurotransmitterId,
  brainNuclei,
  neurotransmitterPathways,
  getNeurotransmitterColor,
  getNeurotransmitterInfo
} from './data';

interface ChordMapProps {
  selectedNeurotransmitter?: NeurotransmitterId | 'all';
  highlightedPathways?: string[];
  width: number;
  height: number;
  onNeurotransmitterHover?: (id: NeurotransmitterId | null) => void;
  onPathwayClick?: (source: string, target: string, neurotransmitter: NeurotransmitterId) => void;
  reducedMotion?: boolean;
}

interface ChordNode {
  id: string;
  label: string;
  type: 'nucleus' | 'target';
  neurotransmitters: NeurotransmitterId[];
  role?: 'wake_promoting' | 'sleep_promoting' | 'modulatory';
}

export function ChordMap({
  selectedNeurotransmitter = 'all',
  highlightedPathways = [],
  width,
  height,
  onNeurotransmitterHover,
  onPathwayClick,
  reducedMotion = false
}: ChordMapProps) {
  const [hoveredRibbon, setHoveredRibbon] = useState<string | null>(null);
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip();

  // Create nodes and matrix for chord diagram
  const { nodes, matrix, colorScale } = useMemo(() => {
    // Create nodes from brain nuclei and common targets
    const nucleiNodes: ChordNode[] = brainNuclei.map(nucleus => ({
      id: nucleus.id,
      label: nucleus.name,
      type: 'nucleus' as const,
      neurotransmitters: nucleus.primaryNeurotransmitters,
      role: nucleus.role
    }));

    const targetNodes: ChordNode[] = [
      {
        id: 'cortex',
        label: 'Cortex',
        type: 'target' as const,
        neurotransmitters: []
      },
      {
        id: 'thalamus',
        label: 'Thalamus',
        type: 'target' as const,
        neurotransmitters: []
      }
    ];

    const allNodes = [...nucleiNodes, ...targetNodes];

    // Filter pathways based on selection
    const filteredPathways = neurotransmitterPathways.filter(pathway => {
      if (selectedNeurotransmitter === 'all') return true;
      return pathway.neurotransmitter === selectedNeurotransmitter;
    });

    // Create adjacency matrix
    const nodeCount = allNodes.length;
    const matrix = Array(nodeCount).fill(0).map(() => Array(nodeCount).fill(0));

    filteredPathways.forEach(pathway => {
      const sourceIndex = allNodes.findIndex(node => node.id === pathway.source);
      const targetIndex = allNodes.findIndex(node => node.id === pathway.target);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Use pathway strength for thickness
        matrix[sourceIndex][targetIndex] = pathway.strength * 10; // Scale for visibility
      }
    });

    // Create color scale
    const colors = allNodes.map(node => {
      if (node.type === 'nucleus' && node.neurotransmitters.length > 0) {
        return getNeurotransmitterColor(node.neurotransmitters[0]);
      }
      if (node.role === 'wake_promoting') return '#EF4444';
      if (node.role === 'sleep_promoting') return '#3B82F6';
      return '#6B7280';
    });

    const colorScale = scaleOrdinal({
      domain: allNodes.map((_, i) => i),
      range: colors
    });

    return { nodes: allNodes, matrix, colorScale };
  }, [selectedNeurotransmitter]);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 80;

  const handleRibbonMouseEnter = (ribbon: any, event: React.MouseEvent) => {
    const sourceNode = nodes[ribbon.source.index];
    const targetNode = nodes[ribbon.target.index];
    const pathway = neurotransmitterPathways.find(
      p => p.source === sourceNode.id && p.target === targetNode.id
    );

    if (pathway) {
      const neurotransmitterInfo = getNeurotransmitterInfo(pathway.neurotransmitter);
      setHoveredRibbon(`${sourceNode.id}-${targetNode.id}`);

      showTooltip({
        tooltipLeft: event.clientX,
        tooltipTop: event.clientY,
        tooltipData: {
          pathway,
          sourceNode,
          targetNode,
          neurotransmitterInfo
        }
      });

      onNeurotransmitterHover?.(pathway.neurotransmitter);
    }
  };

  const handleRibbonMouseLeave = () => {
    setHoveredRibbon(null);
    hideTooltip();
    onNeurotransmitterHover?.(null);
  };

  const handleRibbonClick = (ribbon: any) => {
    const sourceNode = nodes[ribbon.source.index];
    const targetNode = nodes[ribbon.target.index];
    const pathway = neurotransmitterPathways.find(
      p => p.source === sourceNode.id && p.target === targetNode.id
    );

    if (pathway && onPathwayClick) {
      onPathwayClick(sourceNode.id, targetNode.id, pathway.neurotransmitter);
    }
  };

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <LinearGradient id="chord-gradient" from="#3B82F6" to="#1D4ED8" />

        <Group top={centerY} left={centerX}>
          <Chord
            matrix={matrix}
            padAngle={0.05}
            sortGroups={(a, b) => b.value - a.value}
          >
            {({ chords }) => (
              <g>
                {/* Render arcs (nodes) */}
                {chords.groups.map((group, i) => {
                  const node = nodes[i];
                  const isHighlighted = hoveredRibbon?.includes(node.id);

                  return (
                    <motion.g
                      key={`arc-${i}`}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: 1,
                        scale: isHighlighted ? 1.1 : 1
                      }}
                      transition={{
                        duration: reducedMotion ? 0.1 : 0.3,
                        ease: 'easeOut'
                      }}
                    >
                      <Arc
                        data={group}
                        innerRadius={radius - 30}
                        outerRadius={radius - 10}
                        fill={colorScale(i)}
                        stroke={isHighlighted ? '#000' : '#fff'}
                        strokeWidth={isHighlighted ? 2 : 1}
                        opacity={isHighlighted ? 1 : 0.8}
                      />

                      {/* Node labels */}
                      <text
                        dy="0.35em"
                        fontSize={12}
                        fontWeight="600"
                        fill="#374151"
                        textAnchor="middle"
                        transform={`
                          rotate(${((group.startAngle + group.endAngle) / 2) * (180 / Math.PI) - 90})
                          translate(${radius + 20}, 0)
                          ${((group.startAngle + group.endAngle) / 2) > Math.PI ? 'rotate(180)' : ''}
                        `}
                      >
                        {node.label}
                      </text>
                    </motion.g>
                  );
                })}

                {/* Render ribbons (connections) */}
                {chords.map((chord, i) => {
                  const sourceNode = nodes[chord.source.index];
                  const targetNode = nodes[chord.target.index];
                  const pathway = neurotransmitterPathways.find(
                    p => p.source === sourceNode.id && p.target === targetNode.id
                  );

                  if (!pathway) return null;

                  const ribbonId = `${sourceNode.id}-${targetNode.id}`;
                  const isHovered = hoveredRibbon === ribbonId;
                  const isHighlighted = highlightedPathways.includes(ribbonId);

                  return (
                    <motion.g
                      key={`ribbon-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: isHovered || isHighlighted ? 0.8 : 0.4
                      }}
                      transition={{
                        duration: reducedMotion ? 0.1 : 0.2
                      }}
                    >
                      <Ribbon
                        chord={chord}
                        radius={radius - 30}
                        fill={getNeurotransmitterColor(pathway.neurotransmitter)}
                        stroke={pathway.effect === 'inhibitory' ? '#DC2626' : '#059669'}
                        strokeWidth={isHovered ? 3 : 1}
                        strokeDasharray={pathway.effect === 'inhibitory' ? '4,2' : 'none'}
                        onMouseEnter={(event) => handleRibbonMouseEnter(chord, event)}
                        onMouseLeave={handleRibbonMouseLeave}
                        onClick={() => handleRibbonClick(chord)}
                        style={{ cursor: 'pointer' }}
                      />
                    </motion.g>
                  );
                })}
              </g>
            )}
          </Chord>
        </Group>

        {/* Legend */}
        <g transform={`translate(20, ${height - 80})`}>
          <text fontSize={12} fontWeight="600" fill="#374151" y={0}>
            Connection Types:
          </text>
          <g transform="translate(0, 20)">
            <line x1={0} y1={0} x2={20} y2={0} stroke="#059669" strokeWidth={2} />
            <text x={25} y={4} fontSize={10} fill="#6B7280">
              Excitatory
            </text>
          </g>
          <g transform="translate(0, 35)">
            <line
              x1={0}
              y1={0}
              x2={20}
              y2={0}
              stroke="#DC2626"
              strokeWidth={2}
              strokeDasharray="4,2"
            />
            <text x={25} y={4} fontSize={10} fill="#6B7280">
              Inhibitory
            </text>
          </g>
        </g>
      </svg>

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
            maxWidth: '300px'
          }}
        >
          <div className="space-y-2">
            <div className="font-semibold text-gray-900">
              {tooltipData.sourceNode.label} → {tooltipData.targetNode.label}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{
                  backgroundColor: getNeurotransmitterColor(
                    tooltipData.pathway.neurotransmitter
                  )
                }}
              />
              <span className="text-sm text-gray-700">
                {tooltipData.neurotransmitterInfo?.name}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              <span
                className={`font-medium ${
                  tooltipData.pathway.effect === 'excitatory'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {tooltipData.pathway.effect === 'excitatory' ? 'Excitatory' : 'Inhibitory'}
              </span>
              {' · '}
              <span>Strength: {Math.round(tooltipData.pathway.strength * 100)}%</span>
            </div>
            <div className="text-xs text-gray-500 border-t pt-2">
              {tooltipData.pathway.description}
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}