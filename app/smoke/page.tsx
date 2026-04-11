"use client";
/**
 * Dev-only smoke trial page.
 *
 * Standalone route that mounts every Phase 1 animation smoke component
 * directly — no wiki engine, no backend. Used to trial the animation
 * pipeline end-to-end (manifest/registry/embed/view-transition CSS)
 * while the Python wiki engine is down.
 *
 *    http://localhost:3000/smoke
 */
import dynamic from "next/dynamic";
import { Skeleton } from "@mantine/core";
import SmokePulse from "@/features/animations/_smoke/pulse/SmokePulse";
import ChartReveal from "@/features/animations/_smoke/chart-reveal/ChartReveal";
import ScrollFade from "@/features/animations/_smoke/scroll-fade/ScrollFade";
import DrawMorph from "@/features/animations/_smoke/gsap-draw-morph/DrawMorph";
import LottieDemo from "@/features/animations/_smoke/lottie-demo/LottieDemo";
import NotoBrain from "@/features/animations/_smoke/noto-brain/NotoBrain";
import TextReveal from "@/features/animations/_smoke/text-reveal/TextReveal";

const fallback = <Skeleton height={360} radius="lg" />;

const RotatingCube = dynamic(
  () => import("@/features/animations/_smoke/rotating-cube/RotatingCube"),
  { ssr: false, loading: () => fallback },
);

const ModelViewerDemo = dynamic(
  () => import("@/features/animations/_smoke/model-viewer-demo/ModelViewerDemo"),
  { ssr: false, loading: () => fallback },
);

function Card({ title, format, children }: { title: string; format: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1rem] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <header className="flex items-baseline justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
          {format}
        </span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function SmokePage() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-medium" style={{ color: "var(--text-primary)" }}>
          Animation Pipeline Smoke
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Phase 1 smoke trial — mounted directly without the wiki engine.
          Exercises Framer Motion, GSAP ScrollTrigger/DrawSVG, React Three Fiber,
          and <code>&lt;model-viewer&gt;</code> with an RDKit-generated ethanol GLB.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="D1 · SmokePulse" format="framer">
          <SmokePulse />
        </Card>

        <Card title="D2 · RotatingCube" format="r3f">
          <RotatingCube />
        </Card>

        <Card title="D3 · ModelViewer (ethanol.glb)" format="model-viewer">
          <ModelViewerDemo />
        </Card>

        <Card title="D6 · ChartReveal" format="framer + recharts">
          <ChartReveal />
        </Card>

        <Card title="D8 · DrawMorph" format="gsap DrawSVG">
          <DrawMorph />
        </Card>

        <Card title="D10 · Brain (Twemoji)" format="svg + framer motion">
          <LottieDemo />
        </Card>

        <Card title="D11 · Brain (Noto)" format="svg + framer motion">
          <NotoBrain />
        </Card>

        <Card title="D12 · Manim · SmokeScene" format="manim → .mp4">
          <div className="flex h-[280px] w-full items-center justify-center">
            <video
              src="/animations/_smoke/manim/SmokeScene.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-auto rounded-[0.75rem]"
            />
          </div>
        </Card>

        <Card title="D13 · TextReveal" format="framer stagger variants">
          <TextReveal />
        </Card>
      </div>

      <section className="mt-12">
        <Card title="D7 · ScrollFade" format="gsap ScrollTrigger">
          <ScrollFade />
        </Card>
      </section>

      {/* Extra scroll height so D7 actually has something to scroll over */}
      <div className="h-[60vh]" />
    </main>
  );
}
