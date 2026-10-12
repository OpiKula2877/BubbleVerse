import { describe, expect, it } from 'vitest';
import { LIGHTNING_HZ, linkShape } from './links';

const A = { x: 0, y: 0 };
const B = { x: 300, y: 0 };

describe('link shapes', () => {
  it('starts and ends at the bubble edges and skips overlapping bubbles', () => {
    const s = linkShape('line', A, 50, B, 20, 2, null, 1)!;
    expect(s.strokes[0]!.pts).toEqual([50, 0, 280, 0]);
    expect(linkShape('line', A, 50, { x: 60, y: 0 }, 20, 2, null, 1)).toBeNull();
    expect(linkShape('none', A, 10, B, 10, 2, null, 1)).toBeNull();
  });

  it('draws a laser as a core with soft wide glow strokes', () => {
    const s = linkShape('laser', A, 10, B, 10, 2, 5, 1)!;
    expect(s.strokes.map((x) => x.width)).toEqual([6, 3, 1]);
    expect(s.animated).toBe(false);
  });

  it('keeps lightning still in edit mode and changes it about 20 times a second', () => {
    const still1 = linkShape('lightning', A, 10, B, 10, 2, null, 7)!;
    const still2 = linkShape('lightning', A, 10, B, 10, 2, null, 7)!;
    expect(still1).toEqual(still2);
    expect(still1.animated).toBe(false);
    const f1 = linkShape('lightning', A, 10, B, 10, 2, 1, 7)!;
    const f1b = linkShape('lightning', A, 10, B, 10, 2, 1 + 0.2 / LIGHTNING_HZ, 7)!;
    const f2 = linkShape('lightning', A, 10, B, 10, 2, 1 + 1 / LIGHTNING_HZ, 7)!;
    expect(f1).toEqual(f1b);
    expect(f1.strokes[1]!.pts).not.toEqual(f2.strokes[1]!.pts);
    const pts = f1.strokes[1]!.pts;
    expect([pts[0], pts[1], pts.at(-2), pts.at(-1)]).toEqual([10, 0, 290, 0]);
  });

  it('lets a rope and a chain sag below a horizontal link', () => {
    const rope = linkShape('rope', A, 10, B, 10, 2, null, 1)!;
    const pts = rope.strokes[0]!.pts;
    const midY = pts[Math.floor(pts.length / 4) * 2 + 1]!;
    expect(midY).toBeGreaterThan(20);
    const chain = linkShape('chain', A, 10, B, 10, 2, null, 1)!;
    expect(chain.dots.length).toBeGreaterThan(20);
    expect(chain.dots.every((d) => d.ring)).toBe(true);
  });

  it('moves flow particles from the parent to the child over time', () => {
    const at = (t: number) => linkShape('flow', A, 10, B, 10, 2, t, 0, 'dotted')!.dots[0]!.x;
    const x0 = at(0);
    const x1 = at(0.5);
    expect(x1).toBeGreaterThan(x0);
    const dashed = linkShape('flow', A, 10, B, 10, 2, 0, 0, 'dashed')!;
    const dotted = linkShape('flow', A, 10, B, 10, 2, 0, 0, 'dotted')!;
    expect(dashed.strokes.length).toBeLessThan(dotted.strokes.length);
  });
});
