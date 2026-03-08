/**
 * Error Boundary Component for SoleMD
 * Provides graceful error handling with user-friendly fallback UI
 */

"use client";

import React, { Component, ErrorInfo, ReactNode, Suspense, lazy } from "react";
import { Card, Title, Text, Button, Stack, Alert } from "@mantine/core";
import { RefreshCw, Home } from "lucide-react";
import { motion } from "framer-motion";

const LottieAnimation = lazy(() =>
  import("lottie-react").then((mod) => ({
    default: function LottieError() {
      const Lottie = mod.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [animationData, setAnimationData] = React.useState<any>(null);
      React.useEffect(() => {
        import("@/lib/animations/lottie-404.json").then((m) =>
          setAnimationData(m.default)
        );
      }, []);
      if (!animationData) return null;
      return (
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: "100%", height: "100%" }}
        />
      );
    },
  }))
);

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary class component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error Boundary caught an error:", error, errorInfo);
    }

    this.props.onError?.(error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <Card
              className="p-8 text-center"
              styles={{
                root: {
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "1.5rem",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
                },
              }}
            >
              <Stack gap="lg" align="center">
                {/* Error Animation — lazy loaded since this path is rare */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-32 h-32"
                >
                  <Suspense fallback={null}>
                    <LottieAnimation />
                  </Suspense>
                </motion.div>

                <div>
                  <Title
                    order={2}
                    className="mb-2"
                    style={{ color: "var(--foreground)" }}
                  >
                    Something went wrong
                  </Title>
                  <Text
                    size="md"
                    className="mb-4"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    We encountered an unexpected error. Please try refreshing
                    the page or return to the homepage.
                  </Text>
                </div>

                {process.env.NODE_ENV === "development" && this.state.error && (
                  <Alert
                    color="red"
                    title="Development Error Details"
                    className="w-full text-left"
                  >
                    <Text size="sm" className="font-mono">
                      {this.state.error.message}
                    </Text>
                    {this.state.errorInfo?.componentStack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium">
                          Component Stack
                        </summary>
                        <pre className="mt-2 text-xs overflow-auto max-h-32">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </details>
                    )}
                  </Alert>
                )}

                <div className="flex gap-3 w-full">
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1"
                  >
                    <Button
                      onClick={this.handleRetry}
                      leftSection={<RefreshCw size={16} />}
                      variant="filled"
                      fullWidth
                      styles={{
                        root: {
                          backgroundColor: "var(--color-muted-indigo)",
                        },
                      }}
                    >
                      Try Again
                    </Button>
                  </motion.div>

                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1"
                  >
                    <Button
                      onClick={this.handleGoHome}
                      leftSection={<Home size={16} />}
                      variant="outline"
                      fullWidth
                      styles={{
                        root: {
                          borderColor: "var(--border)",
                          color: "var(--foreground)",
                        },
                      }}
                    >
                      Go Home
                    </Button>
                  </motion.div>
                </div>
              </Stack>
            </Card>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary for functional components
 * Throws during render (not in useEffect) so React error boundaries catch it
 */
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  // Throw during render so React error boundaries can catch it
  if (error) {
    throw error;
  }

  return { captureError, resetError };
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorFallback?: ReactNode
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={errorFallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${
    Component.displayName || Component.name
  })`;

  return WrappedComponent;
}

/**
 * Async error boundary for handling promise rejections
 */
export function AsyncErrorBoundary({ children }: { children: ReactNode }) {
  const { captureError } = useErrorBoundary();

  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureError(new Error(event.reason));
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
    };
  }, [captureError]);

  return <>{children}</>;
}
