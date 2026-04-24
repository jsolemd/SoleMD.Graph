"use client";

import { useState, useCallback, useEffect, useRef, type RefObject } from "react";
import { usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

export interface UseChatThreadConfig {
  messageCount: number;
  autoAdvance?: boolean;
  autoAdvanceDelay?: number;
  /**
   * Optional ref to the chat-thread root element. When provided, Enter/Space
   * keyboard advancement is scoped to this subtree — only triggers when the
   * focused element is inside (or IS) the referenced element. When omitted,
   * no keyboard listener is installed (callers can use the returned `advance`
   * callback directly or let users click the "Next" button).
   *
   * Scoping prevents the site-wide Space/Enter hijack that occurs when a
   * module is mounted but the user is interacting elsewhere on the page.
   */
  rootRef?: RefObject<HTMLElement | null>;
}

export interface ChatThreadState {
  visibleCount: number;
  isTyping: boolean;
  advance: () => void;
  reset: () => void;
  revealAll: () => void;
  isComplete: boolean;
}

const TYPING_DELAY_MS = 600;
const DEFAULT_AUTO_ADVANCE_DELAY_MS = 1200;

export function useChatThread({
  messageCount,
  autoAdvance = false,
  autoAdvanceDelay = DEFAULT_AUTO_ADVANCE_DELAY_MS,
  rootRef,
}: UseChatThreadConfig): ChatThreadState {
  const reduced = usePrefersReducedMotion();
  const [visibleCount, setVisibleCount] = useState(1);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isComplete = visibleCount >= messageCount;

  const clearTimers = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    if (isTyping) return;

    setVisibleCount((prev) => {
      if (prev >= messageCount) return prev;

      if (reduced) {
        // Reduced motion: skip typing animation, show immediately
        return prev + 1;
      }

      // Start typing indicator, then reveal after delay
      setIsTyping(true);
      typingTimerRef.current = setTimeout(() => {
        setIsTyping(false);
        setVisibleCount((current) => Math.min(current + 1, messageCount));
      }, TYPING_DELAY_MS);

      return prev;
    });
  }, [isTyping, messageCount, reduced]);

  const reset = useCallback(() => {
    clearTimers();
    setIsTyping(false);
    setVisibleCount(1);
  }, [clearTimers]);

  const revealAll = useCallback(() => {
    clearTimers();
    setIsTyping(false);
    setVisibleCount(messageCount);
  }, [clearTimers, messageCount]);

  // Auto-advance timer
  useEffect(() => {
    if (!autoAdvance || isComplete || isTyping) return;

    autoTimerRef.current = setTimeout(() => {
      advance();
    }, autoAdvanceDelay);

    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [autoAdvance, autoAdvanceDelay, isComplete, isTyping, visibleCount, advance]);

  // Scoped keyboard handler: only attaches when a rootRef is provided, and
  // only advances when the event originates inside that subtree. This
  // prevents hijacking Space/Enter site-wide whenever a ChatThread is
  // mounted somewhere on the page.
  useEffect(() => {
    if (!rootRef) return;
    const root = rootRef.current;
    if (!root) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" && e.key !== " ") return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Skip native interactive elements — they handle Enter/Space themselves
      // (buttons activate, inputs insert a space/newline, etc.).
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;

      e.preventDefault();
      advance();
    }

    // Attach to the root element, not window. Events from outside the
    // subtree never reach this listener.
    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [advance, rootRef]);

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  return {
    visibleCount,
    isTyping,
    advance,
    reset,
    revealAll,
    isComplete,
  };
}
