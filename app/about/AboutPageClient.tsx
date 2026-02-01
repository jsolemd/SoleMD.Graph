// AboutPageClient.tsx
"use client"; // This is the most important line. It tells Next.js: "This is for the Client's Job."

import React from "react";
import Image from "next/image";
import { Card } from "@mantine/core";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  User,
  BookOpen,
  Sparkles,
  Award,
  Users,
  Globe,
} from "lucide-react";
import { getCurrentPageColor } from "@/lib/utils";
import FloatingCard from "@/components/ui/floating-card";
import {
  ANIMATION_VARIANTS,
  ENTRANCE_ANIMATION,
  createStaggeredEntrance,
} from "@/lib/animation-utils";
import useScrollAnimation from "@/hooks/use-scroll-animation";

// This component contains all the visual JSX and interactive elements.
export default function AboutPageClient() {
  const visibleElements = useScrollAnimation();
  const pathname = usePathname();

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      <main className="flex-1">
        {/* Hero Section */}
        <section
          className="flex items-center justify-center min-h-screen pt-32 pb-32"
          id="hero"
          data-animate
        >
          <div className="hero-container">
            <motion.div
              className="space-y-6 sm:space-y-8 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <motion.h1
                className="text-hero-title"
                style={{
                  color: "var(--foreground)",
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              >
                The{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Synthesizer
                </span>{" "}
                Behind SoleMD
              </motion.h1>
              <motion.p
                className="text-hero-subtitle text-opacity-secondary"
                style={{
                  color: "var(--foreground)",
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                Bridging neuroscience, clinical care, and technology to
                transform mental health education through AI-powered innovation.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Story Section */}
        <section className="section-spacing-standard" id="story" data-animate>
          <div className="content-container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={
                  visibleElements.has("story") ? { opacity: 1, x: 0 } : {}
                }
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <Image
                  src="/Jon Sole - Photo.png"
                  width={500}
                  height={500}
                  alt="Dr. SoleMD Portrait"
                  className="rounded-2xl shadow-2xl"
                />
              </motion.div>
              <motion.div
                className="space-y-6 text-flow-natural"
                initial={{ opacity: 0, x: 30 }}
                animate={
                  visibleElements.has("story") ? { opacity: 1, x: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <h2
                  className="text-section-title"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Bridging{" "}
                  <span style={{ color: getCurrentPageColor(pathname) }}>
                    AI & Psychiatry
                  </span>
                </h2>
                <div className="space-y-4">
                  <p
                    className="text-body-large text-opacity-secondary"
                    style={{
                      color: "var(--foreground)",
                    }}
                  >
                    My work as a psychiatrist centers on connection: basic
                    neuroscience to clinical practice, academic research to
                    community care, and emerging technology to medicine. At its
                    core, this work is about bringing together people from
                    diverse disciplines and perspectives to solve complex
                    problems defined by their deep interconnectedness.
                  </p>
                  <p
                    className="text-body-large text-opacity-secondary"
                    style={{
                      color: "var(--foreground)",
                    }}
                  >
                    I trained in molecular neuroscience at Johns Hopkins and
                    psychiatry at Stanford. I am now Chief of CL Psychiatry at
                    SCVMC, where I coordinate the multidisciplinary care for
                    medically complex patients with psychosocial
                    vulnerabilities. My academic work creates frameworks for
                    navigating clinical uncertainty by developing
                    mechanism-informed models in neuropsychiatry and exploring
                    generative AI’s role in clinical contexts through
                    collaborations with colleagues at Harvard/MGH.
                  </p>
                  <p
                    className="text-body-large text-opacity-secondary"
                    style={{
                      color: "var(--foreground)",
                    }}
                  >
                    I'm eager to collaborate with clinicians, builders,
                    learners, and system thinkers-whether in a community clinic,
                    an NIH-funded lab, or an industry Zoom meeting. Challenging
                    these silos is how we foster emergence. Tell me about your
                    models, your ambitions, and your frontiers. Let's explore
                    how we might build new, unexpected solutions together.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Professional Background Section */}
        <section
          className="section-spacing-standard"
          id="background"
          data-animate
        >
          <div className="content-container">
            <motion.div
              className="text-center mb-16 sm:mb-24 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("background") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-6"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Professional{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Background
                </span>
              </h2>
              <p
                className="text-body-large text-opacity-secondary max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground)",
                }}
              >
                A multidisciplinary approach to advancing mental health through
                technology and education.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 lg:gap-16">
              {/* Card 1 - Board Certified Psychiatrist */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("background") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              >
                <FloatingCard
                  title="Board Certified Psychiatrist"
                  description="Specialized training in adult psychiatry with focus on mood disorders and anxiety conditions."
                  icon={User}
                />
              </motion.div>

              {/* Card 2 - Neuroscience Researcher */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("background") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <FloatingCard
                  title="Neuroscience Researcher"
                  description="PhD in Computational Neuroscience with expertise in neuroimaging and machine learning applications."
                  icon={BookOpen}
                />
              </motion.div>

              {/* Card 3 - AI Healthcare Pioneer */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("background") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              >
                <FloatingCard
                  title="AI Healthcare Pioneer"
                  description="Leading research in AI applications for psychiatric diagnosis and treatment optimization."
                  icon={Sparkles}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Impact & Recognition Section */}
        <section className="section-spacing-standard" id="impact" data-animate>
          <div className="content-container">
            <motion.div
              className="text-center mb-16 sm:mb-24 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("impact") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-6"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Impact &{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Recognition
                </span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 lg:gap-16">
              {/* Stat 1 - Publications */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("impact") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Award className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-2xl font-bold mb-2"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  50+
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Peer-reviewed publications
                </p>
              </motion.div>

              {/* Stat 2 - Healthcare Professionals */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("impact") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-2xl font-bold mb-2"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  1000+
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Healthcare professionals trained
                </p>
              </motion.div>

              {/* Stat 3 - Countries Reached */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("impact") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Globe className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-2xl font-bold mb-2"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  25+
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Countries reached
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
