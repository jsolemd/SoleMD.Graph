/**
 * SoleMD Icon Mapping Utility
 *
 * Provides semantic icon suggestions for SoleMD's content categories
 * using Lucide React icons with the two-tier icon system.
 */

import {
  // Medical & Science Icons
  Brain,
  BrainCircuit,
  BrainCog,
  Microscope,
  Stethoscope,
  Heart,
  Activity,
  FlaskConical,
  FlaskRound,
  Beaker,
  Dna,

  // Education & Learning Icons
  GraduationCap,
  BookOpen,
  BookUser,
  Notebook,
  NotebookTabs,
  Library,
  School,

  // Technology & AI Icons
  ChartNetwork,
  Network,
  CircuitBoard,
  Cpu,
  Bot,
  Zap,
  Sparkles,

  // Research & Analysis Icons
  Search,
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  Target,
  Telescope,

  // Communication & Social Icons
  Users,
  User,
  MessageSquare,
  Mail,
  Globe,
  Share2,

  // General Purpose Icons
  Star,
  Award,
  Shield,
  CheckCircle,
  Info,
  ArrowRight,
  Plus,
  type LucideIcon,
} from "lucide-react";

import type { FeatureIconColor } from "@/components/ui/feature-icon";

/**
 * Content categories for SoleMD platform
 */
export type SoleMDContentCategory =
  | "research" // Computational psychiatry, neuroimaging AI, publications
  | "education" // AI for MD courses, learning modules, tutorials
  | "about" // Personal profile, expertise, background
  | "medical" // Clinical expertise, evidence-based treatments
  | "neuroscience" // Neural circuits, brain function, neuroscience topics
  | "ai-technology" // AI applications, machine learning, technology
  | "knowledge-wiki" // Knowledge graph, interactive content, wiki
  | "clinical" // Clinical research, patient care, medical practice
  | "general"; // General purpose, miscellaneous content

/**
 * Icon recommendation for a content category
 */
export interface IconRecommendation {
  /** Primary recommended icon */
  primary: LucideIcon;
  /** Alternative icon options */
  alternatives: LucideIcon[];
  /** Recommended semantic color */
  color: FeatureIconColor;
  /** Suggested keyword tags for this category */
  keywords: string[];
}

/**
 * Comprehensive icon mapping for SoleMD content categories
 */
export const soleMDIconMap: Record<SoleMDContentCategory, IconRecommendation> =
  {
    research: {
      primary: BrainCircuit,
      alternatives: [Brain, Microscope, FlaskConical, Telescope, BarChart3],
      color: "teal",
      keywords: [
        "Computational Psychiatry",
        "Neuroimaging AI",
        "Research Publications",
        "Data Analysis",
        "Scientific Studies",
      ],
    },

    education: {
      primary: GraduationCap,
      alternatives: [BookOpen, Notebook, School, Library, NotebookTabs],
      color: "purple",
      keywords: [
        "AI for MD",
        "Learning Modules",
        "Educational Content",
        "Courses",
        "Tutorials",
      ],
    },

    about: {
      primary: User,
      alternatives: [Users, Award, Shield, Star, Info],
      color: "blue",
      keywords: [
        "Dr. Profile",
        "Expertise",
        "Background",
        "Qualifications",
        "Experience",
      ],
    },

    medical: {
      primary: Stethoscope,
      alternatives: [Heart, Activity, Plus, Shield, CheckCircle],
      color: "green",
      keywords: [
        "Clinical Expertise",
        "Evidence-Based",
        "Medical Practice",
        "Patient Care",
        "Healthcare",
      ],
    },

    neuroscience: {
      primary: Brain,
      alternatives: [BrainCog, Activity, CircuitBoard, Network, Zap],
      color: "orange",
      keywords: [
        "Neural Circuits",
        "Brain Function",
        "Neuroscience",
        "Cognitive Science",
        "Neural Networks",
      ],
    },

    "ai-technology": {
      primary: Bot,
      alternatives: [CircuitBoard, Cpu, ChartNetwork, Sparkles, Zap],
      color: "cyan",
      keywords: [
        "Artificial Intelligence",
        "Machine Learning",
        "Technology",
        "AI Applications",
        "Innovation",
      ],
    },

    "knowledge-wiki": {
      primary: ChartNetwork,
      alternatives: [Network, Globe, BookUser, Share2, Target],
      color: "cyan",
      keywords: [
        "Knowledge Graph",
        "Interactive Content",
        "Wiki",
        "Information Hub",
        "Connected Learning",
      ],
    },

    clinical: {
      primary: FlaskConical,
      alternatives: [Beaker, Microscope, TrendingUp, LineChart, Search],
      color: "green",
      keywords: [
        "Clinical Research",
        "Clinical Trials",
        "Medical Studies",
        "Evidence-Based Medicine",
        "Clinical Practice",
      ],
    },

    general: {
      primary: Star,
      alternatives: [Info, CheckCircle, ArrowRight, Target, Award],
      color: "purple",
      keywords: ["General", "Information", "Content", "Resources", "Tools"],
    },
  };

/**
 * Get icon recommendation for a content category
 */
export function getIconRecommendation(
  category: SoleMDContentCategory
): IconRecommendation {
  return soleMDIconMap[category];
}

/**
 * Get primary icon for a content category
 */
export function getPrimaryIcon(category: SoleMDContentCategory): LucideIcon {
  return soleMDIconMap[category].primary;
}

/**
 * Get recommended color for a content category
 */
export function getRecommendedColor(
  category: SoleMDContentCategory
): FeatureIconColor {
  return soleMDIconMap[category].color;
}

/**
 * Get keyword suggestions for a content category
 */
export function getKeywordSuggestions(
  category: SoleMDContentCategory
): string[] {
  return soleMDIconMap[category].keywords;
}

/**
 * Search for icons by keyword or description
 */
export function searchIcons(query: string): Array<{
  category: SoleMDContentCategory;
  icon: LucideIcon;
  color: FeatureIconColor;
  relevance: number;
}> {
  const results: Array<{
    category: SoleMDContentCategory;
    icon: LucideIcon;
    color: FeatureIconColor;
    relevance: number;
  }> = [];

  const queryLower = query.toLowerCase();

  Object.entries(soleMDIconMap).forEach(([category, recommendation]) => {
    // Check category name match
    if (category.toLowerCase().includes(queryLower)) {
      results.push({
        category: category as SoleMDContentCategory,
        icon: recommendation.primary,
        color: recommendation.color,
        relevance: 1.0,
      });
    }

    // Check keyword matches
    recommendation.keywords.forEach((keyword) => {
      if (keyword.toLowerCase().includes(queryLower)) {
        results.push({
          category: category as SoleMDContentCategory,
          icon: recommendation.primary,
          color: recommendation.color,
          relevance: 0.8,
        });
      }
    });
  });

  // Sort by relevance and remove duplicates
  return results
    .sort((a, b) => b.relevance - a.relevance)
    .filter(
      (item, index, arr) =>
        arr.findIndex((other) => other.category === item.category) === index
    );
}

/**
 * Utility to create a feature card configuration
 */
export function createFeatureConfig(
  category: SoleMDContentCategory,
  title: string,
  description: string,
  customKeywords?: string[]
) {
  const recommendation = getIconRecommendation(category);

  return {
    icon: recommendation.primary,
    color: recommendation.color,
    title,
    description,
    keywords: customKeywords || recommendation.keywords.slice(0, 3), // Limit to 3 keywords
    category,
  };
}
