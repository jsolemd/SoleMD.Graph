import { Text } from "@mantine/core";

interface ProseBlockProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "14px",
  md: "16px",
  lg: "18px",
} as const;

export function ProseBlock({
  children,
  size = "md",
  className,
}: ProseBlockProps) {
  return (
    <div
      className={`mx-auto max-w-prose ${className ?? ""}`}
      style={{ color: "var(--text-primary)" }}
    >
      <Text
        component="div"
        style={{ fontSize: SIZE_MAP[size], lineHeight: 1.7 }}
      >
        {children}
      </Text>
    </div>
  );
}
