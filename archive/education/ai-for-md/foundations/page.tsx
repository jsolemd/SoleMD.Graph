"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@mantine/core";
import {
  ArrowLeft,
  BrainCircuit,
  Play,
  BookOpen,
  Users,
  Clock,
  CheckCircle,
} from "lucide-react";
import useScrollAnimation from "@/hooks/use-scroll-animation";

/**
 * AI for MD Foundations Module Page Component
 *
 * Features:
 * - Subpage module structure (not a landing page)
 * - Compact header with breadcrumb navigation
 * - Education page theme (Fresh Green)
 * - Focused content layout for course modules
 * - Uses floating card system
 * - Theme-aware styling with CSS variables
 * - Responsive design optimized for learning content
 */
export default function AIForMDFoundationsPage() {
  const visibleElements = useScrollAnimation();

  // Use education color directly since this is under /education
  const educationColor = "var(--color-fresh-green)";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Module Header with Prominent Navigation */}
      <section className="pt-24 pb-16" id="header" data-animate>
        <div className="content-container">
          <motion.div
            className="text-flow-natural"
            initial={{ opacity: 0, y: 20 }}
            animate={visibleElements.has("header") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Proper Navigation Hierarchy */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Link href="/education/ai-for-md">
                  <Button
                    size="md"
                    leftSection={<ArrowLeft className="h-4 w-4" />}
                    styles={{
                      root: {
                        backgroundColor: educationColor,
                        color: "white",
                        borderRadius: "2rem",
                        fontWeight: 600,
                        padding: "0.75rem 1.5rem",
                        border: "none",
                        "&:hover": {
                          backgroundColor: educationColor,
                          opacity: 0.9,
                          transform: "translateY(-1px)",
                        },
                      },
                    }}
                  >
                    Back to AI for MD
                  </Button>
                </Link>
              </div>

              {/* Breadcrumb Trail */}
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/education"
                  className="hover:underline"
                  style={{ color: educationColor }}
                >
                  Education
                </Link>
                <span style={{ color: "var(--foreground)", opacity: 0.5 }}>
                  /
                </span>
                <Link
                  href="/education/ai-for-md"
                  className="hover:underline"
                  style={{ color: educationColor }}
                >
                  AI for MD
                </Link>
                <span style={{ color: "var(--foreground)", opacity: 0.5 }}>
                  /
                </span>
                <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                  Foundations Module
                </span>
              </div>
            </div>

            {/* Module Badge & Title Section */}
            <div className="mb-6">
              <div
                className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl mb-6"
                style={{
                  backgroundColor: `${educationColor}15`,
                  border: `1px solid ${educationColor}30`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <BrainCircuit className="h-3.5 w-3.5 text-white" />
                </div>
                <span
                  className="text-base font-semibold"
                  style={{ color: educationColor }}
                >
                  AI for MD Series
                </span>
              </div>

              {/* Module Title */}
              <h1
                className="text-section-title mb-4"
                style={{ color: "var(--foreground)" }}
              >
                Foundations{" "}
                <span style={{ color: educationColor }}>Module</span>
              </h1>

              {/* Module Description */}
              <p
                className="text-body-large max-w-4xl"
                style={{ color: "var(--foreground)", opacity: 0.8 }}
              >
                The first module in the AI for MD series. Master the
                fundamentals of artificial intelligence in healthcare and learn
                how to leverage AI tools to enhance your clinical practice. This
                comprehensive module provides the essential foundation for
                understanding AI applications in modern medicine.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Module Content */}
      <section className="pb-20" id="content" data-animate>
        <div className="content-container">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-start">
            {/* Left Column - Course Overview */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={
                visibleElements.has("content") ? { opacity: 1, x: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="text-flow-natural">
                <h2
                  className="text-section-title mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  Foundations{" "}
                  <span style={{ color: educationColor }}>Overview</span>
                </h2>

                <div
                  className="space-y-4 text-body-large mb-8"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  <p>
                    This foundational module introduces healthcare professionals
                    to the essential concepts of artificial intelligence in
                    medicine. You'll build a solid understanding of AI
                    terminology, core technologies, and their practical
                    applications in clinical settings.
                  </p>
                  <p>
                    Designed specifically for medical professionals, this module
                    covers ethical considerations, implementation challenges,
                    and hands-on experience with AI tools that can immediately
                    enhance your clinical practice.
                  </p>
                </div>

                {/* Module Stats */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {[
                    { icon: BookOpen, value: "6", label: "Lessons" },
                    { icon: Clock, value: "3", label: "Hours" },
                    { icon: Users, value: "150+", label: "Completed" },
                  ].map((stat, index) => (
                    <motion.div
                      key={stat.label}
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={
                        visibleElements.has("content")
                          ? { opacity: 1, y: 0 }
                          : {}
                      }
                      transition={{
                        duration: 0.6,
                        delay: 0.2 + index * 0.1,
                        ease: "easeOut",
                      }}
                    >
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                        style={{
                          backgroundColor: `${educationColor}20`,
                        }}
                      >
                        <stat.icon
                          className="h-6 w-6"
                          style={{ color: educationColor }}
                        />
                      </div>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {stat.value}
                      </div>
                      <div
                        className="text-body-small"
                        style={{ color: "var(--foreground)", opacity: 0.6 }}
                      >
                        {stat.label}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* CTA Buttons */}
                <motion.div
                  className="flex flex-col sm:flex-row gap-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={
                    visibleElements.has("content") ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
                >
                  <Button
                    size="lg"
                    leftSection={<Play className="h-5 w-5" />}
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
                    Start Foundations Module
                  </Button>

                  <Link href="/education/ai-for-md/foundations/demo">
                    <Button
                      size="lg"
                      leftSection={<BrainCircuit className="h-5 w-5" />}
                      styles={{
                        root: {
                          backgroundColor: "transparent",
                          color: educationColor,
                          border: `2px solid ${educationColor}`,
                          borderRadius: "2rem",
                          fontSize: "1.125rem",
                          fontWeight: 600,
                          padding: "1rem 2rem",
                          "&:hover": {
                            backgroundColor: educationColor,
                            color: "white",
                            transform: "translateY(-2px)",
                          },
                        },
                      }}
                    >
                      View Interactive Demo
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </motion.div>

            {/* Right Column - Learning Outcomes */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={
                visibleElements.has("content") ? { opacity: 1, x: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <div
                className="floating-card p-8 h-full"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h3
                  className="text-card-title mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  What You'll Learn
                </h3>

                <div className="space-y-4">
                  {[
                    {
                      title: "AI Fundamentals for Healthcare",
                      description:
                        "Understand core AI concepts, terminology, and how they apply to medical practice.",
                    },
                    {
                      title: "Clinical Decision Support",
                      description:
                        "Learn how AI can enhance diagnostic accuracy and treatment recommendations.",
                    },
                    {
                      title: "Ethical AI Implementation",
                      description:
                        "Navigate the ethical challenges and ensure responsible AI deployment.",
                    },
                    {
                      title: "Hands-on AI Tools",
                      description:
                        "Practice with real AI tools that can be integrated into your workflow.",
                    },
                  ].map((item, index) => (
                    <motion.div
                      key={item.title}
                      className="flex gap-3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={
                        visibleElements.has("content")
                          ? { opacity: 1, x: 0 }
                          : {}
                      }
                      transition={{
                        duration: 0.6,
                        delay: 0.4 + index * 0.1,
                        ease: "easeOut",
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          backgroundColor: educationColor,
                        }}
                      >
                        <CheckCircle className="h-3 w-3 text-white" />
                      </div>
                      <div className="text-flow-natural">
                        <h4
                          className="font-medium mb-1"
                          style={{ color: "var(--foreground)" }}
                        >
                          {item.title}
                        </h4>
                        <p
                          className="text-body-small"
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          {item.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Module Platform Section */}
      <section
        className="py-16"
        id="platform"
        data-animate
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="content-container">
          <motion.div
            className="text-center max-w-4xl mx-auto text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("platform") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="text-section-title mb-6"
              style={{ color: "var(--foreground)" }}
            >
              Interactive Learning{" "}
              <span style={{ color: educationColor }}>Platform</span>
            </h2>

            <p
              className="text-body-large mb-12 max-w-2xl mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              The full AI For MD Foundations webapp will be integrated here,
              providing an immersive learning experience with interactive
              exercises, case studies, and practical applications.
            </p>

            {/* Platform Preview Card */}
            <motion.div
              className="floating-card p-12 max-w-3xl mx-auto"
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--border)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("platform") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              whileHover={{
                y: -4,
                transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
              }}
            >
              <motion.div
                className="mb-8"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={
                  visibleElements.has("platform")
                    ? { opacity: 1, scale: 1 }
                    : {}
                }
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
              >
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"
                  style={{
                    backgroundColor: `${educationColor}15`,
                    border: `2px solid ${educationColor}30`,
                  }}
                >
                  <BrainCircuit
                    className="h-10 w-10"
                    style={{ color: educationColor }}
                  />
                </div>
              </motion.div>

              <h3
                className="text-card-title mb-4"
                style={{ color: "var(--foreground)" }}
              >
                Coming Soon
              </h3>

              <p
                className="text-body-small mb-8"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                This comprehensive learning module is currently in development.
                Get notified when it becomes available.
              </p>

              <Button
                size="lg"
                styles={{
                  root: {
                    backgroundColor: "transparent",
                    color: educationColor,
                    border: `2px solid ${educationColor}`,
                    borderRadius: "2rem",
                    fontWeight: 600,
                    padding: "0.75rem 2rem",
                    "&:hover": {
                      backgroundColor: educationColor,
                      color: "white",
                      transform: "translateY(-1px)",
                    },
                  },
                }}
              >
                Notify Me When Available
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
