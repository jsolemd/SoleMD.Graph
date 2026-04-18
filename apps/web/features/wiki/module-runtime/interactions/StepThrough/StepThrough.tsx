"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ActionIcon } from "@mantine/core";
import { ChevronUp, ChevronDown } from "lucide-react";
import { moduleAccentCssVar } from "@/lib/pastel-tokens";
import {
  useStepThrough,
  type UseStepThroughConfig,
  type StepThroughState,
} from "./useStepThrough";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
} from "@/features/wiki/module-runtime/motion";

/* ── Context ── */

const StepThroughContext = createContext<StepThroughState | null>(null);

function useStepThroughContext(): StepThroughState {
  const ctx = useContext(StepThroughContext);
  if (!ctx) {
    throw new Error(
      "StepThrough compound components must be rendered inside <StepThrough>",
    );
  }
  return ctx;
}

/* ── Root ── */

interface StepThroughRootProps extends UseStepThroughConfig {
  children: ReactNode;
  className?: string;
}

function StepThroughRoot({
  children,
  className,
  ...config
}: StepThroughRootProps) {
  const state = useStepThrough(config);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        state.next();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        state.prev();
      }
    },
    [state],
  );

  return (
    <StepThroughContext.Provider value={state}>
      <div
        role="tablist"
        aria-orientation="vertical"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={`flex flex-col outline-none ${className ?? ""}`}
      >
        {children}
      </div>
    </StepThroughContext.Provider>
  );
}

/* ── Step ── */

interface StepProps {
  index: number;
  title: string;
  children?: ReactNode;
}

function Step({ index, title, children }: StepProps) {
  const { activeStep, goTo } = useStepThroughContext();
  const isActive = index === activeStep;
  const isPast = index < activeStep;
  const reduced = usePrefersReducedMotion();

  return (
    <div
      role="tab"
      aria-selected={isActive}
      style={{ display: "flex", gap: "var(--mantine-spacing-md)" }}
    >
      {/* Numbered circle + vertical line */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => goTo(index)}
          aria-label={`Go to step ${index + 1}: ${title}`}
          style={{
            position: "relative",
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: isActive
              ? moduleAccentCssVar
              : isPast
                ? `color-mix(in srgb, ${moduleAccentCssVar} 40%, var(--surface))`
                : "var(--border-default)",
            color: isActive || isPast ? "white" : "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
            transition: "background 0.2s ease, color 0.2s ease",
          }}
        >
          {index + 1}

          {/* Active pulse ring */}
          {isActive && !reduced && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${moduleAccentCssVar}` }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </button>

        {/* Vertical connector line - rendered after circle, hidden on last step via parent */}
        <div
          style={{
            width: 2,
            flex: 1,
            minHeight: 24,
            background: "var(--border-default)",
          }}
        />
      </div>

      {/* Content */}
      <div style={{ paddingBottom: "var(--mantine-spacing-xl)", flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => goTo(index)}
          style={{
            all: "unset",
            cursor: "pointer",
            fontWeight: isActive ? 700 : 600,
            fontSize: 15,
            color: isActive
              ? "var(--text-primary)"
              : "var(--text-secondary)",
            transition: "color 0.2s ease",
            display: "block",
            marginBottom: isActive ? 8 : 0,
          }}
        >
          {title}
        </button>

        <AnimatePresence mode="wait">
          {isActive && children && (
            <motion.div
              key={`step-content-${index}`}
              variants={reduced ? cardRevealReduced : cardReveal}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Nav ── */

interface NavProps {
  className?: string;
}

function Nav({ className }: NavProps) {
  const { prev, next, isFirst, isLast } = useStepThroughContext();

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <ActionIcon
        variant="light"
        size="lg"
        onClick={prev}
        disabled={isFirst}
        aria-label="Previous step"
        style={{
          "--ai-color": moduleAccentCssVar,
        } as React.CSSProperties}
      >
        <ChevronUp size={18} />
      </ActionIcon>
      <ActionIcon
        variant="light"
        size="lg"
        onClick={next}
        disabled={isLast}
        aria-label="Next step"
        style={{
          "--ai-color": moduleAccentCssVar,
        } as React.CSSProperties}
      >
        <ChevronDown size={18} />
      </ActionIcon>
    </div>
  );
}

/* ── Compound export ── */

export const StepThrough = Object.assign(StepThroughRoot, {
  Step,
  Nav,
});

export { useStepThroughContext };
