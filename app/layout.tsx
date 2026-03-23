import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { MantineThemeProvider } from "@/components/MantineThemeProvider";

import "@mantine/core/styles.css";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        {/* Set .dark class before paint to prevent FOUC — mirrors ColorSchemeScript logic */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem("mantine-color-scheme-value");var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans">
        <MantineThemeProvider>{children}</MantineThemeProvider>
      </body>
    </html>
  );
}
