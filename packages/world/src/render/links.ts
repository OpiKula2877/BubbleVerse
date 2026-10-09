import type { LinkType, Vec2 } from '../model/types';

/**
 * Shapes of the links between a bubble and its parent (spec §3.7), as plain geometry so it
 * is testable. The renderer strokes the polylines and fills the dots with the link's color.
 * `t` is the time in seconds, or `null` when nothing moves (edit mode): then every shape is
 * still.
 */

export interface LinkStroke {
  /** Flat list x0, y0, x1, y1, … */
  pts: number[];
  /** Multiplier of the link width. */
  width: number;
  /** Multiplier of the link opacity. */
  alpha: number;
}

export interface LinkDot {
  x: number;
  y: number;
  r: number;
  alpha: number;
  /** Outline only (chain links). */
  ring: boolean;
}

export interface LinkShape {
  strokes: LinkStroke[];
  dots: LinkDot[];
  /** The shape changes with time. */
  animated: boolean;
}

/** The lightning changes shape this many times per second (spec §10.1). */
export const LIGHTNING_HZ = 20;

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points of a curve from `a` to `b` that sags down (rope, chain); `swing` moves it sideways. */
function sagCurve(a: Vec2, b: Vec2, sag: number, swing: number, n: number): Vec2[] {
  const mx = (a.x + b.x) / 2 + swing;
  const my = (a.y + b.y) / 2 + sag;
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const v = 1 - u;
    out.push({
      x: v * v * a.x + 2 * v * u * mx + u * u * b.x,
      y: v * v * a.y + 2 * v * u * my + u * u * b.y,
    });
  }
  return out;
}

function flat(points: readonly Vec2[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/** Points spaced `step` apart along a polyline. */
function along(points: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    let d = carry;
    while (d <= seg) {
      const u = seg ? d / seg : 0;
      out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
      d += step;
    }
    carry = d - seg;
  }
  return out;
}

/**
 * The link from a parent at `from` (radius `fromR`) to a child at `to` (radius `toR`);
 * `null` when the bubbles overlap or the type is "none".
 */
export function linkShape(
  type: LinkType,
  from: Vec2,
  fromR: number,
  to: Vec2,
  toR: number,
  width: number,
  t: number | null,
  seed: number,
  dash?: 'dotted' | 'dashed',
): LinkShape | null {
  if (type === 'none') return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= fromR + toR) return null;
  const ux = dx / dist;
  const uy = dy / dist;
  const a = { x: from.x + ux * fromR, y: from.y + uy * fromR };
  const b = { x: to.x - ux * toR, y: to.y - uy * toR };
  const len = dist - fromR - toR;
  const w = Math.max(0.5, width);

  switch (type) {
    case 'laser':
      return {
        strokes: [
          { pts: [a.x, a.y, b.x, b.y], width: 6, alpha: 0.12 },
          { pts: [a.x, a.y, b.x, b.y], width: 3, alpha: 0.28 },
          { pts: [a.x, a.y, b.x, b.y], width: 1, alpha: 1 },
        ],
        dots: [],
        animated: false,
      };
    case 'lightning': {
      const bucket = t === null ? 0 : Math.floor(t * LIGHTNING_HZ);
      const r = rng(seed * 31 + bucket);
      const n = Math.max(4, Math.min(24, Math.round(len / 18)));
      const amp = Math.min(len * 0.08, 14 + w * 2);
      const pts: Vec2[] = [a];
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const off = (r() * 2 - 1) * amp;
        pts.push({ x: a.x + (b.x - a.x) * u - uy * off, y: a.y + (b.y - a.y) * u + ux * off });
      }
      pts.push(b);
      const p = flat(pts);
      return {
        strokes: [
          { pts: p, width: 3, alpha: 0.25 },
          { pts: p, width: 1, alpha: 1 },
        ],
        dots: [],
        animated: t !== null,
      };
    }
    case 'rope':
    case 'chain': {
      const swing = t === null ? 0 : Math.sin(t * 1.6 + seed) * len * 0.05;
      const curve = sagCurve(a, b, len * 0.18, swing, 20);
      if (type === 'rope') {
        return {
          strokes: [{ pts: flat(curve), width: 1, alpha: 1 }],
          dots: [],
          animated: t !== null,
        };
      }
      const r = w * 1.6 + 1.5;
      const links = along(curve, r * 2.2).map((p) => ({ x: p.x, y: p.y, r, alpha: 1, ring: true }));
      return { strokes: [], dots: links, animated: t !== null };
    }
    case 'flow': {
      const strokes: LinkStroke[] = [];
      const piece = dash === 'dashed' ? 10 + w * 2 : 2 + w;
      const gap = dash === 'dashed' ? 8 + w : 6 + w;
      for (let d = 0; d < len; d += piece + gap) {
        const e = Math.min(len, d + piece);
        strokes.push({
          pts: [a.x + ux * d, a.y + uy * d, a.x + ux * e, a.y + uy * e],
          width: 1,
          alpha: 0.55,
        });
      }
      // Particles travel from the parent to the child.
      const count = Math.max(1, Math.round(len / 45));
      const speed = 60;
      const dots: LinkDot[] = [];
      for (let i = 0; i < count; i++) {
        const u = (((t ?? 0) * speed) / Math.max(len, 1) + i / count + (seed % 97) / 97) % 1;
        dots.push({
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
          r: w * 1.2 + 1,
          alpha: 1,
          ring: false,
        });
      }
      return { strokes, dots, animated: t !== null };
    }
    default:
      return {
        strokes: [{ pts: [a.x, a.y, b.x, b.y], width: 1, alpha: 1 }],
        dots: [],
        animated: false,
      };
  }
}
