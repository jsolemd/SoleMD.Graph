"use client";

import { useEffect } from "react";
import { MantineProvider, useMantineColorScheme } from "@mantine/core";
import { theme as mantineTheme } from "@/lib/mantine-theme";

/** Syncs Mantine color scheme to `.dark` class on <html> for CSS custom property cascading. */
function DarkClassSync({ children }: { children: React.ReactNode }) {
  const { colorScheme } = useMantineColorScheme();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", colorScheme === "dark");
  }, [colorScheme]);

  return <>{children}</>;
}

export function MantineThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <DarkClassSync>{children}</DarkClassSync>
    </MantineProvider>
  );
}
