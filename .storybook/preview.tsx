import type { Preview } from "@storybook/react-vite";
import "@mantine/core/styles.css";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "surface",
      values: [
        { name: "surface", value: "var(--background, #fafafa)" },
        { name: "dark", value: "#18181b" },
      ],
    },
    layout: "centered",
  },
  globalTypes: {
    colorScheme: {
      description: "Mantine color scheme",
      defaultValue: "light",
      toolbar: {
        icon: "contrast",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
};

export default preview;
