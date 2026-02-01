/**
 * High-performance particle physics engine for neurotransmitter visualization
 */

import { Particle, ParticleConfig, PerformanceConfig } from './types';

export class ParticlePhysicsEngine {
  private particles: Particle[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrame: number | null = null;
  private isRunning: boolean = false;
  private bounds: { width: number; height: number } = { width: 0, height: 0 };
  private particlePool: Particle[] = []; // Object pooling for performance

  constructor(private config: PerformanceConfig) {
    this.initializeParticlePool();
  }

  private initializeParticlePool() {
    // Pre-create particles for object pooling
    for (let i = 0; i < this.config.maxParticles; i++) {
      this.particlePool.push(this.createParticle('day', 0, 0));
    }
  }

  private createParticle(behavior: ParticleConfig['behavior'], x: number, y: number): Particle {
    const configs = this.getParticleConfigs();
    const particleConfig = configs[behavior];

    return {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      vx: (Math.random() - 0.5) * particleConfig.speed,
      vy: (Math.random() - 0.5) * particleConfig.speed,
      life: particleConfig.lifespan,
      maxLife: particleConfig.lifespan,
      color: particleConfig.color,
      size: particleConfig.size,
      behavior
    };
  }

  private getParticleConfigs(): Record<ParticleConfig['behavior'], ParticleConfig> {
    return {
      day: {
        count: 50,
        behavior: 'day',
        color: '#FFD700', // Golden yellow
        speed: 3,
        lifespan: 120, // 2 seconds at 60fps
        size: 3
      },
      night: {
        count: 40,
        behavior: 'night',
        color: '#87CEEB', // Soft blue
        speed: 1,
        lifespan: 180, // 3 seconds at 60fps
        size: 2
      },
      cleaning: {
        count: 30,
        behavior: 'cleaning',
        color: '#191970', // Navy blue
        speed: 0.8,
        lifespan: 240, // 4 seconds at 60fps
        size: 2
      },
      memory: {
        count: 35,
        behavior: 'memory',
        color: '#DDA0DD', // Soft lavender
        speed: 1.2,
        lifespan: 150, // 2.5 seconds at 60fps
        size: 2.5
      },
      neurotransmitter: {
        count: 25,
        behavior: 'neurotransmitter',
        color: '#FF6347', // Variable color
        speed: 2,
        lifespan: 100,
        size: 1.5
      }
    };
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bounds = {
      width: canvas.width,
      height: canvas.height
    };
  }

  setBounds(width: number, height: number) {
    this.bounds = { width, height };
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  emit(behavior: ParticleConfig['behavior'], count: number, origin?: { x: number; y: number }) {
    const emitCount = Math.min(count, this.config.maxParticles - this.particles.length);

    for (let i = 0; i < emitCount; i++) {
      let particle: Particle;

      // Use pooled particle if available
      if (this.particlePool.length > 0) {
        particle = this.particlePool.pop()!;
        // Reset particle properties
        const config = this.getParticleConfigs()[behavior];
        particle.behavior = behavior;
        particle.color = config.color;
        particle.size = config.size;
        particle.life = config.lifespan;
        particle.maxLife = config.lifespan;
        particle.vx = (Math.random() - 0.5) * config.speed;
        particle.vy = (Math.random() - 0.5) * config.speed;
      } else {
        particle = this.createParticle(behavior, 0, 0);
      }

      // Set position
      if (origin) {
        particle.x = origin.x + (Math.random() - 0.5) * 20;
        particle.y = origin.y + (Math.random() - 0.5) * 20;
      } else {
        particle.x = Math.random() * this.bounds.width;
        particle.y = Math.random() * this.bounds.height;
      }

      this.particles.push(particle);
    }
  }

  private updateParticle(particle: Particle) {
    // Update position based on behavior
    switch (particle.behavior) {
      case 'day':
        // Erratic, energetic movement
        particle.vx += (Math.random() - 0.5) * 0.2;
        particle.vy += (Math.random() - 0.5) * 0.2;
        particle.vx *= 0.99; // Slight damping
        particle.vy *= 0.99;
        break;

      case 'night':
        // Slow, purposeful movement
        particle.vx *= 0.995;
        particle.vy *= 0.995;
        break;

      case 'cleaning':
        // Sweeping patterns
        const sweepAngle = Date.now() * 0.001 + particle.x * 0.01;
        particle.vx += Math.cos(sweepAngle) * 0.1;
        particle.vy += Math.sin(sweepAngle) * 0.05;
        break;

      case 'memory':
        // Connecting paths - move toward other memory particles
        const nearbyMemoryParticles = this.particles.filter(p =>
          p.behavior === 'memory' &&
          p.id !== particle.id &&
          Math.hypot(p.x - particle.x, p.y - particle.y) < 100
        );

        if (nearbyMemoryParticles.length > 0) {
          const target = nearbyMemoryParticles[0];
          const dx = target.x - particle.x;
          const dy = target.y - particle.y;
          const distance = Math.hypot(dx, dy);

          if (distance > 0) {
            particle.vx += (dx / distance) * 0.1;
            particle.vy += (dy / distance) * 0.1;
          }
        }
        break;

      case 'neurotransmitter':
        // Follow predefined pathways (simplified)
        particle.vy -= 0.02; // General upward flow (brainstem to cortex)
        break;
    }

    // Apply velocity
    particle.x += particle.vx;
    particle.y += particle.vy;

    // Boundary wrapping
    if (particle.x < 0) particle.x = this.bounds.width;
    if (particle.x > this.bounds.width) particle.x = 0;
    if (particle.y < 0) particle.y = this.bounds.height;
    if (particle.y > this.bounds.height) particle.y = 0;

    // Update life
    particle.life--;
  }

  private renderParticle(particle: Particle) {
    if (!this.ctx) return;

    const opacity = particle.life / particle.maxLife;
    const size = particle.size * (0.5 + opacity * 0.5);

    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.ctx.fillStyle = particle.color;
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
    this.ctx.fill();

    // Add glow effect for certain behaviors
    if (particle.behavior === 'neurotransmitter' || particle.behavior === 'memory') {
      this.ctx.shadowColor = particle.color;
      this.ctx.shadowBlur = size * 2;
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private update() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.bounds.width, this.bounds.height);

    // Update and render particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      this.updateParticle(particle);
      this.renderParticle(particle);

      // Remove dead particles and return to pool
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        this.particlePool.push(particle);
      }
    }
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;

      this.update();
      this.animationFrame = requestAnimationFrame(animate);
    };

    animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  clear() {
    this.particles.length = 0;
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.bounds.width, this.bounds.height);
    }
  }

  setVelocityMultiplier(multiplier: number) {
    this.particles.forEach(particle => {
      particle.vx *= multiplier;
      particle.vy *= multiplier;
    });
  }

  getParticleCount(): number {
    return this.particles.length;
  }

  // Specific emission patterns
  emitNeurotransmitterBurst(type: 'norepinephrine' | 'serotonin' | 'dopamine' | 'histamine', origin: { x: number; y: number }) {
    const colors = {
      norepinephrine: '#FFD700',
      serotonin: '#FF7F50',
      dopamine: '#DC143C',
      histamine: '#DDA0DD'
    };

    const count = 15;
    for (let i = 0; i < count; i++) {
      const particle = this.createParticle('neurotransmitter', origin.x, origin.y);
      particle.color = colors[type];

      // Add specific velocity patterns
      const angle = (i / count) * Math.PI * 2;
      particle.vx = Math.cos(angle) * 2;
      particle.vy = Math.sin(angle) * 2 - 1; // Slight upward bias

      this.particles.push(particle);
    }
  }

  emitCSFFlow(pathway: Array<{ x: number; y: number }>) {
    const particleCount = Math.min(20, this.config.maxParticles - this.particles.length);

    for (let i = 0; i < particleCount; i++) {
      const particle = this.createParticle('cleaning', pathway[0].x, pathway[0].y);
      particle.color = '#87CEEB'; // CSF blue

      // Store pathway in particle for movement
      (particle as any).pathway = pathway;
      (particle as any).pathwayIndex = 0;

      this.particles.push(particle);
    }
  }

  // Update particles following CSF pathways
  private updateCSFParticle(particle: Particle & { pathway?: Array<{ x: number; y: number }>; pathwayIndex?: number }) {
    if (!particle.pathway || particle.pathwayIndex === undefined) return;

    if (particle.pathwayIndex < particle.pathway.length - 1) {
      const target = particle.pathway[particle.pathwayIndex + 1];
      const dx = target.x - particle.x;
      const dy = target.y - particle.y;
      const distance = Math.hypot(dx, dy);

      if (distance < 10) {
        particle.pathwayIndex++;
      } else {
        particle.vx = (dx / distance) * 2;
        particle.vy = (dy / distance) * 2;
      }
    }
  }
}