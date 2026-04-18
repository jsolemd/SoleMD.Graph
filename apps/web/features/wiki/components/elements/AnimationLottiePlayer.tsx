"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { Skeleton } from "@mantine/core";

interface Props {
  src: string;
}

export function AnimationLottiePlayer({ src }: Props) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({});
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!data) return <Skeleton height={280} radius="lg" />;
  return <Lottie animationData={data} loop className="h-full w-full" />;
}
