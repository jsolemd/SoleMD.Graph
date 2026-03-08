"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Section {
  id: string;
  label: string;
  color: string;
}

const SECTIONS: Section[] = [
  { id: "hero-section", label: "Introduction", color: "var(--color-fresh-green)" },
  { id: "section-1", label: "Wake Network", color: "var(--color-golden-yellow)" },
  { id: "section-2", label: "NREM → REM", color: "var(--color-soft-blue)" },
  { id: "section-3", label: "Glymphatic Flow", color: "var(--color-warm-coral)" },
  { id: "section-4", label: "Summary", color: "var(--color-soft-lavender)" },
];

export default function SectionNavigator() {
  const [activeSection, setActiveSection] = useState<string>("");
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const observerOptions: IntersectionObserverInit = {
      root: null,
      rootMargin: "-20% 0px -60% 0px", // Trigger when section enters top 40% of viewport
      threshold: 0,
    };

    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const yOffset = -20; // Small offset from top
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;

      window.scrollTo({
        top: y,
        behavior: "smooth",
      });
    }
  };

  if (!isClient) return null;

  return (
    <motion.nav
      className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-4 p-3 rounded-full"
      style={{
        background: "linear-gradient(135deg, rgba(10, 18, 36, 0.72), rgba(17, 28, 52, 0.58))",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(148, 163, 255, 0.25)",
        boxShadow: "0 8px 32px rgba(4, 8, 20, 0.45)",
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 1 }}
    >
      {SECTIONS.map((section, index) => {
        const isActive = activeSection === section.id;
        const isHovered = hoveredSection === section.id;

        return (
          <div key={section.id} className="relative flex items-center justify-end group">
            {/* Tooltip label */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  className="absolute right-full mr-3 px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, rgba(10, 18, 36, 0.92), rgba(17, 28, 52, 0.88))",
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${section.color}40`,
                    color: section.color,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    boxShadow: `0 4px 16px ${section.color}20`,
                  }}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  {section.label}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation dot */}
            <motion.button
              onClick={() => scrollToSection(section.id)}
              onMouseEnter={() => setHoveredSection(section.id)}
              onMouseLeave={() => setHoveredSection(null)}
              className="relative w-3 h-3 rounded-full cursor-pointer border-0 outline-none transition-all duration-300"
              style={{
                backgroundColor: isActive ? section.color : "rgba(148, 163, 255, 0.2)",
                boxShadow: isActive
                  ? `0 0 12px ${section.color}80, 0 0 24px ${section.color}40`
                  : isHovered
                  ? `0 0 8px ${section.color}60`
                  : "none",
              }}
              whileHover={{ scale: 1.4 }}
              whileTap={{ scale: 0.9 }}
              animate={{
                scale: isActive ? 1.2 : 1,
              }}
              transition={{ duration: 0.2 }}
              aria-label={`Navigate to ${section.label}`}
            >
              {/* Active indicator ring */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2"
                  style={{
                    borderColor: section.color,
                  }}
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: "loop",
                  }}
                />
              )}
            </motion.button>
          </div>
        );
      })}
    </motion.nav>
  );
}
