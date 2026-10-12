import { describe, expect, it } from 'vitest';
import { WorldIndex } from '../model/tree';
import { computePositions } from '../sim/position';
import { generateScene } from './scene-gen';

describe('test scene generator', () => {
  for (const n of [200, 1000]) {
    it(`creates ${n} bubbles with a valid tree and motion`, () => {
      const w = generateScene(n);
      expect(w.bubbles).toHaveLength(n);
      const idx = new WorldIndex(w);
      expect(idx.flatten()).toHaveLength(n);
      expect(w.bubbles.some((b) => b.motion.track?.type === 'orbit')).toBe(true);
      expect(w.bubbles.some((b) => b.kind === 'folder' && b.parentId)).toBe(true);
      const t0 = performance.now();
      computePositions(idx, { time: 123.4 });
      expect(performance.now() - t0).toBeLessThan(50);
    });
  }

  it('is deterministic for a seed', () => {
    expect(generateScene(50, 7).bubbles.map((b) => b.name)).toEqual(
      generateScene(50, 7).bubbles.map((b) => b.name),
    );
  });
});
