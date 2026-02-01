// This file is for the "Server's Job" - the blueprint.

// Part 1: Import the interactive UI from our new client file.
import EducationPageClient from "./EducationPageClient";

// Part 2: Add the metadata here for SEO. This is the server's job.
export const metadata = {
  title: "Education - SoleMD",
  description:
    "Explore educational modules on AI in psychiatry, computational neuroscience, and neuroimaging from SoleMD.",
};

// Part 3: This page now just renders the client component.
export default function EducationPage() {
  return <EducationPageClient />;
}