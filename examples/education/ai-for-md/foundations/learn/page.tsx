"use client";

import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import useScrollAnimation from "@/hooks/use-scroll-animation";

/**
 * AI for MD Foundations Learning App Entry Point
 *
 * This is the main entry point for the interactive learning experience.
 * It will be enhanced with the full webapp functionality in subsequent tasks.
 *
 * Features:
 * - Entry point for interactive learning module
 * - Placeholder for webapp integration
 * - Consistent with SoleMD design system
 * - Education theme (Fresh Green) integration
 */
export default function AIForMDFoundationsLearnPage() {
  const visibleElements = useScrollAnimation();
  const educationColor = "var(--color-fresh-green)";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Learning App Container */}
      <section className="pt-24 pb-20" id="learn-app" data-animate>
        <div className="content-container">
          <motion.div
            className="text-center max-w-4xl mx-auto text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("learn-app") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            {/* App Header */}
            <div className="mb-12">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                style={{
                  backgroundColor: educationColor,
                }}
              >
                <BrainCircuit className="h-10 w-10 text-white" />
              </div>

              <h1
                className="text-hero-title mb-4"
                style={{ color: "var(--foreground)" }}
              >
                AI for MD{" "}
                <span style={{ color: educationColor }}>Foundations</span>
              </h1>

              <p
                className="text-hero-subtitle"
                style={{ color: "var(--foreground)", opacity: 0.8 }}
              >
                Interactive Learning Experience
              </p>
            </div>

            {/* Placeholder Content */}
            <motion.div
              className="floating-card p-12"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("learn-app") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-6"
                style={{ color: "var(--foreground)" }}
              >
                Learning Module Loading...
              </h2>

              <p
                className="text-body-large mb-8"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                The interactive AI for MD Foundations webapp will be integrated
                here. This page serves as the entry point for the comprehensive
                learning experience.
              </p>

              <div
                className="text-body-small"
                style={{ color: educationColor }}
              >
                Module integration in progress...
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
