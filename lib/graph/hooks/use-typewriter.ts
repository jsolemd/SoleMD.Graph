"use client";

import { useEffect, useRef, useState } from "react";

/** Cycles through texts once with a typewriter type/delete effect, then stops. */
export function useTypewriter(
  texts: string[],
  { speed = 45, deleteSpeed = 25, waitTime = 2000, initialDelay = 600 } = {},
) {
  const [display, setDisplay] = useState("");
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<"delay" | "typing" | "deleting" | "done">("delay");
  const textsRef = useRef(texts);

  // Reset when texts array identity changes (mode switch)
  useEffect(() => {
    textsRef.current = texts;
    setDisplay("");
    setTextIdx(0);
    setCharIdx(0);
    setDone(false);
    setPhase("delay");
  }, [texts]);

  useEffect(() => {
    if (phase === "done") return;
    const current = textsRef.current[textIdx];
    if (!current) return;

    let timeout: ReturnType<typeof setTimeout>;

    switch (phase) {
      case "delay":
        timeout = setTimeout(() => setPhase("typing"), initialDelay);
        break;
      case "typing":
        if (charIdx < current.length) {
          timeout = setTimeout(() => {
            setDisplay(current.slice(0, charIdx + 1));
            setCharIdx((c) => c + 1);
          }, speed);
        } else if (textIdx >= textsRef.current.length - 1) {
          // Last text fully typed — hold it
          setDone(true);
          setPhase("done");
        } else {
          timeout = setTimeout(() => setPhase("deleting"), waitTime);
        }
        break;
      case "deleting":
        if (display.length > 0) {
          timeout = setTimeout(() => {
            setDisplay((d) => d.slice(0, -1));
          }, deleteSpeed);
        } else {
          const nextIdx = textIdx + 1;
          if (nextIdx >= textsRef.current.length) {
            // One full cycle complete
            setDone(true);
            setPhase("done");
          } else {
            setTextIdx(nextIdx);
            setCharIdx(0);
            setPhase("typing");
          }
        }
        break;
    }
    return () => clearTimeout(timeout);
  }, [phase, charIdx, display, textIdx, speed, deleteSpeed, waitTime, initialDelay]);

  const isLast = textIdx >= textsRef.current.length - 1;
  return { text: display, done, isLast };
}
