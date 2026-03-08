"use client";

import React from "react";
import {
  BookOpen,
  ArrowUpRight,
  Play,
  Brain,
  Microscope,
  Heart,
  Users,
  Clock,
  Award,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { getCurrentPageColor } from "@/lib/utils";
import { ANIMATION_VARIANTS } from "@/lib/animation-utils";
import useScrollAnimation from "@/hooks/use-scroll-animation";

// This component contains all the visual JSX and interactive elements.
export default function EducationPageClient() {
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
                Transforming{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Medical Education
                </span>
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
                Comprehensive learning modules bridging AI, computational
                neuroscience, and clinical practice for the next generation of
                healthcare professionals.
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* Featured Course Section */}
        <section
          className="section-spacing-standard"
          id="featured"
          data-animate
        >
          <div className="content-container">
            <motion.div
              className="text-center mb-12 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("featured") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-4"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Featured{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Course
                </span>
              </h2>
              <p
                className="text-body-large text-opacity-secondary max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Start your journey with our comprehensive AI foundations program
              </p>
            </motion.div>

            {/* AI For MD Featured Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("featured") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <Link href="/education/ai-for-md" className="group block">
                <div
                  className="floating-card p-8 sm:p-12 relative overflow-hidden"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    transition: "all 300ms ease",
                  }}
                >
                  {/* Background decoration */}
                  <div
                    className="absolute top-0 right-0 w-32 h-32 opacity-5"
                    style={{ backgroundColor: getCurrentPageColor(pathname) }}
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                    {/* Course Info */}
                    <div className="lg:col-span-2 space-y-6 text-flow-natural">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center"
                          style={{
                            backgroundColor: getCurrentPageColor(pathname),
                          }}
                        >
                          <svg
                            className="h-8 w-8 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                            />
                          </svg>
                        </div>
                        <div>
                          <h3
                            className="text-2xl font-semibold mb-1"
                            style={{ color: "var(--foreground)" }}
                          >
                            AI For MD: Foundations
                          </h3>
                          <p
                            className="text-body-small text-opacity-muted"
                            style={{ color: "var(--foreground)" }}
                          >
                            Interactive Learning Module
                          </p>
                        </div>
                      </div>

                      <p
                        className="text-body-large text-opacity-secondary"
                        style={{ color: "var(--foreground)" }}
                      >
                        Master the fundamentals of artificial intelligence in
                        healthcare. Learn practical applications, ethical
                        considerations, and hands-on tools that can immediately
                        enhance your clinical practice.
                      </p>

                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <BookOpen
                            className="h-4 w-4"
                            style={{ color: getCurrentPageColor(pathname) }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            8 Modules
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock
                            className="h-4 w-4"
                            style={{ color: getCurrentPageColor(pathname) }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            12 Hours
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users
                            className="h-4 w-4"
                            style={{ color: getCurrentPageColor(pathname) }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            500+ Students
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center lg:text-right">
                      <div
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 group-hover:scale-105"
                        style={{
                          backgroundColor: getCurrentPageColor(pathname),
                          color: "white",
                        }}
                      >
                        <span>Launch Course</span>
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* All Learning Modules Section */}
        <section className="section-spacing-standard" id="modules" data-animate>
          <div className="content-container">
            <motion.div
              className="text-center mb-16 sm:mb-24 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-6"
                style={{
                  color: "var(--foreground)",
                }}
              >
                All Learning{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Modules
                </span>
              </h2>
              <p
                className="text-body-large text-opacity-secondary max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Explore our complete curriculum designed for healthcare
                professionals at every stage of their AI journey.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16">
              {/* AI For MD Card */}
              <motion.div
                {...ANIMATION_VARIANTS.cardHover}
                className="h-full"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              >
                <Link
                  href="/education/ai-for-md"
                  className="group block h-full"
                >
                  <div
                    className="floating-card p-8 h-full relative"
                    style={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      transition: "all 300ms ease",
                    }}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: `var(--color-golden-yellow)20`,
                          color: "var(--color-golden-yellow)",
                          border: `1px solid var(--color-golden-yellow)30`,
                        }}
                      >
                        Available Now
                      </span>
                    </div>

                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 mt-8"
                      style={{ backgroundColor: getCurrentPageColor(pathname) }}
                    >
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                        />
                      </svg>
                    </div>

                    {/* Arrow indicator */}
                    <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                      <ArrowUpRight
                        className="h-5 w-5 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 opacity-60 group-hover:opacity-100"
                        style={{ color: "var(--foreground)", opacity: 0.4 }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col text-flow-natural">
                      <h3
                        className="text-card-title mb-3"
                        style={{ color: "var(--foreground)" }}
                      >
                        AI For MD
                      </h3>
                      <p
                        className="text-body-small text-opacity-muted mb-6"
                        style={{ color: "var(--foreground)" }}
                      >
                        Master the fundamentals of artificial intelligence in
                        healthcare and learn how to leverage AI tools to enhance
                        your clinical practice.
                      </p>
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 text-caption"
                          style={{ color: "var(--color-golden-yellow)" }}
                        >
                          <Play className="h-4 w-4" />
                          <span>Interactive Module</span>
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.5 }}
                        >
                          8 modules • 12 hours
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Computational Neuroscience Card */}
              <motion.div
                {...ANIMATION_VARIANTS.cardHover}
                className="h-full"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <div className="h-full">
                  <div
                    className="floating-card p-8 h-full relative opacity-75"
                    style={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      transition: "all 300ms ease",
                    }}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: `var(--color-soft-blue)20`,
                          color: "var(--color-soft-blue)",
                          border: `1px solid var(--color-soft-blue)30`,
                        }}
                      >
                        Coming Soon
                      </span>
                    </div>

                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 mt-8"
                      style={{ backgroundColor: getCurrentPageColor(pathname) }}
                    >
                      <Brain className="h-6 w-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col text-flow-natural">
                      <h3
                        className="text-card-title mb-3"
                        style={{ color: "var(--foreground)" }}
                      >
                        Computational Neuroscience
                      </h3>
                      <p
                        className="text-body-small text-opacity-muted mb-6"
                        style={{ color: "var(--foreground)" }}
                      >
                        Mathematical modeling of brain function and neural
                        networks. Master the computational foundations of
                        neuroscience research.
                      </p>
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 text-caption"
                          style={{ color: getCurrentPageColor(pathname) }}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span>In Development</span>
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.5 }}
                        >
                          10 modules • 15 hours
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Neuroimaging Analysis Card */}
              <motion.div
                {...ANIMATION_VARIANTS.cardHover}
                className="h-full"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              >
                <div className="h-full">
                  <div
                    className="floating-card p-8 h-full relative opacity-75"
                    style={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      transition: "all 300ms ease",
                    }}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: `var(--color-soft-blue)20`,
                          color: "var(--color-soft-blue)",
                          border: `1px solid var(--color-soft-blue)30`,
                        }}
                      >
                        Coming Soon
                      </span>
                    </div>

                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 mt-8"
                      style={{ backgroundColor: getCurrentPageColor(pathname) }}
                    >
                      <Microscope className="h-6 w-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col text-flow-natural">
                      <h3
                        className="text-card-title mb-3"
                        style={{ color: "var(--foreground)" }}
                      >
                        Neuroimaging Analysis
                      </h3>
                      <p
                        className="text-body-small text-opacity-muted mb-6"
                        style={{ color: "var(--foreground)" }}
                      >
                        Advanced techniques for analyzing brain imaging data,
                        including fMRI, DTI, and structural MRI processing
                        methods.
                      </p>
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 text-caption"
                          style={{ color: getCurrentPageColor(pathname) }}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span>In Development</span>
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.5 }}
                        >
                          12 modules • 18 hours
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Clinical Applications Card */}
              <motion.div
                {...ANIMATION_VARIANTS.cardHover}
                className="h-full"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
              >
                <div className="h-full">
                  <div
                    className="floating-card p-8 h-full relative opacity-75"
                    style={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      transition: "all 300ms ease",
                    }}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: `var(--color-soft-blue)20`,
                          color: "var(--color-soft-blue)",
                          border: `1px solid var(--color-soft-blue)30`,
                        }}
                      >
                        Coming Soon
                      </span>
                    </div>

                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 mt-8"
                      style={{ backgroundColor: getCurrentPageColor(pathname) }}
                    >
                      <Heart className="h-6 w-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col text-flow-natural">
                      <h3
                        className="text-card-title mb-3"
                        style={{ color: "var(--foreground)" }}
                      >
                        Clinical Applications
                      </h3>
                      <p
                        className="text-body-small text-opacity-muted mb-6"
                        style={{ color: "var(--foreground)" }}
                      >
                        Real-world applications of AI and computational methods
                        in clinical psychiatry and mental health practice.
                      </p>
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 text-caption"
                          style={{ color: getCurrentPageColor(pathname) }}
                        >
                          <BookOpen className="h-4 w-4" />
                          <span>In Development</span>
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.5 }}
                        >
                          6 modules • 9 hours
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Learning Approach Section */}
        <section
          className="section-spacing-standard"
          id="approach"
          data-animate
        >
          <div className="content-container">
            <motion.div
              className="text-center mb-16 sm:mb-24 text-flow-natural"
              initial={{ opacity: 0, y: 30 }}
              animate={
                visibleElements.has("approach") ? { opacity: 1, y: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2
                className="text-section-title mb-6"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Our Learning{" "}
                <span style={{ color: getCurrentPageColor(pathname) }}>
                  Approach
                </span>
              </h2>
              <p
                className="text-body-large text-opacity-secondary max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground)",
                }}
              >
                Evidence-based education that bridges the gap between
                cutting-edge research and practical clinical application.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 lg:gap-16">
              {/* Interactive Learning */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("approach") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Play className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-xl font-semibold mb-3"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Interactive Learning
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Hands-on exercises, simulations, and real-world case studies
                  that make complex concepts accessible and applicable.
                </p>
              </motion.div>

              {/* Evidence-Based */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("approach") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Award className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-xl font-semibold mb-3"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Evidence-Based
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Every module is grounded in peer-reviewed research and
                  validated through real-world clinical experience.
                </p>
              </motion.div>

              {/* Community-Driven */}
              <motion.div
                className="text-center text-flow-natural"
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("approach") ? { opacity: 1, y: 0 } : {}
                }
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: getCurrentPageColor(pathname) }}
                >
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3
                  className="text-xl font-semibold mb-3"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Community-Driven
                </h3>
                <p
                  className="text-body-large text-opacity-muted"
                  style={{
                    color: "var(--foreground)",
                  }}
                >
                  Connect with fellow healthcare professionals and experts to
                  share insights and collaborative learning.
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
