"use client";

import React from "react";
import NEOscillationGraph from "./NEOscillationGraph";
import VasomotionCrossSectionSagittal from "./VasomotionCrossSectionSagittal";
import VasomotionCrossSectionCoronal from "./VasomotionCrossSectionCoronal";
import VolumePhaseGraph from "./VolumePhaseGraph";
import type { Section3State } from "./types";

interface GlymphticVisualizationProps {
  state: Section3State;
}

const STAGE_INFO = {
  intro: {
    title: "Introduction",
    description: "During NREM sleep, norepinephrine from the locus coeruleus doesn't simply drop–it oscillates.",
  },
  oscillation: {
    title: "NE Oscillation",
    description: "Infraslow NE waves occur approximately every 50 seconds, creating a rhythmic pattern throughout NREM.",
  },
  vasomotion: {
    title: "Vasomotion Pump",
    description: "These NE oscillations cause arteries to constrict and relax rhythmically–creating a slow vasomotion pump.",
  },
  "volume-exchange": {
    title: "Volume Exchange",
    description: "Blood and CSF volumes move in opposite phase. When arteries dilate, CSF is pushed out; when they constrict, CSF flows in.",
  },
  "flow-clearance": {
    title: "Flow & Clearance",
    description: "CSF influx drives waste clearance through the parenchyma via the glymphatic pathway–the brain's waste disposal system.",
  },
};
const formatPercent = (value: number, decimals = 0) => `${(value * 100).toFixed(decimals)}%`;

const getNeoSummary = (state: Section3State): string => {
  switch (state.phase) {
    case "intro":
      return `LC output idles near baseline (50%); the night crew is priming the slow oscillation.`;
    case "oscillation":
      return `The infraslow wave ripples between 30-70% as it charges the upcoming vasomotion beat.`;
    case "vasomotion":
      return `NE swings oscillate rhythmically, driving rhythmic squeezes that pump CSF along the vessels.`;
    case "volume-exchange":
      return `NE oscillations continue their steady rhythm as arterial walls trade blood out and pull CSF in on each pass.`;
    case "flow-clearance":
      return `NE oscillation dips during arterial constriction, opening the gate for clearance flow.`;
    default:
      return `NE oscillation adjusts with the cycle to cue vasomotion.`;
  }
};

const getSagittalSummary = (state: Section3State): string => {
  switch (state.phase) {
    case "intro":
      return "Baseline vessel tone with the perivascular pocket on standby.";
    case "oscillation":
      return "Infraslow flex primes the pump and cues CSF drift.";
    case "vasomotion":
      return "Rhythmic squeezes drive CSF past astrocyte endfeet.";
    case "volume-exchange":
      return "Recoil swaps blood out and invites CSF back in.";
    case "flow-clearance":
      return "Downstroke opens clearance lanes for waste.";
    default:
      return "Wall tone and CSF space continue in tandem.";
  }
};

const getCoronalSummary = (state: Section3State): string => {
  switch (state.phase) {
    case "intro":
      return "Baseline trickle keeps the corridor ready.";
    case "oscillation":
      return "Infraslow crest wakes the perivascular stream.";
    case "vasomotion":
      return "Each pulse carries CSF deeper along the vessel.";
    case "volume-exchange":
      return "Counter-flow trades volume to refresh the sleeve.";
    case "flow-clearance":
      return "Clearance beat ferries waste along the lane.";
    default:
      return "Perivascular flow and waste stay in step.";
  }
};

const getVolumeSummary = (state: Section3State): string => {
  switch (state.phase) {
    case "intro":
      return `Blood and CSF volumes maintain equilibrium before the pump engages.`;
    case "oscillation":
      return `Blood volume crests forcing CSF down with each slow wave—opposite phase relationship emerging.`;
    case "vasomotion":
      return `Alternating beats swing blood and CSF in opposite directions as the pump finds rhythm.`;
    case "volume-exchange":
      return `Exchange phase squeezes blood out so CSF can rebound in—inverse coupling at work.`;
    case "flow-clearance":
      return `Blood volume decreases during arterial constriction while CSF increases to flush solutes.`;
    default:
      return `Blood and CSF volumes trade places as the cycle advances.`;
  }
};


export default function GlymphticVisualization({ state }: GlymphticVisualizationProps) {
  const stageInfo = STAGE_INFO[state.phase];
  const neSummary = getNeoSummary(state);
  const sagittalSummary = getSagittalSummary(state);
  const coronalSummary = getCoronalSummary(state);
  const volumeSummary = getVolumeSummary(state);

  return (
    <div className="space-y-6">
      {/* Narrative Stage Info */}
      <div key={state.phase} className="text-center mb-4">
        <h3
          className="text-xl md:text-2xl font-semibold mb-2"
          style={{ color: "var(--color-warm-coral)" }}
        >
          {stageInfo.title}
        </h3>
        <p
          className="text-sm md:text-base max-w-2xl mx-auto"
          style={{ color: "var(--foreground)", opacity: 0.75 }}
        >
          {stageInfo.description}
        </p>
      </div>

      {/* Top: NE Oscillation Graph - Full Width */}
      <div className="section-card-subtle p-6 overflow-hidden">
        <h4
          className="text-caption mb-3"
          style={{ color: "var(--color-warm-coral)", opacity: 0.85 }}
        >
          Norepinephrine Oscillation
        </h4>
        <p className="text-xs md:text-sm mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
          {neSummary}
        </p>
        <div className="flex justify-center">
          <NEOscillationGraph
            width={Math.min(1000, typeof window !== "undefined" ? window.innerWidth - 120 : 800)}
            height={200}
            currentTime={state.time}
            neLevel={state.neLevel}
            phase={state.phase}
          />
        </div>
      </div>

      {/* Middle: Dual Cross-Sections - 1/3 Sagittal, 2/3 Coronal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sagittal Cross-Section (Through) - 1 column */}
        <div className="section-card-subtle p-6 lg:col-span-1 overflow-hidden">
          <h4
            className="text-caption mb-3"
            style={{ color: "var(--color-warm-coral)", opacity: 0.85 }}
          >
            Cross-Section Through
          </h4>
          <p className="text-xs md:text-sm mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
            {sagittalSummary}
          </p>
          <div className="flex justify-center">
            <VasomotionCrossSectionSagittal
              width={Math.min(360, typeof window !== "undefined" ? (window.innerWidth - 120) / 3 : 300)}
              height={280}
              vesselDiameter={state.vesselDiameter}
              flowRate={state.flowRate}
              csfVolume={state.csfVolume}
              phase={state.phase}
              wasteConcentration={state.wasteConcentration}
              time={state.time}
              cycleIndex={state.cycleIndex}
            />
          </div>
        </div>

        {/* Coronal Cross-Section (Along) - 2 columns */}
        <div className="section-card-subtle p-6 lg:col-span-2 overflow-hidden">
          <h4
            className="text-caption mb-3"
            style={{ color: "var(--color-warm-coral)", opacity: 0.85 }}
          >
            Cross-Section Along Vessel
          </h4>
          <p className="text-xs md:text-sm mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
            {coronalSummary}
          </p>
          <div className="flex justify-center">
            <VasomotionCrossSectionCoronal
              width={Math.min(720, typeof window !== "undefined" ? ((window.innerWidth - 120) * 2) / 3 : 600)}
              height={280}
              vesselDiameter={state.vesselDiameter}
              flowRate={state.flowRate}
              time={state.time}
              cycleIndex={state.cycleIndex}
              phase={state.phase}
              wasteConcentration={state.wasteConcentration}
              csfVolume={state.csfVolume}
            />
          </div>
        </div>
      </div>

      {/* Bottom: Volume Phase Graph - Full Width */}
      <div className="section-card-subtle p-6 overflow-hidden">
        <h4
          className="text-caption mb-3"
          style={{ color: "var(--color-warm-coral)", opacity: 0.85 }}
        >
          Blood & CSF Volume Relationship
        </h4>
        <p className="text-xs md:text-sm mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
          {volumeSummary}
        </p>
        <div className="flex justify-center">
          <VolumePhaseGraph
            width={Math.min(1000, typeof window !== "undefined" ? window.innerWidth - 120 : 800)}
            height={280}
            currentTime={state.time}
            bloodVolume={state.bloodVolume}
            csfVolume={state.csfVolume}
            phase={state.phase}
          />
        </div>
      </div>
    </div>
  );
}
