import type {
  Easing,
  OrbitMotion,
  PathMotion,
  PathPoint,
  Pulse,
  Spin,
  Vec2,
  WanderMotion,
} from '../model/types';

/**
 * Motions are pure functions of time (seconds), so the app window and the wallpaper
 * show every bubble at the same place (spec §3.5).
 */

const DEG = Math.PI / 180;

export function ease(e: Easing, u: number): number {
  switch (e) {
    case 'easeIn':
      return u * u;
    case 'easeOut':
      return 1 - (1 - u) * (1 - u);
    case 'easeInOut':
      return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default:
      return u;
  }
}

function frac(x: number): number {
  return x - Math.floor(x);
}

/** Point on an ellipse around the center, rotated by `tilt`. */
export function orbitOffset(o: OrbitMotion, t: number): Vec2 {
  const dir = o.dir === 'cw' ? 1 : -1;
  // Reduce the angle before converting to radians to keep precision with epoch-based time.
  const deg = (((o.phase + dir * o.speed * t) % 360) + 360) % 360;
  const a = deg * DEG;
  const ex = o.rx * Math.cos(a);
  const ey = o.ry * Math.sin(a);
  const tilt = o.tilt * DEG;
  return {
    x: ex * Math.cos(tilt) - ey * Math.sin(tilt),
    y: ex * Math.sin(tilt) + ey * Math.cos(tilt),
  };
}

// ---------- Path ----------

interface PathTable {
  /** Sampled points along the whole path. */
  pts: Vec2[];
  /** Cumulative length at each sample. */
  cum: number[];
  length: number;
}

const SAMPLES_PER_SEGMENT = 24;
const tables = new WeakMap<PathMotion, PathTable>();

function cubic(p0: Vec2, c0: Vec2, c1: Vec2, p1: Vec2, u: number): Vec2 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return {
    x: a * p0.x + b * c0.x + c * c1.x + d * p1.x,
    y: a * p0.y + b * c0.y + c * c1.y + d * p1.y,
  };
}

function segmentPoints(a: PathPoint, b: PathPoint): [Vec2, Vec2, Vec2, Vec2] {
  const out = a.out ?? { x: 0, y: 0 };
  const inn = b.in ?? { x: 0, y: 0 };
  return [
    { x: a.x, y: a.y },
    { x: a.x + out.x, y: a.y + out.y },
    { x: b.x + inn.x, y: b.y + inn.y },
    { x: b.x, y: b.y },
  ];
}

export function buildPathTable(path: PathMotion): PathTable {
  const cached = tables.get(path);
  if (cached) return cached;
  const points = path.points;
  const pts: Vec2[] = [];
  const cum: number[] = [];
  const segCount = path.loop === 'loop' && points.length > 2 ? points.length : points.length - 1;
  if (points.length > 0) {
    const first = points[0]!;
    pts.push({ x: first.x, y: first.y });
    cum.push(0);
  }
  for (let s = 0; s < segCount; s++) {
    const a = points[s]!;
    const b = points[(s + 1) % points.length]!;
    const [p0, c0, c1, p1] = segmentPoints(a, b);
    for (let i = 1; i <= SAMPLES_PER_SEGMENT; i++) {
      const p = cubic(p0, c0, c1, p1, i / SAMPLES_PER_SEGMENT);
      const prev = pts[pts.length - 1]!;
      pts.push(p);
      cum.push(cum[cum.length - 1]! + Math.hypot(p.x - prev.x, p.y - prev.y));
    }
  }
  const table = { pts, cum, length: cum[cum.length - 1] ?? 0 };
  tables.set(path, table);
  return table;
}

function pointAtDistance(table: PathTable, s: number): Vec2 {
  const { pts, cum } = table;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return pts[0]!;
  if (s >= table.length) return pts[pts.length - 1]!;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi]! - cum[lo]!;
  const u = span > 0 ? (s - cum[lo]!) / span : 0;
  const a = pts[lo]!;
  const b = pts[hi]!;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** Offset along the path; the path is relative to the bubble's base position. */
export function pathOffset(path: PathMotion, t: number): Vec2 {
  const table = buildPathTable(path);
  if (table.length <= 0 || path.speed <= 0) return table.pts[0] ?? { x: 0, y: 0 };
  const period = table.length / path.speed;
  let u: number;
  if (path.loop === 'loop') {
    u = frac(t / period);
  } else {
    const phase = frac(t / (2 * period)) * 2;
    u = phase <= 1 ? phase : 2 - phase;
  }
  return pointAtDistance(table, ease(path.easing, u) * table.length);
}

// ---------- Wander ----------

/** Stable 32-bit seed from a bubble id. */
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number, n: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Sum of three sines per axis: smooth, deterministic, values in [-1, 1]. */
function smoothNoise(t: number, seed: number, axis: number, smoothness: number): number {
  const rough = 1 - Math.min(1, Math.max(0, smoothness));
  const weights = [1, 0.5 * rough, 0.25 * rough];
  const mult = [1, 2.3 + seeded(seed, axis * 7 + 1), 4.1 + seeded(seed, axis * 7 + 2)];
  let sum = 0;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const w = weights[i]!;
    if (w === 0) continue;
    const phase = seeded(seed, axis * 7 + 3 + i) * Math.PI * 2;
    const f = mult[i]! * (0.8 + 0.4 * seeded(seed, axis * 7 + 6));
    sum += w * Math.sin(((t * f) % 1e6) + phase);
    total += w;
  }
  return total > 0 ? sum / total : 0;
}

export function wanderOffset(w: WanderMotion, t: number, seed: number): Vec2 {
  const half = w.area.shape === 'circle' ? w.area.r : Math.max(w.area.w, w.area.h) / 2;
  if (half <= 0 || w.speed <= 0) return { x: 0, y: 0 };
  // Angular frequency so that the average speed is roughly `speed` world units per second.
  const omega = w.speed / half;
  const tt = t * omega;
  let nx = smoothNoise(tt, seed, 0, w.smoothness);
  let ny = smoothNoise(tt, seed, 1, w.smoothness);
  if (w.area.shape === 'circle') {
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    return { x: nx * w.area.r, y: ny * w.area.r };
  }
  return { x: (nx * w.area.w) / 2, y: (ny * w.area.h) / 2 };
}

// ---------- Pulse & spin ----------

export function pulseScale(p: Pulse, t: number): number {
  if (p.period <= 0) return p.max;
  const u = 0.5 - 0.5 * Math.cos(frac(t / p.period) * Math.PI * 2);
  return p.min + (p.max - p.min) * u;
}

/** Rotation of the skin in radians. */
export function spinAngle(s: Spin, t: number): number {
  if (s.speed === 0) return 0;
  if (s.mode === 'constant') return ((s.speed * t) % 360) * DEG;
  const period = 360 / Math.abs(s.speed);
  return s.angle * Math.sin(frac(t / period) * Math.PI * 2) * DEG;
}
