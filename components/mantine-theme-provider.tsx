"use client";

import { useEffect } from "react";
import { MantineProvider, useMantineColorScheme } from "@mantine/core";
import {
  theme as mantineTheme,
  cssVariablesResolver,
} from "@/lib/mantine-theme";

interface MantineThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Syncs Mantine's color scheme to the `.dark` class on <html>.
 * Our globals.css uses `.dark { ... }` for all dark mode tokens.
 */
function DarkClassSync({ children }: { children: React.ReactNode }) {
  const { colorScheme } = useMantineColorScheme();

  useEffect(() => {
    const html = document.documentElement;
    if (colorScheme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [colorScheme]);

  return <>{children}</>;
}

export function MantineThemeProvider({ children }: MantineThemeProviderProps) {
  return (
    <MantineProvider
      theme={mantineTheme}
      defaultColorScheme="auto"
      cssVariablesResolver={cssVariablesResolver}
    >
      <DarkClassSync>{children}</DarkClassSync>
    </MantineProvider>
  );
}
