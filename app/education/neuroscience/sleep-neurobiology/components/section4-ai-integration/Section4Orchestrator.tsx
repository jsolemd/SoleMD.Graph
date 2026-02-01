"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Activity, Brain, Zap, CheckCircle, TrendingUp } from "lucide-react";

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: string;
  delay: number;
}

/**
 * Section4Orchestrator - Neurobiology Summary
 *
 * Final section featuring:
 * - Three-card summary (Day Shift Handoff, Night Workshop, Cleanup Pump)
 * - "Night shift" finale card with elegant metaphor
 * - Hero-like starfield aesthetic
 */
export default function Section4Orchestrator() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [stars, setStars] = useState<Star[]>([]);

  // Generate starfield background (similar to hero)
  useEffect(() => {
    setIsClient(true);
    const backgroundStars = generateBackgroundStars(200);
    const foregroundBursts = generateForegroundBursts(30);
    setStars([...backgroundStars, ...foregroundBursts]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isClient) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Fade in content on scroll
      gsap.from("#section4-content", {
        opacity: 0,
        y: 60,
        duration: 1.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#section4-content",
          start: "top 80%",
          end: "top 50%",
          toggleActions: "play none none none",
        },
      });

      // Animate summary cards - removed GSAP animation to prevent conflicts with framer-motion

      // Breathing animation for stars
      gsap.to(".section4-stars", {
        scale: 1.02,
        duration: 4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [isClient]);

  const generateBackgroundStars = (count: number): Star[] => {
    const stars: Star[] = [];
    const palette = ["#ffffff", "#c7d2fe", "#f5f3ff", "#fee2e2"];

    for (let i = 0; i < count; i++) {
      stars.push({
        id: 5000 + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.4 + 0.1,
        color: palette[Math.floor(Math.random() * palette.length)],
        delay: Math.random() * 6,
      });
    }

    return stars;
  };

  const generateForegroundBursts = (count: number): Star[] => {
    const bursts: Star[] = [];
    const palette = ["#fde68a", "#fcd34d", "#bfdbfe", "#ddd6fe"];

    for (let i = 0; i < count; i++) {
      bursts.push({
        id: 7000 + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 3 + Math.random() * 3,
        opacity: 0.6 + Math.random() * 0.3,
        color: palette[Math.floor(Math.random() * palette.length)],
        delay: Math.random() * 5,
      });
    }

    return bursts;
  };

  const summaryItems = [
    {
      title: "The Day Shift Handoff",
      description:
        "Process S builds adenosine pressure while Process C gates timing. VLPO switch flips–wake crew clocks out, sleep crew clocks in.",
      icon: <Zap className="h-6 w-6" />,
      color: "var(--color-golden-yellow)",
    },
    {
      title: "The Night Workshop",
      description:
        "NREM spindles wire memories. Slow waves sweep debris. REM theta rehearses scenarios. Three acts repeat 4-5 times per night.",
      icon: <Activity className="h-6 w-6" />,
      color: "var(--color-soft-blue)",
    },
    {
      title: "The Cleanup Pump",
      description:
        "Glymphatic flow peaks during deep NREM. NE oscillations drive vasomotion, flushing metabolic waste through perivascular channels.",
      icon: <TrendingUp className="h-6 w-6" />,
      color: "var(--color-soft-lavender)",
    },
  ];

  const summaryContainerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const summaryCardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: "easeOut" },
    },
  };

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen py-24"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(120, 140, 255, 0.20), transparent 50%)," +
          "radial-gradient(circle at 70% 80%, rgba(255, 210, 168, 0.15), transparent 55%)," +
          "linear-gradient(180deg, #040814 0%, #0b1730 50%, #111f38 100%)",
      }}
    >
      {/* Extended background overlay to cover any gaps */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, #040814 0%, #0b1730 50%, #111f38 100%)",
          top: "-400px",
          zIndex: -1,
        }}
      />
      {/* Gradient overlays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(82, 95, 201, 0.22), transparent 60%)",
          mixBlendMode: "screen",
          zIndex: 0,
        }}
      />

      {/* Starfield background */}
      <div
        className="section4-stars absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      >
        {isClient &&
          stars.map((star) => (
            <motion.div
              key={star.id}
              className="absolute rounded-full"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                backgroundColor: star.color,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 2}px ${star.color}44`,
              }}
              animate={{
                opacity: [star.opacity, star.opacity * 0.3, star.opacity],
                scale: [1, 1.08, 1],
              }}
              transition={{
                duration: 2.5 + star.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
      </div>

      {/* Content */}
      <div id="section4-content" className="content-container relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Section Title */}
          <motion.div
            className="text-center mb-24"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <h2
              className="text-6xl md:text-7xl lg:text-8xl font-bold mb-8"
              style={{ color: "white" }}
            >
              Pulling It{" "}
              <span className="bg-gradient-to-r from-purple-300 via-blue-200 to-indigo-300 bg-clip-text text-transparent">
                Together
              </span>
            </h2>
            <p
              className="text-body-large max-w-4xl mx-auto mb-16"
              style={{ color: "rgba(230, 233, 255, 0.78)" }}
            >
              Two switches hand power back and forth. Three acts sculpt NREM and
              REM. One pump cleans the brain while we sleep.
            </p>

            {/* Night Sky Visual */}
            <motion.div
              className="relative max-w-4xl mx-auto h-80 mb-8"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.3 }}
              viewport={{ once: true }}
            >
              {/* Moon */}
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                animate={{
                  y: [-8, 8, -8],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <svg width="220" height="220" viewBox="0 0 180 180" fill="none">
                  {/* Crescent Moon */}
                  <defs>
                    <radialGradient id="section4MoonGlow">
                      <stop offset="0%" stopColor="#fef3c7" stopOpacity={0.8} />
                      <stop
                        offset="50%"
                        stopColor="#fde68a"
                        stopOpacity={0.4}
                      />
                      <stop offset="100%" stopColor="#fcd34d" stopOpacity={0} />
                    </radialGradient>
                  </defs>

                  {/* Moon glow */}
                  <circle
                    cx={90}
                    cy={90}
                    r={70}
                    fill="url(#section4MoonGlow)"
                    opacity={0.3}
                  />

                  {/* Moon body - crescent shape */}
                  <circle cx={90} cy={90} r={50} fill="#fef3c7" />
                  <circle cx={105} cy={85} r={45} fill="#0b1730" />

                  {/* Subtle craters */}
                  <circle cx={75} cy={80} r={8} fill="#fde68a" opacity={0.3} />
                  <circle cx={85} cy={105} r={6} fill="#fde68a" opacity={0.2} />
                  <circle
                    cx={70}
                    cy={100}
                    r={5}
                    fill="#fde68a"
                    opacity={0.25}
                  />
                </svg>
              </motion.div>

              {/* Floating stars around moon - multiple rings */}
              {isClient && [...Array(24)].map((_, i) => {
                const ring = Math.floor(i / 12);
                const angleOffset = ring * 0.26; // Offset each ring
                const angle = (i / 12) * Math.PI * 2 + angleOffset;
                const radiusBase = ring === 0 ? 160 : 220;
                const x = 50 + (Math.cos(angle) * radiusBase) / 4;
                const y = 50 + (Math.sin(angle) * radiusBase) / 4;
                const starSize = ring === 0 ? 2 : 2.5;

                return (
                  <motion.div
                    key={`moon-star-${i}`}
                    className="absolute"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                    }}
                    animate={{
                      opacity: [0.3, 0.7, 0.3],
                      scale: [1, 1.3, 1],
                    }}
                    transition={{
                      duration: 2 + i * 0.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.15,
                    }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: `${starSize}px`,
                        height: `${starSize}px`,
                        backgroundColor: "#fef3c7",
                        boxShadow: "0 0 8px #fef3c7",
                      }}
                    />
                  </motion.div>
                );
              })}

              {/* Additional scattered stars - client-side only */}
              {isClient &&
                [...Array(30)].map((_, i) => {
                  // Generate deterministic values based on index to avoid hydration issues
                  const x = (i * 37) % 100;
                  const y = (i * 53) % 100;
                  const size = 1 + ((i * 17) % 15) / 10;
                  const duration = 3 + ((i * 11) % 20) / 10;
                  const delay = ((i * 23) % 30) / 10;

                  return (
                    <motion.div
                      key={`scattered-star-${i}`}
                      className="absolute"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                      }}
                      animate={{
                        opacity: [0.2, 0.5, 0.2],
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: duration,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: delay,
                      }}
                    >
                      <div
                        className="rounded-full"
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          backgroundColor: "#ffffff",
                          boxShadow: "0 0 4px #ffffff",
                        }}
                      />
                    </motion.div>
                  );
                })}

              {/* Drifting clouds */}
              <motion.div
                className="absolute left-0 top-12 w-24 h-10 rounded-full opacity-10"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #c7d2fe, transparent)",
                  filter: "blur(8px)",
                }}
                animate={{
                  x: ["0%", "300%"],
                }}
                transition={{
                  duration: 30,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
              <motion.div
                className="absolute right-0 top-24 w-28 h-12 rounded-full opacity-10"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #ddd6fe, transparent)",
                  filter: "blur(10px)",
                }}
                animate={{
                  x: ["100%", "-200%"],
                }}
                transition={{
                  duration: 40,
                  repeat: Infinity,
                  ease: "linear",
                  delay: 5,
                }}
              />
            </motion.div>
          </motion.div>

          {/* Summary Cards */}
          <motion.div
            className="summary-cards-container grid md:grid-cols-3 gap-8 mb-24 max-w-6xl mx-auto mt-48"
            variants={summaryContainerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
          >
            {summaryItems.map((item) => (
              <motion.div
                key={item.title}
                className="summary-card"
                variants={summaryCardVariants}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(10, 18, 36, 0.72), rgba(17, 28, 52, 0.58))",
                  border: "1px solid rgba(148, 163, 255, 0.25)",
                  borderRadius: "28px",
                  padding: "2.5rem",
                  backdropFilter: "blur(18px)",
                  boxShadow: "0 35px 80px rgba(4, 8, 20, 0.55)",
                }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    backgroundColor: `${item.color}18`,
                    border: `2px solid ${item.color}35`,
                    boxShadow: `0 8px 24px ${item.color}15`,
                  }}
                >
                  <div style={{ color: item.color }}>{item.icon}</div>
                </div>
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ color: "white" }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-body-small leading-relaxed"
                  style={{ color: "rgba(230, 233, 255, 0.75)" }}
                >
                  {item.description}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Finale Card */}
          <motion.div
            id="finale-card"
            className="max-w-4xl mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            viewport={{ once: true }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(10, 18, 36, 0.75), rgba(17, 28, 52, 0.60))",
                border: "1px solid rgba(148, 163, 255, 0.30)",
                borderRadius: "32px",
                padding: "3rem",
                backdropFilter: "blur(20px)",
                boxShadow: "0 35px 80px rgba(4, 8, 20, 0.5)",
              }}
            >
              <div className="flex items-center justify-center gap-3 mb-6">
                <Brain
                  className="h-8 w-8"
                  style={{ color: "var(--color-fresh-green)" }}
                />
                <h3 className="text-2xl font-bold" style={{ color: "white" }}>
                  The Night Shift
                </h3>
              </div>
              <p
                className="text-body-large text-center mb-6"
                style={{ color: "rgba(230, 233, 255, 0.85)" }}
              >
                Every night, your brain's second shift clocks in–switches,
                cycles, and pumps working seamlessly. Just elegant biology,
                evolved over millions of years.
              </p>
              <div className="flex items-center justify-center gap-2 mb-8">
                <CheckCircle
                  className="h-5 w-5"
                  style={{ color: "var(--color-fresh-green)" }}
                />
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-fresh-green)" }}
                >
                  Homeostatic Pressure • Circadian Timing • Neural Maintenance
                </p>
              </div>

              {/* Divider */}
              <div
                className="w-full h-px mb-6"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(148, 163, 255, 0.3), transparent)",
                }}
              />

              {/* Contact Information */}
              <div className="text-center space-y-2">
                <p className="text-lg font-bold" style={{ color: "white" }}>
                  Jon Sole, MD
                </p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <a
                    href="https://www.solemd.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline transition-colors"
                    style={{ color: "var(--color-fresh-green)" }}
                  >
                    www.solemd.org
                  </a>
                  <span style={{ color: "rgba(148, 163, 255, 0.5)" }}>•</span>
                  <a
                    href="mailto:jon@solemd.org"
                    className="hover:underline transition-colors"
                    style={{ color: "var(--color-fresh-green)" }}
                  >
                    jon@solemd.org
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
