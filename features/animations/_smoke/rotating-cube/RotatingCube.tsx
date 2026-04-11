"use client";
/**
 * D2 smoke test — React Three Fiber rotating box with drei's Environment
 * + ContactShadows + Center for auto-fitting.
 *
 * Uses plain refs + useFrame rather than framer-motion-3d (deprecated
 * under R3F 9 / React 19). The rotation is delta-scaled so it stays
 * frame-rate independent. The "neutral" environment preset matches the
 * scientific-accuracy bias we use in @google/model-viewer — flat IBL
 * lighting, no colored kickers, no blown-out highlights on pastels.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Center,
  ContactShadows,
  Environment,
  OrbitControls,
} from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";

function SpinningBox() {
  const ref = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.4;
    ref.current.rotation.y += delta * 0.6;
  });
  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial
        color="#a8c5e9"
        metalness={0.05}
        roughness={0.45}
      />
    </mesh>
  );
}

export default function RotatingCube() {
  return (
    <div className="h-[360px] w-full">
      <Canvas
        camera={{ position: [3.5, 2.5, 4.5], fov: 45 }}
        shadows
        dpr={[1, 2]}
        style={{ background: "var(--surface)" }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={0.85}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Environment preset="studio" />
        <Center>
          <SpinningBox />
        </Center>
        <ContactShadows
          position={[0, -1.3, 0]}
          opacity={0.28}
          scale={6}
          blur={2.6}
          far={2}
        />
        <OrbitControls enablePan={false} enableDamping />
      </Canvas>
    </div>
  );
}
