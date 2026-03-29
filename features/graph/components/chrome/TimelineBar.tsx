"use client";

import { motion } from "framer-motion";
import { useDashboardStore } from "@/features/graph/stores";
import { TimelineWidget } from "@/features/graph/cosmograph/widgets/TimelineWidget";
import type { GraphBundleQueries } from "@/features/graph/types";
import { smooth } from "@/lib/motion";

const timelineStyle: React.CSSProperties = {
  height: 44,
  overflow: "hidden",
  backgroundColor: "var(--graph-bg)",
};

export function TimelineBar({ queries }: { queries: GraphBundleQueries }) {
  const timelineColumn = useDashboardStore((s) => s.timelineColumn);
  const setTimelineSelection = useDashboardStore((s) => s.setTimelineSelection);

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-stretch"
      initial={{ opacity: 0, y: 44 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 44 }}
      transition={smooth}
      style={timelineStyle}
    >
      <TimelineWidget
        column={timelineColumn}
        queries={queries}
        onSelection={setTimelineSelection}
      />
    </motion.div>
  );
}
