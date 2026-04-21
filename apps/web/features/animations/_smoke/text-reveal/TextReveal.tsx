"use client";
/**
 * D13 smoke test — character stagger reveal via Framer Motion variants.
 *
 * Signature pattern from references/creative-patterns.md §3 (text
 * stagger reveal). Characters enter from a slight y-offset and fade in
 * using staggerChildren on their parent motion element.
 *
 * **Architecture note (real bug I caught in the first version):**
 * Framer Motion's `staggerChildren` only orchestrates DIRECT motion
 * children. If you wrap the characters in plain HTML (h2, span) and
 * then put motion.spans inside, the stagger never propagates — the
 * characters all animate simultaneously or not at all. The fix is to
 * make the TITLE element itself a `motion.*` with the stagger
 * transition, and the characters direct motion children of it. No
 * non-motion elements in between.
 *
 * Honors `useReducedMotion` with a rest-state render.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";

const HEADLINE = "Elegant, Precise, Calm.";
const SUBLINE = "Apple Health meets the New England Journal of Medicine.";

const container: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.15,
    },
  },
};

const subContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.028,
      delayChildren: 0.9,
    },
  },
};

const char: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      y: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] },
      opacity: { duration: 0.1, ease: "easeOut" },
    },
  },
};

function renderChars(text: string) {
  return text.split("").map((c, i) => (
    <motion.span
      key={i}
      variants={char}
      style={{
        display: "inline-block",
        whiteSpace: c === " " ? "pre" : undefined,
      }}
    >
      {c}
    </motion.span>
  ));
}

export default function TextReveal() {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div className="flex h-[280px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h2
          className="text-3xl font-medium tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {HEADLINE}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {SUBLINE}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[280px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <motion.h2
        className="text-3xl font-medium tracking-tight"
        style={{ color: "var(--text-primary)" }}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        {renderChars(HEADLINE)}
      </motion.h2>
      <motion.p
        className="text-sm"
        style={{ color: "var(--text-secondary)" }}
        variants={subContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        {renderChars(SUBLINE)}
      </motion.p>
    </div>
  );
}
