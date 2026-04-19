"use client";

import { RefreshCw, Home } from "lucide-react";
import { RouteStatusSurface } from "@/app/_components/RouteStatusSurface";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteStatusSurface
      statusLabel="Error"
      eyebrow="Application error"
      title="Something went wrong"
      description="The app hit an unexpected failure while rendering this route. Try the current action again or return to the homepage."
      primaryAction={{
        label: "Try again",
        onClick: reset,
        icon: <RefreshCw size={16} />,
        tone: "primary",
      }}
      secondaryAction={{
        href: "/",
        label: "Go home",
        icon: <Home size={16} />,
      }}
    />
  );
}
