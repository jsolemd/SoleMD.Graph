import type { Metadata, Viewport } from "next";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { MantineThemeProvider } from "@/components/mantine-theme-provider";

import "@mantine/core/styles.css";
import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://solemd.com"),
  title: {
    default: "SoleMD",
    template: "%s | SoleMD",
  },
  description: "Biomedical knowledge, organized.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="font-sans">
        <MantineThemeProvider>{children}</MantineThemeProvider>
      </body>
    </html>
  );
}
