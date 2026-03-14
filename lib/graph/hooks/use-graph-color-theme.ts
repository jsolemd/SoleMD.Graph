"use client"

import { useComputedColorScheme } from "@mantine/core"
import type { ColorTheme } from "@/lib/graph/types"

/** Bridge Mantine's computed color scheme to the graph palette's ColorTheme. */
export function useGraphColorTheme(): ColorTheme {
  return useComputedColorScheme("light") === "dark" ? "dark" : "light"
}
