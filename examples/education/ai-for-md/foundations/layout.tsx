import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI for MD Foundations',
  description:
    'Master the fundamentals of artificial intelligence in healthcare. Learn AI terminology, clinical decision support, and ethical implementation.',
};

export default function FoundationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
