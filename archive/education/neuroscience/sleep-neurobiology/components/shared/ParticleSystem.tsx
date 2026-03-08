// @ts-nocheck
"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export interface ParticleConfig {
  count: number;
  color: string;
  size: { min: number; max: number };
  speed: { min: number; max: number };
  direction?: "up" | "down" | "left" | "right" | "random";
  opacity: { min: number; max: number };
  lifetime: { min: number; max: number };
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  lifetime: number;
  maxLifetime: number;
}

interface ParticleSystemProps {
  config: ParticleConfig;
  isActive: boolean;
  className?: string;
}

export default function ParticleSystem({ config, isActive, className = "" }: ParticleSystemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const [isClient, setIsClient] = React.useState(false);

  // Ensure component only renders particles on client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Generate particles
  const generateParticles = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    const particles: Particle[] = [];

    for (let i = 0; i < config.count; i++) {
      const size = config.size.min + Math.random() * (config.size.max - config.size.min);
      const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
      const lifetime = config.lifetime.min + Math.random() * (config.lifetime.max - config.lifetime.min);

      let vx = 0, vy = 0;

      switch (config.direction) {
        case "up":
          vy = -speed;
          break;
        case "down":
          vy = speed;
          break;
        case "left":
          vx = -speed;
          break;
        case "right":
          vx = speed;
          break;
        default:
          const angle = Math.random() * Math.PI * 2;
          vx = Math.cos(angle) * speed;
          vy = Math.sin(angle) * speed;
      }

      particles.push({
        id: i,
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx,
        vy,
        size,
        opacity: config.opacity.min + Math.random() * (config.opacity.max - config.opacity.min),
        lifetime,
        maxLifetime: lifetime
      });
    }

    particlesRef.current = particles;
  };

  // Animation loop
  const animate = () => {
    if (!containerRef.current || !isActive) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    particlesRef.current = particlesRef.current.map(particle => {
      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Update lifetime
      particle.lifetime -= 16; // Assuming 60fps

      // Reset particle if it goes off screen or lifetime expires
      if (
        particle.x < -particle.size ||
        particle.x > rect.width + particle.size ||
        particle.y < -particle.size ||
        particle.y > rect.height + particle.size ||
        particle.lifetime <= 0
      ) {
        // Respawn particle
        const size = config.size.min + Math.random() * (config.size.max - config.size.min);
        const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
        const lifetime = config.lifetime.min + Math.random() * (config.lifetime.max - config.lifetime.min);

        let vx = 0, vy = 0;

        switch (config.direction) {
          case "up":
            vy = -speed;
            break;
          case "down":
            vy = speed;
            break;
          case "left":
            vx = -speed;
            break;
          case "right":
            vx = speed;
            break;
          default:
            const angle = Math.random() * Math.PI * 2;
            vx = Math.cos(angle) * speed;
            vy = Math.sin(angle) * speed;
        }

        return {
          ...particle,
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx,
          vy,
          size,
          opacity: config.opacity.min + Math.random() * (config.opacity.max - config.opacity.min),
          lifetime,
          maxLifetime: lifetime
        };
      }

      // Update opacity based on lifetime
      const lifetimeRatio = particle.lifetime / particle.maxLifetime;
      particle.opacity = (config.opacity.min + Math.random() * (config.opacity.max - config.opacity.min)) * lifetimeRatio;

      return particle;
    });

    if (isActive) {
      animationRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isActive) {
      generateParticles();
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, config]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
    >
      {isClient && isActive && particlesRef.current.map(particle => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}px`,
            top: `${particle.y}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: config.color,
            opacity: particle.opacity,
            boxShadow: `0 0 ${particle.size * 2}px ${config.color}44`,
            zIndex: 2
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}