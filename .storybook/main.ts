import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../features/animations/**/*.stories.@(ts|tsx)",
    "../content/graph/components/_smoke/**/*.stories.@(ts|tsx)",
  ],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: false,
  },
};

export default config;
