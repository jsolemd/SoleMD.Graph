"use client";

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { metaPillStyle } from "./surface-styles";

interface MetaPillBaseProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  mono?: boolean;
  truncate?: boolean;
  title?: string;
  entityType?: string | null;
  onMouseDown?: MouseEventHandler<HTMLElement>;
}

interface MetaPillLinkProps extends MetaPillBaseProps {
  href: string;
  target?: string;
  rel?: string;
}

interface MetaPillTextProps extends MetaPillBaseProps {
  href?: undefined;
}

type MetaPillProps = MetaPillLinkProps | MetaPillTextProps;

export function MetaPill(props: MetaPillProps) {
  const entityType = props.entityType?.toLowerCase() ?? undefined;
  const sharedStyle: CSSProperties = {
    ...metaPillStyle,
    ...(entityType
      ? {
          backgroundColor:
            "color-mix(in oklch, var(--entity-accent, var(--graph-panel-input-bg)) 25%, var(--graph-panel-input-bg))",
          border: "1px solid transparent",
          color: "var(--graph-panel-text)",
        }
      : null),
    ...(props.mono ? { fontFamily: "var(--font-mono)" } : null),
    ...(props.truncate
      ? {
          flexShrink: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : null),
    ...props.style,
  };
  const sharedClassName = [props.truncate ? "truncate" : null, props.className]
    .filter(Boolean)
    .join(" ");

  if ("href" in props && props.href) {
    return (
      <a
        href={props.href}
        target={props.target}
        rel={props.rel}
        title={props.title}
        className={sharedClassName}
        data-entity-type={entityType}
        style={{
          ...sharedStyle,
          textDecoration: "none",
        }}
        onMouseDown={props.onMouseDown}
      >
        {props.children}
      </a>
    );
  }

  return (
    <span
      title={props.title}
      className={sharedClassName}
      data-entity-type={entityType}
      style={sharedStyle}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </span>
  );
}
