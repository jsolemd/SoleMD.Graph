"use client";

import { useRef, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { prefersReducedMotion } from "@/features/learn/motion";

interface ManimPlayerProps {
  src: string;
  caption?: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
}

export function ManimPlayer({
  src,
  caption,
  autoPlay = true,
  loop = true,
  className,
}: ManimPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = prefersReducedMotion();
  const shouldAutoPlay = autoPlay && !reduced;
  const [playing, setPlaying] = useState(shouldAutoPlay);

  function handlePlay() {
    videoRef.current?.play();
    setPlaying(true);
  }

  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-xl border shadow-sm">
        <video
          ref={videoRef}
          src={`/learn/manim/${src}`}
          autoPlay={shouldAutoPlay}
          loop={loop}
          muted
          playsInline
          className="block w-full"
          onEnded={() => !loop && setPlaying(false)}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <ActionIcon
              variant="filled"
              size="xl"
              radius="xl"
              aria-label="Play video"
              onClick={handlePlay}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <polygon points="5,3 17,10 5,17" />
              </svg>
            </ActionIcon>
          </div>
        )}
      </div>
      {caption && (
        <figcaption
          className="mt-2 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
