"use client";

import {
  createElement,
  type CSSProperties,
  type ElementType,
  type ReactElement,
} from "react";
import {
  motion,
  useReducedMotionConfig as useReducedMotion,
  type Transition,
  type Variants,
} from "framer-motion";

type TextRevealTag = "div" | "span" | "p" | "h1" | "h2" | "h3";

const motionTagMap = {
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  p: motion.p,
  span: motion.span,
} satisfies Record<TextRevealTag, ElementType>;

export interface TextRevealProps {
  as?: TextRevealTag;
  className?: string;
  ease?: Transition["ease"];
  grain?: "chars" | "words";
  stagger?: number;
  style?: CSSProperties;
  text: string;
  trigger?: "mount" | "in-view" | "scroll";
}

function tokenize(text: string, grain: "chars" | "words") {
  if (grain === "chars") return text.split("");
  return text.split(/(\s+)/);
}

export function TextReveal({
  as = "div",
  className,
  ease = [0.2, 0.8, 0.2, 1],
  grain = "chars",
  stagger = 0.045,
  style,
  text,
  trigger = "in-view",
}: TextRevealProps): ReactElement {
  const reduced = useReducedMotion();
  const MotionTag = motionTagMap[as];

  if (reduced) {
    return createElement(as, { className, style }, text);
  }

  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
      },
    },
  };

  const tokenVariant: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        y: { duration: 0.4, ease },
        opacity: { duration: 0.1, ease: "easeOut" },
      },
    },
  };

  const triggerProps =
    trigger === "mount"
      ? { animate: "visible", initial: "hidden" as const }
      : {
          initial: "hidden" as const,
          viewport: {
            amount: 0.2,
            once: trigger !== "scroll",
          },
          whileInView: "visible" as const,
        };

  return (
    <MotionTag
      className={className}
      style={style}
      variants={container}
      {...triggerProps}
    >
      {tokenize(text, grain).map((token, index) => (
        <motion.span
          key={`${token}-${index}`}
          variants={tokenVariant}
          style={{
            display: "inline-block",
            whiteSpace: token.trim() === "" ? "pre" : undefined,
          }}
        >
          {token}
        </motion.span>
      ))}
    </MotionTag>
  );
}
