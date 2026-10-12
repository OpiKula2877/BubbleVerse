import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, particleDots } from './effects';

describe('particles', () => {
  it('circle the bubble just outside its edge and move with time', () => {
    const p = { color: '#fff', count: 12, speed: 1 };
    const a = particleDots(p, 100, 50, 40, 0, 3);
    expect(a).toHaveLength(12);
    for (const d of a) {
      const dist = Math.hypot(d.x - 100, d.y - 50);
      expect(dist).toBeGreaterThan(40);
      expect(dist).toBeLessThan(40 * 1.3);
    }
    expect(particleDots(p, 100, 50, 40, 1, 3)[0]).not.toEqual(a[0]);
    expect(particleDots(p, 100, 50, 40, null, 3)).toEqual(particleDots(p, 100, 50, 40, null, 3));
  });

  it('caps the count', () => {
    expect(particleDots({ color: '#fff', count: 500, speed: 1 }, 0, 0, 10, 0, 1)).toHaveLength(
      MAX_PARTICLES,
    );
  });
});
