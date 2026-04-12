"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

export interface UseChatThreadConfig {
  messageCount: number;
  autoAdvance?: boolean;
  autoAdvanceDelay?: number;
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

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        // Only advance if the focus is not on an interactive element
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
        e.preventDefault();
        advance();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance]);

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
