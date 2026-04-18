"use client";

import { useEffect } from "react";
import {
  MantineProvider,
  useComputedColorScheme,
} from "@mantine/core";
import { theme as mantineTheme } from "@/lib/mantine-theme";

/** Syncs Mantine's resolved color scheme to `.dark` class on <html> for CSS custom property cascading. */
function DarkClassSync({ children }: { children: React.ReactNode }) {
  const computedScheme = useComputedColorScheme("light");

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      computedScheme === "dark",
    );
  }, [computedScheme]);

  return <>{children}</>;
}

export function Providers({
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
