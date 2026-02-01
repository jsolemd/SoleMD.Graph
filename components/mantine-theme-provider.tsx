/**
 * Mantine theme provider with next-themes integration
 * Provides seamless dark/light theme switching for SoleMD platform
 */

"use client";

import { MantineProvider } from "@mantine/core";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  theme as mantineTheme,
  cssVariablesResolver,
} from "@/lib/mantine-theme";

interface MantineThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Mantine theme provider that syncs with next-themes
 * Automatically switches Mantine color scheme based on next-themes state
 */
export function MantineThemeProvider({ children }: MantineThemeProviderProps) {
  const { theme, systemTheme } = useTheme();
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // Handle hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync Mantine color scheme with next-themes
  useEffect(() => {
    if (!mounted) return;

    const resolvedTheme = theme === "system" ? systemTheme : theme;
    setColorScheme(resolvedTheme === "dark" ? "dark" : "light");
  }, [theme, systemTheme, mounted]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <MantineProvider
        theme={mantineTheme}
        defaultColorScheme="light"
        cssVariablesResolver={cssVariablesResolver}
      >
        {children}
      </MantineProvider>
    );
  }

  return (
    <MantineProvider
      theme={mantineTheme}
      defaultColorScheme="light"
      forceColorScheme={colorScheme}
      cssVariablesResolver={cssVariablesResolver}
    >
      {children}
    </MantineProvider>
  );
}
