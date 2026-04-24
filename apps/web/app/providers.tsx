"use client";

import { useEffect } from "react";
import {
  MantineProvider,
  useComputedColorScheme,
  type CSSVariablesResolver,
} from "@mantine/core";
import { theme as mantineTheme } from "@/lib/mantine-theme";
import { APP_CHROME_PX } from "@/lib/density";
import { bindDomStateObservers } from "@/app/shell/bind-dom-state-observers";
import { bindShellStateClasses } from "@/app/shell/bind-shell-state-classes";

// Mantine's unlayered `body { background: var(--mantine-color-body) }` wins
// over our layered `@layer base { body { ... } }` in styles/base.css (any
// unlayered rule beats any layered one). Point --mantine-color-body at
// --background so Mantine paints our token instead.
//
// Must override in `light`/`dark` (not `variables`): Mantine's own dark
// override uses selector `:root[data-mantine-color-scheme='dark']`
// (specificity 0,2,0), which beats plain `:root` (0,1,0) from `variables`.
// The `light`/`dark` keys inject at matching specificity, so source order
// wins — the resolver runs after Mantine's base stylesheet.
const resolveCssVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-body": "var(--background)" },
  dark: { "--mantine-color-body": "var(--background)" },
});

/** Syncs Mantine's resolved color scheme to `.dark` class on <html> for CSS custom property cascading. */
function DarkClassSync({ children }: { children: React.ReactNode }) {
  const computedScheme = useComputedColorScheme("dark");

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
    <MantineProvider
      theme={mantineTheme}
      defaultColorScheme="dark"
      cssVariablesResolver={resolveCssVariables}
    >
      <DarkClassSync>
        <ShellRuntimeBindings>{children}</ShellRuntimeBindings>
      </DarkClassSync>
    </MantineProvider>
  );
}
