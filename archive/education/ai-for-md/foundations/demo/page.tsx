"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@mantine/core";
import {
  ArrowLeft,
  BrainCircuit,
  Thermometer,
  Code,
  Brain,
  Shield,
  Play,
  Volume2,
  Image as ImageIcon,
} from "lucide-react";
import useScrollAnimation from "@/hooks/use-scroll-animation";

// Import our interactive components
import InteractiveExercises from "../learn/components/InteractiveExercises";
import SaferFrameworkDemo from "../learn/components/SaferFrameworkDemo";
import MultimediaComponents from "../learn/components/MultimediaContent";

/**
 * Interactive Exercises Demo Page
 *
 * This page showcases all the interactive exercises we've migrated and enhanced
 * from the original AI for MD webapp. It provides a comprehensive preview of
 * the educational components with full functionality.
 */
export default function InteractiveExercisesDemoPage() {
  const visibleElements = useScrollAnimation();
  const educationColor = "var(--color-fresh-green)";

  // Demo interaction handler
  const handleInteraction = (data: any) => {
    console.log("Interactive Exercise Event:", data);
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Header */}
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
                <Link href="/education/ai-for-md/foundations">
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
                    Back to Foundations
                  </Button>
                </Link>
              </div>

              {/* Breadcrumb */}
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
                <Link
                  href="/education/ai-for-md/foundations"
                  className="hover:underline"
                  style={{ color: educationColor }}
                >
                  Foundations
                </Link>
                <span style={{ color: "var(--foreground)", opacity: 0.5 }}>
                  /
                </span>
                <span style={{ color: "var(--foreground)", opacity: 0.7 }}>
                  Interactive Demo
                </span>
              </div>
            </div>

            {/* Title Section */}
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
                  Interactive Exercises Demo
                </span>
              </div>

              <h1
                className="text-section-title mb-4"
                style={{ color: "var(--foreground)" }}
              >
                Interactive{" "}
                <span style={{ color: educationColor }}>Learning</span>{" "}
                Components
              </h1>

              <p
                className="text-body-large max-w-4xl"
                style={{ color: "var(--foreground)", opacity: 0.8 }}
              >
                Experience the migrated and enhanced interactive exercises from
                the original AI for MD webapp. These components demonstrate the
                integration of educational content with the SoleMD design
                system, featuring improved accessibility, animations, and user
                experience.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Temperature Slider Demo */}
      <section className="pb-20" id="temperature-demo" data-animate>
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("temperature-demo")
                ? { opacity: 1, y: 0 }
                : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <Thermometer className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2
                    className="text-section-title"
                    style={{ color: "var(--foreground)" }}
                  >
                    Temperature Slider
                  </h2>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Interactive demonstration of AI temperature settings and
                    their impact on creativity vs. factuality
                  </p>
                </div>
              </div>
            </div>

            <InteractiveExercises.TemperatureSlider
              onInteraction={handleInteraction}
              className="mb-12"
            />
          </motion.div>
        </div>
      </section>

      {/* Prompt Builder Demo */}
      <section className="pb-20" id="prompt-demo" data-animate>
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("prompt-demo") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <Code className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2
                    className="text-section-title"
                    style={{ color: "var(--foreground)" }}
                  >
                    Precision Prompt Builder
                  </h2>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Step-by-step tool for building expert-level AI prompts with
                    real-time feedback and analysis
                  </p>
                </div>
              </div>
            </div>

            <InteractiveExercises.PromptBuilder
              onInteraction={handleInteraction}
              className="mb-12"
            />
          </motion.div>
        </div>
      </section>

      {/* Model Size Simulator Demo */}
      <section className="pb-20" id="model-demo" data-animate>
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("model-demo") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2
                    className="text-section-title"
                    style={{ color: "var(--foreground)" }}
                  >
                    Model Size Simulator
                  </h2>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Explore the relationship between AI model size and
                    performance across different clinical tasks
                  </p>
                </div>
              </div>
            </div>

            <InteractiveExercises.ModelSizeSimulator
              onInteraction={handleInteraction}
              className="mb-12"
            />
          </motion.div>
        </div>
      </section>

      {/* SAFER Framework Demo */}
      <section className="pb-20" id="safer-demo" data-animate>
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("safer-demo") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2
                    className="text-section-title"
                    style={{ color: "var(--foreground)" }}
                  >
                    S.A.F.E.R. Framework
                  </h2>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Interactive demonstration of the clinical AI safety
                    framework with step-by-step workflow
                  </p>
                </div>
              </div>
            </div>

            <SaferFrameworkDemo
              onInteraction={handleInteraction}
              className="mb-12"
            />
          </motion.div>
        </div>
      </section>

      {/* Multimedia Components Demo */}
      <section className="pb-20" id="multimedia-demo" data-animate>
        <div className="content-container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("multimedia-demo") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: educationColor }}
                >
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2
                    className="text-section-title"
                    style={{ color: "var(--foreground)" }}
                  >
                    Enhanced Multimedia Components
                  </h2>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Advanced video, audio, and image components with
                    accessibility features and interactive elements
                  </p>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 mb-12">
              {/* Video Player Demo */}
              <div>
                <h3
                  className="text-card-title mb-4 flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <Play className="h-5 w-5" style={{ color: educationColor }} />
                  Video Player
                </h3>
                <MultimediaComponents.VideoPlayer
                  src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                  title="Sample Educational Video"
                  transcript="This is a sample video demonstrating the enhanced video player component with custom controls, chapter navigation, and accessibility features."
                  chapters={[
                    {
                      time: 0,
                      title: "Introduction",
                      description: "Overview of the topic",
                    },
                    {
                      time: 30,
                      title: "Main Content",
                      description: "Detailed explanation",
                    },
                    {
                      time: 60,
                      title: "Summary",
                      description: "Key takeaways",
                    },
                  ]}
                  onInteraction={handleInteraction}
                />
              </div>

              {/* Audio Player Demo */}
              <div>
                <h3
                  className="text-card-title mb-4 flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <Volume2
                    className="h-5 w-5"
                    style={{ color: educationColor }}
                  />
                  Audio Player
                </h3>
                <MultimediaComponents.AudioPlayer
                  src="https://www.soundjay.com/misc/sounds/bell-ringing-05.wav"
                  title="Sample Educational Audio"
                  transcript="This is a sample audio file demonstrating the enhanced audio player with waveform visualization and transcript support."
                  onInteraction={handleInteraction}
                />
              </div>
            </div>

            {/* Interactive Image Demo */}
            <div className="mb-12">
              <h3
                className="text-card-title mb-4 flex items-center gap-2"
                style={{ color: "var(--foreground)" }}
              >
                <ImageIcon
                  className="h-5 w-5"
                  style={{ color: educationColor }}
                />
                Interactive Image
              </h3>
              <MultimediaComponents.InteractiveImage
                src="https://via.placeholder.com/800x600/22c55e/ffffff?text=Interactive+Medical+Diagram"
                alt="Sample medical diagram with interactive annotations"
                title="Clinical Process Diagram"
                annotations={[
                  {
                    x: 25,
                    y: 30,
                    title: "Patient Assessment",
                    description:
                      "Initial evaluation and history taking process",
                  },
                  {
                    x: 50,
                    y: 50,
                    title: "AI Analysis",
                    description:
                      "Machine learning algorithms process patient data",
                  },
                  {
                    x: 75,
                    y: 70,
                    title: "Clinical Decision",
                    description:
                      "Physician reviews AI recommendations and makes final decision",
                  },
                ]}
                onInteraction={handleInteraction}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Technical Details Section */}
      <section
        className="py-16"
        id="technical"
        data-animate
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="content-container">
          <motion.div
            className="text-center max-w-4xl mx-auto text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("technical") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="text-section-title mb-6"
              style={{ color: "var(--foreground)" }}
            >
              Technical{" "}
              <span style={{ color: educationColor }}>Implementation</span>
            </h2>

            <p
              className="text-body-large mb-8"
              style={{ color: "var(--foreground)", opacity: 0.7 }}
            >
              These interactive exercises demonstrate the successful migration
              and enhancement of the original AI for MD webapp components with
              improved accessibility, design integration, and user experience.
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "Accessibility First",
                  description:
                    "WCAG AA compliance with keyboard navigation and screen reader support",
                },
                {
                  title: "SoleMD Design Integration",
                  description:
                    "Consistent with education theme colors, typography, and floating card patterns",
                },
                {
                  title: "Enhanced Interactivity",
                  description:
                    "Smooth animations, error handling, and responsive design for all devices",
                },
              ].map((feature, index) => (
                <motion.div
                  key={feature.title}
                  className="floating-card p-6"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={
                    visibleElements.has("technical") ? { opacity: 1, y: 0 } : {}
                  }
                  transition={{
                    duration: 0.6,
                    delay: 0.2 + index * 0.1,
                    ease: "easeOut",
                  }}
                  whileHover={{
                    y: -2,
                    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                  }}
                >
                  <h3
                    className="text-card-title mb-3"
                    style={{ color: "var(--foreground)" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-body-small"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
