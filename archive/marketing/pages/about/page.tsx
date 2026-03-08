// ./about/page.tsx
// Part 1: Import the interactive UI from our new client file.
import AboutPageClient from "./AboutPageClient";

// Part 2: Keep the metadata here.
export const metadata = {
  title: "About SoleMD - The Mission and the Mind Behind It",
  description:
    "Learn about the psychiatrist and neuroscientist dedicated to transforming mental health education through AI and computational neuroscience.",
};

// Part 3: The page now just renders the client component.
export default function AboutPage() {
  return <AboutPageClient />;
}
