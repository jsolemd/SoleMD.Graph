"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseStepThroughConfig {
  stepCount: number;
  loop?: boolean;
}

export interface StepThroughState {
  activeStep: number;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function useStepThrough({
  stepCount,
  loop = false,
}: UseStepThroughConfig): StepThroughState {
  const [activeStep, setActiveStep] = useState(0);

  const next = useCallback(() => {
    setActiveStep((current) => {
      if (current >= stepCount - 1) return loop ? 0 : current;
      return current + 1;
    });
  }, [stepCount, loop]);

  const prev = useCallback(() => {
    setActiveStep((current) => {
      if (current <= 0) return loop ? stepCount - 1 : current;
      return current - 1;
    });
  }, [stepCount, loop]);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < stepCount) {
        setActiveStep(index);
      }
    },
    [stepCount],
  );

  const isFirst = activeStep === 0;
  const isLast = activeStep === stepCount - 1;

  return useMemo(
    () => ({ activeStep, next, prev, goTo, isFirst, isLast }),
    [activeStep, next, prev, goTo, isFirst, isLast],
  );
}
