/**
 * Tailwind CSS v4 Configuration for SoleMD
 *
 * In Tailwind v4, most configuration is done in CSS using @theme directive.
 * This file is minimal and only contains build-time configuration.
 * All theme values, colors, and design tokens are defined in app/globals.css
 */

/** @type {import('tailwindcss').Config} */
export default {
  // Content paths for JIT compilation
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  // Dark mode configuration
  darkMode: "class",

  // Disable preflight to prevent conflicts with Mantine
  corePlugins: {
    preflight: false,
  },
};
