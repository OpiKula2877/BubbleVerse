import { describe, expect, it } from 'vitest';
import type { OrbitMotion, PathMotion } from '../model/types';
import { orbitOffset } from '../sim/motion';
import {
  addPathPoint,
  dragOrbitHandle,
  movePathPoint,
  orbitHandles,
  removePathPoint,
  setPathHandle,
  snapDirection,
  toggleSmooth,
  wanderAreaFromDrag,
} from './motion-edit';

const path: PathMotion = {
  type: 'path',
  points: [
    { x: 0, y: 0, smooth: false },
    { x: 100, y: 0, smooth: false },
  ],
  loop: 'pingpong',
  speed: 50,
  easing: 'linear',
};

describe('path editing', () => {
  it('adds, moves and removes points', () => {
    let p = addPathPoint(path, { x: 100, y: 80 });
    expect(p.points).toHaveLength(3);
    expect(p.points[2]).toEqual({ x: 100, y: 80, smooth: false });
    p = setPathHandle(p, 1, 'out', { x: 10, y: 5 });
    p = movePathPoint(p, 1, { x: 120, y: 10 });
    expect(p.points[1]).toMatchObject({ x: 120, y: 10, out: { x: 10, y: 5 } });
    expect(removePathPoint(p, 0).points).toHaveLength(2);
    expect(removePathPoint({ ...p, points: [p.points[0]!] }, 0).points).toHaveLength(1);
  });

  it('keeps handles of a smooth point opposite', () => {
    const p = setPathHandle(path, 1, 'in', { x: -30, y: 20 });
    expect(p.points[1]).toEqual({
      x: 100,
      y: 0,
      smooth: true,
      in: { x: -30, y: 20 },
      out: { x: 30, y: -20 },
    });
  });

  it('toggles sharp and smooth points', () => {
    const three = addPathPoint(path, { x: 200, y: 100 });
    const smooth = toggleSmooth(three, 1);
    expect(smooth.points[1]).toMatchObject({
      smooth: true,
      out: { x: 50, y: 25 },
      in: { x: -50, y: -25 },
    });
    const sharp = toggleSmooth(smooth, 1);
    expect(sharp.points[1]).toEqual({ x: 100, y: 0, smooth: false });
  });
});

describe('orbit editing', () => {
  const o: OrbitMotion = {
    type: 'orbit',
    center: 'c',
    rx: 100,
    ry: 50,
    tilt: 0,
    speed: 10,
    dir: 'cw',
    phase: 0,
  };

  it('places the handles on the ellipse', () => {
    const h = orbitHandles(o);
    expect(h.rx).toEqual({ x: 100, y: 0 });
    expect(h.ry.x).toBeCloseTo(0);
    expect(h.ry.y).toBeCloseTo(50);
    // The X handle is where the bubble is at phase 0.
    expect(orbitOffset(o, 0).x).toBeCloseTo(h.rx.x);
  });

  it('sets radius X with the tilt and radius Y along the tilted axis', () => {
    const turned = dragOrbitHandle(o, 'rx', { x: 0, y: 200 });
    expect(turned.rx).toBe(200);
    expect(turned.tilt).toBe(90);
    const taller = dragOrbitHandle(turned, 'ry', { x: -80, y: 3 });
    expect(taller.ry).toBe(80);
  });

  it('snaps the direction from the center to 45° steps (Ctrl), keeping the distance', () => {
    const near = (v: { x: number; y: number }, x: number, y: number) => {
      expect(v.x).toBeCloseTo(x, 6);
      expect(v.y).toBeCloseTo(y, 6);
    };
    near(snapDirection({ x: 100, y: 10 }, 45), Math.hypot(100, 10), 0);
    near(
      snapDirection({ x: 50, y: 60 }, 45),
      Math.hypot(50, 60) / Math.SQRT2,
      Math.hypot(50, 60) / Math.SQRT2,
    );
    near(snapDirection({ x: -3, y: -200 }, 45), 0, -Math.hypot(3, 200));
    expect(snapDirection({ x: 0, y: 0 }, 45)).toEqual({ x: 0, y: 0 });
    // The X handle then gives a tilt of exactly 0°, 45°, 90°…
    expect(dragOrbitHandle(o, 'rx', snapDirection({ x: 70, y: 80 }, 45)).tilt).toBe(45);
  });
});

describe('wander area', () => {
  it('draws a circle or a rectangle around the bubble', () => {
    expect(wanderAreaFromDrag('circle', { x: 30, y: 40 })).toEqual({ shape: 'circle', r: 50 });
    expect(wanderAreaFromDrag('rect', { x: -30, y: 40 })).toEqual({ shape: 'rect', w: 60, h: 80 });
  });
});
