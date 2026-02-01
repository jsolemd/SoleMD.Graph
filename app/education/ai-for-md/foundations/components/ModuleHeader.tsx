"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Clock, Users, BookOpen } from "lucide-react";

/**
 * ModuleHeader Component
 *
 * A reusable header component for education modules that displays:
 * - Module badge and branding
 * - Module title and description
 * - Key statistics (duration, participants, lessons)
 * - Consistent education theme styling
 *
 * This component provides a standardized way to present module information
 * across different education modules in the SoleMD platform.
 */

interface ModuleStats {
  /** Estimated duration in hours */
  duration: number;

  /** Number of participants or completions */
  participants: number;

  /** Number of lessons in the module */
  lessons: number;
}

interface ModuleHeaderProps {
  /** The title of the module */
  title: string;

  /** Brief description of the module */
  description: string;

  /** Module statistics to display */
  stats: ModuleStats;

  /** Optional badge text (defaults to "AI for MD Series") */
  badgeText?: string;

  /** Optional custom icon component */
  icon?: React.ComponentType<{ className?: string }>;

  /** Whether to show the animated entrance */
  animate?: boolean;
}

/**
 * ModuleHeader Component
 *
 * Displays module information in a consistent, visually appealing format
 * with education theme styling and optional animations.
 *
 * @param title - The title of the module
 * @param description - Brief description of the module
 * @param stats - Module statistics (duration, participants, lessons)
 * @param badgeText - Optional badge text
 * @param icon - Optional custom icon component
 * @param animate - Whether to show animated entrance
 */
export default function ModuleHeader({
  title,
  description,
  stats,
  badgeText = "AI for MD Series",
  icon: Icon = BrainCircuit,
  animate = true,
}: ModuleHeaderProps) {
  const educationColor = "var(--color-fresh-green)";

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
        ease: "easeOut",
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  return (
    <motion.div
      className="text-flow-natural"
      variants={animate ? containerVariants : undefined}
      initial={animate ? "hidden" : undefined}
      animate={animate ? "visible" : undefined}
    >
      {/* Module Badge */}
      <motion.div
        className="mb-6"
        variants={animate ? itemVariants : undefined}
      >
        <div
          className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl"
          style={{
            backgroundColor: `${educationColor}15`,
            border: `1px solid ${educationColor}30`,
          }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: educationColor }}
          >
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span
            className="text-base font-semibold"
            style={{ color: educationColor }}
          >
            {badgeText}
          </span>
        </div>
      </motion.div>

      {/* Module Title */}
      <motion.h1
        className="text-section-title mb-4"
        style={{ color: "var(--foreground)" }}
        variants={animate ? itemVariants : undefined}
      >
        {title.split(" ").map((word, index, array) => {
          // Highlight the last word with education color
          if (index === array.length - 1) {
            return (
              <span key={index} style={{ color: educationColor }}>
                {word}
              </span>
            );
          }
          return word + " ";
        })}
      </motion.h1>

      {/* Module Description */}
      <motion.p
        className="text-body-large max-w-4xl mb-8"
        style={{ color: "var(--foreground)", opacity: 0.8 }}
        variants={animate ? itemVariants : undefined}
      >
        {description}
      </motion.p>

      {/* Module Statistics */}
      <motion.div
        className="grid md:grid-cols-3 gap-6"
        variants={animate ? itemVariants : undefined}
      >
        {/* Lessons Count */}
        <motion.div
          className="text-center"
          variants={animate ? itemVariants : undefined}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              backgroundColor: `${educationColor}20`,
            }}
          >
            <BookOpen className="h-6 w-6" style={{ color: educationColor }} />
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            {stats.lessons}
          </div>
          <div
            className="text-body-small"
            style={{ color: "var(--foreground)", opacity: 0.6 }}
          >
            {stats.lessons === 1 ? "Lesson" : "Lessons"}
          </div>
        </motion.div>

        {/* Duration */}
        <motion.div
          className="text-center"
          variants={animate ? itemVariants : undefined}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              backgroundColor: `${educationColor}20`,
            }}
          >
            <Clock className="h-6 w-6" style={{ color: educationColor }} />
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            {stats.duration}
          </div>
          <div
            className="text-body-small"
            style={{ color: "var(--foreground)", opacity: 0.6 }}
          >
            {stats.duration === 1 ? "Hour" : "Hours"}
          </div>
        </motion.div>

        {/* Participants */}
        <motion.div
          className="text-center"
          variants={animate ? itemVariants : undefined}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              backgroundColor: `${educationColor}20`,
            }}
          >
            <Users className="h-6 w-6" style={{ color: educationColor }} />
          </div>
          <div
            className="text-2xl font-bold"
            style={{ color: "var(--foreground)" }}
          >
            {stats.participants >= 1000
              ? `${Math.floor(stats.participants / 1000)}k+`
              : `${stats.participants}+`}
          </div>
          <div
            className="text-body-small"
            style={{ color: "var(--foreground)", opacity: 0.6 }}
          >
            Completed
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
