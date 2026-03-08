/**
 * SoleMD Mantine Theme
 * Minimal bridge: Mantine components pick up brand colors + defaults.
 * All runtime theming is handled by CSS custom properties in globals.css.
 */

import { createTheme, MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#eef3f9",
  "#dce7f4",
  "#c9dcef",
  "#a8c5e9", // [3] Primary — soft blue
  "#92b3d7",
  "#7c9fc5",
  "#668bb3",
  "#5077a1",
  "#3a638f",
  "#244f7d",
];

const neutral: MantineColorsTuple = [
  "#fafafa",
  "#f5f5f5",
  "#eaedf0",
  "#d1d5db",
  "#9ca3af",
  "#6b7280",
  "#5c5f66",
  "#4b5563",
  "#374151",
  "#1f2937",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 3, dark: 3 },

  colors: {
    brand,
    gray: neutral,
  },

  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  headings: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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

  white: "#ffffff",
  black: "#1a1b1e",
});
