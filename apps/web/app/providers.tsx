"use client";

import { useEffect } from "react";
import {
  MantineProvider,
  useComputedColorScheme,
} from "@mantine/core";
import { theme as mantineTheme } from "@/lib/mantine-theme";
import { APP_CHROME_PX } from "@/lib/density";
import { bindDomStateObservers } from "@/app/shell/bind-dom-state-observers";
import { bindShellStateClasses } from "@/app/shell/bind-shell-state-classes";

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

function ShellRuntimeBindings({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const disposeShellClasses = bindShellStateClasses({
      headerHeight: APP_CHROME_PX.panelTop,
    });
    const disposeDomObservers = bindDomStateObservers();
    return () => {
      disposeDomObservers();
      disposeShellClasses();
    };
  }, []);

  return <>{children}</>;
}

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <DarkClassSync>
        <ShellRuntimeBindings>{children}</ShellRuntimeBindings>
      </DarkClassSync>
    </MantineProvider>
  );
}
