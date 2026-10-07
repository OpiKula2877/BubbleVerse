import type { Vec2 } from '../model/types';

export interface Guide {
  axis: 'x' | 'y';
  /** The x (vertical guide) or y (horizontal guide) coordinate. */
  value: number;
  from: number;
  to: number;
}

export interface SnapResult {
  point: Vec2;
  guides: Guide[];
}

export function snapToGrid(p: Vec2, grid: number): Vec2 {
  if (grid <= 0) return { ...p };
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

/**
 * Snaps a dragged point: alignment with a neighbor (within `threshold`) wins over the grid.
 * Guides show the neighbors the point is aligned with.
 */
export function snapPoint(
  p: Vec2,
  neighbors: readonly Vec2[],
  grid: number,
  threshold: number,
): SnapResult {
  const snapped = snapToGrid(p, grid);
  let bestX: { d: number; v: number } | null = null;
  let bestY: { d: number; v: number } | null = null;
  for (const n of neighbors) {
    const dx = Math.abs(n.x - p.x);
    const dy = Math.abs(n.y - p.y);
    if (dx <= threshold && (!bestX || dx < bestX.d)) bestX = { d: dx, v: n.x };
    if (dy <= threshold && (!bestY || dy < bestY.d)) bestY = { d: dy, v: n.y };
  }
  const point = { x: bestX ? bestX.v : snapped.x, y: bestY ? bestY.v : snapped.y };
  const guides: Guide[] = [];
  if (bestX) {
    const ys = neighbors.filter((n) => Math.abs(n.x - point.x) < 0.5).map((n) => n.y);
    guides.push({
      axis: 'x',
      value: point.x,
      from: Math.min(point.y, ...ys),
      to: Math.max(point.y, ...ys),
    });
  }
  if (bestY) {
    const xs = neighbors.filter((n) => Math.abs(n.y - point.y) < 0.5).map((n) => n.x);
    guides.push({
      axis: 'y',
      value: point.y,
      from: Math.min(point.x, ...xs),
      to: Math.max(point.x, ...xs),
    });
  }
  return { point, guides };
}
