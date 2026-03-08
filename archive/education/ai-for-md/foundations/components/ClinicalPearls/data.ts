export interface ClinicalPearl {
  id: string;
  title: string;
  category: 'circadian' | 'pharmacology' | 'behavioral';
  summary: string;
  frontContent: {
    icon: string; // For Lottie animation asset
    quickStat: {
      value: number;
      unit: string;
      trend: number[]; // Sparkline data
    };
  };
  backContent: {
    explanation: string;
    evidenceLevel: {
      score: number; // 0-100
      description: string;
    };
    interventions: string[];
    outcomes: string[];
    citations: number;
  };
  keywords: string[];
  sleepDataReference?: {
    mechanism: keyof import('../../../../../../lib/sleep-neurobiology/types').SleepNeurobiologyReferenceData;
    dataKey: string;
  };
}

export const clinicalPearlsData: ClinicalPearl[] = [
  {
    id: 'sleep-debt-accumulation',
    title: 'Sleep Debt Accumulation',
    category: 'behavioral',
    summary: 'Process S increases by ~1 unit per hour awake, creating exponential recovery pressure',
    frontContent: {
      icon: 'sleep-debt-animation',
      quickStat: {
        value: 16,
        unit: 'hrs max',
        trend: [0, 2, 4, 6, 8, 10, 12, 14, 16]
      }
    },
    backContent: {
      explanation: 'Sleep debt follows a predictable accumulation pattern based on Process S (sleep homeostatic drive). Each hour of wakefulness increases adenosine levels in the basal forebrain, creating mounting pressure for sleep recovery. The relationship becomes exponential after 12+ hours, explaining why partial sleep restriction has cumulative effects.',
      evidenceLevel: {
        score: 92,
        description: 'Strong evidence from multiple sleep deprivation studies'
      },
      interventions: [
        'Strategic napping (10-20 min) before debt exceeds 12 hours',
        'Split sleep schedules for shift workers',
        'Gradual sleep extension over 2-3 weeks'
      ],
      outcomes: [
        'Cognitive performance decline after 17+ hours awake',
        'Microsleep episodes begin around 20 hours',
        'Complete recovery requires 1.5x the debt duration'
      ],
      citations: 47
    },
    keywords: ['adenosine', 'homeostatic drive', 'sleep pressure', 'recovery'],
    sleepDataReference: {
      mechanism: 'processScenarios',
      dataKey: 'baseline'
    }
  },
  {
    id: 'rem-suppression-rebound',
    title: 'REM Suppression & Rebound',
    category: 'pharmacology',
    summary: 'Most antidepressants suppress REM by 50-90%, leading to intense rebound upon discontinuation',
    frontContent: {
      icon: 'rem-cycle-animation',
      quickStat: {
        value: 75,
        unit: '% reduction',
        trend: [25, 20, 15, 10, 8, 5, 5, 8, 12]
      }
    },
    backContent: {
      explanation: 'SSRIs, SNRIs, and tricyclics dramatically reduce REM sleep through increased serotonergic and noradrenergic tone at REM-off neurons in the brainstem. This creates a "REM pressure" that builds over weeks. Abrupt discontinuation triggers intense REM rebound with vivid dreams, night sweats, and sleep fragmentation.',
      evidenceLevel: {
        score: 89,
        description: 'Consistent findings across multiple drug classes'
      },
      interventions: [
        'Gradual taper over 6-12 weeks minimum',
        'Temporary sleep aids during withdrawal',
        'Melatonin 1-3mg to stabilize circadian rhythm'
      ],
      outcomes: [
        'REM rebound peaks 3-7 days post-discontinuation',
        'Return to baseline REM% in 2-4 weeks',
        'Mood instability correlates with REM disruption'
      ],
      citations: 34
    },
    keywords: ['antidepressants', 'REM sleep', 'withdrawal', 'rebound'],
    sleepDataReference: {
      mechanism: 'remSwitch',
      dataKey: 'ssri'
    }
  },
  {
    id: 'circadian-misalignment',
    title: 'Circadian Misalignment',
    category: 'circadian',
    summary: 'Even 1-hour shifts can disrupt metabolic timing for 3-5 days in sensitive individuals',
    frontContent: {
      icon: 'circadian-clock-animation',
      quickStat: {
        value: 3.5,
        unit: 'days recovery',
        trend: [10, 8, 6, 4, 3, 2, 1.5, 1, 0.5]
      }
    },
    backContent: {
      explanation: 'The suprachiasmatic nucleus orchestrates ~40 peripheral clocks throughout the body. Light exposure shifts the central clock within hours, but peripheral tissues (liver, adipose, muscle) require days to resynchronize. This temporal misalignment disrupts glucose tolerance, cortisol rhythm, and temperature regulation.',
      evidenceLevel: {
        score: 85,
        description: 'Robust evidence from chronobiology research'
      },
      interventions: [
        'Morning light therapy (10,000 lux × 30 min)',
        'Meal timing shifts (align with desired schedule)',
        'Controlled evening light exposure (<50 lux after sunset)'
      ],
      outcomes: [
        'Glucose tolerance improves after 4-5 days',
        'Sleep efficiency normalizes in 1-2 weeks',
        'Individual variation: 20% are highly sensitive'
      ],
      citations: 28
    },
    keywords: ['circadian rhythm', 'jet lag', 'shift work', 'metabolism'],
    sleepDataReference: {
      mechanism: 'processScenarios',
      dataKey: 'night_shift'
    }
  },
  {
    id: 'glymphatic-clearance',
    title: 'Glymphatic System Function',
    category: 'behavioral',
    summary: 'Deep sleep increases glymphatic flow by 60%, enhancing amyloid-β clearance',
    frontContent: {
      icon: 'brain-waves-animation',
      quickStat: {
        value: 60,
        unit: '% increase',
        trend: [0, 10, 25, 40, 55, 60, 58, 45, 30]
      }
    },
    backContent: {
      explanation: 'During NREM stages 3-4, astrocytes shrink by ~60%, expanding extracellular space and allowing cerebrospinal fluid to flush metabolic waste. This process is critical for clearing amyloid-β, tau proteins, and other neurotoxic substances. Side sleeping may enhance clearance compared to supine position.',
      evidenceLevel: {
        score: 78,
        description: 'Emerging evidence from neuroimaging studies'
      },
      interventions: [
        'Prioritize deep sleep (stages 3-4)',
        'Maintain consistent sleep duration (7-9 hours)',
        'Consider lateral sleeping position'
      ],
      outcomes: [
        'Reduced amyloid-β accumulation with adequate deep sleep',
        'Cognitive protection in aging populations',
        'Potential neuroprotection against dementia'
      ],
      citations: 19
    },
    keywords: ['glymphatic system', 'deep sleep', 'amyloid clearance', 'neuroprotection'],
    sleepDataReference: {
      mechanism: 'glymphatic',
      dataKey: 'baseline'
    }
  },
  {
    id: 'neurotransmitter-oscillations',
    title: 'Neurotransmitter Sleep Cycling',
    category: 'pharmacology',
    summary: 'GABA peaks in NREM while acetylcholine surges 300% during REM sleep',
    frontContent: {
      icon: 'neurotransmitter-animation',
      quickStat: {
        value: 300,
        unit: '% ACh surge',
        trend: [100, 95, 90, 85, 120, 180, 250, 300, 280]
      }
    },
    backContent: {
      explanation: 'Sleep stages show distinct neurotransmitter profiles: GABA dominates NREM sleep via thalamic inhibition, while acetylcholine from the pedunculopontine nucleus drives REM. Norepinephrine and serotonin are virtually silent during REM, allowing cholinergic dominance. This cycling is essential for memory consolidation and emotional processing.',
      evidenceLevel: {
        score: 91,
        description: 'Well-established from decades of sleep research'
      },
      interventions: [
        'Avoid anticholinergics before bed (impair REM)',
        'Consider GABAergic aids for sleep initiation only',
        'Time cholinesterase inhibitors away from bedtime'
      ],
      outcomes: [
        'Disrupted cycling impairs memory consolidation',
        'REM-selective medications affect mood regulation',
        'Balanced cycling supports cognitive function'
      ],
      citations: 52
    },
    keywords: ['GABA', 'acetylcholine', 'REM sleep', 'neurotransmitters'],
    sleepDataReference: {
      mechanism: 'neurotransmitters',
      dataKey: 'baseline'
    }
  },
  {
    id: 'temperature-rhythm',
    title: 'Core Body Temperature Rhythm',
    category: 'circadian',
    summary: 'CBT drops 1-2°C during sleep, with timing predicting sleep propensity',
    frontContent: {
      icon: 'temperature-animation',
      quickStat: {
        value: 1.5,
        unit: '°C drop',
        trend: [37.2, 37.0, 36.8, 36.5, 36.2, 36.0, 36.2, 36.5, 36.8]
      }
    },
    backContent: {
      explanation: 'Core body temperature follows a robust circadian rhythm, dropping 1-2°C from evening peak to early morning nadir. This decline is mediated by peripheral vasodilation and reduced metabolic rate. The rate of temperature decline, not absolute temperature, best predicts sleep onset timing and sleep quality.',
      evidenceLevel: {
        score: 87,
        description: 'Fundamental chronobiology finding'
      },
      interventions: [
        'Cool bedroom environment (65-68°F/18-20°C)',
        'Warm bath 90 minutes before bed (vasodilation)',
        'Avoid late exercise (elevates CBT for 4-6 hours)'
      ],
      outcomes: [
        'Faster sleep onset with optimal temperature decline',
        'Deeper sleep during temperature nadir',
        'Early morning awakening when temperature rises'
      ],
      citations: 41
    },
    keywords: ['body temperature', 'circadian rhythm', 'sleep onset', 'thermoregulation'],
    sleepDataReference: {
      mechanism: 'processScenarios',
      dataKey: 'baseline'
    }
  }
];

export const pearlCategories = [
  { id: 'all', label: 'All Pearls', color: '#6B7280' },
  { id: 'circadian', label: 'Circadian', color: '#3B82F6' },
  { id: 'pharmacology', label: 'Pharmacology', color: '#EF4444' },
  { id: 'behavioral', label: 'Behavioral', color: '#10B981' }
] as const;

export const evidenceLevels = {
  excellent: { min: 90, label: 'Excellent', color: '#10B981' },
  strong: { min: 80, label: 'Strong', color: '#3B82F6' },
  moderate: { min: 70, label: 'Moderate', color: '#F59E0B' },
  limited: { min: 0, label: 'Limited', color: '#EF4444' }
} as const;