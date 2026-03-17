'use client';

import { type ReactNode, type CSSProperties } from 'react';

interface InteractiveListItemProps {
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
  hoverBg?: string;
}

/**
 * Accessible interactive list row with CSS :hover/:focus-visible highlighting.
 *
 * Replaces the copy-pasted pattern of role="button" + tabIndex={0} + JS
 * onMouseEnter/Leave for background color. Keyboard accessible (Enter/Space).
 */
export function InteractiveListItem({
  onClick,
  children,
  style,
  hoverBg = 'var(--mode-accent-subtle)',
}: InteractiveListItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 -mx-2 cursor-pointer"
      style={{
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      onFocus={(e) => {
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onBlur={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {children}
    </div>
  );
}
