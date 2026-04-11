"use client";
/**
 * D2 smoke test — React Three Fiber rotating cube.
 *
 * Proves R3F + drei + lazy-load (via `dynamic(..., { ssr: false })` in
 * AnimationEmbed) + bundle budget. framer-motion-3d is peer-constrained
 * to R3F 8 so we use plain r3f refs for rotation instead.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";

function Cube() {
  const ref = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.4;
      ref.current.rotation.y += delta * 0.6;
    }
  });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#a8c5e9" />
    </mesh>
  );
}

export default function RotatingCube() {
  return (
    <div className="h-[360px] w-full">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Cube />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}
