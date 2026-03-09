"use client";

import { Component, type ReactNode } from "react";
import { Text } from "@mantine/core";
import { panelMetaTextClassName, panelTextDimStyle } from "./PanelShell";

/** Catches DuckDB-WASM race conditions without crashing the page. */
export class CosmographWidgetBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center gap-2">
          <Text className={panelMetaTextClassName} style={panelTextDimStyle}>
            Widget failed to load.
          </Text>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-xs underline"
            style={{ color: "var(--brand-accent)" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
