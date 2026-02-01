import { gsap } from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

// Register plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(MorphSVGPlugin, DrawSVGPlugin);
}

// Neuron state morphing
export const morphNeuronStates = {
  resting: {
    path: "M50,50 C50,30 30,30 30,50 C30,70 50,70 50,50",
    fill: "#94a3b8",
  },
  depolarized: {
    path: "M50,50 C60,20 20,20 30,50 C20,80 60,80 50,50",
    fill: "#fbbf24",
  },
  firing: {
    path: "M50,50 L60,20 L30,35 L70,35 L40,20 L50,50",
    fill: "#ef4444",
  },
};

// Sleep stage brain morphs
export const sleepStageMorphs = {
  awake: {
    path: "M50,20 C70,20 80,35 80,50 C80,65 70,80 50,80 C30,80 20,65 20,50 C20,35 30,20 50,20",
    fill: "#fbbf24",
    opacity: 1,
  },
  n1: {
    path: "M50,25 C65,25 75,37 75,50 C75,63 65,75 50,75 C35,75 25,63 25,50 C25,37 35,25 50,25",
    fill: "#a3a3a3",
    opacity: 0.9,
  },
  n2: {
    path: "M50,30 C60,30 70,40 70,50 C70,60 60,70 50,70 C40,70 30,60 30,50 C30,40 40,30 50,30",
    fill: "#737373",
    opacity: 0.8,
  },
  n3: {
    path: "M50,35 C57,35 65,43 65,50 C65,57 57,65 50,65 C43,65 35,57 35,50 C35,43 43,35 50,35",
    fill: "#404040",
    opacity: 0.7,
  },
  rem: {
    path: "M50,20 C50,20 80,30 80,50 C80,70 50,80 50,80 C50,80 20,70 20,50 C20,30 50,20 50,20",
    fill: "#8b5cf6",
    opacity: 0.95,
  },
};

// Receptor conformations
export const receptorConformations = {
  inactive: "M40,50 Q50,40 60,50 L60,70 Q50,80 40,70 Z",
  active: "M35,50 Q50,30 65,50 L65,70 Q50,90 35,70 Z",
  desensitized: "M45,50 Q50,45 55,50 L55,70 Q50,75 45,70 Z",
  bound: "M30,50 Q50,25 70,50 L70,70 Q50,95 30,70 Z",
};

// Cell morphing shapes
export const cellShapes = {
  healthy: {
    neuron: "M50,50 m-20,0 a20,20 0 1,1 40,0 a20,20 0 1,1 -40,0",
    astrocyte: "M50,50 l10,-20 l10,10 l10,-10 l-10,20 l10,10 l-20,-10 l-10,10 l-10,-10 z",
    microglia: "M50,50 m-15,0 l30,0 m-15,-15 l0,30 m-10,-10 l20,0 m-10,-10 l0,20",
    oligodendrocyte: "M50,30 Q30,40 30,50 Q30,60 50,70 Q70,60 70,50 Q70,40 50,30",
  },
  diseased: {
    neuron: "M50,50 m-15,-5 a15,20 30 1,1 30,10 a15,20 30 1,1 -30,-10",
    astrocyte: "M50,50 l15,-25 l5,15 l15,-5 l-15,15 l15,15 l-25,-15 l-10,15 l-10,-15 z",
    microglia: "M50,50 m-20,-5 l40,10 m-20,-20 l5,35 m-15,-15 l25,5 m-15,-15 l10,25",
    oligodendrocyte: "M50,25 Q25,35 25,50 Q25,65 50,75 Q75,65 75,50 Q75,35 50,25",
  },
};

// Synapse animation paths
export const synapsePaths = {
  presynaptic: "M10,50 Q30,50 40,45 L40,55 Q30,50 10,50",
  synapticCleft: "M40,45 L60,45 M40,55 L60,55",
  postsynaptic: "M60,45 Q70,50 90,50 L90,50 Q70,50 60,55",
  vesicle: "M20,50 m-3,0 a3,3 0 1,1 6,0 a3,3 0 1,1 -6,0",
  neurotransmitter: "M50,50 m-1,0 a1,1 0 1,1 2,0 a1,1 0 1,1 -2,0",
};

// Blood vessel morphing
export const vesselStates = {
  normal: "M10,50 Q30,45 50,50 T90,50",
  constricted: "M10,50 Q30,48 50,50 T90,50",
  dilated: "M10,50 Q30,40 50,50 T90,50",
  damaged: "M10,50 Q25,43 40,48 Q55,53 70,47 T90,50",
};

// Animation functions
export const morphCell = (
  element: gsap.TweenTarget,
  fromState: string,
  toState: string,
  cellType: keyof typeof cellShapes.healthy,
  duration: number = 2
) => {
  const fromPath = cellShapes[fromState as keyof typeof cellShapes]?.[cellType];
  const toPath = cellShapes[toState as keyof typeof cellShapes]?.[cellType];

  if (!fromPath || !toPath) return;

  return gsap.fromTo(
    element,
    {
      morphSVG: fromPath,
    },
    {
      morphSVG: toPath,
      duration,
      ease: "power2.inOut",
    }
  );
};

export const animateSleepTransition = (
  element: gsap.TweenTarget,
  fromStage: keyof typeof sleepStageMorphs,
  toStage: keyof typeof sleepStageMorphs,
  duration: number = 3
) => {
  const from = sleepStageMorphs[fromStage];
  const to = sleepStageMorphs[toStage];

  const tl = gsap.timeline();

  tl.to(element, {
    morphSVG: to.path,
    fill: to.fill,
    opacity: to.opacity,
    duration,
    ease: "power2.inOut",
  });

  return tl;
};

export const animateReceptorBinding = (
  receptor: gsap.TweenTarget,
  ligand: gsap.TweenTarget,
  duration: number = 1.5
) => {
  const tl = gsap.timeline();

  // Move ligand to receptor
  tl.to(ligand, {
    x: 0,
    y: 0,
    duration: duration * 0.6,
    ease: "power2.in",
  })
  // Morph receptor to bound state
  .to(receptor, {
    morphSVG: receptorConformations.bound,
    fill: "#10b981",
    scale: 1.1,
    duration: duration * 0.4,
    ease: "elastic.out(1, 0.5)",
  }, "-=0.2")
  // Fade out ligand (absorbed)
  .to(ligand, {
    opacity: 0,
    scale: 0.5,
    duration: 0.2,
  }, "-=0.1");

  return tl;
};

export const animateActionPotential = (
  axon: gsap.TweenTarget,
  duration: number = 2
) => {
  return gsap.to(axon, {
    drawSVG: "0% 100%",
    stroke: ["#3b82f6", "#fbbf24", "#ef4444", "#3b82f6"],
    strokeWidth: [2, 4, 2],
    duration,
    ease: "none",
    repeat: -1,
  });
};

export const animateVesicleRelease = (
  vesicles: gsap.TweenTarget[],
  duration: number = 1
) => {
  const tl = gsap.timeline();

  vesicles.forEach((vesicle, index) => {
    tl.to(vesicle, {
      y: "+=30",
      opacity: 0,
      scale: 0.5,
      duration: duration * 0.3,
      ease: "power2.out",
    }, index * 0.1)
    .set(vesicle, {
      y: "-=30",
      opacity: 1,
      scale: 1,
    });
  });

  return tl;
};

export const morphProtein = (
  element: gsap.TweenTarget,
  configs: { folded: string; unfolded: string; misfolded: string },
  state: "folded" | "unfolded" | "misfolded",
  duration: number = 2.5
) => {
  return gsap.to(element, {
    morphSVG: configs[state],
    duration,
    ease: state === "misfolded" ? "rough.inOut" : "power2.inOut",
  });
};

// Complex medical morphing sequences
export const createNeurodegenerationSequence = (elements: {
  neurons: gsap.TweenTarget[];
  synapses: gsap.TweenTarget[];
  plaques?: gsap.TweenTarget[];
}) => {
  const tl = gsap.timeline();

  // Healthy state
  tl.set(elements.neurons, {
    fill: "#10b981",
    scale: 1,
    opacity: 1,
  });

  // Early degeneration
  tl.to(elements.neurons, {
    fill: "#f59e0b",
    scale: 0.95,
    duration: 2,
    stagger: {
      each: 0.2,
      from: "random",
    },
  })
  // Synapse loss
  .to(elements.synapses, {
    opacity: 0,
    scale: 0,
    duration: 1,
    stagger: {
      each: 0.1,
      from: "random",
    },
  }, "-=1")
  // Advanced degeneration
  .to(elements.neurons, {
    fill: "#ef4444",
    scale: 0.7,
    morphSVG: cellShapes.diseased.neuron,
    duration: 2,
    stagger: {
      each: 0.3,
      from: "center",
    },
  });

  // Add plaques if provided
  if (elements.plaques) {
    tl.fromTo(elements.plaques, {
      scale: 0,
      opacity: 0,
    }, {
      scale: 1,
      opacity: 0.7,
      duration: 1.5,
      stagger: 0.2,
      ease: "power2.out",
    }, "-=1");
  }

  return tl;
};

export const createDrugMechanismSequence = (elements: {
  drug: gsap.TweenTarget;
  receptor: gsap.TweenTarget;
  downstream: gsap.TweenTarget[];
  effect?: gsap.TweenTarget;
}) => {
  const tl = gsap.timeline();

  // Drug approach
  tl.from(elements.drug, {
    x: -100,
    y: -50,
    scale: 0,
    duration: 1,
    ease: "back.out(1.7)",
  })
  // Binding
  .to(elements.drug, {
    x: 0,
    y: 0,
    duration: 0.8,
    ease: "power2.in",
  })
  .to(elements.receptor, {
    morphSVG: receptorConformations.active,
    fill: "#10b981",
    scale: 1.2,
    duration: 0.5,
    ease: "elastic.out(1, 0.3)",
  }, "-=0.2")
  // Downstream signaling
  .to(elements.downstream, {
    fill: "#60a5fa",
    scale: 1.1,
    duration: 0.3,
    stagger: {
      each: 0.1,
      from: "start",
    },
    ease: "power2.out",
  })
  // Effect
  .to(elements.effect || elements.downstream, {
    opacity: [1, 0.5, 1],
    scale: [1, 1.2, 1],
    duration: 1,
    ease: "power2.inOut",
  });

  return tl;
};

export default {
  morphNeuronStates,
  sleepStageMorphs,
  receptorConformations,
  cellShapes,
  synapsePaths,
  vesselStates,
  morphCell,
  animateSleepTransition,
  animateReceptorBinding,
  animateActionPotential,
  animateVesicleRelease,
  morphProtein,
  createNeurodegenerationSequence,
  createDrugMechanismSequence,
};