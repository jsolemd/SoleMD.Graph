"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Stack, Text } from "@mantine/core";

interface Props {
  /**
   * Optional reset key. When the value changes, the boundary resets and
   * re-renders its children. Typically the wiki module slug.
   */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Last resetKey we saw, used to auto-recover when the caller switches slugs. */
  lastResetKey: string | undefined;
}

/**
 * Catches render errors in the lazy-loaded wiki module tree (e.g. a dynamic
 * chunk failing to fetch on a stale CDN, or a module throwing during render)
 * so a single broken module does not tear down the whole wiki panel.
 *
 * Inherits panel surface styling — no hairline outlines
 * (see feedback_no_hairline_outlines.md).
 */
export class WikiModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      lastResetKey: props.resetKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    nextProps: Props,
    prevState: State,
  ): Partial<State> | null {
    if (nextProps.resetKey !== prevState.lastResetKey) {
      return {
        hasError: false,
        error: null,
        lastResetKey: nextProps.resetKey,
      };
    }
    return null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Formal logger comes later; console.error is the minimum contract.
    console.error("[WikiModuleErrorBoundary] module render failed", error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error?.message ??
      "This module failed to load. The content may be temporarily unavailable.";

    return (
      <Stack
        gap="xs"
        align="flex-start"
        className="px-4 py-6"
        role="alert"
        aria-live="polite"
      >
        <Text size="sm" fw={600} style={{ color: "var(--text-primary)" }}>
          Module failed to load
        </Text>
        <Text size="xs" style={{ color: "var(--text-secondary)" }}>
          {message}
        </Text>
        <Button
          size="xs"
          variant="subtle"
          onClick={this.handleRetry}
          styles={{
            root: {
              color: "var(--brand-accent)",
              paddingInline: 0,
            },
          }}
        >
          Retry
        </Button>
      </Stack>
    );
  }
}
