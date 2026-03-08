// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import {
  Monitor,
  Activity,
  Waves,
  Brain,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Eye,
  Zap
} from "lucide-react";

interface MetricData {
  name: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
}

/**
 * AIMonitoring Component
 *
 * Visualizes sleep monitoring as an AI manager dashboard
 * with real-time metrics and anomaly detection.
 *
 * Features:
 * - Live sleep metric cards
 * - Anomaly detection alerts
 * - Performance trend indicators
 * - Interactive monitoring interface
 */
export default function AIMonitoring() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<MetricData[]>([
    {
      name: "Slow Wave Density",
      value: 85,
      unit: "%",
      status: 'normal',
      trend: 'stable',
      icon: <Waves className="h-5 w-5" />,
    },
    {
      name: "Spindle Rate",
      value: 12.5,
      unit: "/min",
      status: 'normal',
      trend: 'up',
      icon: <Zap className="h-5 w-5" />,
    },
    {
      name: "REM Density",
      value: 22,
      unit: "%",
      status: 'warning',
      trend: 'down',
      icon: <Eye className="h-5 w-5" />,
    },
    {
      name: "Memory Consolidation",
      value: 78,
      unit: "%",
      status: 'normal',
      trend: 'up',
      icon: <Brain className="h-5 w-5" />,
    },
    {
      name: "Glymphatic Flow",
      value: 95,
      unit: "%",
      status: 'normal',
      trend: 'stable',
      icon: <Activity className="h-5 w-5" />,
    },
    {
      name: "Sleep Efficiency",
      value: 89,
      unit: "%",
      status: 'normal',
      trend: 'up',
      icon: <TrendingUp className="h-5 w-5" />,
    },
  ]);

  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'info',
      message: "REM density below optimal range - monitoring",
      timestamp: "2 min ago",
    },
    {
      id: 2,
      type: 'success',
      message: "Glymphatic clearance operating at peak efficiency",
      timestamp: "5 min ago",
    }
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ctx = gsap.context(() => {
      // Animate monitoring cards entrance
      gsap.from("#monitoring-cards .metric-card", {
        opacity: 0,
        y: 30,
        duration: 0.8,
        ease: "power2.out",
        stagger: 0.1,
      });

      // Animate metric values
      metrics.forEach((metric, index) => {
        gsap.fromTo(`#metric-${index} .metric-value`,
          { textContent: 0 },
          {
            textContent: metric.value,
            duration: 2,
            ease: "power2.out",
            snap: { textContent: 1 },
            delay: index * 0.1,
          }
        );
      });

      // Pulse animation for active metrics
      gsap.to(".status-indicator.normal", {
        opacity: [0.6, 1, 0.6],
        duration: 2,
        ease: "sine.inOut",
        repeat: -1,
      });

      // Warning indicator animation
      gsap.to(".status-indicator.warning", {
        scale: [1, 1.1, 1],
        duration: 1,
        ease: "sine.inOut",
        repeat: -1,
      });

    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [metrics]);

  // Simulate real-time metric updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(metric => ({
        ...metric,
        value: Math.max(0, Math.min(100,
          metric.value + (Math.random() - 0.5) * 5
        )),
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'var(--color-fresh-green)';
      case 'warning': return 'var(--color-golden-yellow)';
      case 'critical': return 'var(--color-accent-rose-red)';
      default: return 'var(--color-gray)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle className="h-4 w-4" />;
      case 'warning': return <AlertCircle className="h-4 w-4" />;
      case 'critical': return <AlertCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
      default: return '→';
    }
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex items-center justify-center relative"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div id="monitoring-content" className="opacity-0 translate-y-10">
        <div className="content-container">
          <div className="max-w-7xl mx-auto">
            {/* Section Title */}
            <motion.div
              className="text-center mb-16"
              data-animate
            >
              <h2
                className="text-section-title mb-6"
                style={{ color: "var(--foreground)" }}
              >
                The AI{" "}
                <span style={{ color: "var(--color-fresh-green)" }}>
                  Sleep Manager
                </span>
              </h2>
              <p
                className="text-body-large max-w-3xl mx-auto"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Like a sophisticated AI system monitoring a complex operation, your brain
                continuously tracks sleep quality, detects anomalies, and optimizes
                restorative processes throughout the night.
              </p>
            </motion.div>

            {/* Dashboard Header */}
            <motion.div
              className="flex items-center justify-between mb-12"
              data-animate
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-fresh-green)" }}
                >
                  <Monitor className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3
                    className="text-xl font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Sleep Monitoring Dashboard
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Real-time neural activity tracking
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: "var(--color-fresh-green)" }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--color-fresh-green)" }}
                >
                  Monitoring Active
                </span>
              </div>
            </motion.div>

            {/* Metrics Grid */}
            <div id="monitoring-cards" className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {metrics.map((metric, index) => (
                <div
                  key={metric.name}
                  id={`metric-${index}`}
                  className="metric-card floating-card p-6"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  {/* Metric Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${getStatusColor(metric.status)}20` }}
                      >
                        <div style={{ color: getStatusColor(metric.status) }}>
                          {metric.icon}
                        </div>
                      </div>
                      <div>
                        <h4
                          className="text-sm font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          {metric.name}
                        </h4>
                      </div>
                    </div>

                    <div
                      className={`status-indicator ${metric.status} flex items-center gap-1`}
                      style={{ color: getStatusColor(metric.status) }}
                    >
                      {getStatusIcon(metric.status)}
                    </div>
                  </div>

                  {/* Metric Value */}
                  <div className="mb-4">
                    <div className="flex items-end gap-1">
                      <span
                        className="metric-value text-3xl font-bold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {Math.round(metric.value)}
                      </span>
                      <span
                        className="text-lg font-medium mb-1"
                        style={{ color: "var(--foreground)", opacity: 0.7 }}
                      >
                        {metric.unit}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: getStatusColor(metric.status) }}
                        initial={{ width: "0%" }}
                        animate={{ width: `${metric.value}%` }}
                        transition={{ duration: 1.5, delay: index * 0.1 }}
                      />
                    </div>
                  </div>

                  {/* Trend Indicator */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs"
                      style={{ color: "var(--foreground)", opacity: 0.6 }}
                    >
                      Last 5 min
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-sm"
                        style={{
                          color: metric.trend === 'up'
                            ? "var(--color-fresh-green)"
                            : metric.trend === 'down'
                            ? "var(--color-accent-rose-red)"
                            : "var(--color-gray)"
                        }}
                      >
                        {getTrendIcon(metric.trend)}
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: metric.trend === 'up'
                            ? "var(--color-fresh-green)"
                            : metric.trend === 'down'
                            ? "var(--color-accent-rose-red)"
                            : "var(--color-gray)"
                        }}
                      >
                        {metric.trend}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Alerts Panel */}
            <motion.div
              className="grid lg:grid-cols-2 gap-8"
              data-animate
            >
              {/* System Alerts */}
              <div
                className="floating-card p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h4
                  className="text-lg font-semibold mb-4 flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <AlertCircle className="h-5 w-5" style={{ color: "var(--color-golden-yellow)" }} />
                  System Alerts
                </h4>

                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 p-3 rounded-lg"
                      style={{
                        backgroundColor: alert.type === 'success'
                          ? "var(--color-fresh-green)10"
                          : "var(--color-golden-yellow)10",
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          backgroundColor: alert.type === 'success'
                            ? "var(--color-fresh-green)"
                            : "var(--color-golden-yellow)",
                        }}
                      >
                        {alert.type === 'success' ? (
                          <CheckCircle className="h-3 w-3 text-white" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p
                          className="text-sm"
                          style={{ color: "var(--foreground)" }}
                        >
                          {alert.message}
                        </p>
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--foreground)", opacity: 0.6 }}
                        >
                          {alert.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Summary */}
              <div
                className="floating-card p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h4
                  className="text-lg font-semibold mb-4 flex items-center gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <TrendingUp className="h-5 w-5" style={{ color: "var(--color-fresh-green)" }} />
                  Performance Summary
                </h4>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Overall Sleep Quality
                    </span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: "var(--color-fresh-green)" }}
                    >
                      87%
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Restoration Efficiency
                    </span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: "var(--color-fresh-green)" }}
                    >
                      92%
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      Anomalies Detected
                    </span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: "var(--color-golden-yellow)" }}
                    >
                      1
                    </span>
                  </div>

                  <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <p
                      className="text-sm"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      <strong style={{ color: "var(--color-fresh-green)" }}>Status:</strong> Sleep
                      architecture is performing within normal parameters. Minor REM reduction
                      noted but within acceptable range.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Educational Note */}
            <motion.div
              className="mt-16 text-center max-w-4xl mx-auto"
              data-animate
            >
              <div
                className="floating-card p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h4
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--foreground)" }}
                >
                  The Brain's Sleep AI
                </h4>
                <p
                  className="text-body-small"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  Your brain continuously monitors and optimizes sleep processes through
                  complex feedback loops. Like an AI system, it detects patterns, predicts
                  needs, and adjusts neural activity to maintain optimal restoration and
                  cognitive performance.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}