"use client";

import { useCallback, useState } from "react";

export function useCopyFeedback(selectedNodeId: string | null) {
  const [copyState, setCopyState] = useState<{
    nodeId: string | null;
    status: "idle" | "copied" | "failed";
  }>({ nodeId: selectedNodeId, status: "idle" });

  const setCopied = useCallback((state: "copied" | "failed") => {
    setCopyState({ nodeId: selectedNodeId, status: state });
    window.setTimeout(() => {
      setCopyState((current) =>
        current.nodeId === selectedNodeId ? { nodeId: selectedNodeId, status: "idle" } : current
      );
    }, 1800);
  }, [selectedNodeId]);

  const effectiveState = copyState.nodeId === selectedNodeId ? copyState.status : "idle";

  const copyLabel =
    effectiveState === "copied" ? "Copied" : effectiveState === "failed" ? "Copy failed" : "Copy note";

  return { copyLabel, setCopied };
}
