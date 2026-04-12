import { AnimationEmbed } from "@/features/wiki/components/elements/AnimationEmbed";

interface AnimationStageProps {
  name: string;
  caption?: string;
  className?: string;
}

export function AnimationStage({ name, caption, className }: AnimationStageProps) {
  return (
    <figure className={className}>
      <AnimationEmbed name={name} />
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
