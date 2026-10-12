import { describe, expect, it } from 'vitest';
import { fixtureBubble, sampleWorld } from '../model/fixtures';
import { WorldIndex } from '../model/tree';
import type { OrbitMotion, PathMotion, WanderMotion } from '../model/types';
import {
  buildPathTable,
  ease,
  orbitOffset,
  pathOffset,
  pulseScale,
  spinAngle,
  wanderOffset,
} from './motion';
import { computePositions, orbitWouldCycle } from './position';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 4);
  expect(a.y).toBeCloseTo(b.y, 4);
};

describe('orbit', () => {
  const orbit: OrbitMotion = {
    type: 'orbit',
    center: 'sun',
    rx: 100,
    ry: 50,
    tilt: 0,
    speed: 90,
    dir: 'cw',
    phase: 0,
  };

  it('moves along the ellipse in time', () => {
    close(orbitOffset(orbit, 0), { x: 100, y: 0 });
    close(orbitOffset(orbit, 1), { x: 0, y: 50 });
    close(orbitOffset(orbit, 2), { x: -100, y: 0 });
    close(orbitOffset({ ...orbit, dir: 'ccw' }, 1), { x: 0, y: -50 });
  });

  it('applies phase and tilt', () => {
    close(orbitOffset({ ...orbit, phase: 90 }, 0), { x: 0, y: 50 });
    close(orbitOffset({ ...orbit, tilt: 90 }, 0), { x: 0, y: 100 });
  });

  it('is deterministic for large epoch times', () => {
    const t = 1_760_000_000.25;
    expect(orbitOffset(orbit, t)).toEqual(orbitOffset(orbit, t));
    close(orbitOffset(orbit, t + 4), orbitOffset(orbit, t));
  });
});

describe('path', () => {
  const square: PathMotion = {
    type: 'path',
    points: [
      { x: 0, y: 0, smooth: false },
      { x: 100, y: 0, smooth: false },
      { x: 100, y: 100, smooth: false },
      { x: 0, y: 100, smooth: false },
    ],
    loop: 'loop',
    speed: 100,
    easing: 'linear',
  };

  it('measures the closed loop', () => {
    expect(buildPathTable(square).length).toBeCloseTo(400, 3);
  });

  it('travels at the given speed and loops', () => {
    close(pathOffset(square, 0), { x: 0, y: 0 });
    close(pathOffset(square, 0.5), { x: 50, y: 0 });
    close(pathOffset(square, 1.5), { x: 100, y: 50 });
    close(pathOffset(square, 4.5), { x: 50, y: 0 });
  });

  it('goes back and forth in ping-pong mode', () => {
    const line: PathMotion = { ...square, points: square.points.slice(0, 2), loop: 'pingpong' };
    close(pathOffset(line, 0.25), { x: 25, y: 0 });
    close(pathOffset(line, 1), { x: 100, y: 0 });
    close(pathOffset(line, 1.25), { x: 75, y: 0 });
  });

  it('follows bezier handles of smooth points', () => {
    const curve: PathMotion = {
      ...square,
      loop: 'pingpong',
      points: [
        { x: 0, y: 0, smooth: true, out: { x: 0, y: 100 } },
        { x: 100, y: 0, smooth: true, in: { x: 0, y: 100 } },
      ],
    };
    expect(buildPathTable(curve).length).toBeGreaterThan(150);
    expect(pathOffset(curve, buildPathTable(curve).length / 200).y).toBeGreaterThan(50);
  });

  it('eases', () => {
    expect(ease('easeIn', 0.5)).toBeCloseTo(0.25);
    expect(ease('easeOut', 0.5)).toBeCloseTo(0.75);
    expect(ease('easeInOut', 0.25)).toBeCloseTo(0.125);
  });
});

describe('wander, pulse, spin', () => {
  it('stays inside the wander area and is deterministic', () => {
    const w: WanderMotion = {
      type: 'wander',
      area: { shape: 'circle', r: 50 },
      speed: 40,
      smoothness: 0.3,
    };
    for (let t = 0; t < 100; t += 0.37) {
      const p = wanderOffset(w, t, 42);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(50.0001);
      expect(wanderOffset(w, t, 42)).toEqual(p);
    }
    const r: WanderMotion = { ...w, area: { shape: 'rect', w: 100, h: 20 } };
    for (let t = 0; t < 50; t += 0.5) {
      const p = wanderOffset(r, t, 7);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(50);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(10);
    }
  });

  it('pulses between min and max', () => {
    const p = { min: 0.8, max: 1.2, period: 2 };
    expect(pulseScale(p, 0)).toBeCloseTo(0.8);
    expect(pulseScale(p, 1)).toBeCloseTo(1.2);
  });

  it('spins constantly or like a pendulum', () => {
    expect(spinAngle({ mode: 'constant', speed: 90, angle: 0 }, 1)).toBeCloseTo(Math.PI / 2);
    const pendulum = { mode: 'pendulum' as const, speed: 90, angle: 30 };
    expect(spinAngle(pendulum, 1)).toBeCloseTo((30 * Math.PI) / 180);
    expect(Math.abs(spinAngle(pendulum, 2))).toBeLessThan(1e-9);
  });
});

describe('positions', () => {
  it('adds parent positions for parent attachment and ignores them for world attachment', () => {
    const w = sampleWorld();
    const idx = new WorldIndex(w);
    const pos = computePositions(idx, { time: null });
    close(pos.get('cc')!, { x: 300, y: 50 });
    w.bubbles.find((b) => b.id === 'cc')!.attach = 'world';
    close(computePositions(new WorldIndex(w), { time: null }).get('cc')!, { x: 100, y: 50 });
  });

  it('nests orbits: moon around planet around sun', () => {
    const w = sampleWorld();
    w.bubbles.push(
      fixtureBubble('sun', null, 'Sun', 'action', 9, { position: { x: 1000, y: 1000 } }),
    );
    const games = w.bubbles.find((b) => b.id === 'games')!;
    games.motion.track = {
      type: 'orbit',
      center: 'sun',
      rx: 300,
      ry: 300,
      tilt: 0,
      speed: 90,
      dir: 'cw',
      phase: 0,
    };
    const mc = w.bubbles.find((b) => b.id === 'mc')!;
    mc.motion.track = {
      type: 'orbit',
      center: 'games',
      rx: 50,
      ry: 50,
      tilt: 0,
      speed: 180,
      dir: 'cw',
      phase: 0,
    };
    const pos = computePositions(new WorldIndex(w), { time: 1 });
    close(pos.get('games')!, { x: 1000, y: 1300 });
    close(pos.get('mc')!, { x: 950, y: 1300 });
    // Children attached to an orbiting parent move with it.
    close(pos.get('cs2')!, { x: 850, y: 1300 });
    // Without time everything stands at base positions.
    close(computePositions(new WorldIndex(w), { time: null }).get('games')!, { x: 0, y: 500 });
  });

  it('detects orbit cycles', () => {
    const w = sampleWorld();
    const idx0 = new WorldIndex(w);
    expect(orbitWouldCycle(idx0, 'apps', 'apps')).toBe(true);
    expect(orbitWouldCycle(idx0, 'apps', 'games')).toBe(false);
    w.bubbles.find((b) => b.id === 'games')!.motion.track = {
      type: 'orbit',
      center: 'apps',
      rx: 1,
      ry: 1,
      tilt: 0,
      speed: 1,
      dir: 'cw',
      phase: 0,
    };
    const idx = new WorldIndex(w);
    expect(orbitWouldCycle(idx, 'apps', 'games')).toBe(true);
    // A child attached to its parent cannot be the center of the parent's orbit.
    expect(orbitWouldCycle(idx, 'apps', 'cc')).toBe(true);
    expect(orbitWouldCycle(idx, 'apps', 'mc')).toBe(true);
  });

  it('survives a cycle in data without hanging', () => {
    const w = sampleWorld();
    const orbit = (center: string) => ({
      type: 'orbit' as const,
      center,
      rx: 10,
      ry: 10,
      tilt: 0,
      speed: 0,
      dir: 'cw' as const,
      phase: 0,
    });
    w.bubbles.find((b) => b.id === 'apps')!.motion.track = orbit('games');
    w.bubbles.find((b) => b.id === 'games')!.motion.track = orbit('apps');
    const pos = computePositions(new WorldIndex(w), { time: 0 });
    expect(pos.size).toBe(w.bubbles.length);
  });

  it('applies runtime overrides from scripts', () => {
    const idx = new WorldIndex(sampleWorld());
    const pos = computePositions(idx, {
      time: null,
      overrides: new Map([['work', { x: 0, y: 0 }]]),
    });
    close(pos.get('cc')!, { x: 100, y: 50 });
  });
});
