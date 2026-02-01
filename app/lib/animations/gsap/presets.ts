import { gsap } from "gsap";

// Medical animation presets for consistent animations across the platform

export const fadeInUp = {
  initial: {
    opacity: 0,
    y: 30,
  },
  animate: {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: "power3.out",
  },
};

export const fadeInScale = {
  initial: {
    opacity: 0,
    scale: 0.8,
  },
  animate: {
    opacity: 1,
    scale: 1,
    duration: 0.6,
    ease: "back.out(1.7)",
  },
};

export const staggerChildren = {
  each: 0.1,
  from: "start",
  ease: "power2.inOut",
};

// Medical-specific animation presets
export const heartbeat = {
  scale: [1, 1.1, 1, 1.15, 1],
  duration: 1.5,
  ease: "power2.inOut",
  repeat: -1,
  repeatDelay: 0.5,
};

export const pulse = {
  opacity: [1, 0.6, 1],
  scale: [1, 1.05, 1],
  duration: 2,
  ease: "sine.inOut",
  repeat: -1,
};

export const neuronFire = {
  initial: {
    opacity: 0,
    scale: 0,
  },
  animate: {
    opacity: [0, 1, 1, 0],
    scale: [0, 1.2, 1, 1.5],
    duration: 0.8,
    ease: "power4.out",
  },
};

export const waveform = {
  strokeDasharray: "1000",
  strokeDashoffset: 1000,
  animate: {
    strokeDashoffset: 0,
    duration: 2,
    ease: "none",
  },
};

// Timeline presets for complex medical animations
export const createSleepStageTimeline = () => {
  const tl = gsap.timeline({
    defaults: {
      duration: 1.5,
      ease: "power2.inOut",
    },
  });

  return tl;
};

export const createNeurotransmitterReleaseTimeline = () => {
  const tl = gsap.timeline({
    defaults: {
      duration: 0.3,
      ease: "power3.out",
    },
  });

  return tl;
};

export const createDrugBindingTimeline = () => {
  const tl = gsap.timeline({
    defaults: {
      duration: 0.8,
      ease: "elastic.out(1, 0.5)",
    },
  });

  return tl;
};

// Scroll-triggered animations
export const parallaxSettings = {
  yPercent: -50,
  ease: "none",
  scrollTrigger: {
    scrub: true,
  },
};

export const fadeInOnScroll = {
  scrollTrigger: {
    start: "top 80%",
    end: "bottom 20%",
    toggleActions: "play none none reverse",
  },
  opacity: 0,
  y: 50,
  duration: 1,
  ease: "power3.out",
};

// Color animations for medical states
export const healthyToPathological = {
  backgroundColor: "#10b981", // green
  animate: {
    backgroundColor: "#ef4444", // red
    duration: 2,
    ease: "power2.inOut",
  },
};

export const normalToAbnormal = {
  borderColor: "#3b82f6", // blue
  animate: {
    borderColor: "#f59e0b", // amber
    duration: 1.5,
    ease: "sine.inOut",
  },
};

// Morphing presets for medical shapes
export const cellMorphSettings = {
  duration: 2,
  ease: "power2.inOut",
  morphSVG: {
    shapeIndex: "auto",
  },
};

// Text animation presets
export const revealText = {
  duration: 0.8,
  opacity: 0,
  y: 20,
  stagger: {
    each: 0.02,
    from: "start",
  },
  ease: "power3.out",
};

export const scrambleTextSettings = {
  duration: 1,
  text: {
    value: "",
    delimiter: "",
  },
  ease: "none",
};

// Utility functions
export const applyPreset = (element: gsap.TweenTarget, preset: any) => {
  const { initial, animate, ...options } = preset;

  if (initial) {
    gsap.set(element, initial);
  }

  if (animate) {
    return gsap.to(element, { ...animate, ...options });
  }

  return gsap.to(element, preset);
};

export const createStaggerAnimation = (
  elements: gsap.TweenTarget,
  preset: any,
  staggerOptions = staggerChildren
) => {
  return gsap.to(elements, {
    ...preset,
    stagger: staggerOptions,
  });
};

// Medical-specific utility animations
export const animateVitalSigns = (element: gsap.TweenTarget, bpm: number = 72) => {
  const duration = 60 / bpm;

  return gsap.to(element, {
    scaleX: [1, 1.1, 1, 1.05, 1],
    scaleY: [1, 0.9, 1, 0.95, 1],
    duration,
    ease: "sine.inOut",
    repeat: -1,
  });
};

export const animateBloodFlow = (path: gsap.TweenTarget, speed: number = 2) => {
  return gsap.to(path, {
    strokeDashoffset: "-=100",
    duration: speed,
    ease: "none",
    repeat: -1,
  });
};

export const animateSynapticTransmission = (
  vesicles: gsap.TweenTarget,
  receptors: gsap.TweenTarget
) => {
  const tl = gsap.timeline();

  tl.to(vesicles, {
    y: 100,
    opacity: 0,
    duration: 0.5,
    stagger: 0.1,
    ease: "power2.in",
  })
  .to(receptors, {
    fill: "#60a5fa",
    scale: 1.2,
    duration: 0.3,
    stagger: 0.05,
    ease: "back.out(2)",
  }, "-=0.2");

  return tl;
};

export default {
  fadeInUp,
  fadeInScale,
  staggerChildren,
  heartbeat,
  pulse,
  neuronFire,
  waveform,
  createSleepStageTimeline,
  createNeurotransmitterReleaseTimeline,
  createDrugBindingTimeline,
  parallaxSettings,
  fadeInOnScroll,
  healthyToPathological,
  normalToAbnormal,
  cellMorphSettings,
  revealText,
  scrambleTextSettings,
  applyPreset,
  createStaggerAnimation,
  animateVitalSigns,
  animateBloodFlow,
  animateSynapticTransmission,
};