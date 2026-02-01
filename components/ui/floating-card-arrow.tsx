"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";
import FloatingCardBase, { FloatingCardBaseProps } from "./floating-card-base";

export interface FloatingCardArrowProps extends Omit<FloatingCardBaseProps, "extra"> {
  href?: string;
  onClick?: () => void;
}

/**
 * Floating card component with arrow indicator for interactive/linkable cards.
 */
export default function FloatingCardArrow({ href, onClick, ...props }: FloatingCardArrowProps) {
  const card = (
    <FloatingCardBase
      {...props}
      extra={
        <div className="absolute top-6 right-6">
          <ArrowUpRight
            className="h-5 w-5 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 opacity-60 group-hover:opacity-100"
            style={{ color: "var(--foreground)", opacity: 0.4 }}
          />
        </div>
      }
    />
  );

  if (href) {
    return (
      <a href={href} className="group block h-full">
        {card}
      </a>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className="group block h-full w-full text-left">
        {card}
      </button>
    );
  }

  return card;
}
