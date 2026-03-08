// @ts-nocheck
'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LinePath, Bar, AreaClosed } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows, GridColumns } from '@visx/grid';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinearGradient } from '@visx/gradient';
import { curveMonotoneX } from '@visx/curve';
import { Tooltip, useTooltip, defaultStyles } from '@visx/tooltip';
import { NeurotransmitterTimelinePoint } from '../../../../../../lib/sleep-neurobiology/types';
import {
  NeurotransmitterId,
  neurotransmitters,
  getNeurotransmitterColor,
  getNeurotransmitterInfo,
  applyScenarioAdjustments,
  NeurotransmitterScenario
} from './data';
import {
  getConcentrationAtHour,
  getSleepStageAtHour,
  getTimeLabel,
  formatConcentrationValue
} from './filters';

interface TimelinePanelProps {
  timelineData: NeurotransmitterTimelinePoint[];
  selectedNeurotransmitter?: NeurotransmitterId | 'all';
  activeScenario: NeurotransmitterScenario;
  highlightedNeurotransmitter?: NeurotransmitterId | null;
  width: number;
  height: number;
  onNeurotransmitterClick?: (id: NeurotransmitterId) => void;
  showSleepStages?: boolean;
  reducedMotion?: boolean;
}

interface ConcentrationPoint {
  hour: number;
  time: Date;
  stage: 'wake' | 'nrem' | 'rem';
  concentrations: Record<NeurotransmitterId, number>;
}

export function TimelinePanel({
  timelineData,
  selectedNeurotransmitter = 'all',
  activeScenario,
  highlightedNeurotransmitter,
  width,
  height,
  onNeurotransmitterClick,
  showSleepStages = true,
  reducedMotion = false
}: TimelinePanelProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    neurotransmitter: NeurotransmitterId;
    point: ConcentrationPoint;
  } | null>(null);

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip
  } = useTooltip();

  // Apply scenario adjustments to timeline data
  const adjustedData = useMemo(() => {
    return applyScenarioAdjustments(timelineData, activeScenario);
  }, [timelineData, activeScenario]);

  // Transform data for visualization
  const chartData = useMemo(() => {
    return adjustedData.map((point, index) => ({
      hour: point.hour,
      time: new Date(2024, 0, 1, Math.floor(point.hour), (point.hour % 1) * 60),
      stage: getSleepStageAtHour(point.hour),
      concentrations: {
        norepinephrine: point.norepinephrinePercentOfWake,
        acetylcholine: point.acetylcholinePercentOfWake,
        serotonin: point.serotoninPercentOfWake,
        dopamine: point.dopaminePercentOfWake,
        histamine: point.histaminePercentOfWake,
        gaba: point.stage === 'nrem' ? 150 : 80, // Approximate GABA levels
        orexin: point.stage === 'wake' ? 100 : 20 // Approximate orexin levels
      } as Record<NeurotransmitterId, number>
    }));
  }, [adjustedData]);

  // Filter neurotransmitters to display
  const displayedNeurotransmitters = useMemo(() => {
    if (selectedNeurotransmitter !== 'all') {
      return [selectedNeurotransmitter];
    }
    return neurotransmitters.map(nt => nt.id);
  }, [selectedNeurotransmitter]);

  // Scales
  const margin = { top: 20, right: 80, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const timeScale = scaleTime({
    domain: [chartData[0]?.time, chartData[chartData.length - 1]?.time],
    range: [0, innerWidth]
  });

  const concentrationScale = scaleLinear({
    domain: [0, 250], // Max concentration range
    range: [innerHeight, 0]
  });

  // Sleep stage background areas
  const sleepStageAreas = useMemo(() => {
    const areas: Array<{ start: number; end: number; stage: string; color: string }> = [];
    let currentStage = chartData[0]?.stage;
    let stageStart = 0;

    chartData.forEach((point, index) => {
      if (point.stage !== currentStage || index === chartData.length - 1) {
        const stageEnd = timeScale(point.time);
        const color = currentStage === 'rem' ? '#FEF3C7' : currentStage === 'nrem' ? '#DBEAFE' : '#F3F4F6';

        areas.push({
          start: stageStart,
          end: stageEnd,
          stage: currentStage || 'wake',
          color
        });

        currentStage = point.stage;
        stageStart = stageEnd;
      }
    });

    return areas;
  }, [chartData, timeScale]);

  const handlePointHover = (
    neurotransmitter: NeurotransmitterId,
    point: ConcentrationPoint,
    event: React.MouseEvent
  ) => {
    setHoveredPoint({ neurotransmitter, point });
    const neurotransmitterInfo = getNeurotransmitterInfo(neurotransmitter);

    showTooltip({
      tooltipLeft: event.clientX,
      tooltipTop: event.clientY,
      tooltipData: {
        neurotransmitter,
        neurotransmitterInfo,
        point,
        concentration: point.concentrations[neurotransmitter]
      }
    });
  };

  const handlePointLeave = () => {
    setHoveredPoint(null);
    hideTooltip();
  };

  return (
    <div className="relative">
      <svg width={width} height={height}>
        {/* Gradients for neurotransmitters */}
        {displayedNeurotransmitters.map(ntId => {
          const color = getNeurotransmitterColor(ntId);
          return (
            <LinearGradient
              key={`gradient-${ntId}`}
              id={`timeline-gradient-${ntId}`}
              from={color}
              to={color}
              fromOpacity={0.3}
              toOpacity={0.05}
            />
          );
        })}

        <Group left={margin.left} top={margin.top}>
          {/* Sleep stage backgrounds */}
          {showSleepStages && sleepStageAreas.map((area, index) => (
            <Bar
              key={`stage-${index}`}
              x={area.start}
              y={0}
              width={area.end - area.start}
              height={innerHeight}
              fill={area.color}
              opacity={0.3}
            />
          ))}

          {/* Grid */}
          <GridRows
            scale={concentrationScale}
            width={innerWidth}
            height={innerHeight}
            stroke="#E5E7EB"
            strokeOpacity={0.5}
          />
          <GridColumns
            scale={timeScale}
            width={innerWidth}
            height={innerHeight}
            stroke="#E5E7EB"
            strokeOpacity={0.5}
            numTicks={12}
          />

          {/* Concentration curves */}
          <AnimatePresence>
            {displayedNeurotransmitters.map(ntId => {
              const neurotransmitterInfo = getNeurotransmitterInfo(ntId);
              const isHighlighted = highlightedNeurotransmitter === ntId;
              const isSelected = selectedNeurotransmitter === ntId;
              const opacity = selectedNeurotransmitter === 'all'
                ? (isHighlighted ? 1 : 0.7)
                : (isSelected ? 1 : 0.3);

              const lineData = chartData.map(d => ({
                x: timeScale(d.time) ?? 0,
                y: concentrationScale(d.concentrations[ntId]) ?? 0,
                data: d
              }));

              return (
                <motion.g
                  key={ntId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{
                    duration: reducedMotion ? 0.1 : 0.6,
                    ease: 'easeOut'
                  }}
                >
                  {/* Area under curve */}
                  <AreaClosed
                    data={lineData}
                    x={d => d.x}
                    y={d => d.y}
                    yScale={concentrationScale}
                    fill={`url(#timeline-gradient-${ntId})`}
                    curve={curveMonotoneX}
                  />

                  {/* Concentration line */}
                  <LinePath
                    data={lineData}
                    x={d => d.x}
                    y={d => d.y}
                    stroke={getNeurotransmitterColor(ntId)}
                    strokeWidth={isHighlighted ? 3 : 2}
                    curve={curveMonotoneX}
                    opacity={opacity}
                  />

                  {/* Data points */}
                  {lineData.map((point, index) => (
                    <circle
                      key={`${ntId}-point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r={isHighlighted ? 4 : 3}
                      fill={getNeurotransmitterColor(ntId)}
                      stroke="white"
                      strokeWidth={1}
                      opacity={opacity}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => handlePointHover(ntId, point.data, e)}
                      onMouseLeave={handlePointLeave}
                      onClick={() => onNeurotransmitterClick?.(ntId)}
                    />
                  ))}
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={timeScale}
            numTicks={12}
            stroke="#6B7280"
            tickStroke="#6B7280"
            tickLabelProps={{
              fill: '#6B7280',
              fontSize: 11,
              textAnchor: 'middle'
            }}
          />

          <AxisLeft
            scale={concentrationScale}
            stroke="#6B7280"
            tickStroke="#6B7280"
            tickLabelProps={{
              fill: '#6B7280',
              fontSize: 11,
              textAnchor: 'end',
              dx: -4
            }}
            tickFormat={value => `${value}%`}
          />
        </Group>

        {/* Axis labels */}
        <text
          x={width / 2}
          y={height - 20}
          textAnchor="middle"
          fontSize={12}
          fill="#374151"
          fontWeight="500"
        >
          Time of Day
        </text>

        <text
          x={20}
          y={height / 2}
          textAnchor="middle"
          fontSize={12}
          fill="#374151"
          fontWeight="500"
          transform={`rotate(-90, 20, ${height / 2})`}
        >
          Concentration (% of Wake)
        </text>

        {/* Legend */}
        <g transform={`translate(${width - margin.right + 10}, ${margin.top})`}>
          {selectedNeurotransmitter === 'all' && (
            <>
              <text fontSize={12} fontWeight="600" fill="#374151" y={0}>
                Neurotransmitters:
              </text>
              {displayedNeurotransmitters.slice(0, 6).map((ntId, index) => {
                const info = getNeurotransmitterInfo(ntId);
                const isHighlighted = highlightedNeurotransmitter === ntId;

                return (
                  <g
                    key={ntId}
                    transform={`translate(0, ${20 + index * 20})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNeurotransmitterClick?.(ntId)}
                  >
                    <circle
                      r={4}
                      fill={getNeurotransmitterColor(ntId)}
                      opacity={isHighlighted ? 1 : 0.7}
                    />
                    <text
                      x={10}
                      y={4}
                      fontSize={10}
                      fill="#374151"
                      fontWeight={isHighlighted ? '600' : '400'}
                    >
                      {info?.abbreviation}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </g>

        {/* Sleep stage legend */}
        {showSleepStages && (
          <g transform={`translate(${margin.left}, ${height - 40})`}>
            <text fontSize={10} fontWeight="600" fill="#6B7280" y={0}>
              Sleep Stages:
            </text>
            <g transform="translate(0, 15)">
              <rect width={15} height={8} fill="#F3F4F6" opacity={0.6} />
              <text x={20} y={6} fontSize={9} fill="#6B7280">Wake</text>

              <rect x={60} width={15} height={8} fill="#DBEAFE" opacity={0.6} />
              <text x={80} y={6} fontSize={9} fill="#6B7280">NREM</text>

              <rect x={120} width={15} height={8} fill="#FEF3C7" opacity={0.6} />
              <text x={140} y={6} fontSize={9} fill="#6B7280">REM</text>
            </g>
          </g>
        )}
      </svg>

      {/* Scenario indicator */}
      <div className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: activeScenario.color }}
          />
          <span className="text-sm font-medium text-gray-700">
            {activeScenario.name}
          </span>
        </div>
      </div>

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
            maxWidth: '250px'
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{
                  backgroundColor: getNeurotransmitterColor(tooltipData.neurotransmitter)
                }}
              />
              <span className="font-semibold text-gray-900">
                {tooltipData.neurotransmitterInfo?.name}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              <div>Time: {getTimeLabel(tooltipData.point.hour)}</div>
              <div>Stage: {tooltipData.point.stage.toUpperCase()}</div>
              <div className="font-medium">
                Concentration: {formatConcentrationValue(tooltipData.concentration)}
              </div>
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}