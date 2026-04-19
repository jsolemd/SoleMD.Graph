"use client";

import { Text } from "@mantine/core";
import {
  ChevronDown,
  Search,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import {
  panelTextDimStyle,
  panelTextMutedStyle,
  panelTextStyle,
  promptSurfaceStyle,
} from "../PanelShell";
import { PromptIconBtn } from "./PromptIconBtn";

interface PromptChromePreviewProps {
  title?: string;
  description?: string;
  placeholder?: string;
  className?: string;
  showDescription?: boolean;
}

export function PromptChromePreview({
  title = "Ask the graph",
  description = "Prompt surfaces, chrome pills, and action icons should read as one coherent floating family.",
  placeholder = "What does DRD2 connectivity suggest about psychosis-related pathways?",
  className,
  showDescription = true,
}: PromptChromePreviewProps) {
  return (
    <div
      className={["rounded-[1.5rem] p-4", className].filter(Boolean).join(" ")}
      style={promptSurfaceStyle}
    >
      <Text fw={600} style={panelTextStyle}>
        {title}
      </Text>
      {showDescription && (
        <Text mt={4} style={panelTextDimStyle}>
          {description}
        </Text>
      )}
      <div className="mt-4 min-h-[92px] px-2 py-1">
        <Text
          style={{
            ...panelTextMutedStyle,
            color: "var(--graph-prompt-placeholder)",
          }}
        >
          {placeholder}
        </Text>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-1">
            <PromptIconBtn
              icon={ChevronDown}
              label="Collapse"
              onClick={() => {}}
            />
          </div>
          <PromptIconBtn
            icon={SlidersHorizontal}
            label="Formatting"
            active
            onClick={() => {}}
          />
          <PromptIconBtn
            icon={Target}
            label="Selection scope"
            onClick={() => {}}
          />
        </div>
        <PromptIconBtn
          icon={Search}
          label="Submit prompt"
          size="md"
          variant="primary"
          onClick={() => {}}
        />
      </div>
    </div>
  );
}
