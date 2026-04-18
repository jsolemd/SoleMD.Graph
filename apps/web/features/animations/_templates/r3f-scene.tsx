"use client";
/**
 * React Three Fiber scene template.
 *
 * Pattern: top-level component sets up Canvas + lighting +
 * OrbitControls. Dynamic-import from the registry with `ssr: false`:
 *
 *    const Scene = dynamic(() => import("./MyScene"), { ssr: false })
 *
 * Keeps three.js out of the SSR bundle and lazy-loads on demand.
 * For animation, prefer `useFrame` with a ref for simplicity; use
 * framer-motion-3d only when declarative state transitions matter,
 * since its peer dependency on R3F 8 is loose.
 */
import { useRef } from "react";
import type { Mesh } from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

function SpinningBox() {
  const ref = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.4;
    ref.current.rotation.y += delta * 0.6;
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#a8c5e9" />
    </mesh>
  );
}

export function R3FSceneTemplate({ children }: { children?: React.ReactNode }) {
  return (
    <div className="h-[400px] w-full overflow-hidden rounded-[1rem] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        style={{ background: "var(--surface)" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Environment preset="studio" />
        <OrbitControls enablePan={false} makeDefault />
        {children ?? <SpinningBox />}
      </Canvas>
    </div>
  );
}
