"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Group } from "@visx/group";
import { Moon, Sun } from "lucide-react";
import ProcessGraph from "./section1-wake-network/ProcessGraph";

// Force rebuild
interface NetworkNode {
  id: string;
  type: 'system' | 'region' | 'stabilizer' | 'switch' | 'gate' | 'clock';
  name: string;
  origin?: string;
  function?: string;
  color: string;
  x: number;
  y: number;
  size: number;
  layer: 'brainstem' | 'hypothalamus' | 'basal_forebrain' | 'thalamus' | 'cortex';
}

interface NetworkLink {
  source: string;
  target: string;
  type: 'ascending' | 'stabilizer' | 'inhibitory' | 'circadian' | 'gating';
  strength: number;
  bidirectional?: boolean;
}

interface NeurotransmitterSystem {
  name: string;
  origin: string;
  function: string;
  color: string;
  pathway: { x: number; y: number }[];
}


const PROCESS_CARD_SUMMARIES: Record<NarrativeStage, string> = {
  0: "Homeostatic pressure reset; circadian gate still holding wake steady.",
  1: "Process S keeps climbing as adenosine stacks up—caffeine only buys time.",
  2: "Circadian cues from the SCN ease the gate while pressure peaks for handoff.",
  3: "Both processes converge and VLPO is primed to drop the first switch into NREM.",
};

const SYSTEMS_SUMMARIES: Record<NarrativeStage, string> = {
  0: "Brainstem arousal crew runs the floor while orexin stabilizers hold the bridge.",
  1: "Wake transmitters fatigue and orexin stretches to keep every console covered.",
  2: "Circadian briefings rotate staffing; stabilizers start releasing their grip.",
  3: "Sleep team seizes the board—VLPO and TRN assume control of the line.",
};

const NETWORK_SUMMARIES: Record<NarrativeStage, string> = {
  0: "Flip-flop firmly in wake mode with corticothalamic loops fully engaged.",
  1: "Adenosine nudges VLPO while orexin still props the ascending relay.",
  2: "TRN begins tightening the gate as SCN cues the handoff toward sleep.",
  3: "VLPO suppresses arousal hubs; TRN clamps input and seeds the first spindles.",
};


type SwitchState = "wake" | "transitioning" | "sleep";
type NarrativeStage = 0 | 1 | 2 | 3;



const formatClock = (hours: number): string => {
  const normalized = (hours + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.round((normalized - h) * 60);
  const paddedHours = h.toString().padStart(2, "0");
  const paddedMinutes = (m === 60 ? 0 : m).toString().padStart(2, "0");
  const hourDisplay = m === 60 ? ((h + 1) % 24).toString().padStart(2, "0") : paddedHours;
  return `${hourDisplay}:${paddedMinutes}`;
};

const formatCircadianPhase = (phase: number): string => {
  const normalized = ((phase % 360) + 360) % 360;
  return `${Math.round(normalized)}°`;
};

const formatFlipFlopState = (state: SwitchState): string => {
  switch (state) {
    case "wake":
      return "Wake guard";
    case "transitioning":
      return "Hand-off";
    case "sleep":
      return "Sleep engaged";
    default:
      return "Unknown";
  }
};
const WAKE_NETWORK_DATA: { nodes: NetworkNode[]; links: NetworkLink[] } = {
  nodes: [
    // Cortex layer
    { id: 'cortex', type: 'region' as const, name: 'Cortex', color: '#ffffff', x: 400, y: 80, size: 28, layer: 'cortex' },

    // Thalamus layer
    { id: 'thalamus', type: 'region' as const, name: 'Thalamus', color: '#e5e7eb', x: 400, y: 180, size: 24, layer: 'thalamus' },
    { id: 'trn', type: 'gate' as const, name: 'TRN', origin: 'Thalamic Reticular Nucleus', function: 'Sensory Gate & Spindles', color: '#6b7280', x: 520, y: 180, size: 18, layer: 'thalamus' },

    // Basal forebrain layer
    { id: 'basal_forebrain', type: 'region' as const, name: 'Basal Forebrain', color: '#d1d5db', x: 280, y: 280, size: 20, layer: 'basal_forebrain' },
    { id: 'acetylcholine', type: 'system' as const, name: 'Acetylcholine', origin: 'Basal Forebrain', function: 'Attention & Learning', color: '#10b981', x: 280, y: 280, size: 18, layer: 'basal_forebrain' },

    // Hypothalamus layer
    { id: 'orexin', type: 'stabilizer' as const, name: 'Orexin', origin: 'Lateral Hypothalamus', function: 'Wake Stabilizer', color: '#a78bfa', x: 400, y: 380, size: 24, layer: 'hypothalamus' },
    { id: 'vlpo', type: 'switch' as const, name: 'VLPO', origin: 'Ventrolateral Preoptic', function: 'Sleep Switch', color: '#3b82f6', x: 240, y: 380, size: 20, layer: 'hypothalamus' },
    { id: 'scn', type: 'clock' as const, name: 'SCN', origin: 'Suprachiasmatic Nucleus', function: 'Circadian Master Clock', color: '#06b6d4', x: 560, y: 380, size: 20, layer: 'hypothalamus' },
    { id: 'histamine', type: 'system' as const, name: 'Histamine', origin: 'TMN', function: 'Arousal & Wakefulness', color: '#8b5cf6', x: 160, y: 420, size: 20, layer: 'hypothalamus' },

    // Brainstem layer
    { id: 'norepinephrine', type: 'system' as const, name: 'Norepinephrine', origin: 'Locus Coeruleus', function: 'Alertness & Attention', color: '#f59e0b', x: 400, y: 520, size: 20, layer: 'brainstem' },
    { id: 'serotonin', type: 'system' as const, name: 'Serotonin', origin: 'Raphe Nuclei', function: 'Mood & Sleep Regulation', color: '#ef4444', x: 240, y: 520, size: 20, layer: 'brainstem' },
    { id: 'dopamine', type: 'system' as const, name: 'Dopamine', origin: 'VTA', function: 'Reward & Motivation', color: '#ec4899', x: 560, y: 520, size: 20, layer: 'brainstem' },
    { id: 'glutamate', type: 'system' as const, name: 'Glutamate', origin: 'PPT/LDT', function: 'Excitatory Drive', color: '#f97316', x: 320, y: 560, size: 18, layer: 'brainstem' },
    { id: 'cholinergic_brainstem', type: 'system' as const, name: 'Cholinergic', origin: 'PPT/LDT', function: 'REM & Arousal', color: '#84cc16', x: 480, y: 560, size: 18, layer: 'brainstem' },
  ],
  links: [
    // Ascending arousal pathways (brainstem → thalamus → cortex)
    { source: 'norepinephrine', target: 'thalamus', type: 'ascending' as const, strength: 1 },
    { source: 'serotonin', target: 'thalamus', type: 'ascending' as const, strength: 1 },
    { source: 'dopamine', target: 'thalamus', type: 'ascending' as const, strength: 1 },
    { source: 'glutamate', target: 'thalamus', type: 'ascending' as const, strength: 1 },
    { source: 'cholinergic_brainstem', target: 'thalamus', type: 'ascending' as const, strength: 1 },

    // Brainstem → basal forebrain → cortex pathway
    { source: 'acetylcholine', target: 'cortex', type: 'ascending' as const, strength: 1 },
    { source: 'basal_forebrain', target: 'cortex', type: 'ascending' as const, strength: 1 },

    // Hypothalamic → cortex pathways
    { source: 'histamine', target: 'cortex', type: 'ascending' as const, strength: 1 },
    { source: 'orexin', target: 'cortex', type: 'ascending' as const, strength: 1 },

    // Thalamic relay
    { source: 'thalamus', target: 'cortex', type: 'ascending' as const, strength: 1 },
    { source: 'trn', target: 'thalamus', type: 'gating' as const, strength: 0.8 },

    // Orexin stabilization of arousal systems
    { source: 'orexin', target: 'norepinephrine', type: 'stabilizer' as const, strength: 0.8 },
    { source: 'orexin', target: 'serotonin', type: 'stabilizer' as const, strength: 0.8 },
    { source: 'orexin', target: 'dopamine', type: 'stabilizer' as const, strength: 0.8 },
    { source: 'orexin', target: 'histamine', type: 'stabilizer' as const, strength: 0.8 },
    { source: 'orexin', target: 'acetylcholine', type: 'stabilizer' as const, strength: 0.8 },

    // VLPO inhibitory projections (mutual inhibition with arousal centers)
    { source: 'vlpo', target: 'norepinephrine', type: 'inhibitory' as const, strength: 1, bidirectional: true },
    { source: 'vlpo', target: 'serotonin', type: 'inhibitory' as const, strength: 1, bidirectional: true },
    { source: 'vlpo', target: 'histamine', type: 'inhibitory' as const, strength: 1, bidirectional: true },
    { source: 'vlpo', target: 'orexin', type: 'inhibitory' as const, strength: 1, bidirectional: true },

    // SCN circadian control
    { source: 'scn', target: 'vlpo', type: 'circadian' as const, strength: 0.9 },
    { source: 'scn', target: 'orexin', type: 'circadian' as const, strength: 0.9 },
  ],
};

const NARRATIVE_STAGES: Record<NarrativeStage, { heading: string; description: string }> = {
  0: {
    heading: "The Wake Network Ascends",
    description: "Norepinephrine from locus coeruleus, serotonin from raphe, dopamine from VTA, histamine from TMN, plus cholinergic and glutamatergic hubs keep cortex fast and reactive. Orexin neurons in lateral hypothalamus act as stabilizers—tonically exciting arousal centers so wake is sustained.",
  },
  1: {
    heading: "Process S: Adenosine Accumulates",
    description: "Adenosine builds during wake, biasing the flip-flop toward sleep. GABA-galanin neurons in VLPO wait for the signal. Caffeine, an A1/A2A antagonist, can push back against this homeostatic pressure by blocking adenosine receptors.",
  },
  2: {
    heading: "Process C: The Circadian Gate Opens",
    description: "The SCN molecular clock routes timing signals through the dorsomedial hypothalamus, dampens orexin output, and drives melatonin release. Sleep onset follows when high Process S pressure meets this circadian 'sleep gate' from Process C.",
  },
  3: {
    heading: "First Switch: VLPO Flips to NREM",
    description: "GABA-galanin neurons in VLPO inhibit arousal hubs. The two sides inhibit each other, so the system flips sharply—either wake is on or sleep is on. TRN closes the sensory gate, seeding spindles that quiet cortex for NREM onset.",
  },
};

const STAGE_STEPS: Array<{ stage: NarrativeStage; title: string; summary: string }> = [
  {
    stage: 0,
    title: "Wake Network Ascends",
    summary: "Brainstem transmitters and orexin keep cortex alert.",
  },
  {
    stage: 1,
    title: "Process S Builds",
    summary: "Adenosine loads the flip-flop; caffeine resists the pressure.",
  },
  {
    stage: 2,
    title: "Process C Gates",
    summary: "SCN timing opens the nightly window as pressure peaks.",
  },
  {
    stage: 3,
    title: "Flip to NREM",
    summary: "VLPO shuts arousal hubs; TRN closes the sensory gate.",
  },
];

export default function WakeNetworkSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [activeSystem, setActiveSystem] = useState<number>(-1);
  const [processSLevel, setProcessSLevel] = useState(0);
  const [processCPhase, setProcessCPhase] = useState(0);
  const [convergenceActive, setConvergenceActive] = useState(false);
  const [switchState, setSwitchState] = useState<SwitchState>("wake");
  const [narrativeStage, setNarrativeStage] = useState<NarrativeStage>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [graphTime, setGraphTime] = useState(7); // Start at 7am

  const stateCacheRef = useRef({
    activeSystem: -1,
    processSLevel: 0,
    processCPhase: 0,
    convergenceActive: false,
    switchState: "wake" as SwitchState,
    narrativeStage: 0 as NarrativeStage,
  });

  const withAlpha = (hex: string, alpha: string) => (
    hex.startsWith("#") && hex.length === 7 ? `${hex}${alpha}` : hex
  );

  // Modern network structure for visx
  const networkData = useMemo(() => WAKE_NETWORK_DATA, []);

  // Comprehensive systems for progressive reveal and panel display
  const neurotransmitterSystems: NeurotransmitterSystem[] = useMemo(
    () => networkData.nodes
      .filter(node => node.type === 'system' || node.type === 'stabilizer' || node.type === 'switch' || node.type === 'clock' || node.type === 'gate')
      .sort((a, b) => {
        // Sort by layer hierarchy: brainstem → hypothalamus → basal_forebrain → thalamus → cortex
        const layerOrder = ['brainstem', 'hypothalamus', 'basal_forebrain', 'thalamus', 'cortex'];
        return layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer);
      })
      .map(node => ({
        name: node.name,
        origin: node.origin || '',
        function: node.function || '',
        color: node.color,
        pathway: [
          { x: node.x / 4, y: (320 - node.y) / 3 + 10 },
          { x: node.x / 4, y: (320 - node.y) / 3 + 30 },
          { x: node.x / 4, y: (320 - node.y) / 3 + 50 },
          { x: node.x / 4, y: (320 - node.y) / 3 + 70 }
        ]
      })),
    [networkData]

  );


  const stageContent = useMemo(() => NARRATIVE_STAGES[narrativeStage], [narrativeStage]);
  const stageBadge = stageContent.title;

  const processSummary = useMemo(() => PROCESS_CARD_SUMMARIES[narrativeStage], [narrativeStage]);
  const systemsSummary = useMemo(() => SYSTEMS_SUMMARIES[narrativeStage], [narrativeStage]);
  const networkSummary = useMemo(() => NETWORK_SUMMARIES[narrativeStage], [narrativeStage]);

  const circadianDisplay = useMemo(() => formatCircadianPhase(processCPhase), [processCPhase]);
  const localTimeDisplay = useMemo(() => formatClock(graphTime), [graphTime]);

  const { crewLoadDisplay, orexinStatus } = useMemo(() => {
    const total = Math.max(1, neurotransmitterSystems.length);
    const engaged = Math.max(0, Math.min(total, activeSystem + 1));
    const orexinIndex = neurotransmitterSystems.findIndex(ns => ns.name === "Orexin");
    return {
      crewLoadDisplay: `${Math.round((engaged / total) * 100)}%`,
      orexinStatus: orexinIndex !== -1 && activeSystem >= orexinIndex ? "Stabilizing" : "Standby",
    };
  }, [neurotransmitterSystems, activeSystem]);

  const vlpoStatus = useMemo(() => {
    switch (switchState) {
      case "sleep":
        return "On duty";
      case "transitioning":
        return "Priming";
      default:
        return "Off duty";
    }
  }, [switchState]);

  const flipFlopLabel = useMemo(() => formatFlipFlopState(switchState), [switchState]);
  const trnGateStatus = useMemo(() => (convergenceActive ? "Clamp engaged" : "Gate open"), [convergenceActive]);

  // Waypoint-based animation sequence - stays centered
  useEffect(() => {
    if (typeof window === "undefined" || !sectionRef.current || !diagramRef.current) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const updateIfChanged = <K extends keyof typeof stateCacheRef.current>(
        key: K,
        value: typeof stateCacheRef.current[K],
        setter: (val: typeof stateCacheRef.current[K]) => void,
      ) => {
        if (stateCacheRef.current[key] !== value) {
          stateCacheRef.current[key] = value;
          setter(value);
        }
      };

      ScrollTrigger.create({
        trigger: sectionRef.current,
        pin: diagramRef.current,
        start: "top top",
        end: "+=150%",
        scrub: 1,
        pinSpacing: true,
        onEnter: () => {
          updateIfChanged("activeSystem", -1, setActiveSystem);
          updateIfChanged("processSLevel", 0, (v) => setProcessSLevel(v as number));
          updateIfChanged("processCPhase", 0, (v) => setProcessCPhase(v as number));
          updateIfChanged("convergenceActive", false, (v) => setConvergenceActive(v as boolean));
          updateIfChanged("switchState", "wake", (v) => setSwitchState(v as SwitchState));
          updateIfChanged("narrativeStage", 0, (v) => setNarrativeStage(v as NarrativeStage));
        },
        onUpdate: (self) => {
          const progress = self.progress;

          const systemPhase = Math.min(1, Math.max(0, (progress - 0.05) / 0.3));
          const systemIndex = Math.min(
            neurotransmitterSystems.length - 1,
            Math.floor(systemPhase * neurotransmitterSystems.length),
          );
          updateIfChanged("activeSystem", systemPhase <= 0 ? -1 : systemIndex, setActiveSystem);

          const processSProgress = Math.min(1, Math.max(0, (progress - 0.28) / 0.3));
          updateIfChanged("processSLevel", Math.round(processSProgress * 100), (v) => setProcessSLevel(v as number));

          // Update graph time based on scroll (7am to 12pm noon)
          const timeProgress = 7 + progress * 5; // 7am + 5 hours = 12pm (noon)
          setGraphTime(timeProgress);

          const processCProgress = Math.min(1, Math.max(0, (progress - 0.58) / 0.26));
          updateIfChanged("processCPhase", processCProgress * 360, (v) => setProcessCPhase(v as number));

          const convergence = progress >= 0.78;
          updateIfChanged("convergenceActive", convergence, (v) => setConvergenceActive(v as boolean));

          const switchStateValue: SwitchState = progress >= 0.92 ? "sleep"
            : progress >= 0.82 ? "transitioning"
            : "wake";
          updateIfChanged("switchState", switchStateValue, (v) => setSwitchState(v as SwitchState));

          const stage: NarrativeStage = progress < 0.33 ? 0
            : progress < 0.58 ? 1
            : progress < 0.82 ? 2
            : 3;
          updateIfChanged("narrativeStage", stage, (v) => setNarrativeStage(v as NarrativeStage));
        },
        onLeave: () => {
          updateIfChanged("activeSystem", neurotransmitterSystems.length - 1, setActiveSystem);
          updateIfChanged("processSLevel", 100, (v) => setProcessSLevel(v as number));
          updateIfChanged("processCPhase", 360, (v) => setProcessCPhase(v as number));
          updateIfChanged("convergenceActive", true, (v) => setConvergenceActive(v as boolean));
          updateIfChanged("switchState", "sleep", (v) => setSwitchState(v as SwitchState));
          updateIfChanged("narrativeStage", 3, (v) => setNarrativeStage(v as NarrativeStage));
        },
        onLeaveBack: () => {
          updateIfChanged("activeSystem", -1, setActiveSystem);
          updateIfChanged("processSLevel", 0, (v) => setProcessSLevel(v as number));
          updateIfChanged("processCPhase", 0, (v) => setProcessCPhase(v as number));
          updateIfChanged("convergenceActive", false, (v) => setConvergenceActive(v as boolean));
          updateIfChanged("switchState", "wake", (v) => setSwitchState(v as SwitchState));
          updateIfChanged("narrativeStage", 0, (v) => setNarrativeStage(v as NarrativeStage));
        },
      });

      gsap.set(".network-node", { scale: 0, opacity: 0 });
      gsap.to(".network-node", {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        stagger: 0.1,
        ease: "back.out(1.7)",
        scrollTrigger: {
          trigger: diagramRef.current,
          start: "top 70%",
          toggleActions: "play none none reverse",
        },
      });

      gsap.set(".network-link", { strokeDasharray: "5,5", strokeDashoffset: 10 });
      gsap.to(".network-link", {
        strokeDashoffset: 0,
        duration: 1.5,
        stagger: 0.2,
        scrollTrigger: {
          trigger: diagramRef.current,
          start: "top 60%",
          toggleActions: "play none none reverse",
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [neurotransmitterSystems]);

  return (
    <section
      ref={sectionRef}
      id="wake-network"
      className="relative min-h-screen flex items-center justify-center py-24 section-bg-standard"
    >
      <div className="w-full max-w-6xl px-6">

          {/* Section Header */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2
              className="text-section-title mb-6"
              style={{ color: "var(--foreground)" }}
            >
              The{" "}
              <span style={{ color: "var(--color-golden-yellow)" }}>
                Day Shift
              </span>{" "}
              & First Switch
            </h2>
            <p
              className="text-body-large max-w-4xl mx-auto text-opacity-secondary"
              style={{ color: "var(--foreground)" }}
            >
              Five neurotransmitter systems ascend from brainstem to cortex while two processes build the pressure that tips the flip-flop toward sleep.
            </p>
          </motion.div>

          {/* Main Content Grid: Process Graph Top, Systems Left, Network Right */}
          <div className="mx-auto space-y-8">

            {/* Process S & C Graph - TOP */}
            <motion.div
              className="section-card-secondary p-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h3 className="text-card-title mb-4" style={{ color: "var(--foreground)" }}>
                <span style={{ color: "var(--color-soft-blue)" }}>Process S</span>
                <span style={{ color: "var(--foreground)", opacity: 0.75 }}> & </span>
                <span style={{ color: "var(--color-soft-lavender)" }}>Process C</span>
                <span style={{ color: "var(--color-warm-coral)", marginLeft: 4 }}>· Two-Process Model</span>
              </h3>
              <p className="text-body-small text-opacity-muted mb-4" style={{ color: "var(--foreground)" }}>
                {processSummary}
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                <InfoChip label="Process S" value={`${Math.round(processSLevel)}%`} color="var(--color-soft-blue)" />
                <InfoChip label="Circadian phase" value={circadianDisplay} color="var(--color-soft-lavender)" />
                <InfoChip label="Local time" value={localTimeDisplay} color="var(--color-warm-coral)" />
              </div>
              <div className="w-full overflow-x-auto">
                <ProcessGraph
                  width={Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 100 : 800)}
                  height={400}
                  currentTime={graphTime}
                  showCaffeine={processSLevel > 50}
                />
              </div>
            </motion.div>

            {/* BOTTOM SECTION: Systems on Left, Brain Network on Right */}
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">

              {/* LEFT: Systems on Shift Panel */}
              <div className="space-y-4">
                <h3 className="text-card-title mb-4" style={{ color: "var(--foreground)" }}>
                  <span style={{ color: "var(--color-fresh-green)" }}>Systems</span>{' '}
                  <span style={{ color: "var(--foreground)", opacity: 0.8 }}>on</span>{' '}
                  <span style={{ color: "var(--color-golden-yellow)" }}>Shift</span>
                </h3>
                <p className="text-body-small text-opacity-muted mb-4" style={{ color: "var(--foreground)" }}>
                  {systemsSummary}
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  <InfoChip label="Crew load" value={crewLoadDisplay} color="#f59e0b" />
                  <InfoChip label="Orexin" value={orexinStatus} color="#a78bfa" />
                  <InfoChip label="VLPO" value={vlpoStatus} color="#3b82f6" />
                </div>

                {/* Wake-Promoting Systems */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold tracking-wide opacity-70" style={{ color: "var(--foreground)" }}>
                    Wake-Promoting Systems
                  </h4>
                  {neurotransmitterSystems
                    .filter(s => ['Norepinephrine', 'Serotonin', 'Dopamine', 'Histamine', 'Acetylcholine'].includes(s.name))
                    .map((system, index) => {
                      const systemIndex = neurotransmitterSystems.findIndex(ns => ns.name === system.name);
                      return (
                        <motion.div
                          key={system.name}
                          className="section-card-subtle p-3"
                          style={{
                            backgroundColor: withAlpha(system.color, activeSystem >= systemIndex ? "26" : "12"),
                            borderColor: system.color,
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                          }}
                          whileHover={{ scale: 1.02 }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                            x: 0,
                            boxShadow: activeSystem >= systemIndex
                              ? `0 0 24px ${withAlpha(system.color, "44")}`
                              : undefined,
                          }}
                          transition={{ duration: 0.5, delay: 0.1 * index }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: system.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-semibold" style={{ color: system.color }}>
                                {system.name.split(' ')[0]}
                              </h5>
                              <p className="text-xs text-opacity-muted truncate" style={{ color: "var(--foreground)" }}>
                                {system.origin}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>

                {/* Stabilizing Systems */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold tracking-wide opacity-70" style={{ color: "var(--foreground)" }}>
                    Stabilizing Systems
                  </h4>
                  {neurotransmitterSystems
                    .filter(s => s.name === 'Orexin')
                    .map((system) => {
                      const systemIndex = neurotransmitterSystems.findIndex(ns => ns.name === system.name);
                      return (
                        <motion.div
                          key={system.name}
                          className="section-card-subtle p-3"
                          style={{
                            backgroundColor: withAlpha(system.color, activeSystem >= systemIndex ? "26" : "12"),
                            borderColor: system.color,
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                          }}
                          whileHover={{ scale: 1.02 }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                            x: 0,
                            boxShadow: activeSystem >= systemIndex
                              ? `0 0 24px ${withAlpha(system.color, "44")}`
                              : undefined,
                          }}
                          transition={{ duration: 0.5, delay: 0.6 }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: system.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-semibold" style={{ color: system.color }}>
                                {system.name}
                              </h5>
                              <p className="text-xs text-opacity-muted truncate" style={{ color: "var(--foreground)" }}>
                                {system.origin}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>

                {/* Sleep-Promoting Systems */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold tracking-wide opacity-70" style={{ color: "var(--foreground)" }}>
                    Sleep-Promoting Systems
                  </h4>
                  {neurotransmitterSystems
                    .filter(s => s.name === 'VLPO')
                    .map((system) => {
                      const systemIndex = neurotransmitterSystems.findIndex(ns => ns.name === system.name);
                      return (
                        <motion.div
                          key={system.name}
                          className="section-card-subtle p-3"
                          style={{
                            backgroundColor: withAlpha(system.color, activeSystem >= systemIndex ? "26" : "12"),
                            borderColor: system.color,
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                          }}
                          whileHover={{ scale: 1.02 }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{
                            opacity: activeSystem >= systemIndex ? 1 : 0.55,
                            x: 0,
                            boxShadow: activeSystem >= systemIndex
                              ? `0 0 24px ${withAlpha(system.color, "44")}`
                              : undefined,
                          }}
                          transition={{ duration: 0.5, delay: 0.7 }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: system.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-semibold" style={{ color: system.color }}>
                                {system.name}
                              </h5>
                              <p className="text-xs text-opacity-muted truncate" style={{ color: "var(--foreground)" }}>
                                {system.origin}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              </div>

              {/* RIGHT: Brain Network Activity */}
              <div ref={diagramRef} className="sticky top-0">
                <div className="mb-6">
                  <h3 className="text-card-title mb-4" style={{ color: "var(--foreground)" }}>
                    <span style={{ color: "var(--color-warm-coral)" }}>Brain</span>{' '}
                    <span style={{ color: "var(--color-soft-blue)" }}>Network</span>{' '}
                    <span style={{ color: "var(--color-soft-lavender)" }}>Activity</span>
                  </h3>
                  <p className="text-body-small text-opacity-muted mb-4" style={{ color: "var(--foreground)" }}>
                    {networkSummary}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <InfoChip label="Flip-flop" value={flipFlopLabel} color="#f97316" />
                    <InfoChip label="TRN gate" value={trnGateStatus} color="#a855f7" />
                    <InfoChip label="Stage" value={stageBadge} color="#0ea5e9" />
                  </div>
                </div>
                <div
                  className="section-card-primary relative overflow-hidden"
                  style={{
                    aspectRatio: "4/3",
                    minHeight: "600px",
                    background: "radial-gradient(circle at 20% 20%, rgba(251, 180, 78, 0.12), transparent 55%), radial-gradient(circle at 80% 15%, rgba(168, 197, 233, 0.18), transparent 65%), linear-gradient(135deg, rgba(42, 42, 47, 0.72), rgba(26, 26, 31, 0.58))",
                  }}
                >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 800 600"
                  className="absolute inset-0"
                >
                  <defs>
                    <linearGradient id="cortexGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1"/>
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05"/>
                    </linearGradient>
                    <linearGradient id="thalamusGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.1"/>
                      <stop offset="100%" stopColor="#e5e7eb" stopOpacity="0.05"/>
                    </linearGradient>
                    <linearGradient id="basalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.1"/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.05"/>
                    </linearGradient>
                    <linearGradient id="hypothalamusGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.1"/>
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.05"/>
                    </linearGradient>
                    <linearGradient id="brainstemGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.1"/>
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05"/>
                    </linearGradient>
                  </defs>

                  <Group>
                    {/* Anatomical Layer Backgrounds */}
                    <rect x="50" y="50" width="700" height="120" fill="url(#cortexGradient)" rx="10" />
                    <text x="60" y="75" fontSize="12" fill="#ffffff" opacity="0.6" fontWeight="600">CORTEX</text>

                    <rect x="50" y="150" width="700" height="100" fill="url(#thalamusGradient)" rx="10" />
                    <text x="60" y="175" fontSize="12" fill="#e5e7eb" opacity="0.6" fontWeight="600">THALAMUS</text>

                    <rect x="50" y="250" width="700" height="80" fill="url(#basalGradient)" rx="10" />
                    <text x="60" y="275" fontSize="12" fill="#10b981" opacity="0.6" fontWeight="600">BASAL FOREBRAIN</text>

                    <rect x="50" y="330" width="700" height="120" fill="url(#hypothalamusGradient)" rx="10" />
                    <text x="60" y="355" fontSize="12" fill="#a78bfa" opacity="0.6" fontWeight="600">HYPOTHALAMUS</text>

                    <rect x="50" y="450" width="700" height="130" fill="url(#brainstemGradient)" rx="10" />
                    <text x="60" y="475" fontSize="12" fill="#f59e0b" opacity="0.6" fontWeight="600">BRAINSTEM</text>
                    {/* Network Links */}
                    {networkData.links.map((link, linkIndex) => {
                      const sourceNode = networkData.nodes.find(n => n.id === link.source);
                      const targetNode = networkData.nodes.find(n => n.id === link.target);

                      if (!sourceNode || !targetNode) return null;

                      const sourceSystemIndex = neurotransmitterSystems.findIndex(s => s.name === sourceNode.name);
                      const targetSystemIndex = neurotransmitterSystems.findIndex(s => s.name === targetNode.name);

                      const isActive = activeSystem >= 0 && (
                        sourceNode.type === 'region' ||
                        sourceNode.type === 'stabilizer' ||
                        sourceNode.type === 'switch' ||
                        sourceNode.type === 'clock' ||
                        sourceNode.type === 'gate' ||
                        sourceSystemIndex <= activeSystem ||
                        targetSystemIndex <= activeSystem
                      );

                      // Link styling based on type
                      const getLinkStyle = () => {
                        switch (link.type) {
                          case 'ascending':
                            return {
                              strokeWidth: 3,
                              strokeDasharray: "none",
                              opacity: isActive ? 0.8 : 0.1,
                              color: sourceNode.color
                            };
                          case 'stabilizer':
                            return {
                              strokeWidth: 2,
                              strokeDasharray: "4,4",
                              opacity: isActive ? 0.6 : 0.1,
                              color: sourceNode.color
                            };
                          case 'inhibitory':
                            return {
                              strokeWidth: 2.5,
                              strokeDasharray: "6,2",
                              opacity: isActive ? 0.7 : 0.1,
                              color: "#ef4444" // Red for inhibition
                            };
                          case 'circadian':
                            return {
                              strokeWidth: 2,
                              strokeDasharray: "8,4",
                              opacity: isActive ? 0.6 : 0.1,
                              color: "#06b6d4" // Cyan for circadian
                            };
                          case 'gating':
                            return {
                              strokeWidth: 2,
                              strokeDasharray: "2,6",
                              opacity: isActive ? 0.5 : 0.1,
                              color: "#6b7280" // Gray for gating
                            };
                          default:
                            return {
                              strokeWidth: 3,
                              strokeDasharray: "none",
                              opacity: isActive ? 0.8 : 0.1,
                              color: sourceNode.color
                            };
                        }
                      };

                      const linkStyle = getLinkStyle();

                      return (
                        <g key={`${link.source}-${link.target}-${linkIndex}`}>
                          <line
                            className="network-link"
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            stroke={linkStyle.color}
                            strokeWidth={linkStyle.strokeWidth}
                            strokeOpacity={linkStyle.opacity}
                            strokeDasharray={linkStyle.strokeDasharray}
                            style={{
                              filter: isActive ? `drop-shadow(0 0 4px ${linkStyle.color}40)` : 'none',
                              transition: 'all 0.5s ease'
                            }}
                          />

                          {/* Bidirectional arrow for mutual inhibition */}
                          {link.bidirectional && link.type === 'inhibitory' && (
                            <>
                              {/* Forward arrow */}
                              <polygon
                                points={`${targetNode.x - 6},${targetNode.y - 3} ${targetNode.x},${targetNode.y} ${targetNode.x - 6},${targetNode.y + 3}`}
                                fill={linkStyle.color}
                                opacity={linkStyle.opacity}
                              />
                              {/* Backward arrow */}
                              <polygon
                                points={`${sourceNode.x + 6},${sourceNode.y - 3} ${sourceNode.x},${sourceNode.y} ${sourceNode.x + 6},${sourceNode.y + 3}`}
                                fill={linkStyle.color}
                                opacity={linkStyle.opacity}
                              />
                            </>
                          )}
                        </g>
                      );
                    })}

                    {/* Network Nodes */}
                    {networkData.nodes.map((node) => {
                      const systemIndex = neurotransmitterSystems.findIndex(s => s.name === node.name);
                      const isSystemActive =
                        node.type === 'region' ||
                        node.type === 'stabilizer' ||
                        systemIndex <= activeSystem;
                      const isPrimarySystem = systemIndex === activeSystem;
                      const resolvedNodeColor = typeof node.color === 'string' ? node.color : '#94a3b8';

                      return (
                        <g key={node.id}>
                          {isPrimarySystem && (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.size + 20}
                              fill="none"
                              stroke={withAlpha(resolvedNodeColor, "55")}
                              strokeWidth="1.5"
                              strokeOpacity="0.85"
                            >
                              <animate
                                attributeName="r"
                                values={`${node.size + 10};${node.size + 24};${node.size + 10}`}
                                dur="3s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-opacity"
                                values="0.9;0.2;0.9"
                                dur="3s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          )}

                          {/* Node circle */}
                          <circle
                            className="network-node"
                            cx={node.x}
                            cy={node.y}
                            r={node.size}
                            fill={resolvedNodeColor}
                            fillOpacity={
                              selectedNode === node.id ? 1 :
                              hoveredNode === node.id ? 0.8 :
                              isSystemActive ? 0.9 : 0.3
                            }
                            stroke={
                              selectedNode === node.id ? "#fff" :
                              hoveredNode === node.id ? "#fff" : "white"
                            }
                            strokeWidth={
                              selectedNode === node.id ? "3" :
                              hoveredNode === node.id ? "2.5" : "2"
                            }
                            style={{
                              filter:
                                selectedNode === node.id ? `drop-shadow(0 0 12px ${resolvedNodeColor}80)` :
                                hoveredNode === node.id ? `drop-shadow(0 0 10px ${resolvedNodeColor}70)` :
                                isSystemActive ? `drop-shadow(0 0 12px ${withAlpha(resolvedNodeColor, "66")})` : 'none',
                              transition: 'all 0.5s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                            onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                          />

                          {/* Node label */}
                          <text
                            x={node.x}
                            y={node.y + node.size + 24}
                            textAnchor="middle"
                            fontSize="13"
                            fontWeight="600"
                            fill="var(--foreground)"
                            opacity={isPrimarySystem ? 1 : isSystemActive ? 0.85 : 0.35}
                            style={{ transition: 'opacity 0.5s ease' }}
                          >
                            {node.name}
                          </text>

                          {/* Orexin stabilizer indicator */}
                          {node.type === 'stabilizer' && convergenceActive && (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.size + 8}
                              fill="none"
                              stroke={resolvedNodeColor}
                              strokeWidth="2"
                              strokeOpacity="0.6"
                              strokeDasharray="6,6"
                            >
                              <animateTransform
                                attributeName="transform"
                                type="rotate"
                                values={`0 ${node.x} ${node.y};360 ${node.x} ${node.y}`}
                                dur="4s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          )}

                          {/* TRN spindle generation visualization */}
                          {node.id === 'trn' && switchState === 'sleep' && (
                            <>
                              {/* Spindle waves (11-16 Hz) */}
                              <path
                                d={`M ${node.x - 20},${node.y} Q ${node.x - 10},${node.y - 8} ${node.x},${node.y} Q ${node.x + 10},${node.y + 8} ${node.x + 20},${node.y}`}
                                stroke={resolvedNodeColor}
                                strokeWidth="2"
                                fill="none"
                                strokeOpacity="0.8"
                              >
                                <animate
                                  attributeName="stroke-opacity"
                                  values="0.8;0.3;0.8"
                                  dur="0.08s"
                                  repeatCount="indefinite"
                                />
                              </path>
                              <path
                                d={`M ${node.x - 15},${node.y + 5} Q ${node.x - 7.5},${node.y - 3} ${node.x},${node.y + 5} Q ${node.x + 7.5},${node.y + 13} ${node.x + 15},${node.y + 5}`}
                                stroke={resolvedNodeColor}
                                strokeWidth="1.5"
                                fill="none"
                                strokeOpacity="0.6"
                              >
                                <animate
                                  attributeName="stroke-opacity"
                                  values="0.6;0.2;0.6"
                                  dur="0.07s"
                                  repeatCount="indefinite"
                                />
                              </path>

                              {/* Spindle annotation */}
                              <text
                                x={node.x}
                                y={node.y - node.size - 8}
                                textAnchor="middle"
                                fontSize="8"
                                fill={resolvedNodeColor}
                                opacity="0.7"
                              >
                                11-16 Hz spindles
                              </text>
                            </>
                          )}

                          {/* Activity pulses for active systems */}
                          {isSystemActive && node.type === 'system' && (
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.size}
                              fill={resolvedNodeColor}
                              fillOpacity="0.6"
                            >
                              <animate
                                attributeName="r"
                                values={`${node.size};${node.size + 6};${node.size}`}
                                dur="2s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="fill-opacity"
                                values="0.6;0.2;0.6"
                                dur="2s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          )}
                        </g>
                      );
                    })}
                  </Group>
                </svg>

                {/* Enhanced Legend */}
                <div className="absolute bottom-2 left-2 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-white opacity-70"></div>
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>Ascending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-white opacity-70" style={{ borderTop: "2px dashed white", height: "1px" }}></div>
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>Stabilizer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-red-500 opacity-70" style={{ borderTop: "2px dashed #ef4444", height: "1px" }}></div>
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>Inhibitory</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-cyan-500 opacity-70" style={{ borderTop: "2px dashed #06b6d4", height: "1px" }}></div>
                    <span style={{ color: "var(--foreground)", opacity: 0.7 }}>Circadian</span>
                  </div>
                </div>

                {/* Interactive Node Info Panel */}
                {selectedNode && (() => {
                  const selectedNodeData = networkData.nodes.find(n => n.id === selectedNode);
                  if (!selectedNodeData) return null;

                  return (
                    <motion.div
                      className="absolute top-4 right-4 p-4 rounded-lg border backdrop-blur-sm z-10"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--card) 87%, transparent)",
                        borderColor: selectedNodeData.color,
                        maxWidth: "250px"
                      }}
                      initial={{ opacity: 0, scale: 0.9, x: 20 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h5
                          className="font-semibold text-lg"
                          style={{ color: selectedNodeData.color }}
                        >
                          {selectedNodeData.name}
                        </h5>
                        <button
                          onClick={() => setSelectedNode(null)}
                          className="text-sm opacity-60 hover:opacity-100"
                          style={{ color: "var(--foreground)" }}
                        >
                          ✕
                        </button>
                      </div>

                      {selectedNodeData.origin && (
                        <div className="mb-2">
                          <p className="text-sm font-medium opacity-80">Location:</p>
                          <p className="text-sm opacity-70">{selectedNodeData.origin}</p>
                        </div>
                      )}

                      {selectedNodeData.function && (
                        <div className="mb-2">
                          <p className="text-sm font-medium opacity-80">Function:</p>
                          <p className="text-sm opacity-70">{selectedNodeData.function}</p>
                        </div>
                      )}

                      <div className="mb-2">
                        <p className="text-sm font-medium opacity-80">Layer:</p>
                        <p className="text-sm opacity-70 capitalize">{selectedNodeData.layer.replace('_', ' ')}</p>
                      </div>

                      {/* Special information based on node type */}
                      {selectedNodeData.id === 'vlpo' && (
                        <div className="mt-3 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                          <p className="text-xs font-medium text-blue-400">Sleep Switch</p>
                          <p className="text-xs opacity-70">GABA-galanin neurons that inhibit arousal centers when activated. Loss of mutual inhibition with wake centers causes sharp state transitions.</p>
                        </div>
                      )}

                      {selectedNodeData.id === 'orexin' && (
                        <div className="mt-3 p-2 rounded bg-purple-500/10 border border-purple-500/20">
                          <p className="text-xs font-medium text-purple-400">Narcolepsy Link</p>
                          <p className="text-xs opacity-70">Loss of orexin neurons causes narcolepsy with cataplexy, REM intrusions, and unstable wake-sleep transitions.</p>
                        </div>
                      )}

                      {selectedNodeData.id === 'trn' && (
                        <div className="mt-3 p-2 rounded bg-gray-500/10 border border-gray-500/20">
                          <p className="text-xs font-medium text-gray-400">Spindle Generator</p>
                          <p className="text-xs opacity-70">Generates 11-16 Hz sleep spindles via rhythmic inhibition of thalamocortical relay cells. Gates sensory input during NREM.</p>
                        </div>
                      )}

                      {selectedNodeData.id === 'scn' && (
                        <div className="mt-3 p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                          <p className="text-xs font-medium text-cyan-400">Master Clock</p>
                          <p className="text-xs opacity-70">Molecular clock entrained by light that coordinates circadian rhythms throughout the body. Sets timing for sleep-wake transitions.</p>
                        </div>
                      )}
                    </motion.div>
                  );
                })()}
                </div>
              </div>
            </div>
          </div>

          {/* Switch Status */}
          <motion.div
            className="mt-8 flex justify-center mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 3 }}
          >
            <div
              className={`section-card-subtle p-6 transition-all duration-500`}
              style={{
                backgroundColor: "var(--color-fresh-green)10",
                borderColor: "var(--color-fresh-green)",
                opacity: convergenceActive ? 1 : 0.7,
                minWidth: "300px"
              }}
            >
              <h4 className="text-card-title mb-4 text-center" style={{ color: "var(--color-fresh-green)" }}>
                First Switch: Wake ↔ NREM
              </h4>
              <div className="relative mb-4 mt-2 h-12">
                <div className="absolute inset-0 flex items-center justify-between px-3">
                  <Sun size={22} color="var(--color-golden-yellow)" className="opacity-80" />
                  <Moon size={22} color="var(--color-soft-blue)" className="opacity-80" />
                </div>
                <div
                  className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 rounded-full"
                  style={{ backgroundColor: "var(--border)" }}
                />
                <motion.div
                  className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 rounded-full"
                  style={{ background: "linear-gradient(90deg, rgba(251,180,78,0.5) 0%, rgba(104,188,232,0.5) 100%)" }}
                  animate={{
                    clipPath:
                      switchState === "wake"
                        ? "inset(0% 100% 0% 0%)"
                        : switchState === "transitioning"
                          ? "inset(0% 50% 0% 0%)"
                          : "inset(0% 0% 0% 0%)",
                  }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute top-1/2 flex h-9 w-9 -translate-y-1/2 -translate-x-1/2 items-center justify-center rounded-full shadow-lg"
                  style={{
                    backgroundColor: switchState === "sleep" ? "#a8c5e9" : "#fbb44e",
                    color: "#0f172a",
                  }}
                  animate={{
                    left: switchState === "wake"
                      ? "12%"
                      : switchState === "transitioning"
                        ? "50%"
                        : "88%",
                    backgroundColor: switchState === "sleep" ? "#a8c5e9" : "#fbb44e",
                  }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                >
                  {switchState === "sleep" ? <Moon size={18} /> : <Sun size={18} />}
                </motion.div>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    switchState === "wake" ? "opacity-100" : "opacity-60"
                  }`}
                  style={{
                    backgroundColor: "var(--color-golden-yellow)20",
                    color: "var(--color-golden-yellow)",
                  }}
                >
                  WAKE
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    switchState === "sleep" ? "opacity-100" : "opacity-60"
                  }`}
                  style={{
                    backgroundColor: "var(--color-soft-blue)20",
                    color: "var(--color-soft-blue)",
                  }}
                >
                  NREM
                </span>
              </div>
              <p className="text-body-small text-center text-opacity-muted" style={{ color: "var(--foreground)" }}>
                VLPO GABA-galanin neurons inhibit arousal centers
              </p>
            </div>
          </motion.div>
        </div>
    </section>
  );
}


function InfoChip({ label, value, color }: { label: string; value: string; color: string }) {
  const isCssVar = color.trim().startsWith("var(");
  const backgroundColor = isCssVar ? `color-mix(in srgb, ${color} 20%, transparent)` : `${color}22`;
  const borderColor = isCssVar ? `color-mix(in srgb, ${color} 55%, transparent)` : `${color}44`;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wide"
      style={{
        backgroundColor,
        color,
        border: `1px solid ${borderColor}`,
        letterSpacing: "0.05em",
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: 0.8 }}>{value}</span>
    </span>
  );
}
