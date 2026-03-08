export type SleepPhase = 'wake' | 'nrem-onset' | 'nrem-deep' | 'transition' | 'rem';
export type ColorTheme = 'blue' | 'purple' | 'transition';
export type BrainstemPosition = 'nrem' | 'rem';
export type SleepStage = 'wake' | 'n1' | 'n2' | 'n3' | 'rem';

export interface SpectralBands {
  delta: number; // 0-1 normalized power in delta band
  theta: number; // 0-1 normalized power in theta band
}

export interface Section2State {
  scrollProgress: number;
  phase: SleepPhase;
  remBlendFactor: number; // 0 = pure NREM, 1 = pure REM (for smooth waveform transitions)
  cortexWaveFrequency: number;
  cortexWaveAmplitude: number;
  hypnogramStage: SleepStage;
  hypnogramProgress: number;
  trnSpindleActive: boolean;
  trnSpindleIntensity: number;
  memoryFlowRate: number;
  memoryFlowPattern: 'transfer' | 'sync';
  brainstemPosition: BrainstemPosition;
  atoniaEngaged: boolean;
  atoniaPathwayGlow: number;
  eogAmplitude: number;
  eogBurstRate: number;
  eogBurstPattern: 'minimal' | 'emerging' | 'rem-saccades';
  emgAmplitude: number;
  emgPattern: 'irregular' | 'flattening' | 'flatline';
  respirationRate: number;
  respirationAmplitude: number;
  respirationPattern: 'regular' | 'irregular';
  heartRate: number;
  heartRateVariability: number;
  colorTheme: ColorTheme;
  spectralPower: {
    frontal: SpectralBands;
    parietal: SpectralBands;
    limbic: SpectralBands;
  };
}
