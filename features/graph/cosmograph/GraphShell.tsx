"use client";
import { CosmographProvider } from "@cosmograph/react";

export function GraphShell({ children }: { children: React.ReactNode }) {
  return <CosmographProvider>{children}</CosmographProvider>;
}
