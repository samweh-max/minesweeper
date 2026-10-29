import { useEffect, useRef } from 'react';

// Bright colours from the classic 16-colour palette.
const COLORS = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffffff', '#0000ff'];
const DURATION_MS = 2600;
const PIXEL = 2; // particle size in original (unzoomed) pixels

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  born: number;
  life: number;
}

/**
 * A few small pixel fireworks over the board after a win. Draws on a canvas
 * that ignores clicks, stops by itself, and is skipped for reduced motion.
 */
export function Fireworks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    // Size the canvas to real device pixels so the squares stay crisp at any zoom.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const cssW = canvas.offsetWidth || 1;
    const unit = (canvas.width / cssW) * PIXEL; // device pixels per particle
    const W = canvas.width;
    const H = canvas.height;

    const particles: Particle[] = [];
    const start = performance.now();
    const bursts = Math.max(3, Math.min(7, Math.round(W / (unit * 40))));
    const schedule = Array.from({ length: bursts }, (_, i) => ({
      at: i * (DURATION_MS * 0.55) / bursts + Math.random() * 120,
      done: false,
    }));

    function burst(now: number) {
      const cx = W * (0.15 + Math.random() * 0.7);
      const cy = H * (0.15 + Math.random() * 0.45);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const count = 18 + Math.floor(Math.random() * 10);
      const speed = unit * (1.1 + Math.random() * 0.6);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
        const s = speed * (0.6 + Math.random() * 0.4);
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          color: Math.random() < 0.2 ? '#ffffff' : color,
          born: now,
          life: 700 + Math.random() * 500,
        });
      }
    }

    let frame = 0;
    let last = start;
    function tick(now: number) {
      const dt = Math.min(48, now - last) / 16.7;
      last = now;
      const t = now - start;
      for (const b of schedule) {
        if (!b.done && t >= b.at) {
          b.done = true;
          burst(now);
        }
      }
      ctx!.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = now - p.born;
        if (age > p.life) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += unit * 0.035 * dt; // gravity
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Twinkle near the end of life instead of fading, to stay pixel-crisp.
        if (age > p.life * 0.7 && Math.floor(age / 60) % 2) continue;
        const px = Math.round(p.x / unit) * unit;
        const py = Math.round(p.y / unit) * unit;
        ctx!.fillStyle = p.color;
        ctx!.fillRect(px, py, Math.ceil(unit), Math.ceil(unit));
      }
      if (t < DURATION_MS || particles.length > 0) frame = requestAnimationFrame(tick);
      else ctx!.clearRect(0, 0, W, H);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} className="fireworks" aria-hidden="true" />;
}
