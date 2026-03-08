// This file is for the "Server's Job" - the blueprint.

// Part 1: Import the interactive UI from our new client file.
import ResearchPageClient from "./ResearchPageClient";

// Part 2: Add the metadata here for SEO. This is the server's job.
export const metadata = {
  title: "Research Portfolio",
  description:
    "Explore publications and projects in computational psychiatry, neuroimaging AI, and digital mental health from SoleMD.",
};

// Part 3: This page now just renders the client component.
export default function ResearchPage() {
  return <ResearchPageClient />;
}
