import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

type Particle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  phase: number;
  vx: number;
  vy: number;
  color: string;
};

const PARTICLE_COLORS = ['233, 61, 170', '56, 180, 218', '237, 184, 58'];
const LIGHT_PARTICLE_COLORS = ['151, 30, 112', '0, 105, 139', '139, 91, 0'];

/** A decorative particle field for the translucent public footer. */
export function FooterParticles({ theme }: { theme: 'light' | 'dark' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !container || !context) return;

    const staticOnly = reducedMotion === true;
    let width = 0;
    let height = 0;
    let animationFrame: number | null = null;
    let particles: Particle[] = [];
    const colors = theme === 'light' ? LIGHT_PARTICLE_COLORS : PARTICLE_COLORS;

    const paint = (time = 0) => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        if (!staticOnly && time) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x > width + 3) particle.x = -3;
          if (particle.y < -3) particle.y = height + 3;
          if (particle.y > height + 3) particle.y = -3;
        }

        const shimmer = staticOnly ? 1 : 0.78 + 0.22 * Math.sin(time * 0.0007 + particle.phase);
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${particle.color}, ${particle.opacity * shimmer})`;
        context.fill();
      }
    };

    const animate = (time: number) => {
      paint(time);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const start = () => {
      if (!staticOnly && animationFrame === null) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const stop = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const amount = Math.min(76, Math.max(28, Math.round((width * height) / 12000)));
      particles = Array.from({ length: amount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.75 + Math.random() * 0.9,
        opacity: (theme === 'light' ? 0.24 : 0.18) + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        vx: 0.015 + Math.random() * 0.035,
        vy: (Math.random() - 0.5) * 0.045,
        color: colors[Math.floor(Math.random() * colors.length)],
      }));
      paint();
    };

    resize();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    let intersectionObserver: IntersectionObserver | null = null;
    if (!staticOnly && typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      });
      intersectionObserver.observe(container);
    } else if (!staticOnly) {
      start();
    }

    return () => {
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion, theme]);

  return <canvas ref={canvasRef} className="site-footer-particles" aria-hidden="true" />;
}
