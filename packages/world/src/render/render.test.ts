import { describe, expect, it } from 'vitest';
import { sampleWorld } from '../model/fixtures';
import { WorldIndex } from '../model/tree';
import { ExpandState } from './expand';
import {
  computeViewports,
  cssToWorld,
  fitCamera,
  viewportAt,
  worldToCss,
  zoomAt,
  type ScreenLayout,
} from './viewports';

/** 1920×1080 @150 % (UI) with a 1920×1080 @100 % monitor on its right. */
const layout: ScreenLayout = {
  monitors: [
    { id: 'A', rect: { x: 0, y: 0, w: 1920, h: 1080 }, scale: 1.5 },
    { id: 'B', rect: { x: 1920, y: 0, w: 1920, h: 1080 }, scale: 1 },
  ],
  uiMonitor: 'A',
  origin: { x: 0, y: 0 },
  cssScale: 1.5,
};

describe('viewports', () => {
  it('centers the camera on the UI monitor', () => {
    const vps = computeViewports(layout, { x: 0, y: 0, zoom: 1 });
    const a = vps.find((v) => v.id === 'A')!;
    expect(a.css).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(a.k).toBe(1);
    expect(worldToCss(a, { x: 0, y: 0 })).toEqual({ x: 640, y: 360 });
  });

  it('uses each monitor’s own scale and joins the planes at the edge', () => {
    const vps = computeViewports(layout, { x: 0, y: 0, zoom: 1 });
    const a = vps.find((v) => v.id === 'A')!;
    const b = vps.find((v) => v.id === 'B')!;
    // On B one world unit is one physical pixel = 1/1.5 CSS px.
    expect(b.k).toBeCloseTo(1 / 1.5);
    // The right edge of A and the left edge of B show the same world x.
    const edgeA = cssToWorld(a, { x: 1280, y: 360 });
    const edgeB = cssToWorld(b, { x: 1280, y: 360 });
    expect(edgeB.x).toBeCloseTo(edgeA.x);
    expect(edgeB.y).toBeCloseTo(edgeA.y);
    // 100 physical px into B = 100 world units.
    expect(cssToWorld(b, { x: 1280 + 100 / 1.5, y: 360 }).x - edgeB.x).toBeCloseTo(100);
    expect(viewportAt(vps, { x: 1300, y: 10 })?.id).toBe('B');
  });

  it('round-trips world and css coordinates', () => {
    for (const vp of computeViewports(layout, { x: 33, y: -12, zoom: 2.5 })) {
      const w = { x: 123.4, y: -55.5 };
      const back = cssToWorld(vp, worldToCss(vp, w));
      expect(back.x).toBeCloseTo(w.x);
      expect(back.y).toBeCloseTo(w.y);
    }
  });

  it('zooms around the cursor', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const c = { x: 900, y: 100 };
    const vp0 = computeViewports(layout, cam)[0]!;
    const before = cssToWorld(vp0, c);
    const next = zoomAt(layout, cam, c, 2);
    const after = cssToWorld(computeViewports(layout, next)[0]!, c);
    expect(next.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('fits a box with a 10 % margin like the spec example', () => {
    const square: ScreenLayout = { ...layout, monitors: [{ id: 'A', rect: { x: 0, y: 0, w: 1200, h: 1200 }, scale: 1 }], cssScale: 1 };
    const cam = fitCamera(square, { x: -500, y: -500, w: 1000, h: 1000 }, 0.1, 4);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    // [-600, 600] (1200 units) fills 1200 logical pixels.
    expect(cam.zoom).toBeCloseTo(1);
  });
});

describe('expand state', () => {
  it('animates children out of collapsed folders', () => {
    const w = sampleWorld();
    w.bubbles.find((b) => b.id === 'games')!.expanded = false;
    const idx = new WorldIndex(w);
    const ex = new ExpandState();
    ex.sync(idx);
    expect(ex.isExpanded('games')).toBe(false);
    expect(ex.visibility(idx, 'mc')).toBe(0);
    expect(ex.visibility(idx, 'cc')).toBe(1);
    ex.toggle('games');
    expect(ex.step(0.1)).toBe(true);
    const mid = ex.visibility(idx, 'mc');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    const pos = new Map([
      ['games', { x: 0, y: 0 }],
      ['mc', { x: 100, y: 0 }],
    ]);
    const d = ex.displayPositions(idx, pos).get('mc')!;
    expect(d.pos.x).toBeGreaterThan(0);
    expect(d.pos.x).toBeLessThan(100);
    while (ex.step(0.1));
    expect(ex.visibility(idx, 'mc')).toBe(1);
  });

  it('keeps runtime state on sync and resets on demand', () => {
    const idx = new WorldIndex(sampleWorld());
    const ex = new ExpandState();
    ex.sync(idx);
    ex.set('apps', false, false);
    ex.sync(idx);
    expect(ex.isExpanded('apps')).toBe(false);
    ex.sync(idx, true);
    expect(ex.isExpanded('apps')).toBe(true);
  });
});
