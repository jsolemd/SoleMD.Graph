// app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { MantineThemeProvider } from "@/components/mantine-theme-provider";
import { cn } from "@/lib/utils";

import "@mantine/core/styles.css";
import "@/app/globals.css";

// --- IMPORT THE SHARED LAYOUT COMPONENTS ---
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer"; // Assuming this is the correct path

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SoleMD - Neuroscience Education Reimagined",
  description:
    "Where artificial intelligence meets psychiatric care through elegant education and research.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <MantineThemeProvider>
            {/* This div creates the stacking context for our z-index layering */}
            <div className="relative flex flex-col min-h-screen">
              {/* The Header is now part of the global layout, rendered on every page. */}
              <Header />

              {/* The <main> tag wraps the page-specific content and allows it to grow */}
              <main className="flex-1">{children}</main>

              {/* The Footer is also part of the global layout. */}
              <Footer />
            </div>
          </MantineThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
