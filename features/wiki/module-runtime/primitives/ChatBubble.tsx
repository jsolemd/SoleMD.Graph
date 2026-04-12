"use client";

import { Text } from "@mantine/core";

interface ChatBubbleProps {
  role: "user" | "ai";
  children: React.ReactNode;
  className?: string;
}

function AiAvatar() {
  return (
    <div
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: "color-mix(in srgb, var(--module-accent) 18%, var(--surface))" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        {/* Sparkle / brain icon - four-pointed star */}
        <path
          d="M8 1c0 3.866-3.134 7-7 7 3.866 0 7 3.134 7 7 0-3.866 3.134-7 7-7-3.866 0-7-3.134-7-7Z"
          fill="var(--module-accent)"
          fillOpacity={0.85}
        />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: "var(--module-accent)", color: "white" }}
    >
      <Text
        component="span"
        style={{ fontSize: "10px", fontWeight: 700, lineHeight: 1, letterSpacing: "0.02em" }}
      >
        MD
      </Text>
    </div>
  );
}

export function ChatBubble({ role, children, className }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"} ${className ?? ""}`}
    >
      {isUser ? <UserAvatar /> : <AiAvatar />}
      <div
        className="max-w-[80%] rounded-[1rem] px-4 py-3"
        style={{
          background: isUser
            ? "color-mix(in srgb, var(--module-accent) 12%, var(--surface))"
            : "var(--surface)",
          boxShadow: "var(--shadow-sm)",
          color: "var(--text-primary)",
        }}
      >
        <Text component="div" size="sm" style={{ lineHeight: 1.6 }}>
          {children}
        </Text>
      </div>
    </div>
  );
}
