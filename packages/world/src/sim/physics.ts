import type { BubbleId, Physics, Vec2 } from '../model/types';
import { hashSeed } from './motion';

/**
 * Physics (spec §3.6): target = base + motion; a spring pulls the bubble to the target and
 * floating, collisions and mouse reaction are added. Fixed time step, grid for collisions.
 */

export const STEP = 1 / 60;
const DEFAULT_K = 220;
const MAX_STEPS = 8;
const REST_EPS = 0.05;

export interface PhysicsInput {
  id: BubbleId;
  parentId: BubbleId | null;
  target: Vec2;
  /** Radius in world units (half of the displayed size). */
  radius: number;
  physics: Physics;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seen: boolean;
}

export function hasPhysics(p: Physics): boolean {
  return Boolean(p.float || p.collide || p.spring || p.mouse);
}

/** Deterministic floating offset (bobbing). */
export function floatOffset(p: Physics, id: BubbleId, t: number): Vec2 {
  const f = p.float;
  if (!f || f.amplitude === 0) return { x: 0, y: 0 };
  const phase = (hashSeed(id) % 1000) / 159.155;
  const w = f.speed * Math.PI * 2;
  return {
    x: Math.sin(((t * w * 0.63) % 1e6) + phase * 1.7) * f.amplitude * 0.35,
    y: Math.sin(((t * w) % 1e6) + phase) * f.amplitude,
  };
}

export class PhysicsSim {
  private bodies = new Map<BubbleId, Body>();
  private acc = 0;
  /** True when no simulated body moved noticeably in the last step. */
  atRest = true;

  reset(): void {
    this.bodies.clear();
    this.acc = 0;
  }

  /**
   * Advances the simulation by `dt` seconds and returns positions of all inputs
   * (bubbles without physics sit exactly on their target).
   */
  update(
    inputs: PhysicsInput[],
    dt: number,
    time: number,
    mouse: Vec2 | null,
  ): Map<BubbleId, Vec2> {
    for (const b of this.bodies.values()) b.seen = false;
    const active: PhysicsInput[] = [];
    for (const inp of inputs) {
      if (!hasPhysics(inp.physics)) continue;
      active.push(inp);
      const body = this.bodies.get(inp.id);
      if (body) body.seen = true;
      else this.bodies.set(inp.id, { x: inp.target.x, y: inp.target.y, vx: 0, vy: 0, seen: true });
    }
    for (const [id, b] of this.bodies) if (!b.seen) this.bodies.delete(id);

    this.acc = Math.min(this.acc + Math.max(0, dt), STEP * MAX_STEPS);
    let moved = false;
    while (this.acc >= STEP) {
      moved = this.step(active, mouse) || moved;
      this.acc -= STEP;
    }
    this.atRest = !moved;

    const out = new Map<BubbleId, Vec2>();
    for (const inp of inputs) {
      const body = this.bodies.get(inp.id);
      const base = body ? { x: body.x, y: body.y } : inp.target;
      const fl = floatOffset(inp.physics, inp.id, time);
      out.set(inp.id, { x: base.x + fl.x, y: base.y + fl.y });
    }
    return out;
  }

  private step(active: PhysicsInput[], mouse: Vec2 | null): boolean {
    let moved = false;
    const h = STEP;
    for (const inp of active) {
      const b = this.bodies.get(inp.id)!;
      const s = inp.physics.spring;
      const k = s ? s.stiffness : DEFAULT_K;
      const c = s ? s.damping : 2 * Math.sqrt(DEFAULT_K);
      let dx = inp.target.x - b.x;
      let dy = inp.target.y - b.y;
      const dist = Math.hypot(dx, dy);
      const slack = s?.length ?? 0;
      if (slack > 0) {
        if (dist <= slack) {
          dx = 0;
          dy = 0;
        } else {
          dx -= (dx / dist) * slack;
          dy -= (dy / dist) * slack;
        }
      }
      let fx = k * dx - c * b.vx;
      let fy = k * dy - c * b.vy;
      const m = inp.physics.mouse;
      if (m && mouse) {
        const mx = b.x - mouse.x;
        const my = b.y - mouse.y;
        const r = Math.hypot(mx, my);
        if (r > 0.001 && r < m.radius) {
          const sign = m.mode === 'repel' ? 1 : -1;
          const mag = sign * m.strength * 4000 * (1 - r / m.radius);
          fx += (mx / r) * mag;
          fy += (my / r) * mag;
        }
      }
      b.vx += fx * h;
      b.vy += fy * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (Math.abs(b.vx) > REST_EPS || Math.abs(b.vy) > REST_EPS) moved = true;
    }
    if (this.collide(active)) moved = true;
    return moved;
  }

  private collide(active: PhysicsInput[]): boolean {
    const colliders = active.filter((a) => a.physics.collide);
    if (colliders.length < 2) return false;
    const cell = Math.max(16, ...colliders.map((c) => c.radius * 2));
    const grid = new Map<string, PhysicsInput[]>();
    for (const c of colliders) {
      const b = this.bodies.get(c.id)!;
      const key = `${Math.floor(b.x / cell)},${Math.floor(b.y / cell)}`;
      const list = grid.get(key);
      if (list) list.push(c);
      else grid.set(key, [c]);
    }
    let pushed = false;
    for (const a of colliders) {
      const ba = this.bodies.get(a.id)!;
      const gx = Math.floor(ba.x / cell);
      const gy = Math.floor(ba.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const o of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
            if (o.id <= a.id || !canCollide(a, o)) continue;
            const bo = this.bodies.get(o.id)!;
            let dx = bo.x - ba.x;
            let dy = bo.y - ba.y;
            let d = Math.hypot(dx, dy);
            const min = a.radius + o.radius;
            if (d >= min) continue;
            if (d < 0.001) {
              dx = 1;
              dy = 0;
              d = 1;
            }
            const push = (min - d) / 2;
            const nx = dx / d;
            const ny = dy / d;
            ba.x -= nx * push;
            ba.y -= ny * push;
            bo.x += nx * push;
            bo.y += ny * push;
            pushed = push > REST_EPS || pushed;
          }
        }
      }
    }
    return pushed;
  }
}

function canCollide(a: PhysicsInput, b: PhysicsInput): boolean {
  const siblings = a.parentId === b.parentId;
  return (
    (a.physics.collide?.with === 'all' || siblings) &&
    (b.physics.collide?.with === 'all' || siblings)
  );
}
