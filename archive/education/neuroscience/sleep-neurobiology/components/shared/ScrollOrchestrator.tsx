"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * ScrollOrchestrator Component
 *
 * Manages all scroll-triggered animations across the sleep neurobiology page.
 * Uses GSAP ScrollTrigger to coordinate section transitions and visual effects.
 *
 * Features:
 * - Master timeline coordination
 * - Performance optimizations
 * - Reduced motion support
 * - Mobile-specific configurations
 */
export default function ScrollOrchestrator() {
  const orchestratorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register GSAP plugins
    gsap.registerPlugin(ScrollTrigger);

    // Development override for testing animations (set to true to test with reduced motion enabled)
    const FORCE_ANIMATIONS = true; // Toggle this to false for production

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion && !FORCE_ANIMATIONS) {
      // Disable complex animations for accessibility
      return;
    }

    const ctx = gsap.context(() => {
      // Hero section scroll effects (unpinned to avoid conflict with timeline section)
      ScrollTrigger.create({
        trigger: "#hero",
        start: "top top",
        end: "+=80%",
        scrub: true,
        onUpdate: (self) => {
          const progress = self.progress;

          // Parallax effect for brain constellation
          const brainConstellation = document.querySelector(".brain-constellation");
          if (brainConstellation) {
            gsap.set(brainConstellation, {
              y: progress * 100,
              opacity: 1 - progress * 0.5,
            });
          }

          // Fade out hero content
          const heroContent = document.querySelector("#hero-title, #hero-subtitle");
          if (heroContent) {
            gsap.set("#hero-title", {
              opacity: 1 - progress * 1.2,
              y: progress * -50,
            });
            gsap.set("#hero-subtitle", {
              opacity: 1 - progress * 1.2,
              y: progress * -30,
            });
          }
        },
      });

      // Switches section entrance
      ScrollTrigger.create({
        trigger: "#switches",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#switches-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            });
        },
        onLeave: () => {
          gsap.to("#switches-content", {
            opacity: 0.3,
            duration: 0.5,
          });
        },
        onEnterBack: () => {
          gsap.to("#switches-content", {
            opacity: 1,
            duration: 0.5,
          });
        },
      });

      // NREM Workshop section
      ScrollTrigger.create({
        trigger: "#nrem",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#nrem-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            })
            .to("#nrem-oscillations", {
              opacity: 1,
              scale: 1,
              duration: 0.8,
              ease: "back.out(1.7)",
            }, "-=0.5");
        },
      });

      // REM Rehearsal section
      ScrollTrigger.create({
        trigger: "#rem",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#rem-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            })
            .to("#rem-split-screen", {
              opacity: 1,
              clipPath: "inset(0% 0% 0% 0%)",
              duration: 1.2,
              ease: "power2.inOut",
            }, "-=0.5");
        },
      });

      // Glymphatic section
      ScrollTrigger.create({
        trigger: "#glymphatic",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#glymphatic-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            })
            .to("#glymphatic-pump", {
              opacity: 1,
              scale: 1,
              rotation: 0,
              duration: 1,
              ease: "elastic.out(1, 0.5)",
            }, "-=0.5");
        },
      });

      // Timeline section
      ScrollTrigger.create({
        trigger: "#timeline",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#timeline-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            })
            .to("#timeline-bars", {
              scaleX: 1,
              duration: 1.5,
              ease: "power2.out",
              stagger: 0.2,
            }, "-=0.5");
        },
      });

      // AI Monitoring section
      ScrollTrigger.create({
        trigger: "#monitoring",
        start: "top 80%",
        end: "top 20%",
        onEnter: () => {
          gsap.timeline()
            .to("#monitoring-content", {
              opacity: 1,
              y: 0,
              duration: 1,
              ease: "power2.out",
            })
            .to("#monitoring-cards", {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: "power2.out",
              stagger: 0.1,
            }, "-=0.5");
        },
      });

      // Global performance optimizations
      ScrollTrigger.batch("[data-animate]", {
        onEnter: (elements) => {
          gsap.from(elements, {
            opacity: 0,
            y: 50,
            duration: 1,
            ease: "power2.out",
            stagger: 0.1,
          });
        },
        onLeave: (elements) => {
          gsap.to(elements, {
            opacity: 0.3,
            duration: 0.3,
          });
        },
        onEnterBack: (elements) => {
          gsap.to(elements, {
            opacity: 1,
            duration: 0.3,
          });
        },
      });

      // Refresh ScrollTrigger after setup
      ScrollTrigger.refresh();

    }, orchestratorRef);

    return () => {
      ctx.revert();
    };
  }, []);

  return <div ref={orchestratorRef} className="fixed inset-0 pointer-events-none z-0" />;
}
