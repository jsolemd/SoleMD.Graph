"use client";

import { memo } from "react";
import { densityCssPx } from "@/lib/density";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
import { usePromptBoxController } from "./prompt/use-prompt-box-controller";
import { PromptBoxSurface } from "./prompt/PromptBoxSurface";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";

function PromptBoxComponent({
  bundle,
  queries,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries | null;
}) {
  const shellVariant = useShellVariantContext();
  const controller = usePromptBoxController({ bundle, queries });

  return (
    <PromptBoxSurface
      {...controller}
      placeholder={
        !controller.hasInput ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              padding: "0.25rem 0.5rem",
              fontSize: densityCssPx(shellVariant === "mobile" ? 12 : 10),
              lineHeight: 1.5,
              overflow: "hidden",
              color: "var(--graph-prompt-placeholder)",
              zIndex: 1,
            }}
          >
            {controller.typewriterIsLast ? (
              <span>
                <span style={{ color: "var(--mode-accent)", opacity: 0.7 }}>
                  {controller.typewriterText.slice(0, controller.activeMode.label.length)}
                </span>
                {controller.typewriterText.slice(controller.activeMode.label.length)}
              </span>
            ) : (
              controller.typewriterText
            )}
          </div>
        ) : undefined
      }
    />
  );
}

export const PromptBox = memo(PromptBoxComponent);
PromptBox.displayName = "PromptBox";
