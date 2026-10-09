import type { OrbitMotion, PathMotion, PathPoint, Vec2, WanderArea } from '../model/types';

/**
 * Edits made with the on-canvas motion editors (spec §4.4). Path points are relative to the
 * bubble's base position, orbit handles to the orbit center.
 */

const DEG = Math.PI / 180;

function withPoints(path: PathMotion, points: PathPoint[]): PathMotion {
  return { ...path, points };
}

/** Click on empty space: a new sharp point at the end. */
export function addPathPoint(path: PathMotion, p: Vec2): PathMotion {
  return withPoints(path, [...path.points, { x: p.x, y: p.y, smooth: false }]);
}

/** A point moves with its handles. */
export function movePathPoint(path: PathMotion, i: number, p: Vec2): PathMotion {
  return withPoints(
    path,
    path.points.map((pt, j) => (j === i ? { ...pt, x: p.x, y: p.y } : pt)),
  );
}

/**
 * Sets a handle (relative to its point). A smooth point keeps the other handle opposite,
 * so the curve stays smooth; dragging a handle out of a sharp point makes it smooth.
 */
export function setPathHandle(
  path: PathMotion,
  i: number,
  which: 'in' | 'out',
  v: Vec2,
): PathMotion {
  return withPoints(
    path,
    path.points.map((pt, j) => {
      if (j !== i) return pt;
      const other = { x: -v.x, y: -v.y };
      return which === 'out'
        ? { ...pt, out: v, in: other, smooth: true }
        : { ...pt, in: v, out: other, smooth: true };
    }),
  );
}

/** Double click: sharp ↔ smooth. A new smooth point gets handles along its neighbours. */
export function toggleSmooth(path: PathMotion, i: number): PathMotion {
  const pts = path.points;
  const pt = pts[i];
  if (!pt) return path;
  if (pt.smooth) {
    const { in: _in, out: _out, ...rest } = pt;
    return withPoints(
      path,
      pts.map((p, j) => (j === i ? { ...rest, smooth: false } : p)),
    );
  }
  const prev = pts[i - 1] ?? (path.loop === 'loop' ? pts[pts.length - 1] : undefined) ?? pt;
  const next = pts[i + 1] ?? (path.loop === 'loop' ? pts[0] : undefined) ?? pt;
  let dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (!dx && !dy) dx = 40;
  const out = { x: dx / 4, y: dy / 4 };
  return withPoints(
    path,
    pts.map((p, j) => (j === i ? { ...p, smooth: true, out, in: { x: -out.x, y: -out.y } } : p)),
  );
}

export function removePathPoint(path: PathMotion, i: number): PathMotion {
  if (path.points.length <= 1) return path;
  return withPoints(
    path,
    path.points.filter((_, j) => j !== i),
  );
}

/** Handle positions of an orbit relative to its center: radius X (with the tilt) and Y. */
export function orbitHandles(o: OrbitMotion): { rx: Vec2; ry: Vec2 } {
  const tl = o.tilt * DEG;
  return {
    rx: { x: o.rx * Math.cos(tl), y: o.rx * Math.sin(tl) },
    ry: { x: -o.ry * Math.sin(tl), y: o.ry * Math.cos(tl) },
  };
}

/**
 * Dragging an orbit handle to `p` (relative to the center): the X handle sets radius X and
 * the tilt, the Y handle sets radius Y (distance along the tilted Y axis).
 */
export function dragOrbitHandle(o: OrbitMotion, which: 'rx' | 'ry', p: Vec2): OrbitMotion {
  if (which === 'rx') {
    const tilt = Math.round((Math.atan2(p.y, p.x) / DEG) * 10) / 10;
    return { ...o, rx: Math.max(1, Math.round(Math.hypot(p.x, p.y))), tilt };
  }
  const tl = o.tilt * DEG;
  const along = -p.x * Math.sin(tl) + p.y * Math.cos(tl);
  return { ...o, ry: Math.max(1, Math.round(Math.abs(along))) };
}

/** Drawing the wander area from the bubble outwards to `d` (relative to the bubble). */
export function wanderAreaFromDrag(shape: WanderArea['shape'], d: Vec2): WanderArea {
  if (shape === 'circle')
    return { shape: 'circle', r: Math.max(1, Math.round(Math.hypot(d.x, d.y))) };
  return {
    shape: 'rect',
    w: Math.max(2, Math.round(Math.abs(d.x) * 2)),
    h: Math.max(2, Math.round(Math.abs(d.y) * 2)),
  };
}
