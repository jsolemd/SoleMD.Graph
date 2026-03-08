"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  Thermometer,
  Zap,
  Brain,
  Settings,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Target,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Sliders,
  Code,
  MessageSquare,
  FileText,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import {
  Button,
  Slider,
  Select,
  TextInput,
  Textarea,
  Badge,
  Tooltip,
} from "@mantine/core";

// Import design patterns and types
import {
  EducationColors,
  AnimationPatterns,
  TypographyClasses,
  FloatingCardPatterns,
} from "../../lib/design-patterns";

/**
 * Temperature Slider Interactive Exercise
 * Migrated from the original webapp's temperature component
 */
interface TemperatureSliderProps {
  onInteraction: (data: any) => void;
  className?: string;
}

export function TemperatureSlider({
  onInteraction,
  className = "",
}: TemperatureSliderProps) {
  const [temperature, setTemperature] = useState(0);
  const [currentResponse, setCurrentResponse] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  // Temperature responses based on creativity level
  const responses = {
    factual:
      "Benzodiazepines are first-line treatment for catatonia in anti-NMDAR encephalitis. Lorazepam 1-2mg IV/IM every 2-4 hours is recommended, with dose escalation as needed for symptom control.",
    balanced:
      "For catatonia in anti-NMDAR encephalitis, benzodiazepines remain first-line therapy. Lorazepam 1-2mg IV/IM every 2-4 hours is the standard approach. If inadequate response, consider dose escalation or adding ECT as definitive treatment.",
    creative:
      "While benzodiazepines like lorazepam (1-2mg IV/IM q2-4h) are first-line for catatonia in anti-NMDAR encephalitis, consider the broader clinical picture. ECT is highly effective for refractory cases. Some clinicians explore NMDA antagonists like memantine as adjunctive therapy, though evidence is limited.",
    superCreative:
      "Catatonia in anti-NMDAR encephalitis presents a fascinating therapeutic challenge! Beyond standard lorazepam (1-2mg IV/IM), consider the pathophysiology: NMDA receptor hypofunction may respond to creative approaches. ECT remains gold standard for refractory cases. Emerging research suggests potential roles for AMPA potentiators, though this remains experimental. The key is balancing evidence-based care with innovative thinking!",
  };

  const getResponseForTemperature = useCallback((temp: number) => {
    if (temp <= 0.25) return responses.factual;
    if (temp <= 0.5) return responses.balanced;
    if (temp <= 0.75) return responses.creative;
    return responses.superCreative;
  }, []);

  const handleTemperatureChange = useCallback(
    (value: number) => {
      setIsAnimating(true);
      setTemperature(value);

      setTimeout(() => {
        const newResponse = getResponseForTemperature(value);
        setCurrentResponse(newResponse);
        setIsAnimating(false);

        onInteraction({
          type: "temperature_changed",
          temperature: value,
          response: newResponse,
          timestamp: new Date(),
        });
      }, 300);
    },
    [getResponseForTemperature, onInteraction]
  );

  const getTemperatureColor = useCallback((temp: number) => {
    if (temp <= 0.33) return "#3b82f6"; // Blue - factual
    if (temp <= 0.66) return "#eab308"; // Yellow - balanced
    return "#dc2626"; // Red - creative
  }, []);

  const getTemperatureLabel = useCallback((temp: number) => {
    if (temp <= 0.33) return "Factual";
    if (temp <= 0.66) return "Balanced";
    return "Creative";
  }, []);

  useEffect(() => {
    setCurrentResponse(responses.factual);
  }, []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Temperature Control */}
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: EducationColors.primary }}
          >
            <Thermometer className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              Temperature Control
            </h3>
            <p className="text-sm opacity-70">
              Adjust creativity vs. factuality
            </p>
          </div>
        </div>

        {/* Visual Thermometer */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative w-8 h-48 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="absolute bottom-0 w-full rounded-full transition-all duration-500"
              style={{
                backgroundColor: getTemperatureColor(temperature),
                height: `${temperature * 100}%`,
              }}
            />
            <motion.div
              className="absolute w-6 h-6 bg-white border-2 rounded-full shadow-lg"
              style={{
                borderColor: getTemperatureColor(temperature),
                left: "50%",
                transform: "translateX(-50%)",
                bottom: `calc(${temperature * 100}% - 12px)`,
              }}
              animate={{
                boxShadow: `0 0 20px ${getTemperatureColor(temperature)}40`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="flex-1 space-y-4">
            <Slider
              value={temperature}
              onChange={handleTemperatureChange}
              min={0}
              max={1}
              step={0.01}
              size="lg"
              color={EducationColors.primary}
              marks={[
                { value: 0, label: "0.0" },
                { value: 0.5, label: "0.5" },
                { value: 1, label: "1.0" },
              ]}
              aria-label="Temperature slider"
            />

            <div className="flex justify-between text-xs">
              <span style={{ color: "#3b82f6" }}>Factual</span>
              <span style={{ color: "#eab308" }}>Balanced</span>
              <span style={{ color: "#dc2626" }}>Creative</span>
            </div>
          </div>
        </div>

        {/* Current Settings Display */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div
              className="text-2xl font-bold"
              style={{ color: getTemperatureColor(temperature) }}
            >
              {temperature.toFixed(2)}
            </div>
            <div className="text-sm opacity-70">Temperature</div>
          </div>
          <div>
            <div
              className="text-lg font-semibold"
              style={{ color: getTemperatureColor(temperature) }}
            >
              {getTemperatureLabel(temperature)}
            </div>
            <div className="text-sm opacity-70">Mode</div>
          </div>
        </div>
      </div>

      {/* AI Response */}
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: getTemperatureColor(temperature) }}
          >
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h4
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              AI Response
            </h4>
            <p className="text-sm opacity-70">
              Temperature: {temperature.toFixed(2)} (
              {getTemperatureLabel(temperature)})
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isAnimating ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-8"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCw
                    className="h-5 w-5"
                    style={{ color: EducationColors.primary }}
                  />
                </motion.div>
                <span className="text-sm opacity-70">
                  Generating response...
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="response"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="prose prose-sm max-w-none text-flow-natural"
              style={{ color: "var(--foreground)" }}
            >
              <p>{currentResponse}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Prompt Builder Interactive Exercise
 * Migrated from the original webapp's prompt builder component
 */
interface PromptBuilderProps {
  onInteraction: (data: any) => void;
  className?: string;
}

export function PromptBuilder({
  onInteraction,
  className = "",
}: PromptBuilderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [showCritique, setShowCritique] = useState(false);

  const promptParts = [
    {
      id: "persona",
      title: "Persona",
      icon: "👨‍⚕️",
      text: "As a clinical pharmacologist specializing in neurocritical care,",
      color: "orange",
      description: "Define the AI's role and expertise",
    },
    {
      id: "goal",
      title: "Goal",
      icon: "🎯",
      text: "synthesize the evidence for non-dopaminergic sedative therapies",
      color: "yellow",
      description: "Specify the desired outcome",
    },
    {
      id: "context",
      title: "Context",
      icon: "🏥",
      text: "for a patient with anti-NMDAR encephalitis whose agitation is refractory to high-dose benzodiazepines.",
      color: "green",
      description: "Provide relevant background information",
    },
    {
      id: "format",
      title: "Format",
      icon: "📋",
      text: "Provide the top 2-3 options with proposed starting doses and critical monitoring parameters",
      color: "teal",
      description: "Specify the desired output structure",
    },
    {
      id: "constraint",
      title: "Constraint",
      icon: "⏱️",
      text: "to bridge the patient safely to ECT.",
      color: "purple",
      description: "Add limitations or requirements",
    },
  ];

  const responses = {
    0: "Benzodiazepines are first line.",
    1: "As a clinical pharmacologist, I can provide evidence-based sedative options for this challenging case.",
    2: "For anti-NMDAR encephalitis with refractory agitation, consider these non-dopaminergic approaches: 1) Phenobarbital loading, 2) Dexmedetomidine infusion, 3) Propofol (with caution).",
    3: "**Evidence-Based Sedative Options:**\n\n1. **Phenobarbital**: 5-10 mg/kg IV load, monitor respiratory status\n2. **Dexmedetomidine**: 0.7 mcg/kg/hr infusion, requires ICU monitoring\n3. **Propofol**: 1-3 mg/kg/hr, watch for propofol infusion syndrome",
    4: "**Bridge Therapy to ECT (24-48h):**\n\n1. **Phenobarbital**: 5-10 mg/kg IV load, may repeat based on response. Monitor: respiratory depression, hypotension\n2. **Dexmedetomidine**: Start 0.7 mcg/kg/hr, titrate to effect. Monitor: bradycardia, hypotension\n3. **Propofol**: 1-3 mg/kg/hr continuous infusion. Monitor: PRIS, hemodynamics\n\n*Goal: Maintain safety while bridging to definitive ECT treatment.*",
    5: "**Comprehensive Bridge Sedation Plan:**\n\n**Primary Recommendations:**\n1. **Phenobarbital**: 5-10 mg/kg IV load, repeat PRN. Monitor respiratory status, BP\n2. **Dexmedetomidine**: 0.7 mcg/kg/hr infusion (ICU level care). Monitor cardiac rhythm, BP\n\n**Alternative:**\n3. **Propofol**: 1-3 mg/kg/hr if above insufficient. Monitor for PRIS, maintain <4mg/kg/hr\n\n**Safety Considerations:**\n- All options require close monitoring\n- ECT remains definitive treatment\n- Avoid dopamine antagonists\n- Consider anesthesia consultation for complex cases",
  };

  const critiques = {
    0: "**Initial Prompt Issues:**\n• Too vague and non-specific\n• No context about the clinical scenario\n• Lacks expertise framing\n• No output format specified",
    1: "**Improvement with Persona:**\n• ✅ Establishes clinical expertise\n• ❌ Still lacks specific clinical context\n• ❌ No clear deliverable specified",
    2: "**Adding Goal:**\n• ✅ Clear therapeutic objective\n• ✅ Specifies non-dopaminergic focus\n• ❌ Missing patient-specific details",
    3: "**With Context:**\n• ✅ Specific clinical scenario\n• ✅ Explains treatment failure\n• ✅ Provides disease context\n• ❌ Output format still unclear",
    4: "**Format Specification:**\n• ✅ Clear deliverable structure\n• ✅ Requests specific details (doses, monitoring)\n• ✅ Actionable output format\n• ❌ Missing time constraint",
    5: "**Complete Prompt:**\n• ✅ Expert persona established\n• ✅ Clear therapeutic goal\n• ✅ Comprehensive clinical context\n• ✅ Structured output format\n• ✅ Time-sensitive constraint\n• **Result: Comprehensive, actionable clinical guidance**",
  };

  const handlePartClick = useCallback(
    (partIndex: number) => {
      if (partIndex === currentStep) {
        setCurrentStep((prev) => prev + 1);
        setSelectedParts((prev) => [...prev, promptParts[partIndex].id]);

        onInteraction({
          type: "prompt_part_added",
          part: promptParts[partIndex],
          step: partIndex + 1,
          timestamp: new Date(),
        });
      }
    },
    [currentStep, onInteraction]
  );

  const resetBuilder = useCallback(() => {
    setCurrentStep(0);
    setSelectedParts([]);
    setShowCritique(false);

    onInteraction({
      type: "prompt_builder_reset",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const getPartColor = useCallback((part: any, index: number) => {
    const colorMap: Record<string, string> = {
      orange: "#f97316",
      yellow: "#eab308",
      green: "#22c55e",
      teal: "#14b8a6",
      purple: "#a855f7",
    };
    return colorMap[part.color] || EducationColors.primary;
  }, []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Prompt Parts */}
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: EducationColors.primary }}
            >
              <Code className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3
                className={TypographyClasses.cardTitle}
                style={{ color: "var(--foreground)" }}
              >
                Precision Prompt Builder
              </h3>
              <p className="text-sm opacity-70">
                Click components in order to build an expert prompt
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetBuilder}
            leftSection={<RotateCcw size={16} />}
            style={{
              borderColor: EducationColors.primary,
              color: EducationColors.primary,
            }}
          >
            Reset
          </Button>
        </div>

        {/* Prompt Components */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {promptParts.map((part, index) => {
            const isActive = selectedParts.includes(part.id);
            const isNext = index === currentStep;
            const isDisabled = index > currentStep;
            const partColor = getPartColor(part, index);

            return (
              <motion.button
                key={part.id}
                className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                  isDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
                style={{
                  backgroundColor: isActive ? `${partColor}20` : "var(--card)",
                  borderColor: isActive
                    ? partColor
                    : isNext
                    ? partColor
                    : "var(--border)",
                  color: isActive ? partColor : "var(--foreground)",
                }}
                onClick={() => handlePartClick(index)}
                disabled={isDisabled}
                whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
                whileTap={!isDisabled ? { scale: 0.98 } : {}}
                animate={
                  isNext
                    ? {
                        boxShadow: `0 0 20px ${partColor}40`,
                      }
                    : {}
                }
                aria-label={`${part.title}: ${part.description}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{part.icon}</span>
                  <span className="font-medium text-sm">{part.title}</span>
                  {isActive && <CheckCircle size={16} />}
                </div>
                <p className="text-xs opacity-70">{part.description}</p>
              </motion.button>
            );
          })}
        </div>

        {/* Built Prompt Display */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Current Prompt:</h4>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowCritique(!showCritique)}
              leftSection={
                showCritique ? <EyeOff size={14} /> : <Eye size={14} />
              }
            >
              {showCritique ? "Hide" : "Show"} Analysis
            </Button>
          </div>

          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="space-y-2">
              <div className="text-sm font-medium opacity-70">User:</div>
              <div className="text-flow-natural">
                {selectedParts.length === 0 ? (
                  <span className="opacity-50">
                    Help me with the treatment for catatonia in anti-NMDAR
                    encephalitis.
                  </span>
                ) : (
                  <div className="space-y-1">
                    {promptParts
                      .filter((_, index) => index < currentStep)
                      .map((part, index) => (
                        <span
                          key={part.id}
                          className="inline-block px-2 py-1 rounded text-sm mr-1 mb-1"
                          style={{
                            backgroundColor: `${getPartColor(part, index)}20`,
                            color: getPartColor(part, index),
                            border: `1px solid ${getPartColor(part, index)}40`,
                          }}
                        >
                          {part.text}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Response */}
          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: `${EducationColors.primary}10`,
              borderColor: `${EducationColors.primary}40`,
            }}
          >
            <div className="space-y-2">
              <div className="text-sm font-medium opacity-70">
                AI Assistant:
              </div>
              <div className="text-flow-natural whitespace-pre-line">
                {responses[currentStep as keyof typeof responses]}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Critique Panel */}
      <AnimatePresence>
        {showCritique && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="floating-card p-6"
            style={{
              backgroundColor: "var(--card)",
              borderColor: EducationColors.primary,
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: EducationColors.primary }}
              >
                <Lightbulb className="h-4 w-4 text-white" />
              </div>
              <h4
                className={TypographyClasses.cardTitle}
                style={{ color: "var(--foreground)" }}
              >
                Prompt Analysis
              </h4>
            </div>
            <div
              className="prose prose-sm max-w-none text-flow-natural whitespace-pre-line"
              style={{ color: "var(--foreground)" }}
            >
              {critiques[currentStep as keyof typeof critiques]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Model Size Simulator
 * Interactive exercise showing the relationship between model size and task performance
 */
interface ModelSizeSimulatorProps {
  onInteraction: (data: any) => void;
  className?: string;
}

export function ModelSizeSimulator({
  onInteraction,
  className = "",
}: ModelSizeSimulatorProps) {
  const [selectedModel, setSelectedModel] = useState("small");
  const [selectedTask, setSelectedTask] = useState("summary");
  const [isProcessing, setIsProcessing] = useState(false);

  const models = [
    {
      id: "small",
      name: "Small Model",
      params: "7B",
      speed: "Fast",
      cost: "Low",
    },
    {
      id: "medium",
      name: "Medium Model",
      params: "13B",
      speed: "Medium",
      cost: "Medium",
    },
    {
      id: "large",
      name: "Large Model",
      params: "70B",
      speed: "Slow",
      cost: "High",
    },
  ];

  const tasks = [
    { id: "summary", name: "Progress Note Summary", complexity: "Low" },
    {
      id: "differential",
      name: "Differential Diagnosis",
      complexity: "Medium",
    },
    { id: "literature", name: "Literature Review", complexity: "High" },
  ];

  const getPerformance = useCallback((modelId: string, taskId: string) => {
    const performanceMatrix: Record<
      string,
      Record<string, { quality: number; speed: number; explanation: string }>
    > = {
      small: {
        summary: {
          quality: 85,
          speed: 95,
          explanation:
            "Excellent for routine summaries. Fast and efficient for daily clinical notes.",
        },
        differential: {
          quality: 65,
          speed: 90,
          explanation:
            "Adequate for basic differentials but may miss subtle connections.",
        },
        literature: {
          quality: 45,
          speed: 85,
          explanation:
            "Limited capability for complex literature synthesis. May miss important nuances.",
        },
      },
      medium: {
        summary: {
          quality: 90,
          speed: 80,
          explanation: "High-quality summaries with good clinical insight.",
        },
        differential: {
          quality: 85,
          speed: 75,
          explanation:
            "Strong performance on differential diagnosis with good reasoning.",
        },
        literature: {
          quality: 70,
          speed: 70,
          explanation:
            "Decent literature review capability but may lack depth in complex topics.",
        },
      },
      large: {
        summary: {
          quality: 95,
          speed: 60,
          explanation:
            "Exceptional summaries with deep clinical understanding.",
        },
        differential: {
          quality: 95,
          speed: 55,
          explanation:
            "Excellent differential diagnosis with sophisticated clinical reasoning.",
        },
        literature: {
          quality: 90,
          speed: 50,
          explanation:
            "Outstanding literature synthesis with comprehensive analysis and insights.",
        },
      },
    };

    return (
      performanceMatrix[modelId]?.[taskId] || {
        quality: 50,
        speed: 50,
        explanation: "Unknown combination",
      }
    );
  }, []);

  const handleSimulation = useCallback(async () => {
    setIsProcessing(true);

    // Simulate processing time based on model size
    const processingTime =
      selectedModel === "small"
        ? 500
        : selectedModel === "medium"
        ? 1000
        : 1500;

    await new Promise((resolve) => setTimeout(resolve, processingTime));

    const performance = getPerformance(selectedModel, selectedTask);

    onInteraction({
      type: "model_simulation",
      model: selectedModel,
      task: selectedTask,
      performance,
      timestamp: new Date(),
    });

    setIsProcessing(false);
  }, [selectedModel, selectedTask, getPerformance, onInteraction]);

  const currentPerformance = getPerformance(selectedModel, selectedTask);

  return (
    <div className={`space-y-6 ${className}`}>
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: EducationColors.primary }}
          >
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              Model Size vs. Task Performance
            </h3>
            <p className="text-sm opacity-70">
              Explore how model size affects different clinical tasks
            </p>
          </div>
        </div>

        {/* Model Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {models.map((model) => (
            <motion.button
              key={model.id}
              className={`p-4 rounded-lg border-2 text-left transition-all duration-200`}
              style={{
                backgroundColor:
                  selectedModel === model.id
                    ? `${EducationColors.primary}20`
                    : "var(--card)",
                borderColor:
                  selectedModel === model.id
                    ? EducationColors.primary
                    : "var(--border)",
              }}
              onClick={() => setSelectedModel(model.id)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="font-medium mb-2">{model.name}</div>
              <div className="text-sm space-y-1 opacity-70">
                <div>Parameters: {model.params}</div>
                <div>Speed: {model.speed}</div>
                <div>Cost: {model.cost}</div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Task Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Select Clinical Task:
          </label>
          <Select
            value={selectedTask}
            onChange={(value) => setSelectedTask(value || "summary")}
            data={tasks.map((task) => ({
              value: task.id,
              label: `${task.name} (${task.complexity} Complexity)`,
            }))}
            size="md"
          />
        </div>

        {/* Simulation Button */}
        <div className="text-center mb-6">
          <Button
            onClick={handleSimulation}
            loading={isProcessing}
            size="lg"
            style={{ backgroundColor: EducationColors.primary }}
            leftSection={<Play size={20} />}
          >
            {isProcessing ? "Processing..." : "Run Simulation"}
          </Button>
        </div>

        {/* Performance Results */}
        <div className="space-y-4">
          <h4 className="font-medium">Performance Metrics:</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm">Quality</span>
                <span className="text-sm font-medium">
                  {currentPerformance.quality}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <motion.div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: EducationColors.primary }}
                  initial={{ width: 0 }}
                  animate={{ width: `${currentPerformance.quality}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm">Speed</span>
                <span className="text-sm font-medium">
                  {currentPerformance.speed}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <motion.div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: "#22c55e" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${currentPerformance.speed}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                />
              </div>
            </div>
          </div>

          <div
            className="p-4 rounded-lg"
            style={{
              backgroundColor: `${EducationColors.primary}10`,
              borderColor: `${EducationColors.primary}40`,
            }}
          >
            <div className="flex items-start gap-2">
              <Lightbulb
                className="h-4 w-4 mt-1"
                style={{ color: EducationColors.primary }}
              />
              <div className="text-sm text-flow-natural">
                {currentPerformance.explanation}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Export all interactive exercises
 */
export const InteractiveExercises = {
  TemperatureSlider,
  PromptBuilder,
  ModelSizeSimulator,
};

export default InteractiveExercises;
