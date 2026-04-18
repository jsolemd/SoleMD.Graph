"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShellVariant } from "./use-shell-variant";

const ShellVariantContext = createContext<ShellVariant>("desktop");

export function ShellVariantProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ShellVariant;
}) {
  return (
    <ShellVariantContext.Provider value={value}>
      {children}
    </ShellVariantContext.Provider>
  );
}

export function useShellVariantContext(): ShellVariant {
  return useContext(ShellVariantContext);
}
