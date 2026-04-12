import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Learn | SoleMD",
  description: "Interactive learning modules for physicians",
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--text-primary)" }}
    >
      <nav className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
        <Link
          href="/"
          className="text-sm no-underline hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          ← Back to Graph
        </Link>
      </nav>
      {children}
    </div>
  );
}
