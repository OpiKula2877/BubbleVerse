import { describe, expect, it } from 'vitest';
import {
  approachCamera,
  boxAround,
  boxInside,
  CameraFollow,
  followBox,
  followStep,
} from './follow';

describe('camera follow', () => {
  it('boxes the shown bubbles', () => {
    expect(boxAround([])).toBeNull();
    expect(
      boxAround([
        { x: 0, y: 0, r: 10 },
        { x: 100, y: 50, r: 20 },
      ]),
    ).toEqual({ x: -10, y: -10, w: 130, h: 80 });
  });

  it('boxes only the chosen bubbles when a level is focused', () => {
    const shown = [
      { id: 'apps', x: 0, y: 0, r: 10 },
      { id: 'kid', x: 100, y: 0, r: 10 },
      { id: 'other', x: -500, y: 0, r: 10 },
    ];
    expect(followBox(shown, null)).toEqual({ x: -510, y: -10, w: 620, h: 20 });
    expect(followBox(shown, new Set(['apps', 'kid']))).toEqual({ x: -10, y: -10, w: 120, h: 20 });
    expect(followBox(shown, new Set(['gone']))).toBeNull();
  });

  it('keeps the area moving bubbles used lately, so the view does not breathe', () => {
    const f = new CameraFollow(8000, 250);
    expect(f.envelope({ x: 0, y: 0, w: 10, h: 10 }, 0)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    // An orbit swings to the right, then back: the area keeps the swing.
    expect(f.envelope({ x: 100, y: 0, w: 10, h: 10 }, 1000)).toEqual({ x: 0, y: 0, w: 110, h: 10 });
    expect(f.envelope({ x: 0, y: 0, w: 10, h: 10 }, 2000)).toEqual({ x: 0, y: 0, w: 110, h: 10 });
    // Long after, only what is seen now counts.
    expect(f.envelope({ x: 0, y: 0, w: 10, h: 10 }, 20_000)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    f.reset();
    expect(f.envelope(null, 21_000)).toBeNull();
  });

  it('zooms out quicker than in, so a bubble reaching a new edge stays in view', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const out = followStep(cam, { x: 0, y: 0, zoom: 0.5 }, 0.1).camera.zoom;
    const inn = followStep(cam, { x: 0, y: 0, zoom: 2 }, 0.1).camera.zoom;
    // Share of the way (in log space) covered in 0.1 s.
    const outShare = Math.log(out) / Math.log(0.5);
    const inShare = Math.log(inn) / Math.log(2);
    expect(outShare).toBeGreaterThan(0.6);
    expect(inShare).toBeLessThan(0.5);
    // A bubble already off screen: catch up fast also when zooming in.
    const urgent = followStep(cam, { x: 0, y: 0, zoom: 2 }, 0.1, true).camera.zoom;
    expect(Math.log(urgent) / Math.log(2)).toBeGreaterThan(0.6);
    expect(boxInside({ x: 1, y: 1, w: 2, h: 2 }, { x: 0, y: 0, w: 4, h: 4 })).toBe(true);
    expect(boxInside({ x: 3, y: 1, w: 2, h: 2 }, { x: 0, y: 0, w: 4, h: 4 })).toBe(false);
  });

  it('moves the camera smoothly and stops once there', () => {
    let cam = { x: 0, y: 0, zoom: 1 };
    const target = { x: 1000, y: -500, zoom: 0.5 };
    const first = approachCamera(cam, target, 1 / 60);
    expect(first.done).toBe(false);
    expect(first.camera.x).toBeGreaterThan(0);
    expect(first.camera.x).toBeLessThan(100);
    let done = false;
    for (let i = 0; i < 60 * 10 && !done; i++) {
      const s = approachCamera(cam, target, 1 / 60);
      cam = s.camera;
      done = s.done;
    }
    expect(done).toBe(true);
    expect(cam).toEqual(target);
  });
});
