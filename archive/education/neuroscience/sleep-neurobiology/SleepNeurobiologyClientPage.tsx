"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@mantine/core";
import { BrainCircuit } from "lucide-react";
import HeroSection from "./components/shared/HeroSection";
import ScrollOrchestrator from "./components/shared/ScrollOrchestrator";
import SectionNavigator from "./components/shared/SectionNavigator";
import TimelineScrollOrchestrator, { type TimelineState, type SleepStage } from "./components/shared/TimelineScrollOrchestrator";
import ProcessGraph from "./components/section1-wake-network/ProcessGraph";
import TimelineBrainNetwork from "./components/section1-wake-network/TimelineBrainNetwork";
import NeurotransmitterPanel from "./components/section1-wake-network/NeurotransmitterPanel";
import Section2Orchestrator from "./components/section2-nrem-rem/Section2Orchestrator";
import Section3Orchestrator from "./components/section3-glymphatic/Section3Orchestrator";
import Section4Orchestrator from "./components/section4-ai-integration/Section4Orchestrator";

const formatPercent = (value: number) => `${Math.round(value)}%`;

const describeCircadianDrive = (processC: number): string => {
  if (processC >= 0.45) {
    return "circadian drive peaks with midday support";
  }
  if (processC >= 0.15) {
    return "circadian drive still lends alerting tone";
  }
  if (processC > -0.15) {
    return "circadian drive idles near neutral";
  }
  if (processC > -0.45) {
    return "circadian drive slides toward evening low";
  }
  return "circadian drive rests in the nocturnal trough";
};

const processCardSummaries: Record<SleepStage, (state: TimelineState) => string> = {
  wake: (state) => `Process S sits near ${formatPercent(state.processS)} while ${describeCircadianDrive(state.processC)}-day crew keeps vigilance high.`,
  drowsy: (state) => `Process S climbs to ${formatPercent(state.processS)} as ${describeCircadianDrive(state.processC)}; the switchboard starts blinking sleepy.`,
  n1: (state) => `Process S stays heavy at ${formatPercent(state.processS)} while ${describeCircadianDrive(state.processC)}; VLPO begins gating sensory flow.`,
  n2: (state) => `Process S remains high at ${formatPercent(state.processS)} and ${describeCircadianDrive(state.processC)}-spindles lock in quiet rehearsal.`,
  n3: (state) => `Process S tops out near ${formatPercent(state.processS)} while ${describeCircadianDrive(state.processC)}; cortex drops into delta restoration.`,
  rem: (state) => {
    const circadianPhrase = state.processC >= 0
      ? "circadian drive begins lifting toward daybreak"
      : describeCircadianDrive(state.processC);
    return `Process S eases to ${formatPercent(state.processS)} even as ${circadianPhrase}-REM runs the after-hours review.`;
  },
};

const systemsShiftSummaries: Record<SleepStage, string> = {
  wake: "Orexin, histamine, and locus coeruleus crews keep the board lit for active duty.",
  drowsy: "Adenosine builds and VLPO warms up while orexin circuits let go of the throttle.",
  n1: "Thalamic gatekeepers pulse spindles as VLPO begins taking sensory feeds offline.",
  n2: "VLPO holds command while spindles and hippocampal replay cycle paperwork quietly.",
  n3: "Slow-wave GABAergic teams lead; monoamine arousal systems stay clocked out.",
  rem: "REM-on cholinergic cells surge while LC and raphe stay mute; atonia circuits clamp the body.",
};

const networkSummaries: Record<SleepStage, string> = {
  wake: "Frontoparietal and salience networks coordinate outward attention and planning.",
  drowsy: "Default mode ramps while frontoparietal control eases back toward sleep transition.",
  n1: "Thalamocortical loops start synchronizing, tagging memories as sensory gates narrow.",
  n2: "Corticothalamic circuits spin up dense spindles, replaying hippocampal packets.",
  n3: "Cortex sweeps slow waves across networks; default mode quiets for deep maintenance.",
  rem: "Pontine-limbic loops ignite dream rehearsal while motor channels stay fully inhibited.",
};

const getProcessCardSummary = (state: TimelineState): string =>
  processCardSummaries[state.sleepStage]
    ? processCardSummaries[state.sleepStage](state)
    : "Process S and circadian drive recalibrate with each lap of the cycle.";

const getSystemsCardSummary = (state: TimelineState): string =>
  systemsShiftSummaries[state.sleepStage] ?? "Teams hand off control as the sleep stage shifts.";

const getNetworkCardSummary = (state: TimelineState): string =>
  networkSummaries[state.sleepStage] ?? "Networks adjust routing as the flip-flop circuit moves through the cycle.";


/**
 * Sleep Neurobiology Visual Narrative Page
 *
 * Simple, elegant educational presentation using the metaphor of a workplace "night shift"
 * to explain complex neuroscience concepts through scroll-driven animations.
 *
 * Features:
 * - Hero section with starfield background
 * - Sequential scroll-triggered visualizations
 * - GSAP-powered animations synchronized to narrative
 * - Simple scroll-driven progression
 * - Accessibility features and reduced motion support
 */
export default function SleepNeurobiologyPage() {
  const educationColor = "var(--color-fresh-green)";
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    handleResize();
    setIsClient(true);

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isClient) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="text-center space-y-4 px-6">
          <h1 className="text-section-title">Sleep Neurobiology</h1>
          <p className="text-body-large" style={{ opacity: 0.7 }}>
            Loading the interactive night shift narrative…
          </p>
        </div>
      </div>
    );
  }

  // Calculate responsive dimensions - optimized for new proportions
  const isLargeScreen = windowSize.width >= 1280;
  const isMobile = windowSize.width < 640;

  const baseWidth = windowSize.width || 1200;
  const baseHeight = windowSize.height || 800;

  const chartMargin = baseWidth >= 1600 ? 420 : baseWidth >= 1440 ? 340 : baseWidth >= 1200 ? 280 : baseWidth >= 992 ? 200 : 120;
  const processGraphWidth = Math.min(
    Math.max(baseWidth - chartMargin, 320),
    Math.max(baseWidth - 64, 320),
  );

  const processGraphHeight = (() => {
    if (baseHeight <= 0) {
      return isMobile ? 320 : 420;
    }
    if (baseHeight >= 900) {
      return Math.min(Math.max(baseHeight * 0.56, 460), 700);
    }
    if (baseHeight >= 700) {
      return Math.max(420, Math.min(baseHeight - 240, 620));
    }
    return isMobile ? 320 : 400;
  })();

  const brainNetworkHeight = (() => {
    if (baseHeight <= 0) {
      return isMobile ? 360 : 480;
    }
    if (baseHeight >= 900) {
      return Math.min(Math.max(baseHeight * 0.48, 520), 720);
    }
    if (baseHeight >= 700) {
      return Math.max(480, Math.min(baseHeight * 0.46, 640));
    }
    return isMobile ? 360 : 460;
  })();

  const brainNetworkWidth = isLargeScreen
    ? Math.min(Math.max(baseWidth * 0.54, 520), 880)
    : Math.min(processGraphWidth, Math.max(baseWidth - 56, 360));

  return (
    <div
      className="narrative-container min-h-screen relative"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Scroll Orchestrator for animations */}
      <ScrollOrchestrator />

      {/* Section Navigator */}
      <SectionNavigator />

      {/* Hero Section */}
      <section id="hero-section">
        <HeroSection />
      </section>

      {/* CLP 2025 Disclosure */}
      <motion.section
        className="relative py-12"
        style={{
          background: "linear-gradient(180deg, #0b1730 0%, #111f38 100%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <div className="content-container relative z-10">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              style={{
                background:
                  "linear-gradient(135deg, rgba(10, 18, 36, 0.72), rgba(17, 28, 52, 0.58))",
                border: "1px solid rgba(148, 163, 255, 0.25)",
                borderRadius: "24px",
                padding: "2rem",
                backdropFilter: "blur(18px)",
                boxShadow: "0 25px 60px rgba(4, 8, 20, 0.45)",
              }}
            >
              <h3
                className="text-xl font-bold mb-4 text-center"
                style={{ color: "white" }}
              >
                CLP 2025 Disclosure
              </h3>
              <p
                className="text-center font-semibold mb-4"
                style={{ color: "rgba(230, 233, 255, 0.9)" }}
              >
                Jon Sole, MD
              </p>
              <p
                className="text-sm leading-relaxed text-center"
                style={{ color: "rgba(230, 233, 255, 0.75)" }}
              >
                With respect to the following presentation, in the 24 months prior to this
                declaration there has been no financial relationship of any kind between the party
                listed above and any ACCME-defined ineligible company which could be considered a
                conflict of interest.
              </p>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Section 1: Timeline-driven Sleep Neurobiology */}
      <section id="section-1">
        <TimelineScrollOrchestrator className="relative">
          {(state) => {
          const processSummary = getProcessCardSummary(state);
          const systemsSummary = getSystemsCardSummary(state);
          const networkSummary = getNetworkCardSummary(state);
          return (
            <div className="w-full h-full flex flex-col">
            {/* Section title - consistent with Sections 2 & 3 */}
            <motion.header
              className="text-center mb-8 px-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-section-title mb-6">
                <span style={{ color: "var(--color-golden-yellow)" }}>The Wake Network</span> &{" "}
                <span style={{ color: "var(--color-golden-yellow)" }}>First Switch</span>
              </h2>
              <p
                className="text-body-large max-w-3xl mx-auto text-opacity-secondary"
                style={{ color: "var(--foreground)" }}
              >
                Homeostatic sleep pressure meets circadian gating. Watch Process S build and the VLPO switch flip.
              </p>
            </motion.header>

            <motion.div
              className="w-full px-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <div className="section-card-primary overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3
                        className="text-card-title mb-2"
                        style={{ color: "var(--foreground)" }}
                      >
                        Process S &amp; C · Two-Process Model
                      </h3>
                      <p
                        className="text-body-small text-opacity-muted"
                        style={{ color: "var(--foreground)" }}
                      >
                        {processSummary}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className="w-full flex items-center justify-center px-2 pb-6 sm:px-4 sm:pb-8"
                  style={{
                    background:
                      "linear-gradient(180deg, hsl(var(--background) / 0.92) 0%, hsl(var(--background) / 1) 100%)",
                  }}
                >
                  <ProcessGraph
                    width={processGraphWidth}
                    height={processGraphHeight}
                    currentTime={state.currentTime}
                    processS={state.processS}
                    processC={state.processC}
                    animated={true}
                    showCaffeine={false}
                  />
                </div>
              </div>
            </motion.div>

            <div className="w-full px-6 pb-12 mt-6">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.7fr)_minmax(520px,1.45fr)] gap-6 items-stretch">
                <motion.div
                  className="section-card-primary h-full flex flex-col overflow-hidden min-h-[360px] sm:min-h-[420px] xl:max-w-[500px] p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <div className="mb-4">
                    <h3
                      className="text-card-title mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      Systems on Shift
                    </h3>
                    <p
                      className="text-body-small text-opacity-muted"
                      style={{ color: "var(--foreground)" }}
                    >
                      {systemsSummary}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <NeurotransmitterPanel
                      currentTime={state.currentTime}
                      sleepStage={state.sleepStage}
                      processS={state.processS}
                      processC={state.processC}
                      className="h-full"
                    />
                  </div>
                </motion.div>

                <motion.div
                  className="section-card-primary h-full flex flex-col overflow-hidden min-h-[440px] sm:min-h-[520px] p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <div className="text-center mb-4">
                    <h3
                      className="text-card-title mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      Brain Network Activity
                    </h3>
                    <p
                      className="text-body-small text-opacity-muted"
                      style={{ color: "var(--foreground)" }}
                    >
                      {networkSummary}
                    </p>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <TimelineBrainNetwork
                      currentTime={state.currentTime}
                      sleepStage={state.sleepStage}
                      processS={state.processS}
                      processC={state.processC}
                      width={brainNetworkWidth}
                      height={brainNetworkHeight}
                    />
                  </div>
                </motion.div>
              </div>
            </div>

          </div>
          );
          }}
        </TimelineScrollOrchestrator>
      </section>

      {/* Section 2: NREM → REM Circuit */}
      <section id="section-2">
        <Section2Orchestrator />
      </section>

      {/* Section 3: Glymphatic Flow & Waste Clearance */}
      <section id="section-3">
        <Section3Orchestrator />
      </section>

      {/* Section 4: AI Integration & Wrap-Up */}
      <section id="section-4">
        <Section4Orchestrator />
      </section>

      {/* Footer Section */}
      <footer className="py-16" style={{ backgroundColor: "var(--card)" }}>
        <div className="content-container">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              viewport={{ once: true }}
            >
              <h2
                className="text-section-title mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Sleep as a{" "}
                <span style={{ color: educationColor }}>Second Shift</span>
              </h2>

              <p
                className="text-body-large mb-8 max-w-2xl mx-auto"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Understanding sleep through the metaphor of a workplace helps us
                appreciate the sophisticated biological processes that occur while
                we rest. Every night, your brain&apos;s &quot;second shift&quot; clocks in to
                maintain, repair, and optimize your neural networks.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/education/neuroscience">
                  <Button
                    size="lg"
                    leftSection={<BrainCircuit className="h-5 w-5" />}
                    styles={{
                      root: {
                        backgroundColor: educationColor,
                        color: "white",
                        borderRadius: "2rem",
                        fontSize: "1.125rem",
                        fontWeight: 600,
                        padding: "1rem 2rem",
                        border: "none",
                        "&:hover": {
                          backgroundColor: educationColor,
                          opacity: 0.9,
                          transform: "translateY(-2px)",
                        },
                      },
                    }}
                  >
                    Continue Learning
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </footer>
    </div>
  );
}
