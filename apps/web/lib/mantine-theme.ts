/**
 * SoleMD Mantine Theme
 * Minimal bridge: Mantine components pick up brand colors + defaults.
 * All runtime theming is handled by CSS custom properties in globals.css.
 */

import { createTheme } from "@mantine/core";
import {
  mantineBrandColorsTuple,
  mantineNeutralColorsTuple,
  themeSurfaceFallbackHexByKey,
} from "@/lib/pastel-tokens";
export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 3, dark: 3 },

  colors: {
    brand: mantineBrandColorsTuple,
    gray: mantineNeutralColorsTuple,
  },

  fontFamily: "var(--font-sans)",
  headings: {
    fontFamily: "var(--font-sans)",
    fontWeight: "500",
  },

  radius: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
  },
  defaultRadius: "lg",

  shadows: {
    xs: "var(--shadow-sm)",
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-lg)",
  },

  components: {
    Button: {
      defaultProps: { radius: "xl", size: "md" },
      styles: { root: { fontWeight: 400, transition: "all 200ms ease" } },
    },
    Card: {
      defaultProps: { radius: "lg", shadow: "sm", padding: "xl" },
    },
    TextInput: {
      defaultProps: { radius: "lg", size: "md" },
    },
    Select: {
      defaultProps: { radius: "lg", size: "md" },
    },
    Textarea: {
      defaultProps: { radius: "lg", size: "md" },
    },
    ActionIcon: {
      defaultProps: { radius: "lg", size: "md" },
    },
    Paper: {
      defaultProps: { radius: "lg", shadow: "sm", padding: "md" },
    },
    Badge: {
      defaultProps: { radius: "xl" },
    },
  },

  white: themeSurfaceFallbackHexByKey.white,
  black: themeSurfaceFallbackHexByKey.black,
});
