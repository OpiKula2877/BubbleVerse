import type { Vec2 } from '../model/types';

/**
 * Camera and per-monitor viewports (spec §8.5).
 * 1 world unit = 1 logical pixel at zoom 1. There is one camera, relative to the primary (UI)
 * monitor; other monitors show the adjoining part of the plane according to their physical
 * placement, each with its own DPI scale.
 */

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenMonitor {
  id: string;
  /** Physical pixels. */
  rect: PxRect;
  scale: number;
}

export interface ScreenLayout {
  monitors: ScreenMonitor[];
  /** Monitor with the UI; the camera is centered on it. */
  uiMonitor: string;
  /** Physical top-left of the window (the virtual desktop). */
  origin: { x: number; y: number };
  /** CSS px → physical px. */
  cssScale: number;
}

export interface Camera {
  /** World point at the center of the UI monitor. */
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  id: string;
  primary: boolean;
  /** Monitor area in CSS pixels of the window. */
  css: PxRect;
  /** CSS pixels per world unit. */
  k: number;
  /** CSS point of the anchor. */
  anchorCss: Vec2;
  /** World point of the anchor. */
  anchorWorld: Vec2;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function clampPoint(p: Vec2, r: PxRect): Vec2 {
  return {
    x: Math.min(r.x + r.w, Math.max(r.x, p.x)),
    y: Math.min(r.y + r.h, Math.max(r.y, p.y)),
  };
}

export function uiMonitorOf(layout: ScreenLayout): ScreenMonitor | undefined {
  return layout.monitors.find((m) => m.id === layout.uiMonitor) ?? layout.monitors[0];
}

export function computeViewports(layout: ScreenLayout, cam: Camera): Viewport[] {
  const ui = uiMonitorOf(layout);
  if (!ui) return [];
  const pc = { x: ui.rect.x + ui.rect.w / 2, y: ui.rect.y + ui.rect.h / 2 };
  const toCss = (p: Vec2) => ({
    x: (p.x - layout.origin.x) / layout.cssScale,
    y: (p.y - layout.origin.y) / layout.cssScale,
  });
  return layout.monitors.map((m) => {
    // The point of this monitor nearest to the UI monitor's center joins the two planes.
    const anchor = m.id === ui.id ? pc : clampPoint(pc, m.rect);
    const anchorWorld = {
      x: cam.x + (anchor.x - pc.x) / (cam.zoom * ui.scale),
      y: cam.y + (anchor.y - pc.y) / (cam.zoom * ui.scale),
    };
    const tl = toCss({ x: m.rect.x, y: m.rect.y });
    return {
      id: m.id,
      primary: m.id === ui.id,
      css: { x: tl.x, y: tl.y, w: m.rect.w / layout.cssScale, h: m.rect.h / layout.cssScale },
      k: (cam.zoom * m.scale) / layout.cssScale,
      anchorCss: toCss(anchor),
      anchorWorld,
    };
  });
}

export function worldToCss(vp: Viewport, w: Vec2): Vec2 {
  return {
    x: vp.anchorCss.x + (w.x - vp.anchorWorld.x) * vp.k,
    y: vp.anchorCss.y + (w.y - vp.anchorWorld.y) * vp.k,
  };
}

export function cssToWorld(vp: Viewport, c: Vec2): Vec2 {
  return {
    x: vp.anchorWorld.x + (c.x - vp.anchorCss.x) / vp.k,
    y: vp.anchorWorld.y + (c.y - vp.anchorCss.y) / vp.k,
  };
}

export function viewportAt(vps: readonly Viewport[], c: Vec2): Viewport | undefined {
  return vps.find((v) => c.x >= v.css.x && c.x < v.css.x + v.css.w && c.y >= v.css.y && c.y < v.css.y + v.css.h);
}

/** Visible world rectangle of a viewport. */
export function visibleWorld(vp: Viewport): PxRect {
  const a = cssToWorld(vp, { x: vp.css.x, y: vp.css.y });
  const b = cssToWorld(vp, { x: vp.css.x + vp.css.w, y: vp.css.y + vp.css.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Zooms around a CSS point so the world point under it stays put. */
export function zoomAt(layout: ScreenLayout, cam: Camera, c: Vec2, factor: number): Camera {
  const vps = computeViewports(layout, cam);
  const vp = viewportAt(vps, c) ?? vps.find((v) => v.primary);
  if (!vp) return cam;
  const before = cssToWorld(vp, c);
  const next = { ...cam, zoom: clampZoom(cam.zoom * factor) };
  const after = cssToWorld(computeViewports(layout, next).find((v) => v.id === vp.id)!, c);
  return { ...next, x: next.x + before.x - after.x, y: next.y + before.y - after.y };
}

/** Moves the camera by a CSS-pixel drag on a viewport. */
export function panBy(cam: Camera, vp: Viewport, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / vp.k, y: cam.y - dy / vp.k };
}

/**
 * Camera that shows `box` (world) on the UI viewport with a margin of `margin` × box size
 * on each side (spec §6.5: [-5;5] → [-6;6] is a margin of 0.1).
 */
export function fitCamera(layout: ScreenLayout, box: PxRect, margin = 0.1, maxZoom = 2): Camera {
  const ui = uiMonitorOf(layout);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (!ui) return { x: cx, y: cy, zoom: 1 };
  const size = Math.max(box.w, box.h, 1);
  const w = box.w + 2 * margin * size;
  const h = box.h + 2 * margin * size;
  // Logical pixels of the UI monitor available for the box.
  const lw = ui.rect.w / ui.scale;
  const lh = ui.rect.h / ui.scale;
  const zoom = clampZoom(Math.min(lw / Math.max(w, 1), lh / Math.max(h, 1), maxZoom));
  return { x: cx, y: cy, zoom };
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  // Zoom interpolates in log space so zooming feels even.
  const z = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom: z };
}
