"use client";
import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { Skeleton } from "@mantine/core";

const fallback = () => <Skeleton height={280} radius="lg" />;

const SmokePulse = dynamic(() => import("@/features/animations/_smoke/pulse/SmokePulse"), { ssr: false, loading: fallback });
const RotatingCube = dynamic(() => import("@/features/animations/_smoke/rotating-cube/RotatingCube"), { ssr: false, loading: fallback });
const ModelViewerDemo = dynamic(() => import("@/features/animations/_smoke/model-viewer-demo/ModelViewerDemo"), { ssr: false, loading: fallback });
const ChartReveal = dynamic(() => import("@/features/animations/_smoke/chart-reveal/ChartReveal"), { ssr: false, loading: fallback });
const DrawMorph = dynamic(() => import("@/features/animations/_smoke/gsap-draw-morph/DrawMorph"), { ssr: false, loading: fallback });
const LottieDemo = dynamic(() => import("@/features/animations/_smoke/lottie-demo/LottieDemo"), { ssr: false, loading: fallback });
const NotoBrain = dynamic(() => import("@/features/animations/_smoke/noto-brain/NotoBrain"), { ssr: false, loading: fallback });
const TextReveal = dynamic(() => import("@/features/animations/_smoke/text-reveal/TextReveal"), { ssr: false, loading: fallback });
const NodeFocusDemo = dynamic(() => import("@/features/animations/_smoke/node-focus-demo/NodeFocusDemo"), { ssr: false, loading: fallback });
const AnimatedBeamDemo = dynamic(() => import("@/features/animations/_smoke/animated-beam/AnimatedBeamDemo"), { ssr: false, loading: fallback });
const BioIconsSmoke = dynamic(() => import("@/features/animations/_smoke/bioicons/BioIconsSmoke"), { ssr: false, loading: fallback });
const LottieFilesSmoke = dynamic(() => import("@/features/animations/_smoke/lottie-files/LottieFilesSmoke"), { ssr: false, loading: fallback });
const ScrollFade = dynamic(() => import("@/features/animations/_smoke/scroll-fade/ScrollFade"), { ssr: false, loading: fallback });
const ScrollMechanism = dynamic(() => import("@/features/animations/_smoke/scroll-mechanism/ScrollMechanism"), { ssr: false, loading: fallback });
const NotoLibrary = dynamic(() => import("@/features/animations/_smoke/noto-library/NotoLibrary"), { ssr: false, loading: fallback });
const SoleMDLogo = dynamic(() => import("@/features/animations/brand/SoleMDLogo"), { ssr: false, loading: fallback });
const SoleMDLogoMark = dynamic(() => import("@/features/animations/brand/SoleMDLogoMark"), { ssr: false, loading: fallback });
const DopamineD2Binding = dynamic(() => import("@/features/animations/biology/dopamine-d2-receptor/DopamineD2Binding"), { ssr: false, loading: fallback });

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
    <MotionConfig reducedMotion="never">
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-medium" style={{ color: "var(--text-primary)" }}>
          Animation Pipeline Smoke
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Every smoke card mounted directly, bypassing the wiki engine. The page
          overrides <code>prefers-reduced-motion</code> via <code>MotionConfig</code> so
          the full motion palette is visible here even when the OS has reduced-motion set.
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

        <Card title="D14 · NodeFocusDemo" format="framer spring bridge">
          <NodeFocusDemo />
        </Card>

        <Card title="D15 · AnimatedBeam" format="magic ui · ref-linked svg">
          <AnimatedBeamDemo />
        </Card>

        <Card title="D17 · BioIcons · Ca channel" format="svg + cc0 library">
          <BioIconsSmoke />
        </Card>

        <Card title="D18 · LottieFiles · pulse" format="lottie-react">
          <LottieFilesSmoke />
        </Card>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          Biology
        </h2>
        <Card title="Dopamine D2 · rest → binding → Gαᵢ" format="svg + framer state machine">
          <DopamineD2Binding />
        </Card>
      </section>

      <section className="mt-12">
        <Card title="D7 · ScrollFade" format="gsap ScrollTrigger">
          <ScrollFade />
        </Card>
      </section>

      <section className="mt-12">
        <Card title="D16 · ScrollMechanism" format="gsap ScrollTrigger · scrubbed 4-step">
          <ScrollMechanism />
        </Card>
      </section>

      <section className="mt-12">
        <Card title="D19 · Noto Library (64 Lotties)" format="lottie-react · OFL 1.1">
          <NotoLibrary />
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          Brand
        </h2>
        <Card title="D20 · SoleMD logo — brain as graph" format="svg + framer motion">
          <div className="flex h-[320px] w-full items-center justify-around gap-8">
            <div className="flex flex-col items-center gap-2">
              <SoleMDLogo size={48} />
              <span className="font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>48</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SoleMDLogo size={96} />
              <span className="font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>96</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SoleMDLogo size={220} />
              <span className="font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>220</span>
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-12">
        <Card title="D21 · SoleMD logomark — scalable glyph" format="lucide + chip">
          <div className="flex h-[240px] w-full flex-col items-center justify-around gap-4">
            <div className="flex items-end gap-6">
              {[16, 24, 32, 48, 96].map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <SoleMDLogoMark size={s} />
                  <span className="font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>{s}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2">
                <SoleMDLogoMark variant="plain" size={28} className="text-neutral-900" />
                <span className="text-sm text-neutral-900">plain · dark-on-light</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2">
                <SoleMDLogoMark variant="plain" size={28} className="text-white" />
                <span className="text-sm text-white">plain · white-on-dark</span>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <div className="h-[60vh]" />
    </main>
    </MotionConfig>
  );
}
