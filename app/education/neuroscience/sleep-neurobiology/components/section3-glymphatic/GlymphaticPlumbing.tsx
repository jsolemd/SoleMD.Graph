"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { Droplets, RotateCcw, Trash2, Heart, Waves } from "lucide-react";

/**
 * GlymphaticPlumbing Component
 *
 * Visualizes the glymphatic system as the brain's plumbing network
 * with CSF flow, waste removal, and norepinephrine oscillations.
 *
 * Features:
 * - Animated CSF flow patterns
 * - Waste clearance visualization
 * - NE oscillation-driven pump
 * - Interactive flow rate controls
 */
export default function GlymphaticPlumbing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plumbingState, setPLumbingState] = useState({
    pumpActive: true,
    flowRate: 75,
    wasteLevel: 60,
    neOscillation: true,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ctx = gsap.context(() => {
      // Pump animation (NE oscillation-driven)
      if (plumbingState.pumpActive && plumbingState.neOscillation) {
        gsap.to("#glymphatic-pump", {
          scale: [1, 1.1, 1],
          duration: 3, // ~50-second cycle simplified to 3s for demo
          ease: "sine.inOut",
          repeat: -1,
        });
      }

      // CSF flow animation
      gsap.to(".csf-particle", {
        x: "400%",
        opacity: [1, 0.8, 0],
        duration: 4,
        ease: "power2.out",
        stagger: 0.3,
        repeat: -1,
      });

      // Waste clearance animation
      if (plumbingState.wasteLevel > 50) {
        gsap.to(".waste-particle", {
          y: -100,
          x: 50,
          opacity: [1, 0.5, 0],
          duration: 3,
          ease: "power2.out",
          stagger: 0.2,
          repeat: -1,
        });
      }

      // NE oscillation wave
      gsap.to("#ne-wave", {
        x: "100%",
        duration: 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      // Flow rate gauge animation
      gsap.to("#flow-gauge", {
        rotation: (plumbingState.flowRate / 100) * 180 - 90,
        duration: 1,
        ease: "power2.out",
      });

    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [plumbingState]);

  // Simulate waste accumulation/clearance
  useEffect(() => {
    const interval = setInterval(() => {
      setPLumbingState(prev => ({
        ...prev,
        wasteLevel: prev.pumpActive
          ? Math.max(20, prev.wasteLevel - 2)
          : Math.min(100, prev.wasteLevel + 1),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const adjustFlowRate = (delta: number) => {
    setPLumbingState(prev => ({
      ...prev,
      flowRate: Math.max(0, Math.min(100, prev.flowRate + delta)),
    }));
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex items-center justify-center relative"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div id="glymphatic-content" className="opacity-0 translate-y-10">
        <div className="content-container">
          <div className="max-w-6xl mx-auto">
            {/* Section Title */}
            <motion.div
              className="text-center mb-16"
              data-animate
            >
              <h2
                className="text-section-title mb-6"
                style={{ color: "var(--foreground)" }}
              >
                The Glymphatic{" "}
                <span style={{ color: "var(--color-accent-sky-blue)" }}>
                  Plumbing System
                </span>
              </h2>
              <p
                className="text-body-large max-w-3xl mx-auto"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Your brain's dedicated cleaning crew works through a sophisticated
                plumbing network. CSF flows through tissue spaces, carrying away
                metabolic waste like amyloid-β. Norepinephrine oscillations drive
                this pump every ~50 seconds during deep sleep.
              </p>
            </motion.div>

            {/* Main Plumbing Visualization */}
            <div className="grid lg:grid-cols-2 gap-12 mb-16">
              {/* Pump and Flow Control */}
              <motion.div
                className="relative"
                data-animate
              >
                <div
                  className="floating-card p-8"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  <h3
                    className="text-xl font-semibold mb-6 text-center"
                    style={{ color: "var(--foreground)" }}
                  >
                    NE-Driven Pump
                  </h3>

                  {/* Central Pump Visualization */}
                  <div className="relative h-64 mb-6 flex items-center justify-center">
                    {/* Pump core */}
                    <div
                      id="glymphatic-pump"
                      className={`w-24 h-24 rounded-full flex items-center justify-center relative ${
                        plumbingState.pumpActive ? 'animate-pulse' : ''
                      }`}
                      style={{
                        backgroundColor: plumbingState.pumpActive
                          ? "var(--color-accent-sky-blue)"
                          : "var(--color-gray)",
                        boxShadow: plumbingState.pumpActive
                          ? "0 0 30px rgba(168, 197, 233, 0.5)"
                          : "none",
                      }}
                    >
                      <Heart className="h-12 w-12 text-white" />
                    </div>

                    {/* CSF flow pipes */}
                    <div className="absolute inset-0">
                      {/* Inlet pipe */}
                      <div
                        className="absolute left-4 top-1/2 w-16 h-4 rounded-l-full transform -translate-y-1/2"
                        style={{ backgroundColor: "var(--color-accent-sky-blue)", opacity: 0.6 }}
                      >
                        {/* CSF particles flowing in */}
                        <div className="relative h-full overflow-hidden">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className="csf-particle absolute w-2 h-2 rounded-full top-1/2 transform -translate-y-1/2"
                              style={{
                                backgroundColor: "var(--color-accent-sky-blue)",
                                left: `${-10 + i * 15}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Outlet pipe */}
                      <div
                        className="absolute right-4 top-1/2 w-16 h-4 rounded-r-full transform -translate-y-1/2"
                        style={{ backgroundColor: "var(--color-accent-sky-blue)", opacity: 0.6 }}
                      >
                        {/* CSF particles flowing out */}
                        <div className="relative h-full overflow-hidden">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className="csf-particle absolute w-2 h-2 rounded-full top-1/2 transform -translate-y-1/2"
                              style={{
                                backgroundColor: "var(--color-accent-sky-blue)",
                                left: `${10 + i * 25}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Waste outlet (top) */}
                      <div
                        className="absolute top-4 left-1/2 w-4 h-16 rounded-t-full transform -translate-x-1/2"
                        style={{ backgroundColor: "var(--color-gray)", opacity: 0.6 }}
                      >
                        {/* Waste particles */}
                        <div className="relative w-full h-full overflow-hidden">
                          {[...Array(3)].map((_, i) => (
                            <div
                              key={i}
                              className="waste-particle absolute w-1.5 h-1.5 rounded-full left-1/2 transform -translate-x-1/2"
                              style={{
                                backgroundColor: "var(--color-gray)",
                                top: `${80 - i * 30}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NE Oscillation Pattern */}
                  <div className="mb-6">
                    <h4
                      className="text-sm font-semibold mb-3"
                      style={{ color: "var(--foreground)" }}
                    >
                      Norepinephrine Oscillation (50s cycle)
                    </h4>
                    <div className="h-12 bg-gray-100 rounded-lg relative overflow-hidden">
                      <svg className="w-full h-full" viewBox="0 0 400 48">
                        <path
                          id="ne-wave"
                          d="M0,24 Q50,8 100,24 Q150,40 200,24 Q250,8 300,24 Q350,40 400,24"
                          fill="none"
                          stroke="var(--color-accent-purple)"
                          strokeWidth="3"
                          opacity="0.8"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Flow Rate Controls */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => adjustFlowRate(-10)}
                      className="px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
                      style={{
                        backgroundColor: "var(--color-accent-rose-red)",
                        color: "white",
                      }}
                    >
                      Slow Flow
                    </button>

                    <div className="text-center">
                      <div
                        className="text-2xl font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {plumbingState.flowRate}%
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        Flow Rate
                      </div>
                    </div>

                    <button
                      onClick={() => adjustFlowRate(10)}
                      className="px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
                      style={{
                        backgroundColor: "var(--color-fresh-green)",
                        color: "white",
                      }}
                    >
                      Boost Flow
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Waste Management Panel */}
              <motion.div
                className="relative"
                data-animate
              >
                <div
                  className="floating-card p-8"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  <h3
                    className="text-xl font-semibold mb-6 text-center"
                    style={{ color: "var(--foreground)" }}
                  >
                    Waste Clearance System
                  </h3>

                  {/* Waste Level Gauge */}
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="8"
                      />
                      {/* Waste level circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={plumbingState.wasteLevel > 80 ? "var(--color-accent-rose-red)" : "var(--color-gray)"}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(plumbingState.wasteLevel / 100) * 251.2} 251.2`}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>

                    {/* Center content */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Trash2
                          className="h-6 w-6 mx-auto mb-1"
                          style={{
                            color: plumbingState.wasteLevel > 80
                              ? "var(--color-accent-rose-red)"
                              : "var(--color-gray)"
                          }}
                        />
                        <span
                          className="text-lg font-bold"
                          style={{ color: "var(--foreground)" }}
                        >
                          {plumbingState.wasteLevel}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Waste Types */}
                  <div className="space-y-3 mb-6">
                    {[
                      { name: "Amyloid-β", level: 70, color: "var(--color-accent-purple)" },
                      { name: "Tau proteins", level: 45, color: "var(--color-accent-rose-red)" },
                      { name: "Metabolites", level: 60, color: "var(--color-gray)" },
                    ].map((waste, index) => (
                      <div key={waste.name} className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: waste.color }}
                        />
                        <span
                          className="text-sm flex-1"
                          style={{ color: "var(--foreground)" }}
                        >
                          {waste.name}
                        </span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: waste.color }}
                            initial={{ width: "0%" }}
                            animate={{ width: `${waste.level}%` }}
                            transition={{ duration: 1, delay: index * 0.2 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Clearance Status */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <RotateCcw
                        className={`h-5 w-5 ${plumbingState.pumpActive ? 'animate-spin' : ''}`}
                        style={{ color: "var(--color-accent-sky-blue)" }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        {plumbingState.pumpActive ? "Active Clearance" : "Clearance Paused"}
                      </span>
                    </div>
                    <p
                      className="text-xs"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Waste clearance increases 60% during deep sleep
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Educational Summary */}
            <motion.div
              className="text-center max-w-4xl mx-auto"
              data-animate
            >
              <div
                className="floating-card p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h4
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--foreground)" }}
                >
                  The Brain's Night Janitors
                </h4>
                <p
                  className="text-body-small"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  The glymphatic system is like a nighttime cleaning crew that becomes 60% more
                  efficient during deep sleep. Astrocytes shrink, creating wider pathways for
                  CSF to flush out toxins. This process is crucial for preventing neurodegenerative
                  diseases and maintaining cognitive health.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}