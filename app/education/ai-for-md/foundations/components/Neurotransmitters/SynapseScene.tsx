'use client';

import React, { useRef, useMemo, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Sphere, Text, useTexture } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import {
  NeurotransmitterId,
  BrainNucleus,
  brainNuclei,
  getNeurotransmitterColor,
  getNeurotransmitterInfo
} from './data';

interface SynapseSceneProps {
  selectedNeurotransmitter?: NeurotransmitterId | 'all';
  activeNucleus?: string | null;
  onNucleusClick?: (nucleusId: string) => void;
  showParticles?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

interface ParticleSystemProps {
  neurotransmitter: NeurotransmitterId;
  sourcePosition: [number, number, number];
  targetPosition: [number, number, number];
  active: boolean;
  reducedMotion: boolean;
}

interface NeurotransmitterParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

function ParticleSystem({
  neurotransmitter,
  sourcePosition,
  targetPosition,
  active,
  reducedMotion
}: ParticleSystemProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particlesRef = useRef<NeurotransmitterParticle[]>([]);
  const [color] = useState(() => new THREE.Color(getNeurotransmitterColor(neurotransmitter)));

  // Performance optimization: Pre-allocate reusable objects
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);

  const particleCount = reducedMotion ? 10 : 50;

  // Initialize particles
  useMemo(() => {
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      position: new THREE.Vector3(...sourcePosition),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
      ),
      life: Math.random() * 100,
      maxLife: 100 + Math.random() * 50,
      size: 0.02 + Math.random() * 0.03
    }));
  }, [sourcePosition, particleCount]);

  useFrame((state, delta) => {
    if (!meshRef.current || !active || reducedMotion) return;

    const particles = particlesRef.current;

    particles.forEach((particle, index) => {
      // Update particle life
      particle.life += delta * 60;

      if (particle.life >= particle.maxLife) {
        // Reset particle
        particle.position.set(...sourcePosition);
        particle.life = 0;
        particle.velocity.set(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02
        );
      } else {
        // Move particle towards target with some randomness (reuse objects)
        target.set(...targetPosition);
        direction.copy(target).sub(particle.position).normalize();

        particle.velocity.lerp(direction.multiplyScalar(0.01), 0.02);
        particle.position.add(particle.velocity);
      }

      // Update instance matrix
      const scale = particle.size * (1 - particle.life / particle.maxLife);
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(particle.position);
      meshRef.current!.setMatrixAt(index, matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (reducedMotion && !active) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </instancedMesh>
  );
}

interface NucleusProps {
  nucleus: BrainNucleus;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  reducedMotion: boolean;
}

function Nucleus({ nucleus, isSelected, isHighlighted, onClick, reducedMotion }: NucleusProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = useMemo(() => {
    if (nucleus.role === 'wake_promoting') return '#EF4444';
    if (nucleus.role === 'sleep_promoting') return '#3B82F6';
    return '#6B7280';
  }, [nucleus.role]);

  const scale = isSelected ? 1.3 : isHighlighted ? 1.1 : hovered ? 1.05 : 1;

  useFrame((state) => {
    if (!meshRef.current || reducedMotion) return;

    // Gentle floating animation
    meshRef.current.position.y = nucleus.position.y + Math.sin(state.clock.elapsedTime + nucleus.position.x) * 0.1;

    // Rotation based on firing rate
    meshRef.current.rotation.y += nucleus.firingRateHz * 0.001;
  });

  return (
    <group position={nucleus.position}>
      <Sphere
        ref={meshRef}
        args={[0.15, reducedMotion ? 8 : 12, reducedMotion ? 8 : 12]}
        scale={scale}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.3 : isHighlighted ? 0.2 : 0.1}
          transparent
          opacity={0.8}
        />
      </Sphere>

      {/* Nucleus label */}
      <Html distanceFactor={10}>
        <div className="bg-white bg-opacity-90 rounded px-2 py-1 text-xs font-medium text-gray-800 pointer-events-none">
          {nucleus.name}
        </div>
      </Html>

      {/* Firing rate indicator */}
      {(isSelected || isHighlighted) && (
        <Html distanceFactor={15} position={[0, -0.3, 0]}>
          <div className="bg-gray-800 bg-opacity-90 rounded px-2 py-1 text-xs text-white pointer-events-none">
            {nucleus.firingRateHz} Hz
          </div>
        </Html>
      )}
    </group>
  );
}

function SynapticCleft({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || reducedMotion) return;

    // Subtle pulsing animation
    const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    meshRef.current.scale.set(scale, scale, scale);
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Presynaptic terminal */}
      <mesh position={[-0.5, 0, 0]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial color="#4F46E5" transparent opacity={0.7} />
      </mesh>

      {/* Synaptic cleft */}
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 8]} />
        <meshStandardMaterial color="#F59E0B" transparent opacity={0.3} />
      </mesh>

      {/* Postsynaptic terminal */}
      <mesh position={[0.5, 0, 0]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial color="#059669" transparent opacity={0.7} />
      </mesh>

      {/* Receptors on postsynaptic membrane */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh
          key={i}
          position={[
            0.35,
            Math.sin((i / 8) * Math.PI * 2) * 0.15,
            Math.cos((i / 8) * Math.PI * 2) * 0.15
          ]}
          rotation={[0, 0, (i / 8) * Math.PI * 2]}
        >
          <boxGeometry args={[0.02, 0.05, 0.02]} />
          <meshStandardMaterial color="#DC2626" />
        </mesh>
      ))}
    </group>
  );
}

function Scene({
  selectedNeurotransmitter,
  activeNucleus,
  onNucleusClick,
  showParticles,
  reducedMotion
}: Omit<SynapseSceneProps, 'className'>) {
  const { camera } = useThree();

  // Filter nuclei based on selected neurotransmitter
  const visibleNuclei = useMemo(() => {
    if (selectedNeurotransmitter === 'all') return brainNuclei;
    return brainNuclei.filter(nucleus =>
      nucleus.primaryNeurotransmitters.includes(selectedNeurotransmitter)
    );
  }, [selectedNeurotransmitter]);

  // Position camera
  React.useEffect(() => {
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-5, -5, -5]} intensity={0.3} color="#3B82F6" />

      {/* Controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={10}
      />

      {/* Synaptic cleft in center */}
      <SynapticCleft reducedMotion={reducedMotion} />

      {/* Brain nuclei */}
      {visibleNuclei.map(nucleus => (
        <Nucleus
          key={nucleus.id}
          nucleus={nucleus}
          isSelected={activeNucleus === nucleus.id}
          isHighlighted={false}
          onClick={() => onNucleusClick?.(nucleus.id)}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* Neurotransmitter particles */}
      {showParticles && selectedNeurotransmitter !== 'all' && visibleNuclei.length > 0 && (
        <ParticleSystem
          neurotransmitter={selectedNeurotransmitter}
          sourcePosition={visibleNuclei[0].position as [number, number, number]}
          targetPosition={[0, 0, 0]}
          active={true}
          reducedMotion={reducedMotion}
        />
      )}

      {/* Information labels */}
      <Html distanceFactor={20} position={[0, -2, 0]} center>
        <div className="bg-black bg-opacity-75 rounded-lg p-3 text-white text-sm max-w-xs">
          <h4 className="font-semibold mb-2">3D Synapse Visualization</h4>
          <p className="text-xs text-gray-300">
            Drag to rotate • Scroll to zoom • Click nuclei for details
          </p>
          {selectedNeurotransmitter !== 'all' && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: getNeurotransmitterColor(selectedNeurotransmitter) }}
              />
              <span className="text-xs">
                {getNeurotransmitterInfo(selectedNeurotransmitter)?.name} Pathways
              </span>
            </div>
          )}
        </div>
      </Html>
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
        <div className="text-sm text-gray-500">Loading 3D Scene...</div>
      </div>
    </div>
  );
}

function ErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
      <div className="text-center p-6">
        <div className="text-gray-400 mb-2">⚠️</div>
        <div className="text-sm text-gray-600 mb-2">3D visualization unavailable</div>
        <div className="text-xs text-gray-500">
          WebGL not supported or hardware acceleration disabled
        </div>
      </div>
    </div>
  );
}

export function SynapseScene({
  selectedNeurotransmitter = 'all',
  activeNucleus,
  onNucleusClick,
  showParticles = true,
  reducedMotion = false,
  className = ''
}: SynapseSceneProps) {
  const [hasWebGL, setHasWebGL] = useState(true);

  React.useEffect(() => {
    // Check WebGL support
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setHasWebGL(false);
      }
    } catch (e) {
      setHasWebGL(false);
    }
  }, []);

  if (!hasWebGL) {
    return (
      <div className={`h-96 ${className}`}>
        <ErrorFallback />
      </div>
    );
  }

  return (
    <motion.div
      className={`h-96 bg-gradient-to-b from-gray-900 to-gray-800 rounded-lg overflow-hidden ${className}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reducedMotion ? 0.1 : 0.6 }}
    >
      <Canvas
        camera={{ position: [3, 2, 3], fov: 50 }}
        gl={{
          antialias: !reducedMotion,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
        dpr={Math.min(window.devicePixelRatio, 2)} // Limit DPI for performance
        frameloop="demand" // Only render when needed
        performance={{ min: 0.5 }} // Adaptive performance
      >
        <Suspense fallback={<LoadingFallback />}>
          <Scene
            selectedNeurotransmitter={selectedNeurotransmitter}
            activeNucleus={activeNucleus}
            onNucleusClick={onNucleusClick}
            showParticles={showParticles}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>

      {/* Controls overlay */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 rounded-lg p-3">
        <div className="text-white text-xs space-y-1">
          <div>🖱️ Drag: Rotate</div>
          <div>🔍 Scroll: Zoom</div>
          <div>👆 Click: Select</div>
        </div>
      </div>

      {/* Neurotransmitter legend */}
      {selectedNeurotransmitter !== 'all' && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 rounded-lg p-3">
          <div className="flex items-center gap-2 text-white text-sm">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: getNeurotransmitterColor(selectedNeurotransmitter) }}
            />
            <span>{getNeurotransmitterInfo(selectedNeurotransmitter)?.name}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}