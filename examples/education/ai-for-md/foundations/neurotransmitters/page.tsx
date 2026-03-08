import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Neurotransmitters',
  description:
    'Interactive exploration of neurotransmitter systems and their role in AI-assisted diagnostics.',
};

export const dynamic = 'force-dynamic';

import { Neurotransmitters } from '../components/Neurotransmitters';

export default function NeurotransmittersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-8">
        <Neurotransmitters />
      </div>
    </div>
  );
}