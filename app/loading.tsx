"use client";

import { motion } from "framer-motion";

export default function GraphLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--graph-bg)]">
      {/* Wordmark placeholder */}
      <div className="fixed top-3 left-3 z-50 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--graph-wordmark-accent)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
            <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
            <path d="M6 18a4 4 0 0 1-1.967-.516" />
            <path d="M19.967 17.484A4 4 0 0 1 18 18" />
          </svg>
        </div>
        <span
          className="text-lg font-semibold"
          style={{ color: "var(--graph-wordmark-text)" }}
        >
          SoleMD
        </span>
      </div>

      {/* Center loading pulse */}
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: "var(--graph-wordmark-accent)" }}
          animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.12, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <span
          className="text-sm"
          style={{ color: "var(--graph-stats-text)" }}
        >
          Loading knowledge graph...
        </span>
      </div>

      {/* PromptBox shell placeholder */}
      <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
        <motion.div
          className="h-14 w-[min(600px,90vw)] rounded-full backdrop-blur-xl"
          style={{
            backgroundColor: "var(--graph-prompt-bg)",
            border: "1px solid var(--graph-prompt-border)",
          }}
          animate={{ opacity: [0.55, 0.95, 0.55] }}
          transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
