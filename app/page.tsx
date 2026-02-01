// app/page.tsx

"use client";

import React from "react";
import { Button } from "@mantine/core";
import {
  ChevronRight,
  User,
  Microscope,
  GraduationCap,
  Network,
} from "lucide-react";
import { motion } from "framer-motion";

import FloatingCardArrow from "@/components/ui/floating-card-arrow";
import ScrollDownLottie from "@/components/animations/ScrollDownLottie";
import {
  ANIMATION_VARIANTS,
} from "@/lib/animation-utils";
import useScrollAnimation from "@/hooks/use-scroll-animation";


/**
 * SoleMD Landing Page
 *
 * Showcases the four pillars of the SoleMD platform using the new brand color system:
 * - Soft Blue: Primary brand identity (About/Synthesizer)
 * - Golden Yellow: Innovation & consulting
 * - Fresh Green: Education & learning
 * - Warm Coral: Engagement & contact
 *
 * Features minimalistic design with abundant white space, refined interactions,
 * and semantic color usage aligned with the SoleMD brand identity.
 */
export default function LandingPage() {
  const visibleElements = useScrollAnimation();

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Hero Section - Minimalistic with SoleMD brand colors */}
      <section
        className="relative flex items-center justify-center min-h-screen pt-32 pb-32"
        id="hero"
        data-animate
        style={{
          background: "var(--gradient-hero)",
        }}
      >
        <div className="hero-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, ease: "easeOut" }}
            className="space-y-6 sm:space-y-8 text-flow-natural"
          >
            <motion.h1
              className="text-hero-title"
              style={{
                color: "var(--foreground)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
            >
              Bridging Brain, Mind & Machine
            </motion.h1>
            <motion.p
              className="text-hero-subtitle text-opacity-secondary"
              style={{
                color: "var(--foreground)",
                maxWidth: "600px",
                margin: "0 auto",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
            >
              Where neuroscience, clinical care, and technology meet through
              elegant education and research.
            </motion.p>
          </motion.div>
        </div>
        <ScrollDownLottie />
      </section>

      {/* Platform Sections - Minimalistic cards with semantic SoleMD colors */}
      <section
        className="py-20"
        style={{ backgroundColor: "var(--background)" }}
        id="sections"
        data-animate
      >
        <div className="content-container">
          <motion.div
            className="mb-16 sm:mb-24 text-center text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("sections") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <h2 className="text-section-title mb-6">
              <span style={{ color: "var(--foreground)" }}>
                Explore Our Platform
              </span>
            </h2>
            <p
              className="text-body-large text-opacity-muted max-w-2xl mx-auto"
              style={{ color: "var(--foreground)" }}
            >
              Four interconnected pillars bridging neuroscience, clinical care,
              and technology.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16">
            {/* About Card - Soft Blue (Synthesizer/Primary Brand) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("sections") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            >
              <FloatingCardArrow
                href="/about"
                title="About"
                description="Meet the psychiatrist and neuroscientist bridging clinical medicine, systems innovation, and technology to transform mental health."
                icon={User}
                usePageColor={false}
                customIconColor="var(--color-soft-blue)"
              />
            </motion.div>

            {/* Research Card - Muted Indigo (Secondary Brand) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("sections") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <FloatingCardArrow
                href="/research"
                title="Research"
                description="Cutting-edge publications in computational psychiatry, neuroimaging AI, and digital mental health innovation."
                icon={Microscope}
                usePageColor={false}
                customIconColor="var(--color-warm-coral)"
              />
            </motion.div>

            {/* Education Card - Fresh Green (Education/Learning) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("sections") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            >
              <FloatingCardArrow
                href="/education"
                title="Education"
                description="Comprehensive learning modules for AI in psychiatry, computational neuroscience, and neuroimaging analysis."
                icon={GraduationCap}
                usePageColor={false}
                customIconColor="var(--color-fresh-green)"
              />
            </motion.div>

            {/* Knowledge Wiki Card - Golden Yellow (Innovation/External Link) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("sections") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            >
              <FloatingCardArrow
                href="https://publish.obsidian.md/solemd"
                title="Knowledge Wiki"
                description="Interactive knowledge graph connecting neuroscience concepts, psychiatric disorders, and evidence-based treatments."
                icon={Network}
                usePageColor={false}
                customIconColor="var(--color-golden-yellow)"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Call to Action - Refined with SoleMD brand colors */}
      <section
        className="py-20"
        style={{ backgroundColor: "var(--background)" }}
        id="cta"
        data-animate
      >
        <div className="centered-content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={visibleElements.has("cta") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, ease: "easeOut" }}
            className="space-y-6 text-flow-natural"
          >
            <h2 className="text-section-title mb-4">
              <span style={{ color: "var(--foreground)" }}>
                Ready to advance your neuroscience knowledge?
              </span>
            </h2>
            <p
              className="text-body-large text-opacity-muted mb-8 max-w-2xl mx-auto"
              style={{ color: "var(--foreground)" }}
            >
              Join mental health professionals and researchers exploring the
              future of computational psychiatry and AI-driven healthcare
              innovation.
            </p>

            {/* Refined CTA Button with SoleMD interaction patterns */}
            <motion.div {...ANIMATION_VARIANTS.buttonHover}>
              <Button
                size="lg"
                styles={{
                  root: {
                    backgroundColor: "var(--color-soft-blue)",
                    color: "white",
                    fontSize: "1rem",
                    fontWeight: 500,
                    padding: "0.75rem 2rem",
                    borderRadius: "1.5rem",
                    border: "none",
                    boxShadow: "0 2px 12px rgba(168, 197, 233, 0.15)",
                    transition: "all 200ms ease",
                    "&:hover": {
                      backgroundColor: "var(--color-accent-sky-blue)",
                      boxShadow: "0 4px 20px rgba(168, 197, 233, 0.25)",
                      transform: "none !important", // Prevent Mantine transform conflicts
                    },
                  },
                }}
              >
                Get Started Today
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
        <ScrollDownLottie />
      </section>
    </div>
  );
}
