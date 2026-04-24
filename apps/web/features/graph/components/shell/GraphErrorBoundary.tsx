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

    const msg = this.state.error?.message?.toLowerCase() ?? "";
    const isWebGL = msg.includes("webgl") || msg.includes("gpu");

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--background)]">
        <div className="flex max-w-md flex-col items-center gap-6 px-8 text-center">
          <BrainCircuit
            size={48}
            style={{ opacity: 0.3, color: "var(--brand-accent-alt)" }}
          />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {isWebGL ? "WebGL is not available" : "Something went wrong"}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {isWebGL
              ? "The knowledge graph requires WebGL support. Please try a different browser or enable hardware acceleration."
              : "The knowledge graph failed to load. Please try refreshing."}
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            styles={{
              root: {
                borderColor: "var(--brand-accent-alt)",
                color: "var(--brand-accent-alt)",
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
