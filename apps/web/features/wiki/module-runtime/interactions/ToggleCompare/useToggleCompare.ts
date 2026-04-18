"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseToggleCompareConfig<T extends string = string> {
  options: T[];
  defaultOption?: T;
}

export interface ToggleCompareState<T extends string = string> {
  active: T;
  setActive: (option: T) => void;
  activeIndex: number;
}

export function useToggleCompare<T extends string = string>({
  options,
  defaultOption,
}: UseToggleCompareConfig<T>): ToggleCompareState<T> {
  const [active, setActiveRaw] = useState<T>(defaultOption ?? options[0]);

  const setActive = useCallback(
    (option: T) => {
      if (options.includes(option)) {
        setActiveRaw(option);
      }
    },
    [options],
  );

  const activeIndex = options.indexOf(active);

  return useMemo(
    () => ({ active, setActive, activeIndex }),
    [active, setActive, activeIndex],
  );
}
