"use client";

import React from "react";
import FloatingCardBase, { FloatingCardBaseProps } from "./floating-card-base";

/**
 * Base floating card component without arrow indicator.
 * Used for informational/static cards that don't link anywhere.
 */
export default function FloatingCard(props: Omit<FloatingCardBaseProps, "extra">) {
  return <FloatingCardBase {...props} />;
}
