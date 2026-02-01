export type NarrativePhase =
  | "intro"
  | "oscillation"
  | "vasomotion"
  | "volume-exchange"
  | "flow-clearance";

export interface Section3State {
  scrollProgress: number;
  phase: NarrativePhase;
  time: number;
  neLevel: number;
  vesselDiameter: number;
  csfVolume: number;
  bloodVolume: number;
  flowRate: number;
  wasteConcentration: number;
  colorTheme: "blue-orange";
  cycleIndex: number;
}

export interface NEDataPoint {
  time: number;
  level: number;
}

export interface VolumeDataPoint {
  time: number;
  blood: number;
  csf: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  speed: number;
}
