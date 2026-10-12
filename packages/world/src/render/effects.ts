import type { Particles } from '../model/types';

/**
 * Particles around a bubble (spec §3.2 "edge effects"): dots that circle the bubble and drift
 * in and out a little. Positions come from time, so nothing is allocated per particle
 * ("particles are recycled", spec §10.1).
 */

export interface ParticleDot {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** At most this many particles per bubble. */
export const MAX_PARTICLES = 48;

export function particleDots(
  p: Particles,
  cx: number,
  cy: number,
  radius: number,
  t: number | null,
  seed: number,
): ParticleDot[] {
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.round(p.count)));
  const time = t ?? 0;
  const out: ParticleDot[] = [];
  for (let i = 0; i < n; i++) {
    const phase = ((seed % 360) * Math.PI) / 180 + (i / n) * Math.PI * 2;
    // Every particle has its own speed, distance and blink.
    const k = 0.6 + ((i * 37 + seed) % 10) / 12;
    const a = phase + time * p.speed * 0.6 * k;
    const dist = radius * (1.12 + 0.12 * Math.sin(time * p.speed * k + i * 1.7));
    out.push({
      x: cx + Math.cos(a) * dist,
      y: cy + Math.sin(a) * dist,
      r: Math.max(1, radius * 0.045 * k),
      alpha: 0.55 + 0.45 * Math.sin(time * 2.3 * k + i),
    });
  }
  return out;
}
