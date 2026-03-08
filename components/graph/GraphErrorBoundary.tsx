"use client";

import { Component, type ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import { Button } from "@mantine/core";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GraphErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isWebGL =
      this.state.error?.message?.toLowerCase().includes("webgl") ||
      this.state.error?.message?.toLowerCase().includes("gpu");

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--graph-bg)]">
        <div className="flex max-w-md flex-col items-center gap-6 px-8 text-center">
          <BrainCircuit size={48} style={{ opacity: 0.3, color: "#a8c5e9" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {isWebGL
              ? "WebGL is not available"
              : "Something went wrong"}
          </h2>
          <p className="text-sm" style={{ color: "var(--foreground)", opacity: 0.6 }}>
            {isWebGL
              ? "The knowledge graph requires WebGL support. Please try a different browser or enable hardware acceleration."
              : "The knowledge graph failed to load. Please try refreshing."}
          </p>
          <Button
            variant="outline"
            radius="xl"
            onClick={() => window.location.reload()}
            styles={{
              root: {
                borderColor: "#a8c5e9",
                color: "#a8c5e9",
              },
            }}
          >
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
