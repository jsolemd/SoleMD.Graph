"use client";

import React from "react";
import { Button } from "@mantine/core";
import { ExternalLink, Filter, ChevronDown, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { getCurrentPageColor } from "@/lib/utils";
import {
  ANIMATION_VARIANTS,
  createThemeAwareButtonStyle,
} from "@/lib/animation-utils";
import useScrollAnimation from "@/hooks/use-scroll-animation";

interface ResearchCardProps {
  title: string;
  venue: string;
  year: string;
  status: "published" | "under-review" | "in-process" | "in-preparation";
  description: string;
  briefAbstract: string;
  pubmedLink?: string;
}

function ResearchCard({
  title,
  venue,
  year,
  status,
  description,
  briefAbstract: _briefAbstract,
  pubmedLink,
}: ResearchCardProps) {
  const pathname = usePathname();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return {
          bg: "var(--color-fresh-green)",
          text: "var(--color-fresh-green)",
        };
      case "under-review":
        return {
          bg: "var(--color-warm-coral)",
          text: "var(--color-warm-coral)",
        };
      case "in-process":
        return {
          bg: "var(--color-golden-yellow)",
          text: "var(--color-golden-yellow)",
        };
      case "in-preparation":
        return {
          bg: "var(--color-soft-blue)",
          text: "var(--color-soft-blue)",
        };
      default:
        return {
          bg: "var(--color-gray)",
          text: "var(--color-gray)",
        };
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "published":
        return "Published";
      case "under-review":
        return "Under Review";
      case "in-process":
        return "In Process";
      case "in-preparation":
        return "In Preparation";
      default:
        return status;
    }
  };

  const statusColors = getStatusColor(status);

  return (
    <motion.div {...ANIMATION_VARIANTS.cardHover} className="h-full">
      <div
        className="floating-card p-8 h-full relative group"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          transition: "all 300ms ease",
        }}
      >
        {/* Research icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
          style={{ backgroundColor: getCurrentPageColor(pathname) }}
        >
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 14.5M14.25 3.104c.251.023.501.05.75.082M19.8 14.5l-5.69 5.69a2.25 2.25 0 01-3.182 0l-5.69-5.69a2.25 2.25 0 010-3.182L8.55 8.05M19.8 14.5V16.5a2.25 2.25 0 01-2.25 2.25h-11.5A2.25 2.25 0 014 16.5v-2"
            />
          </svg>
        </div>

        {/* Arrow indicator */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ArrowUpRight
            className="h-5 w-5 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 opacity-60 group-hover:opacity-100"
            style={{ color: "var(--foreground)", opacity: 0.4 }}
          />
        </div>

        {/* Status badge and year */}
        <div className="flex items-start justify-between mb-4">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${statusColors.bg}20`,
              color: statusColors.text,
              border: `1px solid ${statusColors.bg}30`,
            }}
          >
            {getStatusText(status)}
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            {year}
          </span>
        </div>

        {/* Content */}
        <div className="flex flex-col text-flow-natural">
          <h3
            className="text-card-title mb-3"
            style={{
              color: "var(--foreground)",
            }}
          >
            {title}
          </h3>

          <p
            className="text-body-small text-opacity-secondary mb-4"
            style={{
              color: "var(--foreground)",
            }}
          >
            {venue}
          </p>

          <p
            className="text-body-small text-opacity-muted mb-6"
            style={{
              color: "var(--foreground)",
            }}
          >
            {description}
          </p>

          {/* Action area */}
          <div
            className="pt-4 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            {pubmedLink ? (
              <Button
                component="a"
                href={pubmedLink}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                styles={createThemeAwareButtonStyle(
                  getCurrentPageColor(pathname)
                )}
                leftSection={<ExternalLink className="h-3 w-3" />}
              >
                View Publication
              </Button>
            ) : (
              <div
                className="text-xs text-center py-2 px-3 rounded"
                style={{
                  color: "var(--foreground)",
                  opacity: 0.6,
                  backgroundColor: "var(--background)",
                  border: `1px solid var(--border)`,
                }}
              >
                Publication pending
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const researchData = [
    {
      title:
        "Deep Learning for Depression Diagnosis Using fMRI Connectivity Patterns",
      venue: "Nature Neuroscience",
      year: "2024",
      status: "published" as const,
      description:
        "Novel deep learning approach for identifying depression biomarkers in resting-state functional connectivity networks.",
      briefAbstract:
        "We developed a convolutional neural network that achieves 89% accuracy in diagnosing major depressive disorder using resting-state fMRI connectivity patterns. The model identified key disruptions in default mode and salience networks that correlate with symptom severity. Our approach demonstrates the potential for objective, neuroimaging-based psychiatric diagnosis.",
      pubmedLink: "https://pubmed.ncbi.nlm.nih.gov/example1",
    },
    {
      title:
        "AI-Powered Cognitive Behavioral Therapy: A Randomized Controlled Trial",
      venue: "JAMA Psychiatry",
      year: "2024",
      status: "published" as const,
      description:
        "Evaluation of an AI-enhanced CBT platform for treating anxiety disorders in primary care settings.",
      briefAbstract:
        "Our AI-enhanced CBT platform demonstrated non-inferiority to traditional therapy with 76% response rates. The system provided personalized interventions and real-time mood tracking, significantly reducing therapist workload while maintaining clinical efficacy. This study supports the integration of AI tools in routine psychiatric care.",
      pubmedLink: "https://pubmed.ncbi.nlm.nih.gov/example2",
    },
    {
      title:
        "Multimodal Neuroimaging Biomarkers for Bipolar Disorder Prediction",
      venue: "Biological Psychiatry",
      year: "2023",
      status: "published" as const,
      description:
        "Integration of structural MRI, DTI, and PET imaging using machine learning for early bipolar disorder detection.",
      briefAbstract:
        "By combining structural MRI, diffusion tensor imaging, and PET data through ensemble learning, we achieved 84% accuracy in predicting bipolar disorder onset in at-risk individuals. The model identified key biomarkers in limbic and prefrontal regions, potentially enabling earlier intervention and improved patient outcomes.",
      pubmedLink: "https://pubmed.ncbi.nlm.nih.gov/example3",
    },
    {
      title:
        "Natural Language Processing for Suicide Risk Assessment in Clinical Notes",
      venue: "Nature Digital Medicine",
      year: "2024",
      status: "under-review" as const,
      description:
        "Development of NLP algorithms to identify suicide risk indicators in electronic health records.",
      briefAbstract:
        "Our transformer-based NLP model analyzes clinical notes to identify subtle linguistic markers of suicide risk, achieving 92% sensitivity while maintaining patient privacy through federated learning approaches. The system can flag high-risk patients for immediate clinical attention, potentially saving lives through early intervention.",
    },
    {
      title: "Digital Phenotyping for Schizophrenia Relapse Prediction",
      venue: "Data Collection Phase",
      year: "2024",
      status: "in-process" as const,
      description:
        "Longitudinal study using smartphone sensors and digital biomarkers to predict psychotic episodes.",
      briefAbstract:
        "We're collecting continuous smartphone sensor data from 500 patients with schizophrenia to develop predictive models for relapse. Preliminary results show promise in detecting prodromal symptoms 2-3 weeks before clinical presentation, using patterns in sleep, activity, and communication behaviors.",
    },
    {
      title: "Explainable AI for Psychiatric Treatment Recommendations",
      venue: "In Preparation",
      year: "2024",
      status: "in-preparation" as const,
      description:
        "Development of interpretable machine learning models for personalized psychiatric treatment selection.",
      briefAbstract:
        "This research focuses on creating transparent AI systems that can recommend optimal psychiatric treatments while providing clinically meaningful explanations for their decisions. Our approach addresses the black-box problem in medical AI, ensuring that clinicians can understand and trust AI-generated treatment recommendations.",
    },
  ];

export default function ResearchPageClient() {
  const [sortBy, setSortBy] = React.useState("year-desc");
  const pathname = usePathname();
  const visibleElements = useScrollAnimation();

  const sortedResearch = React.useMemo(() => {
    const sorted = [...researchData];

    switch (sortBy) {
      case "year-desc":
        return sorted.sort(
          (a, b) => Number.parseInt(b.year) - Number.parseInt(a.year)
        );
      case "year-asc":
        return sorted.sort(
          (a, b) => Number.parseInt(a.year) - Number.parseInt(b.year)
        );
      case "status":
        const statusOrder = {
          published: 0,
          "under-review": 1,
          "in-process": 2,
          "in-preparation": 3,
        };
        return sorted.sort(
          (a, b) => statusOrder[a.status] - statusOrder[b.status]
        );
      case "title":
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "venue":
        return sorted.sort((a, b) => a.venue.localeCompare(b.venue));
      default:
        return sorted;
    }
  }, [sortBy]);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Hero Section */}
      <section
        className="flex items-center justify-center min-h-screen pt-32 pb-32"
        id="hero"
        data-animate
      >
        <div className="hero-container">
          <motion.div
            className="space-y-6 sm:space-y-8 text-flow-natural"
            initial={{ opacity: 0, y: 30 }}
            animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.h1
              className="text-hero-title"
              style={{
                color: "var(--foreground)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            >
              Research{" "}
              <span style={{ color: getCurrentPageColor(pathname) }}>
                Portfolio
              </span>
            </motion.h1>

            <motion.p
              className="text-hero-subtitle text-opacity-secondary"
              style={{
                color: "var(--foreground)",
                maxWidth: "600px",
                margin: "0 auto",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={visibleElements.has("hero") ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              Cutting-edge publications in computational psychiatry,
              neuroimaging AI, and digital mental health interventions.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Publications Section */}
      <section
        className="section-spacing-standard"
        id="publications"
        data-animate
      >
        <div className="content-container">
          <motion.div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 sm:gap-4 mb-16 sm:mb-24"
            initial={{ opacity: 0, y: 30 }}
            animate={
              visibleElements.has("publications") ? { opacity: 1, y: 0 } : {}
            }
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2
              className="text-section-title text-flow-natural"
              style={{
                color: "var(--foreground)",
              }}
            >
              Publications &{" "}
              <span style={{ color: getCurrentPageColor(pathname) }}>
                Projects
              </span>
            </h2>

            <div className="flex items-center gap-4 justify-center sm:justify-end">
              <Filter
                className="h-4 w-4"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              />
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none rounded-lg px-4 py-2 pr-8 text-sm focus:outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--card)",
                    color: "var(--foreground)",
                    border: `1px solid var(--border)`,
                  }}
                >
                  <option value="year-desc">Year (Newest First)</option>
                  <option value="year-asc">Year (Oldest First)</option>
                  <option value="status">Status</option>
                  <option value="title">Title (A-Z)</option>
                  <option value="venue">Venue (A-Z)</option>
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "var(--foreground)", opacity: 0.5 }}
                />
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16">
            {sortedResearch.map((research, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  visibleElements.has("publications")
                    ? { opacity: 1, y: 0 }
                    : {}
                }
                transition={{
                  duration: 0.8,
                  delay: 0.1 * index,
                  ease: "easeOut",
                }}
              >
                <ResearchCard {...research} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
