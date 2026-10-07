import { describe, expect, it } from 'vitest';
import { floatOffset, PhysicsSim, type PhysicsInput } from './physics';

const input = (
  id: string,
  x: number,
  y: number,
  physics: PhysicsInput['physics'],
  parentId: string | null = null,
): PhysicsInput => ({
  id,
  parentId,
  target: { x, y },
  radius: 20,
  physics,
});

describe('physics', () => {
  it('leaves bubbles without physics on their target', () => {
    const sim = new PhysicsSim();
    const out = sim.update([input('a', 5, 6, {})], 1 / 60, 0, null);
    expect(out.get('a')).toEqual({ x: 5, y: 6 });
  });

  it('spring follows a moving target with lag and settles', () => {
    const sim = new PhysicsSim();
    const spring = { spring: { stiffness: 60, damping: 6, length: 0 } };
    sim.update([input('a', 0, 0, spring)], 1 / 60, 0, null);
    const lagging = sim.update([input('a', 100, 0, spring)], 1 / 60, 0, null).get('a')!;
    expect(lagging.x).toBeLessThan(10);
    let p = lagging;
    for (let i = 0; i < 600; i++)
      p = sim.update([input('a', 100, 0, spring)], 1 / 60, 0, null).get('a')!;
    expect(p.x).toBeCloseTo(100, 0);
    expect(sim.atRest).toBe(true);
  });

  it('pushes colliding siblings apart but not strangers when siblings-only', () => {
    const sim = new PhysicsSim();
    const col = { collide: { with: 'siblings' as const } };
    let out = new Map();
    for (let i = 0; i < 120; i++) {
      out = sim.update(
        [input('a', 0, 0, col, 'p'), input('b', 5, 0, col, 'p'), input('c', 0, 0, col, 'q')],
        1 / 60,
        0,
        null,
      );
    }
    const a = out.get('a');
    const b = out.get('b');
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(30);
    const c = out.get('c');
    expect(Math.hypot(c.x, c.y)).toBeLessThan(1);
  });

  it('repels from the mouse', () => {
    const sim = new PhysicsSim();
    const m = { mouse: { mode: 'repel' as const, strength: 1, radius: 100 } };
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 30; i++)
      p = sim.update([input('a', 0, 0, m)], 1 / 60, 0, { x: -20, y: 0 }).get('a')!;
    expect(p.x).toBeGreaterThan(5);
  });

  it('floats deterministically', () => {
    const p = { float: { amplitude: 10, speed: 0.5 } };
    expect(floatOffset(p, 'x', 3)).toEqual(floatOffset(p, 'x', 3));
    expect(Math.abs(floatOffset(p, 'x', 3).y)).toBeLessThanOrEqual(10);
  });
});
