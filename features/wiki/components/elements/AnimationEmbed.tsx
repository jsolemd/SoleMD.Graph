"use client";
/**
 * AnimationEmbed — renders an animation referenced by `[[anim:name]]`.
 *
 * Reads the manifest, dispatches to the correct renderer based on
 * `format`, and provides a hover-to-expand button that opens the
 * fullscreen overlay on the wiki panel.
 *
 * Modes:
 *   framer | r3f | interactive → React component (dynamic-imported for r3f/interactive)
 *   model-viewer                → <model-viewer> wrapper
 *   lottie                      → lottie-react JSON playback
 *   manim                       → <video> element
 */
import { memo, useMemo } from "react";
import dynamic from "next/dynamic";
import { ActionIcon, Skeleton } from "@mantine/core";
import { Maximize2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  getAnimationRef,
  type AnimationRef,
} from "@/features/animations/manifest";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { canvasReveal } from "@/lib/motion";

const fallback = <Skeleton height={280} radius="lg" />;

interface AnimationEmbedProps {
  name: string;
}

function AnimationEmbedInner({ name }: AnimationEmbedProps) {
  const ref = getAnimationRef(name);
  const setFullscreenAnim = useWikiStore((s) => s.setFullscreenAnim);

  if (!ref) {
    return (
      <div
        className="my-4 rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface-alt)] p-4 text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        Animation <code>{name}</code> not found in manifest.
      </div>
    );
  }

  return (
    <motion.figure
      {...canvasReveal}
      className="group relative my-6 overflow-hidden rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
    >
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionIcon
          variant="subtle"
          size="sm"
          radius="xl"
          onClick={() => setFullscreenAnim(name)}
          aria-label="Expand animation"
        >
          <Maximize2 size={14} />
        </ActionIcon>
      </div>
      <AnimationBody refData={ref} />
      {ref.caption && (
        <figcaption
          className="px-4 py-2 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {ref.caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

export const AnimationEmbed = memo(AnimationEmbedInner);

// ---------------------------------------------------------------------------

function AnimationBody({ refData }: { refData: AnimationRef }) {
  // Each branch returns a stable element tree per format. r3f and
  // interactive formats are dynamic-imported with ssr: false to keep
  // three.js out of the server bundle.
  const format = refData.format;

  const Loaded = useMemo(() => {
    if (format === "r3f" || format === "interactive") {
      return dynamic(
        () => import(`@/features/animations/${refData.path}`),
        { ssr: false, loading: () => fallback },
      );
    }
    if (format === "framer") {
      return dynamic(
        () => import(`@/features/animations/${refData.path}`),
        { loading: () => fallback },
      );
    }
    return null;
  }, [format, refData.path]);

  if (format === "lottie") {
    const jsonUrl = `/animations/${refData.path}`;
    return <LottiePlayer src={jsonUrl} />;
  }

  if (format === "manim") {
    return (
      <video
        src={`/animations/${refData.path}`}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full"
      />
    );
  }

  if (format === "model-viewer") {
    return <ModelViewerPlayer src={`/animations/${refData.path}`} alt={refData.caption ?? refData.name} />;
  }

  if (Loaded) return <Loaded />;
  return fallback;
}

const LottiePlayer = dynamic(
  () => import("./AnimationLottiePlayer").then((m) => m.AnimationLottiePlayer),
  { ssr: false, loading: () => fallback },
);

const ModelViewerPlayer = dynamic(
  () => import("./AnimationModelViewer").then((m) => m.AnimationModelViewer),
  { ssr: false, loading: () => fallback },
);
