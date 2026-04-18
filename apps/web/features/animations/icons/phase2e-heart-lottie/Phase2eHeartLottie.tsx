"use client";
/**
 * Phase2eHeartLottie — LottieFiles animation wrapper.
 *
 * Source:        LottieFiles
 * Title:         Phase2E Heart
 * Author:        LottieFiles community
 * License:       LottieFiles Simple License
 * Original URL:  https://assets5.lottiefiles.com/packages/lf20_touohxv0.json
 *
 * JSON payload is fetched from `/animations/_assets/lottie/phase2e-heart.json` at runtime so that the
 * Make -> Graph publish step can route the JSON into `public/` while
 * keeping the wrapper in `features/`. `lottie-react` is loaded via
 * `dynamic(..., { ssr: false })` so Next does not try to execute it on
 * the server.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const PUBLIC_PATH = "/animations/_assets/lottie/phase2e-heart.json";

export default function Phase2eHeartLottie() {
  const reduced = useReducedMotion();
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(PUBLIC_PATH)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        /* TODO: surface error state — JSON failed to load */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <div className="flex h-[280px] w-full items-center justify-center" />;
  }

  return (
    <div className="flex h-[280px] w-full items-center justify-center">
      <Lottie
        animationData={data}
        loop={!reduced}
        autoplay={!reduced}
        className="h-full w-auto max-h-[260px]"
      />
    </div>
  );
}
