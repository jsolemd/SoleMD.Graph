"use client";

import { forwardRef } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { promptSurfaceStyle } from "./panel-styles";

interface PopoverSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  style?: CSSProperties;
}

export const PopoverSurface = forwardRef<HTMLDivElement, PopoverSurfaceProps>(
  function PopoverSurface(
    {
      children,
      className,
      width,
      minWidth,
      maxWidth,
      maxHeight,
      style,
      ...rest
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={["rounded-surface-sm", className].filter(Boolean).join(" ")}
        style={{
          width,
          minWidth,
          maxWidth,
          maxHeight,
          ...promptSurfaceStyle,
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
