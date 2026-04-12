"use client";

import { createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Text } from "@mantine/core";
import { ChatBubble } from "@/features/wiki/module-runtime/primitives/ChatBubble";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
} from "@/features/wiki/module-runtime/motion";
import {
  useChatThread,
  type UseChatThreadConfig,
  type ChatThreadState,
} from "./useChatThread";

/* ─── Context ─────────────────────────────────────────────────── */

const ChatThreadContext = createContext<ChatThreadState | null>(null);

function useChatThreadContext(): ChatThreadState {
  const ctx = useContext(ChatThreadContext);
  if (!ctx) {
    throw new Error("ChatThread.* must be used inside <ChatThread>");
  }
  return ctx;
}

/* ─── Typing Indicator ────────────────────────────────────────── */

function TypingIndicator() {
  return (
    <div className="flex gap-1 px-4 py-3" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--text-tertiary)" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

interface MessageProps {
  index: number;
  role: "user" | "ai";
  children: React.ReactNode;
}

function Message({ index, role, children }: MessageProps) {
  const { visibleCount, isTyping } = useChatThreadContext();
  const reduced = usePrefersReducedMotion();
  const variants = reduced ? cardRevealReduced : cardReveal;

  const isVisible = index < visibleCount;
  const isNext = index === visibleCount;
  const showTyping = isNext && isTyping && role === "ai";

  return (
    <AnimatePresence mode="popLayout">
      {showTyping && (
        <motion.div
          key={`typing-${index}`}
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex justify-start"
        >
          <div
            className="rounded-[1rem] px-1"
            style={{
              background: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <TypingIndicator />
          </div>
        </motion.div>
      )}

      {isVisible && (
        <motion.div
          key={`msg-${index}`}
          variants={variants}
          initial="hidden"
          animate="visible"
          layout={!reduced}
        >
          <ChatBubble role={role}>{children}</ChatBubble>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface InputProps {
  children: React.ReactNode;
}

function Input({ children }: InputProps) {
  return (
    <div
      className="mt-2 rounded-[0.75rem] border px-4 py-3"
      style={{
        borderColor: "var(--border-default)",
        background: "var(--surface)",
        color: "var(--text-tertiary)",
      }}
    >
      <Text size="sm" style={{ lineHeight: 1.5 }}>
        {children}
      </Text>
    </div>
  );
}

interface ControlsProps {
  children?: React.ReactNode;
  nextLabel?: string;
}

function Controls({ children, nextLabel = "Next" }: ControlsProps) {
  const { advance, isComplete, isTyping } = useChatThreadContext();

  return (
    <div className="mt-3 flex items-center gap-3">
      {children}
      {!isComplete && (
        <button
          type="button"
          onClick={advance}
          disabled={isTyping}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: isTyping
              ? "var(--border-default)"
              : "var(--module-accent)",
            color: isTyping ? "var(--text-tertiary)" : "white",
            cursor: isTyping ? "not-allowed" : "pointer",
            opacity: isTyping ? 0.6 : 1,
          }}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

/* ─── Root ────────────────────────────────────────────────────── */

interface ChatThreadProps extends UseChatThreadConfig {
  children: React.ReactNode;
  className?: string;
}

function ChatThreadRoot({
  children,
  className,
  ...config
}: ChatThreadProps) {
  const state = useChatThread(config);

  return (
    <ChatThreadContext.Provider value={state}>
      <div
        className={`flex flex-col gap-3 ${className ?? ""}`}
        role="log"
        aria-live="polite"
      >
        {children}
      </div>
    </ChatThreadContext.Provider>
  );
}

/* ─── Compound export ─────────────────────────────────────────── */

export const ChatThread = Object.assign(ChatThreadRoot, {
  Message,
  Input,
  Controls,
});
