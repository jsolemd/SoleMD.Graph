import type { Metadata } from "next";

/**
 * Layout for AI for MD Foundations Learning Module
 *
 * This layout provides the structure for the interactive learning experience
 * while maintaining integration with the main SoleMD platform.
 *
 * Features:
 * - Module-specific metadata and SEO
 * - Maintains global header/footer from root layout
 * - Education theme integration
 * - Optimized for learning content
 */

export const metadata: Metadata = {
  title: "AI for MD Foundations - Interactive Learning | SoleMD",
  description:
    "Master the fundamentals of artificial intelligence in healthcare through interactive lessons, exercises, and practical applications.",
  keywords: [
    "AI in healthcare",
    "medical AI",
    "artificial intelligence",
    "clinical decision support",
    "healthcare technology",
    "medical education",
    "AI foundations",
    "SoleMD education",
  ],
  openGraph: {
    title: "AI for MD Foundations - Interactive Learning",
    description:
      "Master the fundamentals of artificial intelligence in healthcare through interactive lessons, exercises, and practical applications.",
    type: "website",
    siteName: "SoleMD",
    images: [
      {
        url: "/api/og?title=AI for MD Foundations&subtitle=Interactive Learning Experience&theme=education",
        width: 1200,
        height: 630,
        alt: "AI for MD Foundations - Interactive Learning Experience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI for MD Foundations - Interactive Learning",
    description:
      "Master the fundamentals of artificial intelligence in healthcare through interactive lessons, exercises, and practical applications.",
    images: [
      "/api/og?title=AI for MD Foundations&subtitle=Interactive Learning Experience&theme=education",
    ],
  },
};

interface LearnLayoutProps {
  children: React.ReactNode;
}

/**
 * Learn Layout Component
 *
 * Provides the layout structure for the AI for MD Foundations learning module.
 * Inherits global layout (header/footer) while providing module-specific structure.
 *
 * @param children - The page content to render within the layout
 */
export default function LearnLayout({ children }: LearnLayoutProps) {
  return (
    <>
      {/* Module-specific styles and configuration will be added here */}
      <div className="learn-module-container">{children}</div>
    </>
  );
}
