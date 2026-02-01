"use client";

import React from "react";
import { Button, Card, Title, Text } from "@mantine/core";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Code,
  FileText,
  Lightbulb,
  MessageSquare,
  Play,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { getCurrentPageColor } from "@/lib/utils";
import {
  ANIMATION_VARIANTS,
  createThemeAwareButtonStyle,
} from "@/lib/animation-utils";
import useScrollAnimation from "@/hooks/use-scroll-animation";

export default function AIForMDFoundationsPageClient() {
  const visibleElements = useScrollAnimation();
  const pathname = usePathname();
  
  // Use education page color (Fresh Green)
  const educationColor = "var(--color-fresh-green)";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      <main className="flex-1">
        {/* Hero Section */}
        <section 
          className="w-full py-12 md:py-24 lg:py-32"
          id="hero"
          data-animate
          style={{ backgroundColor: `${educationColor}08` }}
        >
          <div className="container px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <Link
                href="/education"
                className="inline-flex items-center gap-1 mb-8 transition-colors hover:underline"
                style={{ color: educationColor }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Education
              </Link>
              
              <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
                <div className="flex flex-col justify-center space-y-4">
                  <div className="space-y-2">
                    <motion.h1 
                      className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none"
                      style={{ color: educationColor }}
                      initial={{ opacity: 0, y: 30 }}
                      animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                    >
                      AI For MD: Foundations
                    </motion.h1>
                    <motion.p 
                      className="max-w-[600px] text-body-large text-opacity-secondary md:text-xl"
                      style={{ color: "var(--foreground)" }}
                      initial={{ opacity: 0, y: 30 }}
                      animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    >
                      Master the fundamentals of artificial intelligence in
                      healthcare and learn how to leverage AI tools to enhance
                      your clinical practice.
                    </motion.p>
                  </div>
                  
                  <motion.div 
                    className="flex flex-col gap-2 min-[400px]:flex-row"
                    initial={{ opacity: 0, y: 30 }}
                    animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                  >
                    <motion.div {...ANIMATION_VARIANTS.buttonHover}>
                      <Button
                        size="lg"
                        leftSection={<Play className="h-4 w-4" />}
                        styles={{
                          root: {
                            backgroundColor: educationColor,
                            color: "white",
                            "&:hover": {
                              backgroundColor: "var(--color-accent-green)",
                              transform: "none !important",
                            },
                          },
                        }}
                      >
                        Begin Course
                      </Button>
                    </motion.div>
                    <Button
                      size="lg"
                      variant="outline"
                      styles={{
                        root: {
                          borderColor: educationColor,
                          color: educationColor,
                          backgroundColor: "transparent",
                          "&:hover": {
                            backgroundColor: `${educationColor}10`,
                          },
                        },
                      }}
                    >
                      View Syllabus
                    </Button>
                  </motion.div>
                  
                  <motion.div 
                    className="flex items-center gap-4 pt-4"
                    initial={{ opacity: 0, y: 30 }}
                    animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  >
                    <div className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" style={{ color: "var(--foreground)", opacity: 0.7 }} />
                      <span className="text-sm" style={{ color: "var(--foreground)", opacity: 0.7 }}>8 Modules</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" style={{ color: "var(--foreground)", opacity: 0.7 }} />
                      <span className="text-sm" style={{ color: "var(--foreground)", opacity: 0.7 }}>24 Lessons</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" style={{ color: "var(--foreground)", opacity: 0.7 }} />
                      <span className="text-sm" style={{ color: "var(--foreground)", opacity: 0.7 }}>
                        Community Support
                      </span>
                    </div>
                  </motion.div>
                </div>
                
                <motion.div 
                  className="rounded-xl border p-6 shadow-sm"
                  style={{ 
                    borderColor: educationColor,
                    backgroundColor: "var(--card)" 
                  }}
                  initial={{ opacity: 0, x: 30 }}
                  animate={visibleElements.has("hero") ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                >
                  <h3 className="text-xl font-bold mb-4" style={{ color: educationColor }}>
                    What You'll Learn
                  </h3>
                  <ul className="space-y-4">
                    {[
                      {
                        title: "AI Fundamentals for Healthcare",
                        description: "Understand the core concepts and terminology of AI in medicine"
                      },
                      {
                        title: "Clinical Applications of AI",
                        description: "Explore real-world applications of AI in various medical specialties"
                      },
                      {
                        title: "Ethical Considerations",
                        description: "Navigate the ethical challenges of implementing AI in healthcare"
                      },
                      {
                        title: "Hands-on AI Tools",
                        description: "Learn to use practical AI tools that can enhance your clinical workflow"
                      }
                    ].map((item, index) => (
                      <li key={index} className="flex gap-3">
                        <div 
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${educationColor}15` }}
                        >
                          <Lightbulb className="h-3 w-3" style={{ color: educationColor }} />
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: "var(--foreground)" }}>
                            {item.title}
                          </p>
                          <p className="text-sm text-opacity-muted" style={{ color: "var(--foreground)" }}>
                            {item.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Course Modules Section */}
        <section 
          id="modules" 
          className="py-20"
          data-animate
        >
          <div className="container px-4 md:px-6">
            <motion.div 
              className="flex flex-col items-center justify-center space-y-4 text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="space-y-2">
                <div 
                  className="inline-block rounded-lg px-3 py-1 text-sm"
                  style={{ 
                    backgroundColor: `${educationColor}15`,
                    color: educationColor 
                  }}
                >
                  Course Modules
                </div>
                <h2 className="text-3xl font-bold tracking-tighter md:text-4xl" style={{ color: "var(--foreground)" }}>
                  Comprehensive Learning Path
                </h2>
                <p className="max-w-[900px] text-body-large text-opacity-secondary md:text-xl" style={{ color: "var(--foreground)" }}>
                  Our structured curriculum takes you from AI basics to advanced
                  applications in clinical practice.
                </p>
              </div>
            </motion.div>
            
            <div className="mx-auto grid max-w-5xl gap-6 py-12 md:grid-cols-2">
              {[
                {
                  title: "Module 1: Introduction to AI in Medicine",
                  subtitle: "Foundation concepts and terminology",
                  items: [
                    "History and evolution of AI in healthcare",
                    "Key AI terminology for medical professionals",
                    "Types of AI systems in healthcare"
                  ]
                },
                {
                  title: "Module 2: Machine Learning Basics",
                  subtitle: "Understanding how machines learn from data",
                  items: [
                    "Supervised vs. unsupervised learning",
                    "Neural networks and deep learning",
                    "Evaluating model performance in healthcare"
                  ]
                },
                {
                  title: "Module 3: Clinical Decision Support",
                  subtitle: "AI-powered tools for clinical practice",
                  items: [
                    "Risk prediction and early warning systems",
                    "Diagnostic assistance tools",
                    "Treatment recommendation systems"
                  ]
                },
                {
                  title: "Module 4: Hands-on AI Tools",
                  subtitle: "Practical applications for everyday use",
                  items: [
                    "Medical literature search and summarization",
                    "Clinical documentation assistance",
                    "Patient education and communication tools"
                  ]
                }
              ].map((module, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  animate={visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.8, delay: 0.1 * index, ease: "easeOut" }}
                >
                  <Card 
                    className="p-6"
                    styles={{
                      root: {
                        backgroundColor: "var(--card)",
                        borderColor: educationColor,
                        border: `1px solid ${educationColor}30`,
                      }
                    }}
                  >
                    <Title order={3} className="mb-2" style={{ color: educationColor }}>
                      {module.title}
                    </Title>
                    <Text size="sm" c="dimmed" className="mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
                      {module.subtitle}
                    </Text>
                    <ul className="space-y-2 mb-4">
                      {module.items.map((item, itemIndex) => (
                        <li key={itemIndex} className="flex items-center gap-2">
                          <div 
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: educationColor }}
                          ></div>
                          <span style={{ color: "var(--foreground)", opacity: 0.8 }}>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      fullWidth
                      styles={{
                        root: {
                          borderColor: educationColor,
                          color: educationColor,
                          backgroundColor: "transparent",
                          "&:hover": {
                            backgroundColor: `${educationColor}10`,
                          },
                        },
                      }}
                    >
                      Start Module
                    </Button>
                  </Card>
                </motion.div>
              ))}
            </div>
            
            <motion.div 
              className="flex justify-center"
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("modules") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
            >
              <Button 
                styles={{
                  root: {
                    backgroundColor: educationColor,
                    color: "white",
                    "&:hover": {
                      backgroundColor: "var(--color-accent-green)",
                    },
                  },
                }}
              >
                View All Modules
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Additional Resources Section */}
        <section
          id="resources"
          className="py-20"
          data-animate
          style={{ backgroundColor: `${educationColor}05` }}
        >
          <div className="container px-4 md:px-6">
            <motion.div 
              className="flex flex-col items-center justify-center space-y-4 text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("resources") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="space-y-2">
                <div 
                  className="inline-block rounded-lg px-3 py-1 text-sm"
                  style={{ 
                    backgroundColor: "var(--card)",
                    color: educationColor 
                  }}
                >
                  Additional Resources
                </div>
                <h2 className="text-3xl font-bold tracking-tighter md:text-4xl" style={{ color: "var(--foreground)" }}>
                  Enhance Your Learning
                </h2>
                <p className="max-w-[900px] text-body-large text-opacity-secondary md:text-xl" style={{ color: "var(--foreground)" }}>
                  Supplement your course with these carefully curated resources
                  to deepen your understanding of AI in medicine.
                </p>
              </div>
            </motion.div>
            
            <div className="mx-auto grid max-w-5xl gap-6 py-12 md:grid-cols-3">
              {[
                {
                  icon: FileText,
                  title: "Research Papers",
                  subtitle: "Curated collection of influential AI in medicine papers",
                  description: "Access a library of seminal research papers that have shaped the field of AI in healthcare, with expert annotations.",
                  buttonText: "Browse Library"
                },
                {
                  icon: Code,
                  title: "Interactive Tools",
                  subtitle: "Hands-on applications to practice with AI",
                  description: "Experiment with interactive demos and tools that illustrate AI concepts and applications in a clinical context.",
                  buttonText: "Try Tools"
                },
                {
                  icon: MessageSquare,
                  title: "Community Forum",
                  subtitle: "Connect with peers and experts",
                  description: "Join discussions with fellow healthcare professionals and AI experts to share insights and ask questions.",
                  buttonText: "Join Forum"
                }
              ].map((resource, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  animate={visibleElements.has("resources") ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.8, delay: 0.1 * index, ease: "easeOut" }}
                >
                  <Card 
                    className="p-6"
                    styles={{
                      root: {
                        backgroundColor: "var(--card)",
                        borderColor: educationColor,
                        border: `1px solid ${educationColor}30`,
                      }
                    }}
                  >
                    <div 
                      className="h-12 flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${educationColor}15` }}
                    >
                      <resource.icon className="h-6 w-6" style={{ color: educationColor }} />
                    </div>
                    <Title order={3} className="mb-2" style={{ color: educationColor }}>
                      {resource.title}
                    </Title>
                    <Text size="sm" c="dimmed" className="mb-4" style={{ color: "var(--foreground)", opacity: 0.7 }}>
                      {resource.subtitle}
                    </Text>
                    <Text size="sm" className="mb-4" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                      {resource.description}
                    </Text>
                    <Button
                      variant="outline"
                      fullWidth
                      styles={{
                        root: {
                          borderColor: educationColor,
                          color: educationColor,
                          backgroundColor: "transparent",
                          "&:hover": {
                            backgroundColor: `${educationColor}10`,
                          },
                        },
                      }}
                    >
                      {resource.buttonText}
                    </Button>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-20" id="cta" data-animate>
          <div className="container grid items-center gap-6 px-4 md:px-6 lg:grid-cols-2 lg:gap-10">
            <motion.div 
              className="space-y-2"
              initial={{ opacity: 0, x: -30 }}
              animate={visibleElements.has("cta") ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight" style={{ color: educationColor }}>
                Ready to transform your practice with AI?
              </h2>
              <p className="max-w-[600px] text-body-large text-opacity-secondary md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed" style={{ color: "var(--foreground)" }}>
                Join hundreds of physicians who have already enhanced their
                clinical skills through our AI for MD program.
              </p>
            </motion.div>
            <motion.div 
              className="flex flex-col gap-2 min-[400px]:flex-row lg:justify-end"
              initial={{ opacity: 0, x: 30 }}
              animate={visibleElements.has("cta") ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              <motion.div {...ANIMATION_VARIANTS.buttonHover}>
                <Button
                  size="lg"
                  leftSection={<Play className="h-4 w-4" />}
                  styles={{
                    root: {
                      backgroundColor: educationColor,
                      color: "white",
                      "&:hover": {
                        backgroundColor: "var(--color-accent-green)",
                        transform: "none !important",
                      },
                    },
                  }}
                >
                  Enroll Now
                </Button>
              </motion.div>
              <Button
                size="lg"
                variant="outline"
                styles={{
                  root: {
                    borderColor: educationColor,
                    color: educationColor,
                    backgroundColor: "transparent",
                    "&:hover": {
                      backgroundColor: `${educationColor}10`,
                    },
                  },
                }}
              >
                Request Information
              </Button>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}