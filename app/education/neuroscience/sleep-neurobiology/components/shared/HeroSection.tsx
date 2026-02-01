"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Stars } from "lucide-react";

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  color?: string;
  isBrainStar?: boolean;
  isBrainCluster?: boolean;
  delay: number;
}

/**
 * HeroSection Component
 *
 * Simple, elegant hero with dark night sky and brain constellation.
 * Features stars arranged to form a subtle brain silhouette.
 */
export default function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [stars, setStars] = useState<Star[]>([]);

  // Ensure client-side only rendering for stars to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
    const brainStars = generateBrainConstellation();
    const backgroundStars = generateBackgroundStars(180);
    const foregroundBursts = generateForegroundBursts(24);
    const brainClusterStars = generateBrainClusterStars();
    setStars([
      ...backgroundStars,
      ...foregroundBursts,
      ...brainClusterStars,
      ...brainStars,
    ]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isClient) return;

    // Register GSAP plugins
    gsap.registerPlugin(ScrollTrigger);

    // GSAP context for brain constellation breathing animation only
    const ctx = gsap.context(() => {
      // Breathing animation for brain constellation
      gsap.to(".brain-constellation", {
        scale: 1.02,
        duration: 4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, heroRef);

    return () => {
      ctx.revert();
    };
  }, []);

  // Generate brain constellation - elegant and minimal
  const generateBrainConstellation = (): Star[] => {
    const brainStars: Star[] = [];
    let id = 0;

    // Simple, elegant brain constellation - like a real constellation in the sky
    const brainConstellation = [
      // Frontal "cortex" - key anchor stars
      { x: 25, y: 35, size: 4, name: "frontal" },
      { x: 30, y: 30, size: 3 },
      { x: 35, y: 25, size: 3 },

      // Top of head curve - the "crown"
      { x: 42, y: 20, size: 3 },
      { x: 50, y: 18, size: 5, name: "crown" }, // Brightest star
      { x: 58, y: 20, size: 3 },

      // Back of head
      { x: 65, y: 25, size: 3 },
      { x: 70, y: 30, size: 3 },
      { x: 75, y: 38, size: 4, name: "occipital" },

      // Down to cerebellum
      { x: 72, y: 48, size: 3 },
      { x: 68, y: 58, size: 3 },
      { x: 62, y: 65, size: 4, name: "cerebellum" },

      // Brainstem - sleep control center
      { x: 55, y: 70, size: 4, color: "#a78bfa", name: "brainstem" },
      { x: 48, y: 72, size: 3, color: "#a78bfa" },

      // Temporal curve back up
      { x: 40, y: 68, size: 3 },
      { x: 32, y: 62, size: 3 },
      { x: 26, y: 55, size: 3 },
      { x: 22, y: 45, size: 4, name: "temporal" },

      // Complete the circuit back to frontal
      { x: 23, y: 40, size: 3 },
    ];

    // Add constellation stars
    brainConstellation.forEach(point => {
      brainStars.push({
        id: id++,
        x: point.x,
        y: point.y,
        size: point.size,
        opacity: 0.8 + Math.random() * 0.2,
        color: point.color || "#ffffff",
        isBrainStar: true,
        delay: Math.random() * 3,
      });
    });

    return brainStars;
  };

  // Generate background stars
  const generateBackgroundStars = (count: number): Star[] => {
    const backgroundStars: Star[] = [];

    for (let i = 0; i < count; i++) {
      const palette = ["#ffffff", "#c7d2fe", "#f5f3ff", "#fee2e2"];
      const color = palette[Math.floor(Math.random() * palette.length)];
      const baseOpacity = Math.random() * 0.35 + 0.15;

      backgroundStars.push({
        id: 1000 + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        opacity: baseOpacity,
        color,
        isBrainStar: false,
        delay: Math.random() * 6,
      });
    }

    return backgroundStars;
  };

  const generateForegroundBursts = (count: number): Star[] => {
    const bursts: Star[] = [];
    let id = 4000;

    for (let i = 0; i < count; i++) {
      const palette = ["#fde68a", "#fcd34d", "#bfdbfe", "#ddd6fe"];
      const color = palette[Math.floor(Math.random() * palette.length)];

      bursts.push({
        id: id++,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 3 + Math.random() * 3,
        opacity: 0.65 + Math.random() * 0.25,
        color,
        isBrainStar: false,
        delay: Math.random() * 5,
      });
    }

    return bursts;
  };

  const generateBrainClusterStars = (): Star[] => {
    const stars: Star[] = [];
    let id = 6000;
    const width = 38;
    const height = 30;
    const centerX = 49;
    const centerY = 47;
    const palette = ["#fef3c7", "#fde68a", "#c7d2fe", "#e9d5ff"];

    for (let i = 0; i < 120; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random();
      const scaledRadius = Math.sqrt(radius);
      const offsetX = Math.cos(angle) * scaledRadius * (width / 2);
      const offsetY = Math.sin(angle) * scaledRadius * (height / 2);

      const x = centerX + offsetX;
      const y = centerY + offsetY * 0.95;

      if (x < 5 || x > 95 || y < 10 || y > 90) continue;

      stars.push({
        id: id++,
        x,
        y,
        size: 1.4 + Math.random() * 1.6,
        opacity: 0.55 + Math.random() * 0.3,
        color: palette[Math.floor(Math.random() * palette.length)],
        isBrainCluster: true,
        delay: Math.random() * 3,
      });
    }

    return stars;
  };

  // Stars are now managed by state to prevent hydration mismatch

  return (
    <section
      ref={heroRef}
      id="hero"
      className="relative flex items-center justify-center min-h-screen pt-32 pb-32"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(120, 140, 255, 0.24), transparent 45%)," +
          "radial-gradient(circle at 70% 25%, rgba(255, 210, 168, 0.18), transparent 50%)," +
          "linear-gradient(180deg, #040814 0%, #0b1730 55%, #111f38 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 48% 38%, rgba(82, 95, 201, 0.25), transparent 55%)," +
            "radial-gradient(circle at 60% 60%, rgba(19, 32, 73, 0.45), transparent 70%)",
          mixBlendMode: "screen",
          zIndex: 0,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 70%, rgba(255, 195, 135, 0.12), transparent 60%)," +
            "radial-gradient(circle at 85% 80%, rgba(148, 163, 255, 0.16), transparent 65%)",
          filter: "blur(20px)",
          opacity: 0.9,
          mixBlendMode: "screen",
          zIndex: 0,
        }}
      />

      {/* Brain Constellation Background */}
      <div className="brain-constellation absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {/* Stars - Client-side only to prevent hydration mismatch */}
        {isClient && stars.map((star) => (
          <motion.div
            key={star.id}
            className={`absolute rounded-full ${star.isBrainStar ? 'brain-stars' : ''}`}
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: star.isBrainStar
                ? `0 0 ${star.size * 3}px ${star.color}66`
                : star.isBrainCluster
                ? `0 0 ${star.size * 3.5}px ${star.color}55`
                : `0 0 ${star.size * 2}px ${star.color}44`,
              zIndex: star.isBrainStar ? 3 : star.isBrainCluster ? 2.5 : 2,
            }}
            animate={{
              opacity: [star.opacity, star.opacity * 0.3, star.opacity],
              scale: star.isBrainStar ? [1, 1.12, 1] : [1, 1.06, 1],
            }}
            transition={{
              duration: 2.5 + star.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Hero Content - Standard SoleMD Structure */}
      <div className="hero-container relative z-30">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="space-y-6 sm:space-y-8 text-flow-natural"
          style={{
            background:
              "linear-gradient(135deg, rgba(10, 18, 36, 0.72), rgba(17, 28, 52, 0.58))",
            border: "1px solid rgba(148, 163, 255, 0.25)",
            boxShadow: "0 35px 80px rgba(4, 8, 20, 0.55)",
            backdropFilter: "blur(18px)",
            borderRadius: "32px",
            padding: "2.5rem",
            maxWidth: "720px",
            margin: "0 auto",
          }}
        >
          <motion.h1
            id="hero-title"
            className="text-hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
          >
            <span className="bg-gradient-to-r from-purple-300 via-blue-200 to-indigo-300 bg-clip-text text-transparent">
              Sleep Neurobiology
            </span>
          </motion.h1>
          <motion.p
            id="hero-subtitle"
            className="text-hero-subtitle text-opacity-secondary"
            style={{
              color: "white",
              maxWidth: "560px",
              margin: "0 auto",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
          >
            While You Dream, The Second Shift Clocks In
          </motion.p>
          <motion.p
            className="text-body-large"
            style={{
              color: "rgba(230, 233, 255, 0.78)",
              margin: "0 auto",
              maxWidth: "540px",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          >
            Follow the night crew as it takes the handoff from wake: the two flip-flop
            switches, the clocks that bias them, and the circuits that keep NREM and REM on
            schedule.
          </motion.p>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20"
        animate={{
          y: [0, 10, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-sm font-medium text-white"
            style={{ opacity: 0.6 }}
          >
            Scroll to explore
          </span>
          <Stars className="h-5 w-5 text-white" style={{ opacity: 0.6 }} />
        </div>
      </motion.div>
    </section>
  );
}
