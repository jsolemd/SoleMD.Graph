"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Users,
  RefreshCw,
  Play,
  Pause,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  FileText,
  Lightbulb,
  Target,
  Clock,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { Button, Badge, Tooltip, Textarea, Select } from "@mantine/core";

// Import design patterns
import {
  EducationColors,
  AnimationPatterns,
  TypographyClasses,
} from "../../lib/design-patterns";

/**
 * SAFER Framework Interactive Demo
 * Migrated and enhanced from the original webapp's SAFER chat component
 */
interface SaferFrameworkDemoProps {
  onInteraction: (data: any) => void;
  className?: string;
}

export default function SaferFrameworkDemo({
  onInteraction,
  className = "",
}: SaferFrameworkDemoProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [showCommentary, setShowCommentary] = useState(true);
  const [triageItems, setTriageItems] = useState<any[]>([]);

  const saferSteps = [
    {
      id: "S",
      title: "Secure & Summarize",
      color: "#f97316", // orange
      icon: Shield,
      description: "Remove PHI and create a precise clinical summary",
    },
    {
      id: "A",
      title: "Architect & Antagonize",
      color: "#eab308", // yellow
      icon: Target,
      description: "Design expert prompts and challenge assumptions",
    },
    {
      id: "F",
      title: "First-Pass Plausibility",
      color: "#22c55e", // green
      icon: Eye,
      description: "Apply clinical expertise as a safety filter",
    },
    {
      id: "E",
      title: "Engage Your Expertise",
      color: "#14b8a6", // teal
      icon: Users,
      description: "Triage AI output: Keep, Modify, or Discard",
    },
    {
      id: "R",
      title: "Risk & Review",
      color: "#a855f7", // purple
      icon: AlertTriangle,
      description: "Assess risk level and implement verification",
    },
  ];

  const commentary = [
    {
      title: "The Problem",
      content:
        "The EMR consult is a dense block of text with extraneous detail and PHI.",
      solution:
        "We strip all identifiers and summarize the request into a precise, one-sentence C-L problem statement.",
    },
    {
      title: "The Challenge",
      content:
        "We need safe, effective bridge therapies for agitation, but a simple literature search is slow.",
      solution:
        "We architect a precise prompt, assigning an expert persona to the AI to rapidly synthesize evidence-based options.",
    },
    {
      title: "The Trap",
      content:
        "The AI suggests an ICU-level infusion for a floor patient and fails to check for drug interactions.",
      solution:
        "Our systems-level and pharmacological expertise acts as a firewall, catching both logistical and safety issues.",
    },
    {
      title: "The Decision",
      content:
        "We have a mix of valid, contextually-flawed, and dangerous suggestions.",
      solution:
        "An AI cannot sign orders. We triage its output: Keep the appropriate option, Modify the ICU-level drug, and Discard the dangerous one.",
    },
    {
      title: "The Responsibility",
      content:
        "The final plan is sound but involves high-risk medication and potential ICU transfer.",
      solution:
        "Assess the plan's risk as HIGH. This mandates direct communication with Neurology, ICU team, and Pharmacy before execution.",
    },
  ];

  const initialConsult = `URGENT C/L Consult from Dr. Miller on Jane Doe (MRN: 456789) on the general medical floor. 22F with confirmed anti-NMDAR Ab+. She's failed steroids and high-dose Ativan. Family is very distressed and has been calling frequently. Neurology started her on Lamotrigine 25mg daily 3 days ago for focal seizures. This was for a brief episode of left arm twitching, now resolved. Catatonia and agitation are severe. Neurology wants to know if Zyprexa is okay. We plan for ECT but it's 24-48h out. Need recs for a bridge therapy for severe agitation NOW. Please advise.`;

  const securePrompt = `C/L Problem Statement: "C/L Psych Consult: 22F w/ known anti-NMDAR Ab+, refractory catatonic agitation on a general medical floor. Neuro requests recs for bridge therapy pending ECT (24-48h out)."`;

  const architectPrompt = `As a clinical pharmacologist specializing in neurocritical care, synthesize the evidence for non-dopaminergic sedative therapies for a patient with anti-NMDAR encephalitis whose agitation is refractory to high-dose benzodiazepines. Provide the top 2-3 options with proposed starting doses and critical monitoring parameters to bridge the patient safely to ECT.`;

  const aiResponse = [
    {
      id: "phenobarbital",
      content:
        "**1. Phenobarbital:** A reliable GABA-A agonist. Recommend an IV load of 5-10 mg/kg. Monitor for respiratory depression and hypotension.",
      status: "keep",
      reasoning: "Floor-appropriate option with good safety profile",
    },
    {
      id: "dexmedetomidine",
      content:
        "**2. Dexmedetomidine Infusion:** An alpha-2 agonist that provides sedation without respiratory depression. Start infusion at 0.7 mcg/kg/hr.",
      status: "modify",
      reasoning:
        "Excellent option, but requires ICU level of care. Add 'Transfer to ICU' to plan.",
    },
    {
      id: "valproic",
      content:
        "**3. Valproic Acid (IV):** A well-tolerated option for agitation with a different mechanism. Recommend 20 mg/kg IV load.",
      status: "discard",
      reasoning: "Contraindicated due to DDI with lamotrigine (SJS/TEN risk).",
    },
  ];

  const finalPlan = `**Final C/L Recommendations:**

**# Refractory catatonic agitation in anti-NMDAR Encephalitis**

- **Primary Goal:** Expedite ECT as definitive treatment for catatonia.
- **Bridge Therapy Options (for severe agitation):**
  1. **(Floor Option) Phenobarbital load:** 5-10 mg/kg IV, may repeat based on response.
  2. **(ICU Option) Transfer to ICU** for initiation of a Dexmedetomidine infusion.
- **SAFETY ALERT:** Avoid Valproic Acid. Patient is on Lamotrigine; co-administration would create an unacceptable risk of SJS/TEN.`;

  const verifiedPlan = `**Documentation of Verification**

Plan risk assessed as HIGH. Spoke directly with Dr. Smith (Neurology). Plan to start with Phenobarbital load on floor reviewed and approved by C/L attending. ICU team aware of patient as potential transfer if she decompensates. Safe to implement.

---

${finalPlan}`;

  // Animation functions for each step
  const runSecureStep = useCallback(async () => {
    // Add initial consult
    setChatMessages([
      {
        id: "initial-consult",
        type: "user",
        content: initialConsult,
        timestamp: new Date(),
        className: "phi-content",
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Highlight and redact PHI
    setChatMessages((prev) =>
      prev.map((msg) =>
        msg.id === "initial-consult"
          ? { ...msg, className: "phi-content redacted" }
          : msg
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Add secure summary
    setChatMessages((prev) => [
      ...prev,
      {
        id: "secure-summary",
        type: "assistant",
        content: securePrompt,
        timestamp: new Date(),
        stepColor: saferSteps[0].color,
      },
    ]);

    onInteraction({
      type: "safer_step_completed",
      step: "secure",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const runArchitectStep = useCallback(async () => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: "architect-prompt",
        type: "user",
        content: architectPrompt,
        timestamp: new Date(),
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    onInteraction({
      type: "safer_step_completed",
      step: "architect",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const runFirstPassStep = useCallback(async () => {
    // Add AI response with suggestions
    setChatMessages((prev) => [
      ...prev,
      {
        id: "ai-response",
        type: "assistant",
        content: "**Evidence Synthesis for Bridge Sedation:**",
        timestamp: new Date(),
        stepColor: saferSteps[2].color,
        suggestions: aiResponse,
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Highlight the dangerous interaction
    setChatMessages((prev) =>
      prev.map((msg) =>
        msg.id === "ai-response"
          ? {
              ...msg,
              suggestions: msg.suggestions?.map((s: any) =>
                s.id === "valproic"
                  ? { ...s, className: "dangerous-interaction" }
                  : s
              ),
            }
          : msg
      )
    );

    onInteraction({
      type: "safer_step_completed",
      step: "first_pass",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const runEngageStep = useCallback(async () => {
    // Show triage board
    setTriageItems(aiResponse);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Animate items into triage bins
    for (const item of aiResponse) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setTriageItems((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, triaged: true } : t))
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Add final plan
    setChatMessages((prev) => [
      ...prev,
      {
        id: "final-plan",
        type: "user",
        content: finalPlan,
        timestamp: new Date(),
        className: "clinical-plan",
      },
    ]);

    onInteraction({
      type: "safer_step_completed",
      step: "engage",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const runRiskStep = useCallback(async () => {
    // Add risk assessment
    setChatMessages((prev) => [
      ...prev,
      {
        id: "risk-assessment",
        type: "assistant",
        content:
          "**Risk Assessment: HIGH**\n\nRequired Verification (C/L Workflow):\n1. Discuss plan directly with Neurology attending\n2. If pursuing ICU option, discuss with MICU attending\n3. Run the board with C/L service attending",
        timestamp: new Date(),
        stepColor: saferSteps[4].color,
        riskLevel: "HIGH",
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Add verified plan
    setChatMessages((prev) => [
      ...prev,
      {
        id: "verified-plan",
        type: "user",
        content: verifiedPlan,
        timestamp: new Date(),
        className: "clinical-plan verified",
        verified: true,
      },
    ]);

    onInteraction({
      type: "safer_step_completed",
      step: "risk",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const stepAnimations = [
    runSecureStep,
    runArchitectStep,
    runFirstPassStep,
    runEngageStep,
    runRiskStep,
  ];

  const handleStepClick = useCallback(
    async (stepIndex: number) => {
      if (stepIndex === currentStep && !isPlaying) {
        setIsPlaying(true);
        await stepAnimations[stepIndex]();
        setCurrentStep((prev) => prev + 1);
        setIsPlaying(false);
      }
    },
    [currentStep, isPlaying, stepAnimations]
  );

  const resetDemo = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
    setChatMessages([]);
    setTriageItems([]);

    onInteraction({
      type: "safer_demo_reset",
      timestamp: new Date(),
    });
  }, [onInteraction]);

  const getCurrentCommentary = useCallback(() => {
    return commentary[Math.min(currentStep, commentary.length - 1)];
  }, [currentStep]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* SAFER Steps Control Panel */}
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
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3
                className={TypographyClasses.cardTitle}
                style={{ color: "var(--foreground)" }}
              >
                S.A.F.E.R. Framework Demo
              </h3>
              <p className="text-sm opacity-70">
                Interactive C-L Psychiatry workflow demonstration
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCommentary(!showCommentary)}
              leftSection={
                showCommentary ? <Eye size={16} /> : <Eye size={16} />
              }
            >
              {showCommentary ? "Hide" : "Show"} Guide
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetDemo}
              leftSection={<RefreshCw size={16} />}
              style={{
                borderColor: EducationColors.primary,
                color: EducationColors.primary,
              }}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* SAFER Step Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {saferSteps.map((step, index) => {
            const isActive = index < currentStep;
            const isNext = index === currentStep;
            const isDisabled = index > currentStep;
            const Icon = step.icon;

            return (
              <motion.button
                key={step.id}
                className={`p-4 rounded-lg border-2 text-left transition-all duration-200 ${
                  isDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer"
                }`}
                style={{
                  backgroundColor: isActive ? `${step.color}20` : "var(--card)",
                  borderColor: isActive
                    ? step.color
                    : isNext
                    ? step.color
                    : "var(--border)",
                  color: isActive ? step.color : "var(--foreground)",
                }}
                onClick={() => handleStepClick(index)}
                disabled={isDisabled || isPlaying}
                whileHover={
                  !isDisabled && !isPlaying ? { scale: 1.02, y: -2 } : {}
                }
                whileTap={!isDisabled && !isPlaying ? { scale: 0.98 } : {}}
                animate={
                  isNext && !isPlaying
                    ? {
                        boxShadow: `0 0 20px ${step.color}40`,
                      }
                    : {}
                }
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={20} />
                  <span className="font-bold text-lg">{step.id}</span>
                  {isActive && <CheckCircle size={16} />}
                  {isPlaying && isNext && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <RefreshCw size={16} />
                    </motion.div>
                  )}
                </div>
                <div className="text-sm font-medium mb-1">{step.title}</div>
                <div className="text-xs opacity-70">{step.description}</div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <div
            className="floating-card p-6 h-96 overflow-y-auto"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="space-y-4">
              {chatMessages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-lg ${
                      message.className || ""
                    }`}
                    style={{
                      backgroundColor:
                        message.type === "user"
                          ? `${EducationColors.primary}20`
                          : message.stepColor
                          ? `${message.stepColor}20`
                          : "var(--card)",
                      borderColor:
                        message.type === "user"
                          ? EducationColors.primary
                          : message.stepColor || "var(--border)",
                      border: "1px solid",
                    }}
                  >
                    <div className="text-sm text-flow-natural whitespace-pre-line">
                      {message.content}
                    </div>

                    {/* AI Suggestions */}
                    {message.suggestions && (
                      <div className="mt-4 space-y-2">
                        {message.suggestions.map((suggestion: any) => (
                          <div
                            key={suggestion.id}
                            className={`p-3 rounded border ${
                              suggestion.className || ""
                            }`}
                            style={{
                              backgroundColor:
                                suggestion.status === "discard"
                                  ? "#fef2f2"
                                  : "var(--card)",
                              borderColor:
                                suggestion.status === "discard"
                                  ? "#fca5a5"
                                  : "var(--border)",
                            }}
                          >
                            <div className="text-sm">{suggestion.content}</div>
                            {suggestion.status === "discard" && (
                              <div className="mt-2 text-xs text-red-600 font-medium">
                                ❌ Gut Check: {suggestion.reasoning}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Risk Level Indicator */}
                    {message.riskLevel && (
                      <div className="mt-4">
                        <Badge
                          color="red"
                          size="lg"
                          leftSection={<AlertTriangle size={16} />}
                        >
                          Risk Level: {message.riskLevel}
                        </Badge>
                      </div>
                    )}

                    {/* Verification Stamp */}
                    {message.verified && (
                      <motion.div
                        initial={{ scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.5, type: "spring" }}
                        className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold"
                      >
                        ✓ S.A.F.E.R. Verified
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Triage Board (shown during Engage step) */}
          <AnimatePresence>
            {triageItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <div
                  className="floating-card p-6"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: saferSteps[3].color,
                  }}
                >
                  <h4 className="font-medium mb-4 flex items-center gap-2">
                    <Users size={20} style={{ color: saferSteps[3].color }} />
                    Triage Board
                  </h4>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="font-medium text-green-600 mb-2">
                        ✅ Keep
                      </div>
                      <div className="min-h-[100px] p-3 rounded border-2 border-green-200 bg-green-50">
                        {triageItems
                          .filter(
                            (item) => item.status === "keep" && item.triaged
                          )
                          .map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-xs p-2 bg-white rounded mb-2"
                            >
                              {item.content.split(":")[0]}
                            </motion.div>
                          ))}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="font-medium text-blue-600 mb-2">
                        ✏️ Modify
                      </div>
                      <div className="min-h-[100px] p-3 rounded border-2 border-blue-200 bg-blue-50">
                        {triageItems
                          .filter(
                            (item) => item.status === "modify" && item.triaged
                          )
                          .map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-xs p-2 bg-white rounded mb-2"
                            >
                              {item.content.split(":")[0]}
                              <div className="text-blue-600 font-medium mt-1">
                                {item.reasoning}
                              </div>
                            </motion.div>
                          ))}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="font-medium text-red-600 mb-2">
                        ❌ Discard
                      </div>
                      <div className="min-h-[100px] p-3 rounded border-2 border-red-200 bg-red-50">
                        {triageItems
                          .filter(
                            (item) => item.status === "discard" && item.triaged
                          )
                          .map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-xs p-2 bg-white rounded mb-2"
                            >
                              {item.content.split(":")[0]}
                              <div className="text-red-600 font-medium mt-1">
                                {item.reasoning}
                              </div>
                            </motion.div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Commentary Panel */}
        <AnimatePresence>
          {showCommentary && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="floating-card p-6"
              style={{
                backgroundColor: "var(--card)",
                borderColor:
                  currentStep > 0
                    ? saferSteps[
                        Math.min(currentStep - 1, saferSteps.length - 1)
                      ].color
                    : "var(--border)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor:
                      currentStep > 0
                        ? saferSteps[
                            Math.min(currentStep - 1, saferSteps.length - 1)
                          ].color
                        : EducationColors.primary,
                  }}
                >
                  <Lightbulb className="h-4 w-4 text-white" />
                </div>
                <h4
                  className={TypographyClasses.cardTitle}
                  style={{ color: "var(--foreground)" }}
                >
                  Guide Panel
                </h4>
              </div>

              {currentStep === 0 ? (
                <div className="text-sm text-flow-natural opacity-70">
                  This panel provides context and explains the rationale for
                  each step in the S.A.F.E.R. process. Click the first step to
                  begin the demonstration.
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div
                      className="font-medium text-sm mb-2"
                      style={{ color: "#dc2626" }}
                    >
                      {getCurrentCommentary().title}:
                    </div>
                    <div className="text-sm text-flow-natural opacity-80">
                      {getCurrentCommentary().content}
                    </div>
                  </div>
                  <div>
                    <div
                      className="font-medium text-sm mb-2"
                      style={{ color: "#22c55e" }}
                    >
                      SAFER Fix:
                    </div>
                    <div className="text-sm text-flow-natural opacity-80">
                      {getCurrentCommentary().solution}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
