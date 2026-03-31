"use client";

import { useEffect, useReducer, useRef } from "react";

type Phase = "delay" | "typing" | "deleting" | "done";

interface TypewriterState {
  display: string;
  textIdx: number;
  charIdx: number;
  phase: Phase;
}

type TypewriterAction =
  | { type: "RESET" }
  | { type: "SET_PHASE"; phase: Phase }
  | { type: "TYPE_CHAR"; text: string }
  | { type: "DELETE_CHAR" }
  | { type: "NEXT_TEXT" };

const initialState: TypewriterState = {
  display: "",
  textIdx: 0,
  charIdx: 0,
  phase: "delay",
};

function reducer(state: TypewriterState, action: TypewriterAction): TypewriterState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "TYPE_CHAR":
      return {
        ...state,
        charIdx: state.charIdx + 1,
        display: action.text.slice(0, state.charIdx + 1),
      };
    case "DELETE_CHAR":
      return { ...state, display: state.display.slice(0, -1) };
    case "NEXT_TEXT":
      return { ...state, textIdx: state.textIdx + 1, charIdx: 0, phase: "typing" };
  }
}

/** Cycles through texts once with a typewriter type/delete effect, then stops. */
export function useTypewriter(
  texts: string[],
  { speed = 45, deleteSpeed = 25, waitTime = 2000, initialDelay = 600 } = {},
) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const textsRef = useRef(texts);

  // Reset when texts array identity changes (mode switch)
  useEffect(() => {
    textsRef.current = texts;
    dispatch({ type: "RESET" });
  }, [texts]);

  useEffect(() => {
    const { phase, textIdx, charIdx, display } = state;
    if (phase === "done") return;
    const current = textsRef.current[textIdx];
    if (!current) return;

    let timeout: ReturnType<typeof setTimeout>;

    switch (phase) {
      case "delay":
        timeout = setTimeout(() => dispatch({ type: "SET_PHASE", phase: "typing" }), initialDelay);
        break;
      case "typing":
        if (charIdx < current.length) {
          timeout = setTimeout(() => dispatch({ type: "TYPE_CHAR", text: current }), speed);
        } else if (textIdx >= textsRef.current.length - 1) {
          // Last text fully typed — hold it
          dispatch({ type: "SET_PHASE", phase: "done" });
        } else {
          timeout = setTimeout(() => dispatch({ type: "SET_PHASE", phase: "deleting" }), waitTime);
        }
        break;
      case "deleting":
        if (display.length > 0) {
          timeout = setTimeout(() => dispatch({ type: "DELETE_CHAR" }), deleteSpeed);
        } else {
          const nextIdx = textIdx + 1;
          if (nextIdx >= textsRef.current.length) {
            // One full cycle complete
            dispatch({ type: "SET_PHASE", phase: "done" });
          } else {
            dispatch({ type: "NEXT_TEXT" });
          }
        }
        break;
    }
    return () => clearTimeout(timeout);
  }, [state, speed, deleteSpeed, waitTime, initialDelay]);

  const done = state.phase === "done";
  const isLast = state.textIdx >= texts.length - 1;
  return { text: state.display, done, isLast };
}
