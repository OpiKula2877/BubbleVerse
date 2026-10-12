import type { Camera, PxRect } from './viewports';

/**
 * A camera that keeps every shown bubble in view (view mode and wallpaper): it aims at the
 * area the bubbles used in the last seconds, so orbits and paths fit without the view
 * breathing along with them, and glides there smoothly.
 */

export function boxAround(items: readonly { x: number; y: number; r: number }[]): PxRect | null {
  if (!items.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of items) {
    x0 = Math.min(x0, b.x - b.r);
    y0 = Math.min(y0, b.y - b.r);
    x1 = Math.max(x1, b.x + b.r);
    y1 = Math.max(y1, b.y + b.r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Box of the shown bubbles the camera follows: `ids` = only these (a focused level), else all. */
export function followBox(
  shown: readonly { id: string; x: number; y: number; r: number }[],
  ids: ReadonlySet<string> | null,
): PxRect | null {
  return boxAround(ids ? shown.filter((b) => ids.has(b.id)) : shown);
}

function union(a: PxRect, b: PxRect): PxRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export class CameraFollow {
  private samples: { at: number; box: PxRect }[] = [];

  constructor(
    /** How long a place bubbles used keeps counting. */
    private readonly windowMs = 8000,
    /** One remembered box per this many ms. */
    private readonly sampleMs = 250,
  ) {}

  /** Adds the box of now; returns the box of everything shown recently. */
  envelope(box: PxRect | null, now: number): PxRect | null {
    this.samples = this.samples.filter((s) => now - s.at <= this.windowMs);
    if (box) {
      const last = this.samples[this.samples.length - 1];
      if (last && now - last.at < this.sampleMs) last.box = union(last.box, box);
      else this.samples.push({ at: now, box });
    }
    let out: PxRect | null = null;
    for (const s of this.samples) out = out ? union(out, s.box) : { ...s.box };
    return out;
  }

  reset(): void {
    this.samples = [];
  }
}

/**
 * One frame of the follow camera: it zooms out fast (a bubble reaching a new edge must not
 * leave the screen) and comes back in calmly; `urgent` (a followed bubble is off screen now)
 * is fast too.
 */
export function followStep(
  cam: Camera,
  target: Camera,
  dt: number,
  urgent = false,
): { camera: Camera; done: boolean } {
  return approachCamera(cam, target, dt, urgent || target.zoom < cam.zoom ? 0.15 : 0.8);
}

/** Whether `inner` lies fully inside `outer`. */
export function boxInside(inner: PxRect, outer: PxRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** One frame of gliding towards `target` (about 0.5 s to get most of the way). */
export function approachCamera(
  cam: Camera,
  target: Camera,
  dt: number,
  seconds = 0.5,
): { camera: Camera; done: boolean } {
  const zoomGap = Math.abs(Math.log(target.zoom / cam.zoom));
  const near =
    Math.abs(target.x - cam.x) * cam.zoom < 0.5 &&
    Math.abs(target.y - cam.y) * cam.zoom < 0.5 &&
    zoomGap < 0.002;
  if (near) return { camera: { ...target }, done: true };
  const t = 1 - Math.exp(-Math.max(0, dt) / (seconds / 3));
  const zoom = Math.exp(Math.log(cam.zoom) + (Math.log(target.zoom) - Math.log(cam.zoom)) * t);
  return {
    camera: { x: cam.x + (target.x - cam.x) * t, y: cam.y + (target.y - cam.y) * t, zoom },
    done: false,
  };
}
