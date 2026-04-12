"use client";

import { createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useToggleCompare,
  type UseToggleCompareConfig,
  type ToggleCompareState,
} from "./useToggleCompare";
import { smooth, usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

/* ── Context ── */

const ToggleCompareContext = createContext<ToggleCompareState | null>(null);

function useToggleCompareContext(): ToggleCompareState {
  const ctx = useContext(ToggleCompareContext);
  if (!ctx) {
    throw new Error(
      "ToggleCompare compound components must be rendered inside <ToggleCompare>",
    );
  }
  return ctx;
}

/* ── Root ── */

interface ToggleCompareRootProps<T extends string = string>
  extends UseToggleCompareConfig<T> {
  children: ReactNode;
  className?: string;
}

function ToggleCompareRoot<T extends string = string>({
  children,
  className,
  ...config
}: ToggleCompareRootProps<T>) {
  const state = useToggleCompare(config);

  return (
    <ToggleCompareContext.Provider value={state as unknown as ToggleCompareState}>
      <div className={`flex flex-col gap-4 ${className ?? ""}`}>
        {children}
      </div>
    </ToggleCompareContext.Provider>
  );
}

/* ── Control ── */

interface ControlProps {
  children: ReactNode;
}

function Control({ children }: ControlProps) {
  return <div className="flex justify-center">{children}</div>;
}

/* ── Display ── */

interface DisplayProps {
  children: ReactNode;
}

function Display({ children }: DisplayProps) {
  const { active } = useToggleCompareContext();
  const reduced = usePrefersReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={active}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
        transition={{
          y: smooth,
          opacity: { duration: 0.15, ease: "easeOut" },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Option ── */

interface OptionProps {
  value: string;
  children: ReactNode;
}

function Option({ value, children }: OptionProps) {
  const { active } = useToggleCompareContext();
  if (active !== value) return null;
  return <>{children}</>;
}

/* ── Compound export ── */

export const ToggleCompare = Object.assign(ToggleCompareRoot, {
  Control,
  Display,
  Option,
});

export { useToggleCompareContext };
