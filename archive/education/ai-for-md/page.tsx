"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@mantine/core";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Code,
  FileText,
  Lightbulb,
  MessageSquare,
  Play,
  Users,
  Clock,
  CheckCircle,
} from "lucide-react";
import useScrollAnimation from "@/hooks/use-scroll-animation";

/**
 * AI for MD Series Landing Page Component
 *
 * Features:
 * - Series overview page for AI for MD modules
 * - Education page theme (Fresh Green)
 * - Proper navigation hierarchy
 * - Module listings and course information
 * - Uses SoleMD design system
 * - Theme-aware styling with CSS variables
 * - Responsive design optimized for course discovery
 */
export default function AIForMDPage() {
  const visibleElements = useScrollAnimation();

  // Use education color directly since this is under /education
  const educationColor = "var(--color-fresh-green)";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Series Header */}
      <section className="pt-24 pb-16" id="header" data-animate>
        <div className="content-container">
          <motion.div
            className="text-flow-natural"
            initial={{ opacity: 0, y: 20 }}
            animate={visibleElements.has("header") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Navigation */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Link href="/education">
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
                    Back to Education
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
                <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                  AI for MD Series
                </span>
              </div>
            </div>

            {/* Series Badge & Title */}
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
                  <Brain className="h-3.5 w-3.5 text-white" />
                </div>
                <span
                  className="text-base font-semibold"
                  style={{ color: educationColor }}
                >
                  Course Series
                </span>
              </div>

              {/* Series Title */}
              <h1
                className="text-section-title mb-4"
                style={{ color: "var(--foreground)" }}
              >
                AI for <span style={{ color: educationColor }}>MD</span>
              </h1>

              {/* Series Description */}
              <p
                className="text-body-large max-w-4xl"
                style={{ color: "var(--foreground)", opacity: 0.8 }}
              >
                A comprehensive course series designed to equip healthcare
                professionals with the knowledge and skills needed to
                effectively integrate artificial intelligence into clinical
                practice. From foundational concepts to advanced applications.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
      {/* Series Overview */}
      <section className="pb-20" id="overview" data-animate>
        <div className="content-container">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-start">
            {/* Left Column - Series Info */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={
                visibleElements.has("overview") ? { opacity: 1, x: 0 } : {}
              }
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="text-flow-natural">
                <h2
                  className="text-section-title mb-6"
                  style={{ color: "var(--foreground)" }}
                >
                  Series <span style={{ color: educationColor }}>Overview</span>
                </h2>

                <div
                  className="space-y-4 text-body-large mb-8"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  <p>
                    The AI for MD series is a comprehensive educational program
                    designed specifically for healthcare professionals. Each
                    module builds upon the previous one, creating a structured
                    learning path from basic concepts to advanced clinical
                    applications.
                  </p>
                  <p>
                    Developed by practicing physicians and AI researchers, this
                    series ensures that every concept is relevant, practical,
                    and immediately applicable to your clinical practice.
                  </p>
                </div>

                {/* Series Stats */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {[
                    { icon: BookOpen, value: "4", label: "Modules" },
                    { icon: Clock, value: "12", label: "Total Hours" },
                    { icon: Users, value: "500+", label: "Enrolled" },
                  ].map((stat, index) => (
                    <motion.div
                      key={stat.label}
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={
                        visibleElements.has("overview")
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
              </div>
            </motion.div>

            {/* Right Column - What You'll Learn */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={
                visibleElements.has("overview") ? { opacity: 1, x: 0 } : {}
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
                        "Core concepts, terminology, and how AI applies to medical practice.",
                    },
                    {
                      title: "Clinical Applications of AI",
                      description:
                        "Real-world applications across various medical specialties.",
                    },
                    {
                      title: "Ethical Considerations",
                      description:
                        "Navigate challenges of implementing AI in healthcare responsibly.",
                    },
                    {
                      title: "Hands-on AI Tools",
                      description:
                        "Practical tools that can enhance your clinical workflow.",
                    },
                  ].map((item, index) => (
                    <motion.div
                      key={item.title}
                      className="flex gap-3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={
                        visibleElements.has("overview")
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

      {/* Course Modules */}
      <section
        className="py-16"
        id="modules"
        data-animate
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="content-container">
          <motion.div
            className="text-center mb-16 text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="text-section-title mb-6"
              style={{ color: "var(--foreground)" }}
            >
              Course <span style={{ color: educationColor }}>Modules</span>
            </h2>
            <p
              className="text-body-large max-w-3xl mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Our structured curriculum takes you from AI basics to advanced
              applications in clinical practice.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 max-w-6xl mx-auto">
            {[
              {
                title: "Foundations",
                subtitle: "Essential AI concepts for healthcare",
                description: "Master the fundamentals of AI in medicine",
                lessons: "6 lessons",
                duration: "3 hours",
                status: "Available",
                href: "/education/ai-for-md/foundations",
              },
              {
                title: "Machine Learning",
                subtitle: "Understanding how machines learn",
                description:
                  "Dive into ML algorithms and their medical applications",
                lessons: "8 lessons",
                duration: "4 hours",
                status: "Coming Soon",
                href: "#",
              },
              {
                title: "Clinical Decision Support",
                subtitle: "AI-powered clinical tools",
                description: "Learn to integrate AI into diagnostic workflows",
                lessons: "7 lessons",
                duration: "3.5 hours",
                status: "Coming Soon",
                href: "#",
              },
              {
                title: "Hands-on AI Tools",
                subtitle: "Practical applications",
                description: "Use real AI tools in your clinical practice",
                lessons: "9 lessons",
                duration: "4.5 hours",
                status: "Coming Soon",
                href: "#",
              },
            ].map((module, index) => (
              <motion.div
                key={module.title}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}
                }
                transition={{
                  duration: 0.8,
                  delay: 0.1 * index,
                  ease: "easeOut",
                }}
                whileHover={
                  module.status === "Available"
                    ? {
                        y: -4,
                        transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                      }
                    : {}
                }
              >
                <Link
                  href={module.href}
                  className={
                    module.status === "Available"
                      ? "block h-full"
                      : "block h-full cursor-not-allowed"
                  }
                >
                  <div
                    className="floating-card p-8 h-full relative"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                      opacity: module.status === "Available" ? 1 : 0.7,
                    }}
                  >
                    {/* Module Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                      style={{ backgroundColor: educationColor }}
                    >
                      <Brain className="h-6 w-6 text-white" />
                    </div>

                    {/* Status Badge */}
                    <div className="absolute top-6 right-6">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor:
                            module.status === "Available"
                              ? `${educationColor}20`
                              : "var(--border)",
                          color:
                            module.status === "Available"
                              ? educationColor
                              : "var(--foreground)",
                          opacity: module.status === "Available" ? 1 : 0.6,
                        }}
                      >
                        {module.status}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="text-flow-natural">
                      <h3
                        className="text-card-title mb-2"
                        style={{ color: "var(--foreground)" }}
                      >
                        {module.title}
                      </h3>

                      <p
                        className="text-body-small mb-4"
                        style={{ color: "var(--foreground)", opacity: 0.8 }}
                      >
                        {module.subtitle}
                      </p>

                      <p
                        className="text-body-small mb-6"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        {module.description}
                      </p>

                      {/* Module Stats */}
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center gap-1">
                          <BookOpen
                            className="h-4 w-4"
                            style={{ color: educationColor }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            {module.lessons}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock
                            className="h-4 w-4"
                            style={{ color: educationColor }}
                          />
                          <span
                            className="text-sm"
                            style={{ color: "var(--foreground)", opacity: 0.7 }}
                          >
                            {module.duration}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      {module.status === "Available" ? (
                        <Button
                          size="sm"
                          leftSection={<Play className="h-4 w-4" />}
                          styles={{
                            root: {
                              backgroundColor: educationColor,
                              color: "white",
                              borderRadius: "1.5rem",
                              fontWeight: 600,
                              "&:hover": {
                                backgroundColor: educationColor,
                                opacity: 0.9,
                              },
                            },
                          }}
                        >
                          Start Module
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled
                          styles={{
                            root: {
                              backgroundColor: "var(--border)",
                              color: "var(--foreground)",
                              borderRadius: "1.5rem",
                              fontWeight: 600,
                              opacity: 0.5,
                            },
                          }}
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Get Started Section */}
      <section className="py-20" id="get-started" data-animate>
        <div className="content-container">
          <motion.div
            className="text-center max-w-4xl mx-auto text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("get-started") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="text-section-title mb-6"
              style={{ color: "var(--foreground)" }}
            >
              Ready to Transform Your{" "}
              <span style={{ color: educationColor }}>Practice?</span>
            </h2>

            <p
              className="text-body-large mb-12 max-w-2xl mx-auto"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              Join hundreds of physicians who have already enhanced their
              clinical skills through our AI for MD program.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/education/ai-for-md/foundations">
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
                  Start with Foundations
                </Button>
              </Link>

              <Button
                size="lg"
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
                      transform: "translateY(-1px)",
                    },
                  },
                }}
              >
                Learn More
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
