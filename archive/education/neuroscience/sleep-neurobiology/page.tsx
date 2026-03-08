import type { Metadata } from 'next';
import SleepNeurobiologyClientPage from "./SleepNeurobiologyClientPage";

export const metadata: Metadata = {
  title: 'Sleep Neurobiology',
  description:
    'Comprehensive guide to the neuroscience of sleep, covering wake networks, NREM/REM cycles, glymphatic clearance, and AI integration.',
};

export default function SleepNeurobiologyPage() {
  return <SleepNeurobiologyClientPage />;
}
