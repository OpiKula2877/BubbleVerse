import { describe, expect, it } from 'vitest';
import { WorldIndex } from '../model/tree';
import { computePositions, orbitWouldCycle } from '../sim/position';
import { effectsShowcase, solarSystem } from './showcase';

describe('developer scenes', () => {
  it('builds the solar system from spec §3.5 with nested orbits', () => {
    const w = solarSystem();
    const index = new WorldIndex(w);
    const byName = (n: string) => w.bubbles.find((b) => b.name === n)!;
    const sun = byName('Slunce');
    const games = byName('Games');
    expect(sun.kind).toBe('action');
    for (const n of ['Apps', 'Games', 'Work']) {
      expect(byName(n).motion.track).toMatchObject({ type: 'orbit', center: sun.id });
    }
    expect(byName('CS2').motion.track).toMatchObject({ type: 'orbit', center: games.id });
    expect(orbitWouldCycle(index, games.id, byName('CS2').id)).toBe(true);
    // Moons stay near their planet while it moves around the sun.
    for (const t of [0, 7.5, 31]) {
      const p = computePositions(index, { time: t });
      const g = p.get(games.id)!;
      const m = p.get(byName('CS2').id)!;
      expect(Math.hypot(m.x - g.x, m.y - g.y)).toBeCloseTo(110, 0);
    }
    const p0 = computePositions(index, { time: 0 }).get(games.id)!;
    const p1 = computePositions(index, { time: 5 }).get(games.id)!;
    expect(p0).not.toEqual(p1);
  });

  it('shows every link type', () => {
    const types = new Set(effectsShowcase().bubbles.map((b) => b.link.type));
    for (const t of ['line', 'lightning', 'rope', 'flow', 'laser', 'chain'])
      expect(types.has(t as never)).toBe(true);
  });
});
