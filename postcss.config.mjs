/**
 * PostCSS Configuration for SoleMD
 *
 * Optimized for Tailwind CSS v4 + Mantine v8 integration
 * - @tailwindcss/postcss handles autoprefixer automatically in v4
 * - postcss-preset-mantine for Mantine component processing
 * - postcss-simple-vars for Mantine breakpoint variables
 */
export default {
  plugins: {
    // Mantine preset - must come first
    "postcss-preset-mantine": {},

    // Mantine breakpoint variables
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },

    // Tailwind CSS v4 PostCSS plugin (includes autoprefixer automatically)
    "@tailwindcss/postcss": {},

    // Note: autoprefixer is automatically included in @tailwindcss/postcss v4
    // No need to include it separately
  },
};
