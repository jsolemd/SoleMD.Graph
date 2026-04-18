"use client";

import { Text } from "@mantine/core";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelScaledPx,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

interface OpenModuleCTAProps {
  accent?: string;
}

export function OpenModuleCTA({ accent }: OpenModuleCTAProps) {
  const modulePopped = useWikiStore((s) => s.modulePopped);
  const setModulePopped = useWikiStore((s) => s.setModulePopped);

  const handleClick = () => {
    if (modulePopped) {
      // Bring content back inline
      setModulePopped(false);
      return;
    }
    // Scroll to inline module content
    const el = document.getElementById("wiki-module-inline");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex justify-center" style={{ margin: "6px 0" }}>
      <button
        type="button"
        className={`${panelAccentCardClassName} transition-opacity hover:brightness-105`}
        style={{
          ...panelAccentCardStyle,
          cursor: "pointer",
          padding: `${panelScaledPx(6)} ${panelScaledPx(14)}`,
          ...(accent ? { borderColor: accent } : {}),
        }}
        onClick={handleClick}
      >
        <Text style={panelTextStyle}>
          {modulePopped ? "View module inline" : "Start the module"}
        </Text>
      </button>
    </div>
  );
}
